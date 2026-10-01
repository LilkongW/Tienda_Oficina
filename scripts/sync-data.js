// Script de sincronización usando endpoints de la API
// Ejecutar: node scripts/sync-data.js

import { createClient } from '@supabase/supabase-js';

// Configuración directa de Supabase
const supabaseUrl = 'https://atjjwlwdwpnmmgfvtlrx.supabase.co';
const supabaseKey = 'sb_publishable_Q1gpMrB-thmTLc9Z6twowQ_-kivRvJO';

const supabase = createClient(supabaseUrl, supabaseKey);

// Datos de productos
const productos = [
  { id_producto: 1, nombre: 'Golpe', unidades_por_paquete: 12, costo_paquete: 6.11, precio_venta: 1.00, stock_actual: 100 },
  { id_producto: 2, nombre: 'Oreo', unidades_por_paquete: 6, costo_paquete: 2.29, precio_venta: 0.80, stock_actual: 100 },
  { id_producto: 3, nombre: 'Mentos', unidades_por_paquete: 12, costo_paquete: 7.24, precio_venta: 1.20, stock_actual: 100 },
  { id_producto: 4, nombre: 'De todito 40g', unidades_por_paquete: 12, costo_paquete: 1.40, precio_venta: 1.40, stock_actual: 100 }
];

// Datos de clientes
const clientes = [
  { id_cliente: 1, nombre_cliente: 'Geremy' },
  { id_cliente: 2, nombre_cliente: 'Manuel Maldonado' },
  { id_cliente: 3, nombre_cliente: 'Aviannis' },
  { id_cliente: 4, nombre_cliente: 'Andrew' },
  { id_cliente: 5, nombre_cliente: 'Dylan' },
  { id_cliente: 6, nombre_cliente: 'Daniel Sánchez' },
  { id_cliente: 7, nombre_cliente: 'Laura' },
  { id_cliente: 8, nombre_cliente: 'Chirinos' },
  { id_cliente: 9, nombre_cliente: 'Roberto' },
  { id_cliente: 10, nombre_cliente: 'Samir' },
  { id_cliente: 11, nombre_cliente: 'Sol' },
  { id_cliente: 12, nombre_cliente: 'Pablo' },
  { id_cliente: 13, nombre_cliente: 'Avi' },
  { id_cliente: 14, nombre_cliente: 'Rodelo' },
  { id_cliente: 15, nombre_cliente: 'Leo' },
  { id_cliente: 16, nombre_cliente: 'Sarah' },
  { id_cliente: 17, nombre_cliente: 'Abrahan' },
  { id_cliente: 18, nombre_cliente: 'Karolain' },
  { id_cliente: 19, nombre_cliente: 'Josuep' }
];

// Datos de ventas (cliente -> [productos, pagado])
const ventasData = [
  { cliente: 1, productos: [{ id: 1, cantidad: 3, precio: 1.00 }], pagado: true }, // Geremy 3 golpes ✅
  { cliente: 2, productos: [{ id: 1, cantidad: 2, precio: 1.00 }], pagado: true }, // Manuel 2 golpes ✅
  { cliente: 3, productos: [{ id: 1, cantidad: 1, precio: 1.00 }], pagado: true }, // Aviannis 1 golpe ✅
  { cliente: 4, productos: [{ id: 3, cantidad: 1, precio: 1.20 }], pagado: false }, // Andrew 1 mento
  { cliente: 2, productos: [{ id: 3, cantidad: 1, precio: 1.20 }, { id: 1, cantidad: 1, precio: 1.00 }], pagado: false }, // Manuel 1 mento y 1 golpe
  { cliente: 5, productos: [{ id: 3, cantidad: 1, precio: 1.20 }], pagado: true }, // Dylan 1 mentos ✅
  { cliente: 6, productos: [{ id: 1, cantidad: 1, precio: 1.00 }], pagado: false }, // Daniel 1 golpe
  { cliente: 3, productos: [{ id: 1, cantidad: 1, precio: 1.00 }], pagado: false }, // Aviannis 1 golpe
  { cliente: 2, productos: [{ id: 2, cantidad: 1, precio: 0.80 }], pagado: false }, // Manuel 1 oreo
  { cliente: 7, productos: [{ id: 1, cantidad: 1, precio: 1.00 }], pagado: true }, // Laura 1 golpe ✅
  { cliente: 8, productos: [{ id: 3, cantidad: 1, precio: 1.20 }], pagado: true }, // Chirinos 1 Mentos ✅
  { cliente: 9, productos: [{ id: 2, cantidad: 1, precio: 0.80 }], pagado: true }, // Roberto 1 oreo ✅
  { cliente: 2, productos: [{ id: 1, cantidad: 1, precio: 1.00 }], pagado: false }, // Manuel 1 golpe
  { cliente: 1, productos: [{ id: 4, cantidad: 1, precio: 1.40 }], pagado: true }, // Geremy 1 de todito ✅
  { cliente: 6, productos: [{ id: 4, cantidad: 1, precio: 1.40 }], pagado: true }, // Daniel 1 de todito ✅
  { cliente: 10, productos: [{ id: 3, cantidad: 1, precio: 1.20 }], pagado: true }, // Samir 1 Mentos ✅
  { cliente: 11, productos: [{ id: 4, cantidad: 1, precio: 1.40 }], pagado: true }, // Sol 1 de todito ✅
  { cliente: 12, productos: [{ id: 4, cantidad: 2, precio: 1.40 }], pagado: true }, // Pablo 2 de todito ✅
  { cliente: 2, productos: [{ id: 4, cantidad: 1, precio: 1.40 }], pagado: false }, // Manuel 1 de todito
  { cliente: 13, productos: [{ id: 4, cantidad: 1, precio: 1.40 }], pagado: false }, // Avi 1 de todito
  { cliente: 14, productos: [{ id: 4, cantidad: 1, precio: 1.40 }], pagado: true }, // Rodelo 1 de todito ✅
  { cliente: 15, productos: [{ id: 4, cantidad: 1, precio: 1.40 }], pagado: true }, // Leo 1 de todito ✅
  { cliente: 2, productos: [{ id: 2, cantidad: 1, precio: 0.80 }], pagado: false }, // Manuel 1 oreo
  { cliente: 1, productos: [{ id: 4, cantidad: 1, precio: 1.40 }], pagado: true }, // Geremy 1 de todito ✅
  { cliente: 8, productos: [{ id: 4, cantidad: 1, precio: 1.40 }], pagado: true }, // Chirinos 1 de todito ✅
  { cliente: 6, productos: [{ id: 1, cantidad: 1, precio: 1.00 }], pagado: false }, // Daniel 1 golpe
  { cliente: 3, productos: [{ id: 1, cantidad: 1, precio: 1.00 }], pagado: false }, // Aviannis 1 golpe
  { cliente: 16, productos: [{ id: 1, cantidad: 1, precio: 1.00 }], pagado: false }, // Sarah 1 golpe
  { cliente: 1, productos: [{ id: 1, cantidad: 1, precio: 1.00 }], pagado: true }, // Geremy 1 golpe ✅
  { cliente: 17, productos: [{ id: 3, cantidad: 1, precio: 1.20 }], pagado: false }, // Abrahan 1 Mentos
  { cliente: 8, productos: [{ id: 1, cantidad: 1, precio: 1.00 }], pagado: false }, // Chirinos 1 golpe
  { cliente: 18, productos: [{ id: 1, cantidad: 1, precio: 1.00 }], pagado: false }, // Karolain 1 golpe
  { cliente: 11, productos: [{ id: 1, cantidad: 1, precio: 1.00 }], pagado: true }, // Sol 1 golpe ✅
  { cliente: 5, productos: [{ id: 3, cantidad: 1, precio: 1.20 }], pagado: true }, // Dylan 1 mentos ✅
  { cliente: 19, productos: [{ id: 3, cantidad: 1, precio: 1.20 }], pagado: true }, // Josuep 1 mentos ✅
  { cliente: 17, productos: [{ id: 1, cantidad: 1, precio: 1.00 }], pagado: false }  // Abrahan 1 golpe
];

async function syncData() {
  try {
    console.log('🚀 Iniciando sincronización de datos...\n');

    // 1. Limpiar datos existentes
    console.log('🗑️  Limpiando datos existentes...');
    await supabase.from('detalle_venta').delete().neq('id_detalle', 0);
    await supabase.from('ventas').delete().neq('id_venta', 0);
    await supabase.from('clientes').delete().neq('id_cliente', 0);
    await supabase.from('productos').delete().neq('id_producto', 0);
    console.log('✅ Datos limpiados\n');

    // 2. Insertar productos
    console.log('📦 Insertando productos...');
    for (const producto of productos) {
      const { error } = await supabase.from('productos').insert(producto);
      if (error) {
        console.error(`❌ Error insertando producto ${producto.nombre}:`, error.message);
      } else {
        console.log(`✅ ${producto.nombre} insertado`);
      }
    }
    console.log(`✅ ${productos.length} productos insertados\n`);

    // 3. Insertar clientes
    console.log('👥 Insertando clientes...');
    for (const cliente of clientes) {
      const { error } = await supabase.from('clientes').insert(cliente);
      if (error) {
        console.error(`❌ Error insertando cliente ${cliente.nombre_cliente}:`, error.message);
      } else {
        console.log(`✅ ${cliente.nombre_cliente} insertado`);
      }
    }
    console.log(`✅ ${clientes.length} clientes insertados\n`);

    // 4. Insertar ventas y detalles
    console.log('🛒 Insertando ventas y detalles...');
    let ventasInsertadas = 0;
    let detallesInsertados = 0;

    for (const venta of ventasData) {
      // Insertar venta
      const { data: ventaData, error: ventaError } = await supabase
        .from('ventas')
        .insert({
          id_cliente: venta.cliente,
          estado_pago: venta.pagado ? 'Pagado' : 'Pendiente',
          monto_total: 0
        })
        .select()
        .single();

      if (ventaError) {
        console.error(`❌ Error insertando venta para cliente ${venta.cliente}:`, ventaError.message);
        continue;
      }

      ventasInsertadas++;

      // Insertar detalles
      for (const producto of venta.productos) {
        const { error: detalleError } = await supabase
          .from('detalle_venta')
          .insert({
            id_venta: ventaData.id_venta,
            id_producto: producto.id,
            cantidad: producto.cantidad,
            precio_unitario: producto.precio
          });

        if (detalleError) {
          console.error(`❌ Error insertando detalle:`, detalleError.message);
        } else {
          detallesInsertados++;
        }
      }

      const clienteNombre = clientes.find(c => c.id_cliente === venta.cliente)?.nombre_cliente || 'Desconocido';
      const estado = venta.pagado ? '✅ Pagado' : '⏳ Pendiente';
      console.log(`✅ Venta #${ventaData.id_venta} - ${clienteNombre} - ${estado}`);
    }

    console.log(`\n✅ ${ventasInsertadas} ventas insertadas`);
    console.log(`✅ ${detallesInsertados} detalles insertados\n`);

    // 5. Verificar datos
    console.log('📊 Verificando datos sincronizados...');
    const { count: productosCount } = await supabase.from('productos').select('*', { count: 'exact', head: true });
    const { count: clientesCount } = await supabase.from('clientes').select('*', { count: 'exact', head: true });
    const { count: ventasCount } = await supabase.from('ventas').select('*', { count: 'exact', head: true });
    const { count: detallesCount } = await supabase.from('detalle_venta').select('*', { count: 'exact', head: true });

    console.log('\n📈 Resumen de sincronización:');
    console.log(`   Productos: ${productosCount}`);
    console.log(`   Clientes: ${clientesCount}`);
    console.log(`   Ventas: ${ventasCount}`);
    console.log(`   Detalles: ${detallesCount}`);

    // 6. Cuentas por cobrar
    const { data: cuentasPorCobrar } = await supabase
      .from('ventas')
      .select('monto_total')
      .eq('estado_pago', 'Pendiente');

    const totalPorCobrar = cuentasPorCobrar?.reduce((sum, v) => sum + v.monto_total, 0) || 0;
    console.log(`   Cuentas por cobrar: ${cuentasPorCobrar?.length || 0} ($${totalPorCobrar.toFixed(2)})`);

    console.log('\n✨ Sincronización completada exitosamente!');
  } catch (error) {
    console.error('❌ Error durante la sincronización:', error);
    process.exit(1);
  }
}

syncData();
