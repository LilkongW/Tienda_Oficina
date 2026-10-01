# API Endpoints - Sistema de Ventas

## Arquitectura de Comunicación

El sistema utiliza **Supabase** como backend, que proporciona una API REST automática basada en las tablas de PostgreSQL. La comunicación se realiza a través del cliente de Supabase (`@supabase/supabase-js`).

## Servicios Disponibles

### 1. **Productos** (`src/services/productosService.ts`)

#### Endpoints disponibles:
- `getAll()` - Obtener todos los productos
- `getById(id)` - Obtener un producto por ID
- `create(producto)` - Crear nuevo producto
- `update(id, producto)` - Actualizar producto existente
- `delete(id)` - Eliminar producto
- `actualizarStock(id, cantidad)` - Actualizar stock específico

#### Ejemplo de uso:
```typescript
import { productosService } from '../services/productosService';

// Obtener todos los productos
const productos = await productosService.getAll();

// Crear nuevo producto
const nuevoProducto = await productosService.create({
  nombre: 'Golpe',
  unidades_por_paquete: 12,
  costo_paquete: 6.11,
  precio_venta: 1.00,
  stock_actual: 100
});
```

### 2. **Clientes** (`src/services/clientesService.ts`)

#### Endpoints disponibles:
- `getAll()` - Obtener todos los clientes
- `getById(id)` - Obtener un cliente por ID
- `create(cliente)` - Crear nuevo cliente
- `update(id, cliente)` - Actualizar cliente existente
- `delete(id)` - Eliminar cliente
- `getHistorialCompras(idCliente)` - Obtener historial de compras de un cliente

#### Ejemplo de uso:
```typescript
import { clientesService } from '../services/clientesService';

// Obtener todos los clientes
const clientes = await clientesService.getAll();

// Crear nuevo cliente
const nuevoCliente = await clientesService.create({
  nombre_cliente: 'Juan Pérez',
  telefono: '+58 412-1234567'
});
```

### 3. **Ventas** (`src/services/ventasService.ts`)

#### Endpoints disponibles:
- `getAll()` - Obtener todas las ventas
- `getById(id)` - Obtener venta con detalles completos
- `create(venta)` - Crear nueva venta
- `update(id, venta)` - Actualizar venta existente
- `delete(id)` - Eliminar venta
- `marcarPagada(id)` - Marcar venta como pagada
- `getCuentasPorCobrar()` - Obtener ventas pendientes de pago
- `getVentasPorCliente(idCliente)` - Obtener ventas de un cliente específico

#### Ejemplo de uso:
```typescript
import { ventasService } from '../services/ventasService';

// Obtener todas las ventas
const ventas = await ventasService.getAll();

// Crear nueva venta
const nuevaVenta = await ventasService.create({
  id_cliente: 1,
  estado_pago: 'Pendiente'
});

// Marcar como pagada
await ventasService.marcarPagada(1);

// Obtener cuentas por cobrar
const cuentasPorCobrar = await ventasService.getCuentasPorCobrar();
```

### 4. **Detalle de Ventas** (`src/services/ventasService.ts` - `detalleVentaService`)

#### Endpoints disponibles:
- `create(detalle)` - Crear detalle de venta
- `update(id, detalle)` - Actualizar detalle de venta
- `delete(id)` - Eliminar detalle de venta
- `getByVenta(idVenta)` - Obtener detalles de una venta específica

#### Ejemplo de uso:
```typescript
import { detalleVentaService } from '../services/ventasService';

// Crear detalle de venta
const detalle = await detalleVentaService.create({
  id_venta: 1,
  id_producto: 1,
  cantidad: 2,
  precio_unitario: 1.00
});
```

### 5. **Ventas Completas** (`src/services/ventasService.ts` - `ventasConDetallesService`)

#### Endpoints disponibles:
- `crearVentaCompleta(venta, detalles)` - Crear venta con todos sus detalles en una transacción

#### Ejemplo de uso:
```typescript
import { ventasConDetallesService } from '../services/ventasService';

// Crear venta completa con detalles
const ventaCompleta = await ventasConDetallesService.crearVentaCompleta(
  {
    id_cliente: 1,
    estado_pago: 'Pendiente'
  },
  [
    {
      id_venta: 0,
      id_producto: 1,
      cantidad: 2,
      precio_unitario: 1.00
    }
  ]
);
```

## Configuración de Supabase

El cliente de Supabase está configurado en `src/lib/supabase.ts`:

```typescript
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

export const supabase = createClient(supabaseUrl, supabaseKey);
```

## Variables de Entorno

Las credenciales de Supabase se configuran en el archivo `.env`:

```env
VITE_SUPABASE_URL=https://tu-proyecto.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=tu-clave-publica
```

## Tipos de Datos

Los tipos TypeScript están definidos en `src/types/database.ts`:

- `Producto` - Entidad de producto
- `ProductoInput` - Input para crear/actualizar producto
- `Cliente` - Entidad de cliente
- `ClienteInput` - Input para crear/actualizar cliente
- `Venta` - Entidad de venta
- `VentaInput` - Input para crear/actualizar venta
- `DetalleVenta` - Entidad de detalle de venta
- `DetalleVentaInput` - Input para crear/actualizar detalle
- `VentaConDetalles` - Venta con todos sus detalles relacionados
- `VentaResumen` - Resumen de venta para vistas

## Comunicación Front-Back

1. **Frontend (React)** → Llama a los servicios
2. **Servicios** → Usan el cliente de Supabase
3. **Supabase** → Se comunica con PostgreSQL
4. **PostgreSQL** → Ejecuta las operaciones en la base de datos

## Ejemplo Completo de Flujo

```typescript
// 1. Usuario crea una venta en el frontend
const handleCrearVenta = async () => {
  try {
    // 2. Llamada al servicio
    const venta = await ventasService.create({
      id_cliente: selectedCliente,
      estado_pago: 'Pendiente'
    });
    
    // 3. El servicio usa Supabase
    // 4. Supabase hace INSERT en PostgreSQL
    // 5. Retorna el resultado al frontend
    console.log('Venta creada:', venta);
  } catch (error) {
    console.error('Error:', error);
  }
};
```

## Ventajas de esta Arquitectura

- **Sin servidor backend propio**: Supabase maneja la API automáticamente
- **Tipado fuerte**: TypeScript previene errores en tiempo de desarrollo
- **Servicios reutilizables**: Lógica de negocio separada de componentes
- **CRUD completo**: Operaciones completas para todas las entidades
- **Relaciones automáticas**: Supabase maneja JOINs entre tablas
