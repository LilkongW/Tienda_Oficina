import { getActiveProfile, getSupabaseClient, hasSupabaseConfig } from './databaseProfiles';
import { localDatabase, type RowFor, type TableName } from './localDatabase';

const idKey: Record<TableName, string> = {
  productos: 'id_producto',
  clientes: 'id_cliente',
  ventas: 'id_venta',
  detalle_venta: 'id_detalle',
};

const db = () => localDatabase(getActiveProfile().id);
const refreshes = new Map<string, Promise<void>>();

// ---------------------------------------------------------------------------
// DEBUG HELPERS
// ---------------------------------------------------------------------------

/**
 * Convierte cualquier cosa lanzada (Error, PostgrestError, string, objeto)
 * en un Error real, preservando code/details/hint de Supabase.
 */
export const asError = (e: unknown, context?: Record<string, unknown>): Error => {
  if (e instanceof Error) {
    if (context) (e as any).context = { ...(e as any).context, ...context };
    return e;
  }
  let message = 'Error desconocido';
  const extra: Record<string, unknown> = {};

  if (e && typeof e === 'object') {
    const obj = e as Record<string, unknown>;
    message =
      (obj.message as string) ??
      (obj.error_description as string) ??
      (obj.error as string) ??
      (obj.msg as string) ??
      JSON.stringify(obj);
    if ('code' in obj) extra.code = obj.code;
    if ('details' in obj) extra.details = obj.details;
    if ('hint' in obj) extra.hint = obj.hint;
    if ('status' in obj) extra.status = obj.status;
    if ('statusText' in obj) extra.statusText = obj.statusText;
  } else if (e !== undefined && e !== null) {
    message = String(e);
  }

  const err = new Error(message);
  Object.assign(err, extra);
  if (context) (err as any).context = context;
  (err as any).cause = e;
  return err;
};

type SyncOp =
  | { kind: 'insert'; table: TableName; rowId: number; syncUid: string; payload: Record<string, unknown> }
  | { kind: 'update'; table: TableName; rowId: number; payload: Record<string, unknown> }
  | { kind: 'delete'; table: TableName; rowId: number };

const logSyncError = (op: SyncOp, err: Error) => {
  const anyErr = err as any;
  console.group(`%c[SYNC ERROR] ${op.kind.toUpperCase()} ${op.table}#${op.rowId}`, 'color:#fff;background:#c0392b;padding:2px 6px;border-radius:3px');
  console.error('Mensaje :', err.message);
  if (anyErr.code) console.error('Code    :', anyErr.code);
  if (anyErr.details) console.error('Details :', anyErr.details);
  if (anyErr.hint) console.error('Hint    :', anyErr.hint);
  if (anyErr.status) console.error('Status  :', anyErr.status, anyErr.statusText ?? '');
  console.error('Contexto:', (anyErr.context ?? {}) as Record<string, unknown>);
  console.error('Payload :', op.kind === 'delete' ? '(delete)' : op.payload);
  console.error('Raw     :', anyErr.cause ?? err);
  console.groupEnd();
};

/** Dispara un sync manual y muestra por consola el resultado exacto. */
export async function debugSync(): Promise<void> {
  console.group('%c[debugSync] Iniciando', 'color:#2980b9;font-weight:bold');
  const profile = getActiveProfile();
  console.log('Perfil activo   :', profile);
  console.log('Supabase OK     :', hasSupabaseConfig(profile));
  console.log('navigator.onLine:', navigator.onLine);
  try {
    const pendientes = await db().pending();
    console.log('Pendientes      :', pendientes);
  } catch (e) {
    console.error('No se pudo leer pendientes', asError(e));
  }
  try {
    const n = await synchronizePending();
    console.log(`%c✔ Sincronizados ${n} cambio(s)`, 'color:#27ae60');
  } catch (e) {
    console.error('%c✖ Fallo la sincronización', 'color:#c0392b', e);
  } finally {
    console.groupEnd();
  }
}

/** Informe legible de los pendientes actuales (para pegar en un issue). */
export async function getPendingReport(): Promise<string> {
  const rows = await db().pending();
  return rows
    .map((c) =>
      [
        `• [${c.action}] ${c.table}#${c.rowId}`,
        `  sync_uid: ${(c.payload as any)?.sync_uid ?? '(sin sync_uid)'}`,
        `  payload : ${JSON.stringify(c.payload)}`,
      ].join('\n'),
    )
    .join('\n\n') || '(sin pendientes)';
}

// ---------------------------------------------------------------------------
// CANONICALIZACIÓN
// ---------------------------------------------------------------------------

const canonicalRow = (row: unknown) =>
  Object.fromEntries(
    Object.entries(row as Record<string, unknown>)
      .filter(([, value]) => value !== null && value !== undefined)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, value]) => [
        key,
        typeof value === 'boolean'
          ? Number(value)
          : typeof value === 'object'
          ? JSON.stringify(value)
          : value,
      ]),
  );

const sameRows = (a: unknown[], b: unknown[]) =>
  JSON.stringify(a.map(canonicalRow)) === JSON.stringify(b.map(canonicalRow));

const cleanForInsert = (table: TableName, row: Record<string, unknown>) => {
  const result = { ...row };
  const id = Number(result[idKey[table]]);
  if (id < 0) delete result[idKey[table]];
  delete result.created_at;
  delete result.updated_at;
  if (table === 'productos') delete result.costo_unitario;
  if (table === 'detalle_venta') delete result.subtotal;
  return result;
};

const cleanForUpdate = (table: TableName, row: Record<string, unknown>) => {
  const result = cleanForInsert(table, row);
  delete result[idKey[table]];
  return result;
};

// ---------------------------------------------------------------------------
// SYNC
// ---------------------------------------------------------------------------

export async function synchronizePending(): Promise<number> {
  const profile = getActiveProfile();
  if (!hasSupabaseConfig(profile) || !navigator.onLine) return 0;

  const client = getSupabaseClient();
  const local = db();

  // --- Migración al vuelo: re-encolar pendientes antiguos sin sync_uid ---
  // Los pendientes creados antes de existir el sistema de sync_uid no pueden
  // subir tal cual (upsert onConflict='sync_uid' requiere el campo). Los
  // re-encolamos con un sync_uid nuevo preservando el row local.
  const prePending = await local.pending();
  for (const change of prePending) {
    if (change.action !== 'insert') continue;
    const p = (change.payload ?? {}) as Record<string, unknown>;
    if (p.sync_uid) continue;

    const row = await local.get(change.table, change.rowId);
    if (!row) {
      await local.clearPending(change.id!);
      console.warn(`[sync] pendiente huérfano eliminado: ${change.table}#${change.rowId}`);
      continue;
    }
    const patched = { ...(row as unknown as Record<string, unknown>), sync_uid: newSyncUid() };
    await local.clearPending(change.id!);
    await saveRow(change.table, patched as RowFor<TableName>, 'insert', true, false);
    console.warn(`[sync] pendiente re-encolado con sync_uid: ${change.table}#${change.rowId}`);
  }
  // -----------------------------------------------------------------------

  const changeIds = (await local.pending()).map((change) => change.id!);
  let completed = 0;

  for (const changeId of changeIds) {
    const change = (await local.pending()).find((item) => item.id === changeId);
    if (!change) continue;

    const key = idKey[change.table];
    const payload = (change.payload ?? {}) as Record<string, unknown>;

    if (change.action === 'insert') {
      const cleanPayload = cleanForInsert(change.table, payload);
      const syncUid = String(cleanPayload.sync_uid ?? '');
      const op: SyncOp = {
        kind: 'insert',
        table: change.table,
        rowId: change.rowId,
        syncUid,
        payload: cleanPayload,
      };

      if (!syncUid) {
        const err = asError(
          new Error(`El registro pendiente de ${change.table} no tiene sync_uid.`),
          { table: change.table, rowId: change.rowId, op: 'insert' },
        );
        logSyncError(op, err);
        throw err;
      }

      const { data: inserted, error } = await client
        .from(change.table)
        .upsert(cleanPayload, { onConflict: 'sync_uid' })
        .select()
        .maybeSingle();

      if (error) {
        const err = asError(error, { table: change.table, rowId: change.rowId, op: 'insert', syncUid });
        logSyncError(op, err);
        throw err;
      }

      let data = inserted;
      if (!data) {
        const { data: existing, error: lookupError } = await client
          .from(change.table)
          .select()
          .eq('sync_uid', syncUid)
          .single();
        if (lookupError) {
          const err = asError(lookupError, {
            table: change.table,
            rowId: change.rowId,
            op: 'insert/lookup',
            syncUid,
          });
          logSyncError(op, err);
          throw err;
        }
        data = existing;
      }

      const remoteId = Number((data as Record<string, unknown>)[key]);
      if (change.rowId < 0 && remoteId) await local.remapId(change.table, change.rowId, remoteId);
    } else if (change.action === 'update') {
      const cleanPayload = cleanForUpdate(change.table, payload);
      const op: SyncOp = {
        kind: 'update',
        table: change.table,
        rowId: change.rowId,
        payload: cleanPayload,
      };

      const { data, error } = await client
        .from(change.table)
        .update(cleanPayload)
        .eq(key, change.rowId)
        .select(key)
        .maybeSingle();

      if (error) {
        const err = asError(error, { table: change.table, rowId: change.rowId, op: 'update' });
        logSyncError(op, err);
        throw err;
      }
      if (!data) {
        const err = asError(
          new Error(`Supabase no actualizó ${change.table} #${change.rowId}; revisa las políticas RLS.`),
          { table: change.table, rowId: change.rowId, op: 'update' },
        );
        logSyncError(op, err);
        throw err;
      }
    } else {
      const op: SyncOp = { kind: 'delete', table: change.table, rowId: change.rowId };
      const { error } = await client.from(change.table).delete().eq(key, change.rowId);
      if (error) {
        const err = asError(error, { table: change.table, rowId: change.rowId, op: 'delete' });
        logSyncError(op, err);
        throw err;
      }
    }

    await local.clearPending(change.id!);
    completed++;
  }

  return completed;
}

// ---------------------------------------------------------------------------
// REFRESH
// ---------------------------------------------------------------------------

export async function refreshLocalCopy(): Promise<void> {
  const profile = getActiveProfile();
  if (!hasSupabaseConfig(profile) || !navigator.onLine) return;

  await synchronizePending();

  const local = db();
  if ((await local.pending()).length) return;

  const client = getSupabaseClient();
  let changed = false;

  for (const table of ['productos', 'clientes', 'ventas', 'detalle_venta'] as const) {
    const { data, error } = await client.from(table).select('*');
    if (error) {
      const err = asError(error, { table, op: 'refresh/select' });
      console.error(`[REFRESH ERROR] ${table}`, err, (err as any).cause);
      throw err;
    }
    const key = idKey[table];
    const remoteRows = [...(data ?? [])].sort(
      (a, b) => Number(a[key]) - Number(b[key]),
    ) as RowFor<typeof table>[];
    const localRows = (await local.all(table)).sort(
      (a, b) =>
        Number((a as unknown as Record<string, unknown>)[key]) -
        Number((b as unknown as Record<string, unknown>)[key]),
    );
    if (!sameRows(remoteRows, localRows)) {
      await local.replaceAll(table, remoteRows);
      changed = true;
    }
  }

  if (changed) window.dispatchEvent(new Event('database:refreshed'));
}

// ---------------------------------------------------------------------------
// READ / WRITE
// ---------------------------------------------------------------------------

export async function readTable<T extends TableName>(table: T): Promise<RowFor<T>[]> {
  const local = db();
  const cached = await local.all(table);
  if (hasSupabaseConfig() && navigator.onLine) {
    const profileId = getActiveProfile().id;
    let refresh = refreshes.get(profileId);
    if (!refresh) {
      refresh = refreshLocalCopy()
        .catch((e) => {
          console.error('[readTable] refresh falló silenciosamente:', asError(e));
        })
        .finally(() => refreshes.delete(profileId));
      refreshes.set(profileId, refresh);
    }
    if (cached.length) return cached;
    await refresh;
    return local.all(table);
  }
  return cached;
}

export async function readOne<T extends TableName>(table: T, id: number): Promise<RowFor<T> | undefined> {
  const rows = await readTable(table);
  return rows.find((row) => Number((row as unknown as Record<string, unknown>)[idKey[table]]) === id);
}

export async function saveRow<T extends TableName>(
  table: T,
  row: RowFor<T>,
  action: 'insert' | 'update',
  queue = true,
  flush = true,
): Promise<void> {
  // Defensa en profundidad: en inserts SIEMPRE debe haber sync_uid.
  // El caller puede olvidarse; la cola no. Sin esto, un insert llega a
  // Supabase con upsert onConflict='sync_uid' y no puede reconciliar.
  const needsUid = action === 'insert' && !(row as unknown as Record<string, unknown>)?.sync_uid;
  const finalRow = needsUid
    ? ({ ...(row as unknown as Record<string, unknown>), sync_uid: newSyncUid() } as RowFor<T>)
    : row;

  await db().put(table, finalRow, queue ? { action } : undefined);

  if (queue && flush) {
    await synchronizePending().catch((e) => {
      console.error('[saveRow] sync falló:', asError(e, { table, action }));
    });
  }
}

export async function deleteRow<T extends TableName>(table: T, id: number): Promise<void> {
  const existing = await db().get(table, id);
  if (id < 0) {
    const changes = await db().pending();
    for (const change of changes.filter((item) => item.table === table && item.rowId === id)) {
      await db().clearPending(change.id!);
    }
    await db().remove(table, id, false);
    return;
  }
  await db().remove(table, id, !!existing);
  await synchronizePending().catch((e) => {
    console.error('[deleteRow] sync falló:', asError(e, { table, id }));
  });
}

// ---------------------------------------------------------------------------
// UTILIDADES
// ---------------------------------------------------------------------------

export const nowIso = () => new Date().toISOString();

export const newSyncUid = () =>
  crypto.randomUUID?.() ??
  'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (char) => {
    const random = Math.floor(Math.random() * 16);
    return (char === 'x' ? random : (random & 0x3) | 0x8).toString(16);
  });

export const nextLocalId = (table: TableName) => db().nextId(table);
export const resolveLocalId = (table: TableName, id: number) => db().resolveId(table, id);

export const cancelPendingForRow = async (table: TableName, id: number) => {
  const changes = await db().pending();
  for (const change of changes.filter((item) => item.table === table && item.rowId === id)) {
    await db().clearPending(change.id!);
  }
};