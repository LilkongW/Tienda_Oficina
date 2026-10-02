export interface Producto {
  id_producto: number;
  sync_uid?: string;
  nombre: string;
  unidades_por_paquete: number;
  costo_paquete: number;
  costo_unitario: number;
  precio_venta: number;
  stock_actual: number;
  created_at: string;
  updated_at: string;
}

export interface ProductoInput {
  nombre: string;
  unidades_por_paquete: number;
  costo_paquete: number;
  precio_venta: number;
  stock_actual?: number;
}

export interface Cliente {
  id_cliente: number;
  sync_uid?: string;
  nombre_cliente: string;
  telefono?: string | null;
  telegram_chat_id?: number | null;
  created_at: string;
  updated_at: string;
}

export interface ClienteInput {
  nombre_cliente: string;
  telefono?: string;
}

export interface Venta {
  id_venta: number;
  sync_uid?: string;
  fecha: string;
  id_cliente: number;
  estado_pago: 'Pagado' | 'Pendiente';
  monto_total: number;
  created_at: string;
  updated_at: string;
}

export interface VentaInput {
  id_cliente: number;
  estado_pago?: 'Pagado' | 'Pendiente';
}

export interface VentaConItemsInput {
  id_cliente: number;
  estado_pago: 'Pagado' | 'Pendiente';
  items: {
    id_producto: number;
    cantidad: number;
    precio_unitario: number;
    subtotal: number;
  }[];
}

export interface DetalleVenta {
  id_detalle: number;
  sync_uid?: string;
  id_venta: number;
  id_producto: number;
  cantidad: number;
  precio_unitario: number;
  subtotal: number;
  created_at: string;
}

export interface DetalleVentaInput {
  id_venta: number;
  id_producto: number;
  cantidad: number;
  precio_unitario: number;
  subtotal?: number;
}

export interface VentaConDetalles extends Venta {
  cliente: Cliente;
  detalles: (DetalleVenta & { producto: Producto })[];
}

export interface VentaResumen {
  id_venta: number;
  fecha: string;
  cliente_nombre: string;
  estado_pago: 'Pagado' | 'Pendiente';
  monto_total: number;
  cantidad_productos: number;
}
