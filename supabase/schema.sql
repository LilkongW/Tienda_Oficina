-- Tabla: Productos (Inventario y Precios)
CREATE TABLE productos (
  id_producto SERIAL PRIMARY KEY,
  sync_uid UUID NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  nombre VARCHAR(255) NOT NULL,
  unidades_por_paquete INTEGER NOT NULL,
  costo_paquete DECIMAL(10, 2) NOT NULL,
  costo_unitario DECIMAL(10, 2) GENERATED ALWAYS AS (costo_paquete / unidades_por_paquete) STORED,
  precio_venta DECIMAL(10, 2) NOT NULL,
  stock_actual INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Tabla: Clientes
CREATE TABLE clientes (
  id_cliente SERIAL PRIMARY KEY,
  sync_uid UUID NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  nombre_cliente VARCHAR(255) NOT NULL,
  telefono VARCHAR(50),
  telegram_chat_id BIGINT UNIQUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Tabla: Ventas (Encabezado de Transacciones)
CREATE TABLE ventas (
  id_venta SERIAL PRIMARY KEY,
  sync_uid UUID NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  fecha TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  id_cliente INTEGER REFERENCES clientes(id_cliente),
  estado_pago VARCHAR(20) NOT NULL DEFAULT 'Pendiente' CHECK (estado_pago IN ('Pagado', 'Pendiente')),
  monto_total DECIMAL(10, 2) NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Tabla: Detalle_Venta
CREATE TABLE detalle_venta (
  id_detalle SERIAL PRIMARY KEY,
  sync_uid UUID NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  id_venta INTEGER REFERENCES ventas(id_venta) ON DELETE CASCADE,
  id_producto INTEGER REFERENCES productos(id_producto),
  cantidad INTEGER NOT NULL,
  precio_unitario DECIMAL(10, 2) NOT NULL,
  subtotal DECIMAL(10, 2) GENERATED ALWAYS AS (cantidad * precio_unitario) STORED,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Índices para optimizar consultas
CREATE INDEX idx_ventas_cliente ON ventas(id_cliente);
CREATE INDEX idx_ventas_estado_pago ON ventas(estado_pago);
CREATE INDEX idx_ventas_fecha ON ventas(fecha);
CREATE INDEX idx_detalle_venta_venta ON detalle_venta(id_venta);
CREATE INDEX idx_detalle_venta_producto ON detalle_venta(id_producto);

-- Función para actualizar updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers para updated_at
CREATE TRIGGER update_productos_updated_at BEFORE UPDATE ON productos
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_clientes_updated_at BEFORE UPDATE ON clientes
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_ventas_updated_at BEFORE UPDATE ON ventas
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Función para actualizar monto_total de venta cuando se insertan/actualizan detalles
CREATE OR REPLACE FUNCTION actualizar_monto_total_venta()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE ventas 
    SET monto_total = (
      SELECT COALESCE(SUM(cantidad * precio_unitario), 0)
      FROM detalle_venta 
      WHERE id_venta = NEW.id_venta
    )
    WHERE id_venta = NEW.id_venta;
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    UPDATE ventas 
    SET monto_total = (
      SELECT COALESCE(SUM(cantidad * precio_unitario), 0)
      FROM detalle_venta 
      WHERE id_venta = NEW.id_venta
    )
    WHERE id_venta = NEW.id_venta;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE ventas 
    SET monto_total = (
      SELECT COALESCE(SUM(cantidad * precio_unitario), 0)
      FROM detalle_venta 
      WHERE id_venta = OLD.id_venta
    )
    WHERE id_venta = OLD.id_venta;
    RETURN OLD;
  END IF;
END;
$$ LANGUAGE plpgsql;

-- Triggers para actualizar monto_total
CREATE TRIGGER actualizar_monto_total_insert AFTER INSERT ON detalle_venta
  FOR EACH ROW EXECUTE FUNCTION actualizar_monto_total_venta();

CREATE TRIGGER actualizar_monto_total_update AFTER UPDATE ON detalle_venta
  FOR EACH ROW EXECUTE FUNCTION actualizar_monto_total_venta();

CREATE TRIGGER actualizar_monto_total_delete AFTER DELETE ON detalle_venta
  FOR EACH ROW EXECUTE FUNCTION actualizar_monto_total_venta();

-- Función para actualizar stock cuando se hace una venta
CREATE OR REPLACE FUNCTION actualizar_stock_venta()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE productos 
    SET stock_actual = stock_actual - NEW.cantidad
    WHERE id_producto = NEW.id_producto;
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    UPDATE productos 
    SET stock_actual = stock_actual - (NEW.cantidad - OLD.cantidad)
    WHERE id_producto = NEW.id_producto;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE productos 
    SET stock_actual = stock_actual + OLD.cantidad
    WHERE id_producto = OLD.id_producto;
    RETURN OLD;
  END IF;
END;
$$ LANGUAGE plpgsql;

-- Trigger para actualizar stock
CREATE TRIGGER actualizar_stock_insert AFTER INSERT ON detalle_venta
  FOR EACH ROW EXECUTE FUNCTION actualizar_stock_venta();

CREATE TRIGGER actualizar_stock_update AFTER UPDATE ON detalle_venta
  FOR EACH ROW EXECUTE FUNCTION actualizar_stock_venta();

CREATE TRIGGER actualizar_stock_delete AFTER DELETE ON detalle_venta
  FOR EACH ROW EXECUTE FUNCTION actualizar_stock_venta();
