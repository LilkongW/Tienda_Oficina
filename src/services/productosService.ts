import type { Producto, ProductoInput } from '../types/database';
import { deleteRow, newSyncUid, nextLocalId, nowIso, readOne, readTable, resolveLocalId, saveRow } from '../lib/dataAccess';

const normalize = (row: Producto): Producto => ({ ...row, costo_unitario: Number(row.costo_paquete) / Number(row.unidades_por_paquete), costo_paquete: Number(row.costo_paquete), precio_venta: Number(row.precio_venta), stock_actual: Number(row.stock_actual) });
export const productosService = {
  async getAll(): Promise<Producto[]> { return (await readTable('productos')).map(normalize).sort((a, b) => a.nombre.localeCompare(b.nombre)); },
  async getById(id: number): Promise<Producto> { const row = await readOne('productos', id); if (!row) throw new Error('Producto no encontrado'); return normalize(row); },
  async create(input: ProductoInput): Promise<Producto> {
    const row: Producto = { id_producto: await nextLocalId('productos'), sync_uid: newSyncUid(), ...input, costo_unitario: input.costo_paquete / input.unidades_por_paquete, stock_actual: input.stock_actual ?? 0, created_at: nowIso(), updated_at: nowIso() };
    await saveRow('productos', row, 'insert'); return { ...row, id_producto: await resolveLocalId('productos', row.id_producto) };
  },
  async update(id: number, input: Partial<ProductoInput>): Promise<Producto> {
    const old = await this.getById(id);
    const row: Producto = normalize({ ...old, ...input, costo_unitario: Number(input.costo_paquete ?? old.costo_paquete) / Number(input.unidades_por_paquete ?? old.unidades_por_paquete), updated_at: nowIso() });
    await saveRow('productos', row, 'update'); return row;
  },
  async delete(id: number): Promise<void> { await deleteRow('productos', id); },
  async actualizarStock(id: number, cantidad: number): Promise<Producto> { return this.update(id, { stock_actual: cantidad }); },
};
