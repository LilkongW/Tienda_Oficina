// Script para cargar datos iniciales
// Ejecutar con: node scripts/cargar-datos.js

import { createClient } from '@supabase/supabase-js';

// Configura tus credenciales de Supabase aquí directamente
const supabaseUrl = 'https://atjjwlwdwpnmmgfvtlrx.supabase.co';
const supabaseKey = 'sb_publishable_Q1gpMrB-thmTLc9Z6twowQ_-kivRvJO';

if (!supabaseUrl || !supabaseKey) {
  console.error('Error: Configura las credenciales de Supabase en el script');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

// Datos de productos
const productos = [
  { nombre: 'Golpe', unidades_por_paquete: 12, costo_paquete: 6.11, precio_venta: 1.00, stock_actual: 100 },
  { nombre: 'Oreo', unidades_por_paquete: 6, costo_paquete: 2.29, precio_venta: 0.80, stock_actual: 100 },
  { nombre: 'Mentos', unidades_por_paquete: 12, costo_paquete: 7.24, precio_venta: 1.20, stock_actual: 100 },
  { nombre: 'De todito 40g', unidades_por_paquete: 12, costo_paquete: 1.40, precio_venta: 1.40, stock_actual: 100 }
];

// Datos de clientes
const clientes = [
  'Geremy', 'Manuel Maldonado', 'Aviannis', 'Andrew', 'Dylan',
  'Daniel Sánchez', 'Laura', 'Chirinos', 'Roberto', 'Samir',
  'Sol', 'Pablo', 'Avi', 'Rodelo', 'Leo', 'Sarah', 'Abrahan', 'Karolain'
];

// Datos de ventas (cliente -> [productos])
// producto: { nombre, cantidad }
// pagado: true/false
const ventasData = [
  { cliente: 'Geremy', productos: [{ nombre: 'Golpe', cantidad: 3 }], pagado: false },
  { cliente: 'Manuel Maldonado', productos: [{ nombre: 'Golpe', cantidad: 2 }], pagado: true },
  { cliente: 'Aviannis', productos: [{ nombre: 'Golpe', cantidad: 1 }], pagado: true },
  { cliente: 'Andrew', productos: [{ nombre: 'Mentos', cantidad: 1 }], pagado: false },
  { cliente: 'Manuel Maldonado', productos: [{ nombre: 'Mentos', cantidad: 1 }, { nombre: 'Golpe', cantidad: 1 }], pagado: false },
  { cliente: 'Dylan', productos: [{ nombre: 'Mentos', cantidad: 1 }], pagado: false },
  { cliente: 'Daniel Sánchez', productos: [{ nombre: 'Golpe', cantidad: 1 }], pagado: false },
  { cliente: 'Aviannis', productos: [{ nombre: 'Golpe', cantidad: 1 }], pagado: false },
  { cliente: 'Manuel Maldonado', productos: [{ nombre: 'Oreo', cantidad: 1 }], pagado: false },
  { cliente: 'Laura', productos: [{ nombre: 'Golpe', cantidad: 1 }], pagado: true },
  { cliente: 'Chirinos', productos: [{ nombre: 'Mentos', cantidad: 1 }], pagado: false },
  { cliente: 'Roberto', productos: [{ nombre: 'Oreo', cantidad: 1 }], pagado: false },
  { cliente: 'Manuel Maldonado', productos: [{ nombre: 'Golpe', cantidad: 1 }], pagado: false },
  { cliente: 'Geremy', productos: [{ nombre: 'De todito 40g', cantidad: 1 }], pagado: false },
  { cliente: 'Daniel Sánchez', productos: [{ nombre: 'De todito 40g', cantidad: 1 }], pagado: false },
  { cliente: 'Samir', productos: [{ nombre: 'Mentos', cantidad: 1 }], pagado: false },
  { cliente: 'Sol', productos: [{ nombre: 'De todito 40g', cantidad: 1 }], pagado: false },
  { cliente: 'Pablo', productos: [{ nombre: 'De todito 40g', cantidad: 2 }], pagado: false },
  { cliente: 'Manuel Maldonado', productos: [{ nombre: 'De todito 40g', cantidad: 1 }], pagado: false },
  { cliente: 'Avi', productos: [{ nombre: 'De todito 40g', cantidad: 1 }], pagado: false },
  { cliente: 'Rodelo', productos: [{ nombre: 'De todito 40g', cantidad: 1 }], pagado: false },
  { cliente: 'Leo', productos: [{ nombre: 'De todito 40g', cantidad: 1 }], pagado: true },
  { cliente: 'Manuel Maldonado', productos: [{ nombre: 'Oreo', cantidad: 1 }], pagado: false },
  { cliente: 'Geremy', productos: [{ nombre: 'De todito 40g', cantidad: 1 }], pagado: false },
  { cliente: 'Chirinos', productos: [{ nombre: 'De todito 40g', cantidad: 1 }], pagado: false },
  { cliente: 'Daniel Sánchez', productos: [{ nombre: 'Golpe', cantidad: 1 }], pagado: false },
  { cliente: 'Aviannis', productos: [{ nombre: 'Golpe', cantidad: 1 }], pagado: false },
  { cliente: 'Sarah', productos: [{ nombre: 'Golpe', cantidad: 1 }], pagado: false },
  { cliente: 'Geremy', productos: [{ nombre: 'Golpe', cantidad: 1 }], pagado: false },
  { cliente: 'Abrahan', productos: [{ nombre: 'Mentos', cantidad: 1 }], pagado: false },
  { cliente: 'Chirinos', productos: [{ nombre: 'Golpe', cantidad: 1 }], pagado: false },
  { cliente: 'Karolain', productos: [{ nombre: 'Golpe', cantidad: 1 }], pagado: false },
  { cliente: 'Sol', productos: [{ nombre: 'Golpe', cantidad: 1 }], pagado: false }
];

async function cargarDatos() {
  try {
    console.log('🚀 Iniciando carga de datos...');

    // 1. Cargar productos
    console.log('📦 Cargando productos...');
    for (const producto of productos) {
      const { error } = await supabase
        .from('productos')
        .insert(producto);
      
      if (error) {
        console.error(`Error insertando producto ${producto.nombre}:`, error.message);
      } else {
        console.log(`✅ Producto ${producto.nombre} insertado`);
      }
    }

    // 2. Cargar clientes
    console.log('👥 Cargando clientes...');
    for (const nombre of clientes) {
      const { error } = await supabase
        .from('clientes')
        .insert({ nombre_cliente: nombre });
      
      if (error) {
        console.error(`Error insertando cliente ${nombre}:`, error.message);
      } else {
        console.log(`✅ Cliente ${nombre} insertado`);
      }
    }

    // 3. Obtener IDs de productos y clientes
    console.log('🔍 Obteniendo IDs...');
    const { data: productosData } = await supabase.from('productos').select('id_producto, nombre');
    const { data: clientesData } = await supabase.from('clientes').select('id_cliente, nombre_cliente');

    const productoMap = new Map(productosData.map(p => [p.nombre, p.id_producto]));
    const clienteMap = new Map(clientesData.map(c => [c.nombre_cliente, c.id_cliente]));

    // 4. Cargar ventas con detalles
    console.log('🛒 Cargando ventas...');
    for (const venta of ventasData) {
      const idCliente = clienteMap.get(venta.cliente);
      if (!idCliente) {
        console.error(`No se encontró cliente: ${venta.cliente}`);
        continue;
      }

      // Insertar venta
      const { data: ventaData, error: ventaError } = await supabase
        .from('ventas')
        .insert({
          id_cliente: idCliente,
          estado_pago: venta.pagado ? 'Pagado' : 'Pendiente',
          monto_total: 0 // Se calculará automáticamente
        })
        .select()
        .single();

      if (ventaError) {
        console.error(`Error insertando venta para ${venta.cliente}:`, ventaError.message);
        continue;
      }

      console.log(`✅ Venta #${ventaData.id_venta} para ${venta.cliente}`);

      // Insertar detalles
      for (const prod of venta.productos) {
        const idProducto = productoMap.get(prod.nombre);
        if (!idProducto) {
          console.error(`No se encontró producto: ${prod.nombre}`);
          continue;
        }

        const { error: detalleError } = await supabase
          .from('detalle_venta')
          .insert({
            id_venta: ventaData.id_venta,
            id_producto: idProducto,
            cantidad: prod.cantidad,
            precio_unitario: productos.find(p => p.nombre === prod.nombre)?.precio_venta || 0
          });

        if (detalleError) {
          console.error(`Error insertando detalle:`, detalleError.message);
        } else {
          console.log(`  - ${prod.cantidad}x ${prod.nombre}`);
        }
      }
    }

    console.log('✨ Datos cargados exitosamente!');
  } catch (error) {
    console.error('Error general:', error);
  }
}

cargarDatos();
