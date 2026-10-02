import type { Cliente, ClienteInput } from '../types/database';
import { deleteRow, newSyncUid, nextLocalId, nowIso, readOne, readTable, resolveLocalId, saveRow } from '../lib/dataAccess';

export const clientesService = {
  async getAll(): Promise<Cliente[]> { return (await readTable('clientes')).sort((a, b) => a.nombre_cliente.localeCompare(b.nombre_cliente)); },
  async getById(id: number): Promise<Cliente> { const row = await readOne('clientes', id); if (!row) throw new Error('Cliente no encontrado'); return row; },
  async create(input: ClienteInput): Promise<Cliente> {
    const row: Cliente = { id_cliente: await nextLocalId('clientes'), sync_uid: newSyncUid(), ...input, created_at: nowIso(), updated_at: nowIso() };
    await saveRow('clientes', row, 'insert'); return { ...row, id_cliente: await resolveLocalId('clientes', row.id_cliente) };
  },
  async update(id: number, input: Partial<ClienteInput>): Promise<Cliente> {
    const row: Cliente = { ...(await this.getById(id)), ...input, updated_at: nowIso() };
    await saveRow('clientes', row, 'update'); return row;
  },
  async delete(id: number): Promise<void> { await deleteRow('clientes', id); },
  async getHistorialCompras(idCliente: number): Promise<any[]> {
    const [ventas, clientes, detalles, productos] = await Promise.all([readTable('ventas'), readTable('clientes'), readTable('detalle_venta'), readTable('productos')]);
    const cliente = clientes.find((row) => row.id_cliente === idCliente);
    return ventas.filter((venta) => venta.id_cliente === idCliente).map((venta) => ({ ...venta, cliente: cliente ? { nombre_cliente: cliente.nombre_cliente } : null, detalle_venta: detalles.filter((detalle) => detalle.id_venta === venta.id_venta).map((detalle) => ({ ...detalle, producto: productos.find((producto) => producto.id_producto === detalle.id_producto) ? { nombre: productos.find((producto) => producto.id_producto === detalle.id_producto)!.nombre } : null })) }));
  },
};
