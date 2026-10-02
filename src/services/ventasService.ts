import type { Venta, VentaInput, DetalleVenta, DetalleVentaInput, VentaConDetalles, VentaResumen, VentaConItemsInput, Producto } from '../types/database';
import { cancelPendingForRow, deleteRow, newSyncUid, nextLocalId, nowIso, readOne, readTable, resolveLocalId, saveRow, synchronizePending } from '../lib/dataAccess';

const normalizeVenta = (venta: Venta): Venta => ({ ...venta, monto_total: Number(venta.monto_total) || 0 });
const detalleConProducto = async (idVenta: number): Promise<(DetalleVenta & { producto: Producto })[]> => {
  const [detalles, productos] = await Promise.all([readTable('detalle_venta'), readTable('productos')]);
  return detalles.filter((d) => d.id_venta === idVenta).map((d) => ({ ...d, producto: productos.find((p) => p.id_producto === d.id_producto)! })).filter((d) => !!d.producto);
};
export const ventasService = {
  async getAll(): Promise<Venta[]> { return (await readTable('ventas')).map(normalizeVenta).sort((a, b) => b.fecha.localeCompare(a.fecha)); },
  async getById(id: number): Promise<VentaConDetalles> {
    const venta = await readOne('ventas', id); if (!venta) throw new Error('Venta no encontrada');
    const [cliente, detalles] = await Promise.all([readTable('clientes').then((rows) => rows.find((row) => row.id_cliente === venta.id_cliente)), detalleConProducto(id)]);
    if (!cliente) throw new Error('Cliente de la venta no encontrado');
    return { ...normalizeVenta(venta), cliente, detalles };
  },
  async create(input: VentaInput): Promise<Venta> {
    const row: Venta = { id_venta: await nextLocalId('ventas'), sync_uid: newSyncUid(), fecha: nowIso(), ...input, estado_pago: input.estado_pago ?? 'Pendiente', monto_total: 0, created_at: nowIso(), updated_at: nowIso() };
    await saveRow('ventas', row, 'insert'); return { ...row, id_venta: await resolveLocalId('ventas', row.id_venta) };
  },
  async crearVentaConItems(input: VentaConItemsInput): Promise<Venta> {
    const fecha = nowIso();
    const productos = await readTable('productos');
    for (const item of input.items) {
      const producto = productos.find((candidate) => candidate.id_producto === item.id_producto);
      if (!producto) throw new Error(`Producto ${item.id_producto} no encontrado`);
      if (producto.stock_actual < item.cantidad) throw new Error(`Stock insuficiente para ${producto.nombre}`);
    }
    const venta: Venta = { id_venta: await nextLocalId('ventas'), sync_uid: newSyncUid(), fecha, id_cliente: input.id_cliente, estado_pago: input.estado_pago, monto_total: input.items.reduce((sum, item) => sum + item.subtotal, 0), created_at: fecha, updated_at: fecha };
    await saveRow('ventas', venta, 'insert', true, false);
    for (const item of input.items) {
      const producto = await readOne('productos', item.id_producto);
      if (!producto) throw new Error(`Producto ${item.id_producto} no encontrado`);
      const detalle: DetalleVenta = { id_detalle: await nextLocalId('detalle_venta'), id_venta: venta.id_venta, id_producto: item.id_producto, cantidad: item.cantidad, precio_unitario: item.precio_unitario, subtotal: item.subtotal, created_at: fecha };
      await saveRow('detalle_venta', detalle, 'insert', true, false);
      await saveRow('productos', { ...producto, stock_actual: producto.stock_actual - item.cantidad, updated_at: fecha }, 'update', false);
    }
    await synchronizePending().catch(() => undefined);
    return { ...venta, id_venta: await resolveLocalId('ventas', venta.id_venta) };
  },
  async update(id: number, input: Partial<VentaInput>): Promise<Venta> { const row: Venta = { ...(await this.getById(id)), ...input, updated_at: nowIso() }; await saveRow('ventas', row, 'update'); return row; },
  async delete(id: number): Promise<void> {
    const detalles = (await readTable('detalle_venta')).filter((d) => d.id_venta === id);
    for (const detalle of detalles) await detalleVentaService.delete(detalle.id_detalle);
    if (id < 0) await cancelPendingForRow('ventas', id);
    await deleteRow('ventas', id);
  },
  async marcarPagada(id: number): Promise<Venta> { return this.update(id, { estado_pago: 'Pagado' }); },
  async getCuentasPorCobrar(): Promise<VentaResumen[]> {
    const [ventas, clientes, detalles] = await Promise.all([readTable('ventas'), readTable('clientes'), readTable('detalle_venta')]);
    return ventas.filter((v) => v.estado_pago === 'Pendiente').sort((a, b) => b.fecha.localeCompare(a.fecha)).map((v) => ({ id_venta: v.id_venta, fecha: v.fecha, cliente_nombre: clientes.find((c) => c.id_cliente === v.id_cliente)?.nombre_cliente ?? 'N/A', estado_pago: v.estado_pago, monto_total: Number(v.monto_total), cantidad_productos: detalles.filter((d) => d.id_venta === v.id_venta).length }));
  },
  async getVentasPorCliente(idCliente: number): Promise<Venta[]> { return (await readTable('ventas')).filter((v) => v.id_cliente === idCliente).sort((a, b) => b.fecha.localeCompare(a.fecha)); },
};

export const detalleVentaService = {
  async create(input: DetalleVentaInput): Promise<DetalleVenta> {
    const producto = await readOne('productos', input.id_producto); if (!producto) throw new Error('Producto no encontrado');
    const subtotal = input.subtotal ?? input.cantidad * input.precio_unitario;
    const row: DetalleVenta = { ...input, id_detalle: await nextLocalId('detalle_venta'), sync_uid: newSyncUid(), subtotal, created_at: nowIso() };
    await saveRow('detalle_venta', row, 'insert');
    await saveRow('productos', { ...producto, stock_actual: producto.stock_actual - input.cantidad, updated_at: nowIso() }, 'update', false);
    await recalculateVenta(input.id_venta);
    return { ...row, id_detalle: await resolveLocalId('detalle_venta', row.id_detalle) };
  },
  async update(id: number, input: Partial<DetalleVentaInput>): Promise<DetalleVenta> {
    const old = await readOne('detalle_venta', id); if (!old) throw new Error('Detalle no encontrado');
    const row: DetalleVenta = { ...old, ...input, subtotal: Number(input.cantidad ?? old.cantidad) * Number(input.precio_unitario ?? old.precio_unitario) };
    await saveRow('detalle_venta', row, 'update');
    if (old.id_producto === row.id_producto) {
      const product = await readOne('productos', row.id_producto);
      if (product) await saveRow('productos', { ...product, stock_actual: product.stock_actual - (row.cantidad - old.cantidad), updated_at: nowIso() }, 'update', false);
    }
    await recalculateVenta(row.id_venta); return row;
  },
  async delete(id: number): Promise<void> {
    const old = await readOne('detalle_venta', id); if (!old) return;
    await deleteRow('detalle_venta', id);
    const product = await readOne('productos', old.id_producto);
    if (product) await saveRow('productos', { ...product, stock_actual: product.stock_actual + old.cantidad, updated_at: nowIso() }, 'update', false);
    await recalculateVenta(old.id_venta);
  },
  async getByVenta(idVenta: number): Promise<DetalleVenta[]> { return (await readTable('detalle_venta')).filter((d) => d.id_venta === idVenta); },
  async getAllDetalles(): Promise<(DetalleVenta & { producto: Producto })[]> {
    const [detalles, productos] = await Promise.all([readTable('detalle_venta'), readTable('productos')]);
    return detalles.map((d) => ({ ...d, producto: productos.find((p) => p.id_producto === d.id_producto)! })).filter((d) => !!d.producto);
  },
};

async function recalculateVenta(id: number) {
  const venta = await readOne('ventas', id); if (!venta) return;
  const detalles = (await readTable('detalle_venta')).filter((d) => d.id_venta === id);
  await saveRow('ventas', { ...venta, monto_total: detalles.reduce((sum, d) => sum + d.cantidad * d.precio_unitario, 0), updated_at: nowIso() }, 'update');
}

export const ventasConDetallesService = {
  async crearVentaCompleta(input: VentaInput, detalles: DetalleVentaInput[]): Promise<VentaConDetalles> {
    const venta = await ventasService.create(input);
    for (const detalle of detalles) await detalleVentaService.create({ ...detalle, id_venta: venta.id_venta });
    const current = (await readTable('ventas')).find((row) => row.id_venta === venta.id_venta) ?? venta;
    return ventasService.getById(current.id_venta);
  },
};
