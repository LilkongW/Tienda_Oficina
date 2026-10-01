import { useState, useEffect } from 'react';
import { ventasService, detalleVentaService } from '../services/ventasService';
import { clientesService } from '../services/clientesService';
import { productosService } from '../services/productosService';
import type { Venta, Cliente, Producto, DetalleVenta } from '../types/database';

interface ClienteMetrica {
  id_cliente: number;
  nombre_cliente: string;
  total_compras: number;
  monto_total: number;
}

interface ProductoMetrica {
  id_producto: number;
  nombre: string;
  cantidad_vendida: number;
  monto_total: number;
}

interface VentaPorDia {
  dia: string;
  hora: number;
  cantidad: number;
  monto: number;
}

export default function MetricasManager() {
  const [ventas, setVentas] = useState<Venta[]>([]);
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [productos, setProductos] = useState<Producto[]>([]);
  const [detalles, setDetalles] = useState<(DetalleVenta & { producto: Producto })[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      const [ventasData, clientesData, productosData, detallesData] = await Promise.all([
        ventasService.getAll(),
        clientesService.getAll(),
        productosService.getAll(),
        detalleVentaService.getAllDetalles(),
      ]);
      setVentas(ventasData);
      setClientes(clientesData);
      setProductos(productosData);
      setDetalles(detallesData);
    } catch (error) {
      console.error('Error loading data:', error);
      alert('Error al cargar datos');
    } finally {
      setLoading(false);
    }
  };

  // Calcular métricas de clientes
  const clientesMetricas: ClienteMetrica[] = clientes.map((cliente) => {
    const ventasCliente = ventas.filter((v) => v.id_cliente === cliente.id_cliente);
    return {
      id_cliente: cliente.id_cliente,
      nombre_cliente: cliente.nombre_cliente,
      total_compras: ventasCliente.length,
      monto_total: ventasCliente.reduce((sum, v) => sum + v.monto_total, 0),
    };
  }).sort((a, b) => b.monto_total - a.monto_total);

  // Calcular métricas de productos
  const productosMetricas: ProductoMetrica[] = productos.map((producto) => {
    const detallesProducto = detalles.filter((d) => d.id_producto === producto.id_producto);
    return {
      id_producto: producto.id_producto,
      nombre: producto.nombre,
      cantidad_vendida: detallesProducto.reduce((sum, d) => sum + d.cantidad, 0),
      monto_total: detallesProducto.reduce((sum, d) => sum + d.subtotal, 0),
    };
  }).filter((p) => p.cantidad_vendida > 0).sort((a, b) => b.cantidad_vendida - a.cantidad_vendida);

  // Calcular ganancias (ventas - costos)
  const gananciasTotales = detalles.reduce((sum, d) => {
    const costoTotal = d.cantidad * d.producto.costo_unitario;
    return sum + (d.subtotal - costoTotal);
  }, 0);

  // Calcular ventas por día y hora
  const ventasPorDia: VentaPorDia[] = ventas.map((venta) => {
    const fecha = new Date(venta.fecha);
    const dias = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
    return {
      dia: dias[fecha.getDay()],
      hora: fecha.getHours(),
      cantidad: 1,
      monto: venta.monto_total,
    };
  });

  // Agrupar por día y hora
  const ventasAgrupadas = ventasPorDia.reduce((acc, venta) => {
    const key = `${venta.dia}-${venta.hora}`;
    if (!acc[key]) {
      acc[key] = { dia: venta.dia, hora: venta.hora, cantidad: 0, monto: 0 };
    }
    acc[key].cantidad += venta.cantidad;
    acc[key].monto += venta.monto;
    return acc;
  }, {} as Record<string, VentaPorDia>);

  const ventasPorDiaArray = Object.values(ventasAgrupadas).sort((a, b) => {
    const ordenDias = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
    const idxA = ordenDias.indexOf(a.dia);
    const idxB = ordenDias.indexOf(b.dia);
    if (idxA !== idxB) return idxA - idxB;
    return a.hora - b.hora;
  });

  // Ventas por día (total)
  const ventasPorDiaTotal = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'].map(dia => {
    const ventasDia = ventasPorDiaArray.filter(v => v.dia === dia);
    return {
      dia,
      cantidad: ventasDia.reduce((sum, v) => sum + v.cantidad, 0),
      monto: ventasDia.reduce((sum, v) => sum + v.monto, 0),
    };
  });

  const totalVentas = ventas.length;
  const montoTotalGlobal = ventas.reduce((sum, v) => sum + v.monto_total, 0);
  const ventasPagadas = ventas.filter((v) => v.estado_pago === 'Pagado').length;
  const ventasPendientes = ventas.filter((v) => v.estado_pago === 'Pendiente').length;
  const ticketPromedio = totalVentas > 0 ? montoTotalGlobal / totalVentas : 0;

  if (loading) {
    return (
      <div className="loading-container">
        <div className="loading-spinner"></div>
        <span className="loading-text">Cargando métricas...</span>
      </div>
    );
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">📊 Métricas</h1>
          <p className="page-description">Análisis de ventas y rendimiento</p>
        </div>
        <button onClick={loadData} className="btn btn-secondary" disabled={loading}>
          🔄 {loading ? 'Actualizando...' : 'Recargar'}
        </button>
      </div>

      {/* Stats Generales */}
      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-card-icon blue">🛒</div>
          <div className="stat-card-label">Total Ventas</div>
          <div className="stat-card-value">{totalVentas}</div>
        </div>
        <div className="stat-card">
          <div className="stat-card-icon green">�</div>
          <div className="stat-card-label">Ganancias Totales</div>
          <div className="stat-card-value text-green">${gananciasTotales.toFixed(2)}</div>
        </div>
        <div className="stat-card">
          <div className="stat-card-icon yellow">📈</div>
          <div className="stat-card-label">Ticket Promedio</div>
          <div className="stat-card-value">${ticketPromedio.toFixed(2)}</div>
        </div>
        <div className="stat-card">
          <div className="stat-card-icon red">⏳</div>
          <div className="stat-card-label">Por Cobrar</div>
          <div className="stat-card-value text-red">{ventasPendientes}</div>
        </div>
      </div>

      {/* Ventas por día */}
      <div className="card">
        <div className="card-header">
          <h2 className="card-title">� Ventas por día de la semana</h2>
        </div>
        {ventasPorDiaTotal.every(v => v.cantidad === 0) ? (
          <div className="empty-state">
            <div className="empty-state-icon">📅</div>
            <div className="empty-state-text">No hay datos de ventas por día</div>
          </div>
        ) : (
          <div className="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>Día</th>
                  <th>Cantidad Ventas</th>
                  <th>Monto Total</th>
                  <th>Barra</th>
                </tr>
              </thead>
              <tbody>
                {ventasPorDiaTotal.map((venta) => {
                  const maxCantidad = Math.max(...ventasPorDiaTotal.map(v => v.cantidad));
                  const porcentaje = maxCantidad > 0 ? (venta.cantidad / maxCantidad) * 100 : 0;
                  return (
                    <tr key={venta.dia}>
                      <td className="table-cell-bold">{venta.dia}</td>
                      <td>{venta.cantidad}</td>
                      <td className="table-cell-money">${venta.monto.toFixed(2)}</td>
                      <td>
                        <div style={{
                          width: '100%',
                          height: '24px',
                          backgroundColor: 'var(--gray-100)',
                          borderRadius: '4px',
                          overflow: 'hidden'
                        }}>
                          <div style={{
                            width: `${porcentaje}%`,
                            height: '100%',
                            backgroundColor: 'var(--primary-500)',
                            transition: 'width 0.3s ease'
                          }} />
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Productos más vendidos */}
      <div className="card">
        <div className="card-header">
          <h2 className="card-title">📦 Productos más vendidos</h2>
        </div>
        {productosMetricas.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">�</div>
            <div className="empty-state-text">No hay datos de productos vendidos</div>
          </div>
        ) : (
          <div className="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>Posición</th>
                  <th>Producto</th>
                  <th>Cantidad Vendida</th>
                  <th>Monto Total</th>
                </tr>
              </thead>
              <tbody>
                {productosMetricas.map((producto, index) => (
                  <tr key={producto.id_producto}>
                    <td className="table-cell-bold">
                      {index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : `#${index + 1}`}
                    </td>
                    <td className="table-cell-bold">{producto.nombre}</td>
                    <td>{producto.cantidad_vendida}</td>
                    <td className="table-cell-money">${producto.monto_total.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Todos los clientes */}
      <div className="card">
        <div className="card-header">
          <h2 className="card-title">👥 Todos los clientes</h2>
        </div>
        {clientesMetricas.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">👥</div>
            <div className="empty-state-text">No hay datos de clientes</div>
          </div>
        ) : (
          <div className="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>Posición</th>
                  <th>Cliente</th>
                  <th>Total Compras</th>
                  <th>Monto Total</th>
                </tr>
              </thead>
              <tbody>
                {clientesMetricas.map((cliente, index) => (
                  <tr key={cliente.id_cliente}>
                    <td className="table-cell-bold">
                      {index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : `#${index + 1}`}
                    </td>
                    <td className="table-cell-bold">{cliente.nombre_cliente}</td>
                    <td>{cliente.total_compras}</td>
                    <td className="table-cell-money">${cliente.monto_total.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
