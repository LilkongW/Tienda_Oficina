import { getActiveProfile, getSupabaseClient, hasSupabaseConfig } from './databaseProfiles';
import { localDatabase, type RowFor, type TableName } from './localDatabase';

const idKey: Record<TableName, string> = { productos: 'id_producto', clientes: 'id_cliente', ventas: 'id_venta', detalle_venta: 'id_detalle' };
const db = () => localDatabase(getActiveProfile().id);
const refreshes = new Map<string, Promise<void>>();
// SQLite devuelve las columnas en otro orden, null en vez de columnas ausentes y 0/1 en vez de booleanos.
// Se normaliza antes de comparar; si no, la copia local "siempre cambia" y se refresca en bucle.
const canonicalRow = (row: unknown) => Object.fromEntries(
  Object.entries(row as Record<string, unknown>)
    .filter(([, value]) => value !== null && value !== undefined)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => [key, typeof value === 'boolean' ? Number(value) : typeof value === 'object' ? JSON.stringify(value) : value]),
);
const sameRows = (a: unknown[], b: unknown[]) => JSON.stringify(a.map(canonicalRow)) === JSON.stringify(b.map(canonicalRow));
const cleanForInsert = (table: TableName, row: Record<string, unknown>) => {
  const result = { ...row };
  const id = Number(result[idKey[table]]);
  if (id < 0) delete result[idKey[table]];
  delete result.created_at;
  if (table === 'productos') delete result.costo_unitario;
  if (table === 'detalle_venta') delete result.subtotal;
  return result;
};
const cleanForUpdate = (table: TableName, row: Record<string, unknown>) => {
  const result = cleanForInsert(table, row);
  delete result[idKey[table]];
  return result;
};

export async function synchronizePending(): Promise<number> {
  const profile = getActiveProfile();
  if (!hasSupabaseConfig(profile) || !navigator.onLine) return 0;
  const client = getSupabaseClient();
  const local = db();
  const changeIds = (await local.pending()).map((change) => change.id!);
  let completed = 0;
  for (const changeId of changeIds) {
    const change = (await local.pending()).find((item) => item.id === changeId);
    if (!change) continue;
    const key = idKey[change.table];
    if (change.action === 'insert') {
      const payload = cleanForInsert(change.table, (change.payload ?? {}) as Record<string, unknown>);
      const syncUid = String(payload.sync_uid ?? '');
      if (!syncUid) throw new Error(`El registro pendiente de ${change.table} no tiene sync_uid. Actualiza la base de datos local.`);
      const { data: inserted, error } = await client.from(change.table).upsert(payload, { onConflict: 'sync_uid', ignoreDuplicates: true }).select().maybeSingle();
      if (error) throw error;
      let data = inserted;
      if (!data) {
        const { data: existing, error: lookupError } = await client.from(change.table).select().eq('sync_uid', syncUid).single();
        if (lookupError) throw lookupError;
        data = existing;
      }
      const remoteId = Number((data as Record<string, unknown>)[key]);
      if (change.rowId < 0 && remoteId) await local.remapId(change.table, change.rowId, remoteId);
    } else if (change.action === 'update') {
      const { data, error } = await client.from(change.table).update(cleanForUpdate(change.table, (change.payload ?? {}) as Record<string, unknown>)).eq(key, change.rowId).select(key).maybeSingle();
      if (error) throw error;
      if (!data) throw new Error(`Supabase no actualizó ${change.table} #${change.rowId}; revisa las políticas RLS.`);
    } else {
      const { error } = await client.from(change.table).delete().eq(key, change.rowId);
      if (error) throw error;
    }
    await local.clearPending(change.id!);
    completed++;
  }
  return completed;
}

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
    if (error) throw error;
    const key = idKey[table];
    const remoteRows = [...(data ?? [])].sort((a, b) => Number(a[key]) - Number(b[key])) as RowFor<typeof table>[];
    const localRows = (await local.all(table)).sort((a, b) => Number((a as unknown as Record<string, unknown>)[key]) - Number((b as unknown as Record<string, unknown>)[key]));
    if (!sameRows(remoteRows, localRows)) {
      await local.replaceAll(table, remoteRows);
      changed = true;
    }
  }
  if (changed) window.dispatchEvent(new Event('database:refreshed'));
}

export async function readTable<T extends TableName>(table: T): Promise<RowFor<T>[]> {
  const local = db();
  const cached = await local.all(table);
  if (hasSupabaseConfig() && navigator.onLine) {
    const profileId = getActiveProfile().id;
    let refresh = refreshes.get(profileId);
    if (!refresh) {
      refresh = refreshLocalCopy().catch(() => undefined).finally(() => refreshes.delete(profileId));
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

export async function saveRow<T extends TableName>(table: T, row: RowFor<T>, action: 'insert' | 'update', queue = true, flush = true): Promise<void> {
  await db().put(table, row, queue ? { action } : undefined);
  if (queue && flush) await synchronizePending().catch(() => undefined);
}
export async function deleteRow<T extends TableName>(table: T, id: number): Promise<void> {
  const existing = await db().get(table, id);
  if (id < 0) {
    const changes = await db().pending();
    for (const change of changes.filter((item) => item.table === table && item.rowId === id)) await db().clearPending(change.id!);
    await db().remove(table, id, false);
    return;
  }
  await db().remove(table, id, !!existing);
  await synchronizePending().catch(() => undefined);
}

export const nowIso = () => new Date().toISOString();
export const newSyncUid = () => crypto.randomUUID?.() ?? 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (char) => {
  const random = Math.floor(Math.random() * 16);
  return (char === 'x' ? random : (random & 0x3) | 0x8).toString(16);
});
export const nextLocalId = (table: TableName) => db().nextId(table);
export const resolveLocalId = (table: TableName, id: number) => db().resolveId(table, id);
export const cancelPendingForRow = async (table: TableName, id: number) => {
  const changes = await db().pending();
  for (const change of changes.filter((item) => item.table === table && item.rowId === id)) await db().clearPending(change.id!);
};
