import type { Cliente, DetalleVenta, Producto, Venta } from '../types/database';
import { isElectron, ElectronDatabase } from './electron/sqliteDatabase';

export type TableName = 'productos' | 'clientes' | 'ventas' | 'detalle_venta';
export type RowFor<T extends TableName> = T extends 'productos' ? Producto : T extends 'clientes' ? Cliente : T extends 'ventas' ? Venta : DetalleVenta;
export interface PendingChange { id?: number; table: TableName; action: 'insert' | 'update' | 'delete'; rowId: number; payload?: Record<string, unknown>; }

export interface DatabaseAdapter {
  all<T extends TableName>(table: T): Promise<RowFor<T>[]>;
  get<T extends TableName>(table: T, id: number): Promise<RowFor<T> | undefined>;
  put<T extends TableName>(table: T, row: RowFor<T>, change?: Omit<PendingChange, 'id' | 'table' | 'rowId'>): Promise<void>;
  remove<T extends TableName>(table: T, id: number, queue?: boolean): Promise<void>;
  nextId<T extends TableName>(table: T): Promise<number>;
  pending(): Promise<PendingChange[]>;
  clearPending(id: number): Promise<void>;
  remapId(table: TableName, oldId: number, newId: number): Promise<void>;
  resolveId(table: TableName, id: number): Promise<number>;
  replaceAll<T extends TableName>(table: T, rows: RowFor<T>[]): Promise<void>;
}

const DB_PREFIX = 'ventas-local-';
const stores: TableName[] = ['productos', 'clientes', 'ventas', 'detalle_venta'];
const idFields: Record<TableName, string> = { productos: 'id_producto', clientes: 'id_cliente', ventas: 'id_venta', detalle_venta: 'id_detalle' };
const databaseFor = (profileId: string) => new Promise<IDBDatabase>((resolve, reject) => {
  const request = indexedDB.open(`${DB_PREFIX}${profileId}`, 1);
  request.onupgradeneeded = () => {
    const db = request.result;
    for (const store of stores) if (!db.objectStoreNames.contains(store)) db.createObjectStore(store, { keyPath: idFields[store] });
    if (!db.objectStoreNames.contains('pending')) db.createObjectStore('pending', { keyPath: 'id', autoIncrement: true });
    if (!db.objectStoreNames.contains('meta')) db.createObjectStore('meta', { keyPath: 'key' });
  };
  request.onsuccess = () => resolve(request.result);
  request.onerror = () => reject(request.error);
});

export class LocalDatabase implements DatabaseAdapter {
  private readonly profileId: string;
  constructor(profileId: string) {
    this.profileId = profileId;
  }
  async all<T extends TableName>(table: T): Promise<RowFor<T>[]> {
    const db = await databaseFor(this.profileId);
    return new Promise((resolve, reject) => {
      const request = db.transaction(table).objectStore(table).getAll();
      request.onsuccess = () => { db.close(); resolve(request.result as RowFor<T>[]); };
      request.onerror = () => { db.close(); reject(request.error); };
    });
  }
  async get<T extends TableName>(table: T, id: number): Promise<RowFor<T> | undefined> {
    const db = await databaseFor(this.profileId);
    return new Promise((resolve, reject) => {
      const request = db.transaction(table).objectStore(table).get(id);
      request.onsuccess = () => { db.close(); resolve(request.result as RowFor<T> | undefined); };
      request.onerror = () => { db.close(); reject(request.error); };
    });
  }
  async put<T extends TableName>(table: T, row: RowFor<T>, change?: Omit<PendingChange, 'id' | 'table' | 'rowId'>): Promise<void> {
    const db = await databaseFor(this.profileId);
    await new Promise<void>((resolve, reject) => {
      const names = change ? [table, 'pending'] : [table];
      const tx = db.transaction(names, 'readwrite');
      tx.objectStore(table).put(row);
      if (change) tx.objectStore('pending').add({ ...change, table, rowId: Number((row as unknown as Record<string, unknown>)[idFields[table]]), payload: row as unknown as Record<string, unknown> });
      tx.oncomplete = () => { db.close(); resolve(); };
      tx.onerror = () => { db.close(); reject(tx.error); };
    });
  }
  async remove<T extends TableName>(table: T, id: number, queue = true): Promise<void> {
    const oldRow = queue ? await this.get(table, id) : undefined;
    const db = await databaseFor(this.profileId);
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(queue && oldRow ? [table, 'pending'] : [table], 'readwrite');
      tx.objectStore(table).delete(id);
      if (queue && oldRow) tx.objectStore('pending').add({ table, action: 'delete', rowId: id, payload: oldRow as unknown as Record<string, unknown> | undefined } satisfies PendingChange);
      tx.oncomplete = () => { db.close(); resolve(); };
      tx.onerror = () => { db.close(); reject(tx.error); };
    });
  }
  async nextId<T extends TableName>(table: T): Promise<number> {
    const rows = await this.all(table);
    const firstAvailable = Math.min(0, ...rows.map((row) => Number((row as unknown as Record<string, unknown>)[idFields[table]])).filter((id) => id < 0)) - 1;
    const db = await databaseFor(this.profileId);
    return new Promise((resolve, reject) => {
      const tx = db.transaction('meta', 'readwrite');
      const store = tx.objectStore('meta');
      const request = store.get(`next:${table}`);
      let id = firstAvailable;
      request.onsuccess = () => {
        id = Math.min(firstAvailable, Number(request.result?.value ?? firstAvailable));
        store.put({ key: `next:${table}`, value: id - 1 });
      };
      tx.oncomplete = () => { db.close(); resolve(id); };
      tx.onerror = () => { db.close(); reject(tx.error); };
    });
  }
  async pending(): Promise<PendingChange[]> {
    const db = await databaseFor(this.profileId);
    return new Promise((resolve, reject) => {
      const request = db.transaction('pending').objectStore('pending').getAll();
      request.onsuccess = () => { db.close(); resolve(request.result as PendingChange[]); };
      request.onerror = () => { db.close(); reject(request.error); };
    });
  }
  async clearPending(id: number): Promise<void> {
    const db = await databaseFor(this.profileId);
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction('pending', 'readwrite'); tx.objectStore('pending').delete(id);
      tx.oncomplete = () => { db.close(); resolve(); }; tx.onerror = () => { db.close(); reject(tx.error); };
    });
  }
  async remapId(table: TableName, oldId: number, newId: number): Promise<void> {
    const db = await databaseFor(this.profileId);
    const key = idFields[table];
    const tx = db.transaction([...stores, 'pending', 'meta'], 'readwrite');
    const store = tx.objectStore(table);
    const get = store.get(oldId);
    get.onsuccess = () => {
      if (get.result) {
        const row = { ...get.result, [key]: newId } as Record<string, unknown>;
        store.delete(oldId); store.put(row);
      }
    };
    for (const relatedTable of stores) {
      const relatedStore = tx.objectStore(relatedTable);
      const rows = relatedStore.getAll();
      rows.onsuccess = () => {
        for (const row of rows.result as Record<string, unknown>[]) {
          let changed = false;
          if (table === 'clientes' && relatedTable === 'ventas' && row.id_cliente === oldId) { row.id_cliente = newId; changed = true; }
          if (table === 'productos' && relatedTable === 'detalle_venta' && row.id_producto === oldId) { row.id_producto = newId; changed = true; }
          if (table === 'ventas' && relatedTable === 'detalle_venta' && row.id_venta === oldId) { row.id_venta = newId; changed = true; }
          if (changed) relatedStore.put(row);
        }
      };
    }
    const pendingStore = tx.objectStore('pending');
    const pendingRows = pendingStore.getAll();
    pendingRows.onsuccess = () => {
      for (const op of pendingRows.result as PendingChange[]) {
        if (op.table === table && op.rowId === oldId) op.rowId = newId;
        const payload = op.payload as Record<string, unknown> | undefined;
        if (!payload) continue;
        if (table === 'clientes' && op.table === 'ventas' && payload.id_cliente === oldId) payload.id_cliente = newId;
        if (table === 'productos' && op.table === 'detalle_venta' && payload.id_producto === oldId) payload.id_producto = newId;
        if (table === 'ventas' && op.table === 'detalle_venta' && payload.id_venta === oldId) payload.id_venta = newId;
        pendingStore.put(op);
      }
    };
    tx.objectStore('meta').put({ key: `${table}:${oldId}`, value: newId });
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => { db.close(); resolve(); };
      tx.onerror = () => { db.close(); reject(tx.error); };
      tx.onabort = () => { db.close(); reject(tx.error); };
    });
  }
  async resolveId(table: TableName, id: number): Promise<number> {
    if (id >= 0) return id;
    const db = await databaseFor(this.profileId);
    return new Promise((resolve, reject) => {
      const request = db.transaction('meta').objectStore('meta').get(`${table}:${id}`);
      request.onsuccess = () => { db.close(); resolve(Number(request.result?.value ?? id)); };
      request.onerror = () => { db.close(); reject(request.error); };
    });
  }
  async replaceAll<T extends TableName>(table: T, rows: RowFor<T>[]): Promise<void> {
    const db = await databaseFor(this.profileId);
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction([table, 'pending'], 'readwrite');
      const store = tx.objectStore(table);
      let pendingRows: PendingChange[] | undefined;
      let oldProducts: Producto[] | undefined;
      const remote = [...rows];
      const apply = () => {
        if (!pendingRows || (table === 'productos' && !oldProducts)) return;
        store.clear();
        for (const row of remote) store.put(row);
        for (const change of pendingRows) {
          if (change.table !== table) continue;
          if (change.action === 'delete') store.delete(change.rowId);
          else if (change.payload) store.put(change.payload);
        }
        if (table === 'productos') {
          const changedStockIds = new Set(pendingRows
            .filter((change) => change.table === 'detalle_venta')
            .map((change) => Number(change.payload?.id_producto)));
          for (const product of oldProducts ?? []) if (changedStockIds.has(product.id_producto)) store.put(product);
        }
      };
      const pendingRequest = tx.objectStore('pending').getAll();
      pendingRequest.onsuccess = () => { pendingRows = pendingRequest.result as PendingChange[]; apply(); };
      if (table === 'productos') {
        const productsRequest = store.getAll();
        productsRequest.onsuccess = () => { oldProducts = productsRequest.result as Producto[]; apply(); };
      }
      tx.oncomplete = () => { db.close(); resolve(); }; tx.onerror = () => { db.close(); reject(tx.error); };
    });
  }
}

const instances = new Map<string, DatabaseAdapter>();
export const localDatabase = (profileId: string): DatabaseAdapter => {
  let db = instances.get(profileId);
  if (!db) {
    if (isElectron()) {
      db = new ElectronDatabase(profileId);
    } else {
      db = new LocalDatabase(profileId);
    }
    instances.set(profileId, db);
  }
  return db;
};
