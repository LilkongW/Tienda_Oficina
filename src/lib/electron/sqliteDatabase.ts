import type { TableName, RowFor, PendingChange } from '../localDatabase';
import type { Producto } from '../../types/database';

export const isElectron = (): boolean => {
  return typeof window !== 'undefined' && !!(window as any).electronAPI?.sqlite;
};

export class ElectronDatabase {
  private readonly profileId: string;
  private readonly api: any;

  constructor(profileId: string) {
    const api = (window as any).electronAPI?.sqlite;
    if (!api) {
      throw new Error('SQLite API no disponible. Solo funciona en Electron.');
    }
    this.profileId = profileId;
    this.api = api;
  }

  async all<T extends TableName>(table: T): Promise<RowFor<T>[]> {
    return this.api.all(this.profileId, table);
  }

  async get<T extends TableName>(table: T, id: number): Promise<RowFor<T> | undefined> {
    return this.api.get(this.profileId, table, id);
  }

  async put<T extends TableName>(table: T, row: RowFor<T>, change?: Omit<PendingChange, 'id' | 'table' | 'rowId'>): Promise<void> {
    await this.api.put(this.profileId, table, row);
    if (change) {
      await this.api.addPending(this.profileId, {
        ...change,
        table,
        rowId: Number((row as unknown as Record<string, unknown>)[this.getIdField(table)]),
        payload: row as unknown as Record<string, unknown>
      });
    }
  }

  async remove<T extends TableName>(table: T, id: number, queue = true): Promise<void> {
    const oldRow = queue ? await this.get(table, id) : undefined;
    await this.api.remove(this.profileId, table, id);
    if (queue && oldRow) {
      await this.api.addPending(this.profileId, { table, action: 'delete', rowId: id, payload: oldRow as unknown as Record<string, unknown> | undefined });
    }
  }

  async nextId<T extends TableName>(table: T): Promise<number> {
    const rows = await this.all(table);
    const firstAvailable = Math.min(0, ...rows.map((row) => Number((row as unknown as Record<string, unknown>)[this.getIdField(table)])).filter((id) => id < 0)) - 1;
    const currentNext = await this.api.getMeta(this.profileId, `next:${table}`);
    const next = currentNext ? Math.min(firstAvailable, Number(currentNext)) : firstAvailable;
    await this.api.setMeta(this.profileId, `next:${table}`, String(next - 1));
    return next;
  }

  async pending(): Promise<PendingChange[]> {
    return this.api.getPending(this.profileId);
  }

  async clearPending(id: number): Promise<void> {
    await this.api.clearPending(this.profileId, id);
  }

  async remapId(table: TableName, oldId: number, newId: number): Promise<void> {
    const key = this.getIdField(table);

    // Actualizar la fila principal
    const row = await this.get(table, oldId);
    if (row) {
      const updatedRow = { ...row, [key]: newId } as RowFor<TableName>;
      await this.put(table, updatedRow);
      // La versión IndexedDB borra la fila con el id temporal; aquí también
      if (newId !== oldId) await this.api.remove(this.profileId, table, oldId);
    }

    // Actualizar filas relacionadas
    const relatedTables: TableName[] = ['productos', 'clientes', 'ventas', 'detalle_venta'];
    for (const relatedTable of relatedTables) {
      const relatedRows = await this.all(relatedTable);
      for (const r of relatedRows) {
        const record = r as unknown as Record<string, unknown>;
        let changed = false;
        if (table === 'clientes' && relatedTable === 'ventas' && record.id_cliente === oldId) {
          record.id_cliente = newId;
          changed = true;
        }
        if (table === 'productos' && relatedTable === 'detalle_venta' && record.id_producto === oldId) {
          record.id_producto = newId;
          changed = true;
        }
        if (table === 'ventas' && relatedTable === 'detalle_venta' && record.id_venta === oldId) {
          record.id_venta = newId;
          changed = true;
        }
        if (changed) {
          await this.put(relatedTable, r as RowFor<TableName>);
        }
      }
    }

    // Actualizar cambios pendientes
    const pending = await this.pending();
    for (const op of pending) {
      let needsUpdate = false;
      if (op.table === table && op.rowId === oldId) {
        op.rowId = newId;
        needsUpdate = true;
      }
      const payload = op.payload as Record<string, unknown> | undefined;
      if (payload) {
        if (table === 'clientes' && op.table === 'ventas' && payload.id_cliente === oldId) {
          payload.id_cliente = newId;
          needsUpdate = true;
        }
        if (table === 'productos' && op.table === 'detalle_venta' && payload.id_producto === oldId) {
          payload.id_producto = newId;
          needsUpdate = true;
        }
        if (table === 'ventas' && op.table === 'detalle_venta' && payload.id_venta === oldId) {
          payload.id_venta = newId;
          needsUpdate = true;
        }
      }
      if (needsUpdate) {
        await this.api.updatePending(this.profileId, op);
      }
    }

    await this.api.setMeta(this.profileId, `${table}:${oldId}`, String(newId));
  }

  async resolveId(table: TableName, id: number): Promise<number> {
    if (id >= 0) return id;
    const remapped = await this.api.getMeta(this.profileId, `${table}:${id}`);
    return remapped ? Number(remapped) : id;
  }

  async replaceAll<T extends TableName>(table: T, rows: RowFor<T>[]): Promise<void> {
    // Primero obtener cambios pendientes
    const pendingChanges = await this.pending();
    let oldProducts: RowFor<'productos'>[] | undefined;

    if (table === 'productos') {
      oldProducts = await this.all('productos');
    }

    // Reemplazar todos los datos
    await this.api.replaceAll(this.profileId, table, rows);

    // Reaplicar cambios pendientes
    for (const change of pendingChanges) {
      if (change.table !== table) continue;
      if (change.action === 'delete') {
        await this.remove(table, change.rowId, false);
      } else if (change.payload) {
        await this.put(table, change.payload as unknown as RowFor<T>);
      }
    }

    // Si es productos, restaurar stock de productos afectados por ventas pendientes
    if (table === 'productos' && oldProducts) {
      const changedStockIds = new Set(
        pendingChanges
          .filter((change) => change.table === 'detalle_venta')
          .map((change) => Number(change.payload?.id_producto))
      );
      for (const product of oldProducts) {
        if (changedStockIds.has((product as unknown as Producto).id_producto)) {
          await this.put('productos', product);
        }
      }
    }
  }

  private getIdField(table: TableName): string {
    const idFields: Record<TableName, string> = {
      productos: 'id_producto',
      clientes: 'id_cliente',
      ventas: 'id_venta',
      detalle_venta: 'id_detalle'
    };
    return idFields[table];
  }
}
