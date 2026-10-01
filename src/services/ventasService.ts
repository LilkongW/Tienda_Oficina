import { supabase } from '../lib/supabase';
import type {
  Venta,
  VentaInput,
  DetalleVenta,
  DetalleVentaInput,
  VentaConDetalles,
  VentaResumen,
  VentaConItemsInput,
  Producto,
} from '../types/database';

export const ventasService = {
  async getAll(): Promise<Venta[]> {
    const { data, error } = await supabase
      .from('ventas')
      .select('*')
      .order('fecha', { ascending: false });

    if (error) throw error;
    return data;
  },

  async getById(id: number): Promise<VentaConDetalles> {
    const { data, error } = await supabase
      .from('ventas')
      .select(`
        *,
        cliente:clientes(*),
        detalle_venta(
          *,
          producto:productos(*)
        )
      `)
      .eq('id_venta', id)
      .single();

    if (error) throw error;
    return data;
  },

  async create(venta: VentaInput): Promise<Venta> {
    const { data, error } = await supabase
      .from('ventas')
      .insert(venta)
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  /**
   * Crea una venta completa: el trigger de detalle_venta en la base de datos
   * descuenta el stock. No actualizar stock también desde el cliente.
   * Si algo falla, hace rollback (borra la venta recién creada).
   */
  async crearVentaConItems(input: VentaConItemsInput): Promise<Venta> {
    const monto_total = input.items.reduce((s, i) => s + i.subtotal, 0);

    // 1) Crear la venta
    const { data: venta, error: errVenta } = await supabase
      .from('ventas')
      .insert({
        id_cliente: input.id_cliente,
        estado_pago: input.estado_pago,
        monto_total,
      })
      .select()
      .single();

    if (errVenta) throw errVenta;

    // 2) Crear los detalles (subtotal es columna generada → NO se envía)
    const detalles = input.items.map((i) => ({
      id_venta: venta.id_venta,
      id_producto: i.id_producto,
      cantidad: i.cantidad,
      precio_unitario: i.precio_unitario,
    }));

    const { error: errDetalle } = await supabase
      .from('detalle_venta')
      .insert(detalles);

    if (errDetalle) {
      await supabase.from('ventas').delete().eq('id_venta', venta.id_venta);
      throw errDetalle;
    }

    return venta as Venta;
  },

  async update(id: number, venta: Partial<VentaInput>): Promise<Venta> {
    const { data, error } = await supabase
      .from('ventas')
      .update(venta)
      .eq('id_venta', id)
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  async delete(id: number): Promise<void> {
    const { error } = await supabase
      .from('ventas')
      .delete()
      .eq('id_venta', id);

    if (error) throw error;
  },

  async marcarPagada(id: number): Promise<Venta> {
    const { data, error } = await supabase
      .from('ventas')
      .update({ estado_pago: 'Pagado' })
      .eq('id_venta', id)
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  async getCuentasPorCobrar(): Promise<VentaResumen[]> {
    const { data, error } = await supabase
      .from('ventas')
      .select(`
        id_venta,
        fecha,
        cliente:clientes(nombre_cliente),
        estado_pago,
        monto_total,
        detalle_venta(count)
      `)
      .eq('estado_pago', 'Pendiente')
      .order('fecha', { ascending: false });

    if (error) throw error;

    return data.map((venta: any) => ({
      id_venta: venta.id_venta,
      fecha: venta.fecha,
      cliente_nombre: venta.cliente?.nombre_cliente || 'N/A',
      estado_pago: venta.estado_pago,
      monto_total: venta.monto_total,
      cantidad_productos: venta.detalle_venta[0]?.count || 0,
    }));
  },

  async getVentasPorCliente(idCliente: number): Promise<Venta[]> {
    const { data, error } = await supabase
      .from('ventas')
      .select('*')
      .eq('id_cliente', idCliente)
      .order('fecha', { ascending: false });

    if (error) throw error;
    return data;
  },
};

export const detalleVentaService = {
  async create(detalle: DetalleVentaInput): Promise<DetalleVenta> {
    const { data, error } = await supabase
      .from('detalle_venta')
      .insert(detalle)
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  async update(id: number, detalle: Partial<DetalleVentaInput>): Promise<DetalleVenta> {
    const { data, error } = await supabase
      .from('detalle_venta')
      .update(detalle)
      .eq('id_detalle', id)
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  async delete(id: number): Promise<void> {
    const { error } = await supabase
      .from('detalle_venta')
      .delete()
      .eq('id_detalle', id);

    if (error) throw error;
  },

  async getByVenta(idVenta: number): Promise<DetalleVenta[]> {
    const { data, error } = await supabase
      .from('detalle_venta')
      .select('*, producto:productos(*)')
      .eq('id_venta', idVenta);

    if (error) throw error;
    return data;
  },

  async getAllDetalles(): Promise<(DetalleVenta & { producto: Producto })[]> {
    const { data, error } = await supabase
      .from('detalle_venta')
      .select('*, producto:productos(*)');

    if (error) throw error;
    return data;
  },
};

export const ventasConDetallesService = {
  async crearVentaCompleta(
    venta: VentaInput,
    detalles: DetalleVentaInput[]
  ): Promise<VentaConDetalles> {
    const { data: ventaData, error: ventaError } = await supabase
      .from('ventas')
      .insert(venta)
      .select()
      .single();

    if (ventaError) throw ventaError;

    const detallesConVenta = detalles.map((detalle) => ({
      ...detalle,
      id_venta: ventaData.id_venta,
    }));

    const { data: detallesData, error: detallesError } = await supabase
      .from('detalle_venta')
      .insert(detallesConVenta)
      .select('*, producto:productos(*)');

    if (detallesError) throw detallesError;

    const { data: clienteData } = await supabase
      .from('clientes')
      .select('*')
      .eq('id_cliente', ventaData.id_cliente)
      .single();

    return {
      ...ventaData,
      cliente: clienteData,
      detalles: detallesData,
    };
  },
};
