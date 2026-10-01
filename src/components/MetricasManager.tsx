import { useState, useEffect, useMemo } from 'react';
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

type RangoFiltro = 'hoy' | '7d' | '30d' | 'mes' | 'todo';
type TopN = 5 | 10 | 0;
type OrdenClientes = 'monto' | 'compras';

const DIAS_ORDEN = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
const DIAS_CORTOS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];

const FRANJAS = [
  { label: '00-04', start: 0, end: 4 },
  { label: '04-08', start: 4, end: 8 },
  { label: '08-12', start: 8, end: 12 },
  { label: '12-16', start: 12, end: 16 },
  { label: '16-20', start: 16, end: 20 },
  { label: '20-24', start: 20, end: 24 },
];

export default function MetricasManager() {
  const [ventas, setVentas] = useState<Venta[]>([]);
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [productos, setProductos] = useState<Producto[]>([]);
  const [detalles, setDetalles] = useState<(DetalleVenta & { producto: Producto })[]>([]);
  const [loading, setLoading] = useState(true);

  const [rango, setRango] = useState<RangoFiltro>('30d');
  const [topN, setTopN] = useState<TopN>(10);
  const [ordenClientes, setOrdenClientes] = useState<OrdenClientes>('monto');

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

  // ── Filtrado por rango ──────────────────────────────────
  const ventasFiltradas = useMemo(() => {
    if (rango === 'todo') return ventas;
    const ahora = new Date();
    const inicio = new Date();
    switch (rango) {
      case 'hoy':
        inicio.setHours(0, 0, 0, 0);
        break;
      case '7d':
        inicio.setDate(ahora.getDate() - 7);
        inicio.setHours(0, 0, 0, 0);
        break;
      case '30d':
        inicio.setDate(ahora.getDate() - 30);
        inicio.setHours(0, 0, 0, 0);
        break;
      case 'mes':
        inicio.setDate(1);
        inicio.setHours(0, 0, 0, 0);
        break;
    }
    return ventas.filter((v) => new Date(v.fecha) >= inicio);
  }, [ventas, rango]);

  const idsVentasFiltradas = useMemo(
    () => new Set(ventasFiltradas.map((v) => v.id_venta)),
    [ventasFiltradas]
  );

  const detallesFiltrados = useMemo(() => {
    if (rango === 'todo') return detalles;
    return detalles.filter((d) => idsVentasFiltradas.has(d.id_venta));
  }, [detalles, idsVentasFiltradas, rango]);

  // ── Métricas de clientes ────────────────────────────────
  const clientesMetricas: ClienteMetrica[] = useMemo(
    () =>
      clientes
        .map((cliente) => {
          const ventasCliente = ventasFiltradas.filter(
            (v) => v.id_cliente === cliente.id_cliente
          );
          return {
            id_cliente: cliente.id_cliente,
            nombre_cliente: cliente.nombre_cliente,
            total_compras: ventasCliente.length,
            monto_total: ventasCliente.reduce((s, v) => s + v.monto_total, 0),
          };
        })
        .filter((c) => c.total_compras > 0)
        .sort((a, b) =>
          ordenClientes === 'monto'
            ? b.monto_total - a.monto_total
            : b.total_compras - a.total_compras
        ),
    [clientes, ventasFiltradas, ordenClientes]
  );

  // ── Métricas de productos ───────────────────────────────
  const productosMetricas: ProductoMetrica[] = useMemo(
    () =>
      productos
        .map((producto) => {
          const detallesProducto = detallesFiltrados.filter(
            (d) => d.id_producto === producto.id_producto
          );
          return {
            id_producto: producto.id_producto,
            nombre: producto.nombre,
            cantidad_vendida: detallesProducto.reduce((s, d) => s + d.cantidad, 0),
            monto_total: detallesProducto.reduce((s, d) => s + d.subtotal, 0),
          };
        })
        .filter((p) => p.cantidad_vendida > 0)
        .sort((a, b) => b.cantidad_vendida - a.cantidad_vendida),
    [productos, detallesFiltrados]
  );

  // ── Ganancias ───────────────────────────────────────────
  const gananciasTotales = useMemo(
    () =>
      detallesFiltrados.reduce((sum, d) => {
        const costoTotal = d.cantidad * d.producto.costo_unitario;
        return sum + (d.subtotal - costoTotal);
      }, 0),
    [detallesFiltrados]
  );

  // ── Ventas por día y hora ───────────────────────────────
  const ventasPorDia: VentaPorDia[] = useMemo(
    () =>
      ventasFiltradas.map((venta) => {
        const fecha = new Date(venta.fecha);
        const dias = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
        return {
          dia: dias[fecha.getDay()],
          hora: fecha.getHours(),
          cantidad: 1,
          monto: venta.monto_total,
        };
      }),
    [ventasFiltradas]
  );

  const ventasPorDiaTotal = useMemo(
    () =>
      DIAS_ORDEN.map((dia) => {
        const delDia = ventasPorDia.filter((v) => v.dia === dia);
        return {
          dia,
          cantidad: delDia.reduce((s, v) => s + v.cantidad, 0),
          monto: delDia.reduce((s, v) => s + v.monto, 0),
        };
      }),
    [ventasPorDia]
  );

  const maxCantidadDia = useMemo(
    () => Math.max(1, ...ventasPorDiaTotal.map((v) => v.cantidad)),
    [ventasPorDiaTotal]
  );

  // ── Heatmap día × franja horaria ────────────────────────
  const heatmap = useMemo(() => {
    const grid: Record<string, number> = {};
    ventasPorDia.forEach((v) => {
      const franja = FRANJAS.findIndex((f) => v.hora >= f.start && v.hora < f.end);
      if (franja >= 0) {
        const key = `${v.dia}-${franja}`;
        grid[key] = (grid[key] || 0) + v.cantidad;
      }
    });
    return grid;
  }, [ventasPorDia]);

  const maxHeatmap = useMemo(
    () => Math.max(1, ...Object.values(heatmap)),
    [heatmap]
  );

  // ── KPIs ────────────────────────────────────────────────
  const totalVentas = ventasFiltradas.length;
  const montoTotalGlobal = ventasFiltradas.reduce((s, v) => s + v.monto_total, 0);
  const ventasPendientes = ventasFiltradas.filter((v) => v.estado_pago === 'Pendiente').length;
  const ventasPagadas = ventasFiltradas.filter((v) => v.estado_pago === 'Pagado').length;
  const ticketPromedio = totalVentas > 0 ? montoTotalGlobal / totalVentas : 0;
  const margenGanancias = montoTotalGlobal > 0 ? (gananciasTotales / montoTotalGlobal) * 100 : 0;
  const pctPagadas = totalVentas > 0 ? (ventasPagadas / totalVentas) * 100 : 0;

  const productosTop = topN === 0 ? productosMetricas : productosMetricas.slice(0, topN);
  const clientesTop = topN === 0 ? clientesMetricas : clientesMetricas.slice(0, topN);
  const maxProdMonto = Math.max(1, ...productosMetricas.map((p) => p.monto_total));
  const maxCliMonto = Math.max(1, ...clientesMetricas.map((c) => c.monto_total));

  const rangoLabel: Record<RangoFiltro, string> = {
    hoy: 'Hoy',
    '7d': 'Últimos 7 días',
    '30d': 'Últimos 30 días',
    mes: 'Este mes',
    todo: 'Todo el historial',
  };

  if (loading) {
    return (
      <div className="loading-container">
        <div className="loading-spinner"></div>
        <span className="loading-text">Cargando métricas...</span>
      </div>
    );
  }

  return (
    <div className="mt-root">
      {/* Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">📊 Métricas</h1>
          <p className="page-description">
            Análisis de ventas y rendimiento · {rangoLabel[rango]}
          </p>
        </div>
        <button onClick={loadData} className="btn btn-secondary" disabled={loading}>
          🔄 {loading ? 'Actualizando...' : 'Recargar'}
        </button>
      </div>

      {/* Filtros de rango */}
      <div className="mt-toolbar">
        <div className="mt-pills">
          {(['hoy', '7d', '30d', 'mes', 'todo'] as RangoFiltro[]).map((r) => (
            <button
              key={r}
              className={`mt-pill ${rango === r ? 'active' : ''}`}
              onClick={() => setRango(r)}
            >
              {rangoLabel[r]}
            </button>
          ))}
        </div>
      </div>

      {/* KPIs */}
      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-card-icon blue">🛒</div>
          <div className="stat-card-label">Total Ventas</div>
          <div className="stat-card-value">{totalVentas}</div>
          <div className="mt-kpi-sub">
            {ventasPagadas} pagadas · {ventasPendientes} pendientes
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-card-icon green">💰</div>
          <div className="stat-card-label">Ganancias Totales</div>
          <div className="stat-card-value text-green">${gananciasTotales.toFixed(2)}</div>
          <div className="mt-kpi-sub">Margen: {margenGanancias.toFixed(1)}%</div>
        </div>

        <div className="stat-card">
          <div className="stat-card-icon yellow">📈</div>
          <div className="stat-card-label">Ticket Promedio</div>
          <div className="stat-card-value">${ticketPromedio.toFixed(2)}</div>
          <div className="mt-kpi-sub">Sobre ${montoTotalGlobal.toFixed(2)} facturado</div>
        </div>

        <div className="stat-card">
          <div className="stat-card-icon red">⏳</div>
          <div className="stat-card-label">Por Cobrar</div>
          <div className="stat-card-value text-red">{ventasPendientes}</div>
          <div className="mt-kpi-sub">{pctPagadas.toFixed(0)}% cobrado</div>
        </div>
      </div>

      {/* Ventas por día */}
      <div className="mt-card">
        <div className="mt-card-header">
          <h2 className="mt-card-title">📅 Ventas por día de la semana</h2>
          <span className="mt-badge">
            {ventasPorDiaTotal.reduce((s, v) => s + v.cantidad, 0)} ventas
          </span>
        </div>

        {ventasPorDiaTotal.every((v) => v.cantidad === 0) ? (
          <div className="mt-empty">
            <div className="mt-empty-icon">📅</div>
            <div className="mt-empty-title">No hay datos de ventas por día</div>
            <div className="mt-empty-sub">Prueba cambiando el rango de fechas</div>
          </div>
        ) : (
          <div className="mt-bars">
            {ventasPorDiaTotal.map((v, idx) => {
              const pct = (v.cantidad / maxCantidadDia) * 100;
              return (
                <div className="mt-bar-row" key={v.dia}>
                  <div className="mt-bar-day">{DIAS_CORTOS[idx]}</div>
                  <div className="mt-bar-track">
                    <div className="mt-bar-fill" style={{ width: `${pct}%` }} />
                  </div>
                  <div className="mt-bar-value">
                    <b>{v.cantidad}</b>
                    <span>${v.monto.toFixed(2)}</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Heatmap día × franja (SIN SCROLL) */}
      <div className="mt-card">
        <div className="mt-card-header">
          <h2 className="mt-card-title">🔥 Mapa de calor · día × franja horaria</h2>
          <span className="mt-badge">Intensidad = ventas</span>
        </div>

        {ventasPorDia.length === 0 ? (
          <div className="mt-empty">
            <div className="mt-empty-icon">🔥</div>
            <div className="mt-empty-title">Sin datos para el heatmap</div>
          </div>
        ) : (
          <div className="mt-heatmap">
            <div className="mt-heatmap-grid">
              <div className="mt-heatmap-corner"></div>
              {FRANJAS.map((f) => (
                <div key={f.label} className="mt-heatmap-head">
                  {f.label}
                </div>
              ))}

              {DIAS_ORDEN.map((dia) => (
                <div key={dia} className="mt-heatmap-row">
                  <div className="mt-heatmap-day">{dia.slice(0, 3)}</div>
                  {FRANJAS.map((f, i) => {
                    const val = heatmap[`${dia}-${i}`] || 0;
                    const intensity = val / maxHeatmap;
                    return (
                      <div
                        key={f.label}
                        className="mt-heatmap-cell"
                        style={{
                          background: val
                            ? `rgba(99, 102, 241, ${0.15 + intensity * 0.85})`
                            : 'var(--input-bg, #f9fafb)',
                          color: intensity > 0.55 ? '#fff' : 'inherit',
                        }}
                        title={`${dia} ${f.label} · ${val} venta(s)`}
                      >
                        {val || ''}
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Selector Top N */}
      <div className="mt-toolbar mt-toolbar-right">
        <div className="mt-pills">
          <span className="mt-pills-label">Mostrar:</span>
          {([5, 10, 0] as TopN[]).map((n) => (
            <button
              key={n}
              className={`mt-pill ${topN === n ? 'active' : ''}`}
              onClick={() => setTopN(n)}
            >
              {n === 0 ? 'Todos' : `Top ${n}`}
            </button>
          ))}
        </div>
      </div>

      {/* Grid: Productos + Clientes */}
      <div className="mt-grid-2">
        {/* Productos */}
        <div className="mt-card">
          <div className="mt-card-header">
            <h2 className="mt-card-title">📦 Productos más vendidos</h2>
            <span className="mt-badge">{productosMetricas.length} con ventas</span>
          </div>

          {productosTop.length === 0 ? (
            <div className="mt-empty">
              <div className="mt-empty-icon">📦</div>
              <div className="mt-empty-title">No hay productos vendidos</div>
              <div className="mt-empty-sub">Aún no hay ventas en este rango</div>
            </div>
          ) : (
            <div className="mt-ranking">
              {productosTop.map((p, i) => {
                const pct = (p.monto_total / maxProdMonto) * 100;
                const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : null;
                return (
                  <div className="mt-rank-item" key={p.id_producto}>
                    <div className={`mt-rank-pos ${medal ? 'medal' : ''}`}>
                      {medal ?? `#${i + 1}`}
                    </div>
                    <div className="mt-rank-body">
                      <div className="mt-rank-top">
                        <span className="mt-rank-name">{p.nombre}</span>
                        <span className="mt-rank-money">${p.monto_total.toFixed(2)}</span>
                      </div>
                      <div className="mt-rank-track">
                        <div className="mt-rank-fill" style={{ width: `${pct}%` }} />
                      </div>
                      <div className="mt-rank-meta">
                        {p.cantidad_vendida} unidades vendidas
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Clientes */}
        <div className="mt-card">
          <div className="mt-card-header">
            <h2 className="mt-card-title">👥 Mejores clientes</h2>
            <div className="mt-pills mt-pills-mini">
              <button
                className={`mt-pill ${ordenClientes === 'monto' ? 'active' : ''}`}
                onClick={() => setOrdenClientes('monto')}
              >
                Por monto
              </button>
              <button
                className={`mt-pill ${ordenClientes === 'compras' ? 'active' : ''}`}
                onClick={() => setOrdenClientes('compras')}
              >
                Por compras
              </button>
            </div>
          </div>

          {clientesTop.length === 0 ? (
            <div className="mt-empty">
              <div className="mt-empty-icon">👥</div>
              <div className="mt-empty-title">No hay datos de clientes</div>
              <div className="mt-empty-sub">Ningún cliente compró en este rango</div>
            </div>
          ) : (
            <div className="mt-ranking">
              {clientesTop.map((c, i) => {
                const pct = (c.monto_total / maxCliMonto) * 100;
                const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : null;
                return (
                  <div className="mt-rank-item" key={c.id_cliente}>
                    <div className={`mt-rank-pos ${medal ? 'medal' : ''}`}>
                      {medal ?? `#${i + 1}`}
                    </div>
                    <div className="mt-rank-body">
                      <div className="mt-rank-top">
                        <span className="mt-rank-name">{c.nombre_cliente}</span>
                        <span className="mt-rank-money">${c.monto_total.toFixed(2)}</span>
                      </div>
                      <div className="mt-rank-track">
                        <div className="mt-rank-fill alt" style={{ width: `${pct}%` }} />
                      </div>
                      <div className="mt-rank-meta">
                        {c.total_compras}{' '}
                        {c.total_compras === 1 ? 'compra' : 'compras'}
                        {c.total_compras > 0 &&
                          ` · ticket prom. $${(c.monto_total / c.total_compras).toFixed(2)}`}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Estilos encapsulados (prefijo mt-) */}
      <style>{`
        .mt-toolbar {
          display: flex; align-items: center; justify-content: space-between;
          gap: 12px; margin: 0 0 18px; flex-wrap: wrap;
        }
        .mt-toolbar-right { justify-content: flex-end; }

        .mt-pills {
          display: inline-flex; align-items: center; gap: 4px;
          padding: 4px;
          background: var(--card-bg, #fff);
          border: 1.5px solid var(--border-color, #e5e7eb);
          border-radius: 12px;
          flex-wrap: wrap;
        }
        .mt-pills-mini { padding: 3px; }
        .mt-pills-label {
          font-size: 12px; font-weight: 600;
          color: #6b7280; padding: 0 8px;
        }
        .mt-pill {
          padding: 7px 14px;
          border: none; background: transparent;
          border-radius: 9px;
          font-size: 13px; font-weight: 600;
          color: #6b7280; cursor: pointer;
          transition: all .15s ease;
          white-space: nowrap;
        }
        .mt-pill:hover { color: #111827; background: #f3f4f6; }
        .mt-pill.active {
          background: linear-gradient(135deg, #6366f1, #8b5cf6);
          color: #fff;
          box-shadow: 0 3px 8px rgba(99,102,241,0.3);
        }

        .mt-kpi-sub {
          margin-top: 6px; font-size: 12px;
          color: #6b7280; font-weight: 500;
        }

        .mt-card {
          background: var(--card-bg, #fff);
          border: 1px solid var(--border-color, #e5e7eb);
          border-radius: 16px;
          padding: 20px 22px;
          margin-bottom: 20px;
          box-shadow: 0 4px 16px rgba(15,23,42,0.04);
        }
        .mt-card-header {
          display: flex; align-items: center; justify-content: space-between;
          gap: 12px; margin-bottom: 16px; flex-wrap: wrap;
        }
        .mt-card-title {
          margin: 0; font-size: 15px; font-weight: 700;
          color: var(--text, #111827);
        }
        .mt-badge {
          background: #eef2ff; color: #4f46e5;
          padding: 4px 10px; border-radius: 999px;
          font-size: 11px; font-weight: 700;
          letter-spacing: .3px;
        }

        /* Bars */
        .mt-bars { display: flex; flex-direction: column; gap: 10px; }
        .mt-bar-row {
          display: grid;
          grid-template-columns: 44px 1fr 140px;
          align-items: center;
          gap: 12px;
        }
        .mt-bar-day {
          font-size: 12px; font-weight: 700;
          color: var(--text, #111827);
          text-transform: uppercase;
          letter-spacing: .4px;
        }
        .mt-bar-track {
          height: 22px;
          background: var(--input-bg, #f3f4f6);
          border-radius: 8px;
          overflow: hidden;
        }
        .mt-bar-fill {
          height: 100%;
          background: linear-gradient(90deg, #6366f1, #8b5cf6);
          border-radius: 8px;
          transition: width .4s ease;
          min-width: 4px;
        }
        .mt-bar-value {
          display: flex; align-items: center; justify-content: flex-end;
          gap: 8px; font-size: 12px; color: #6b7280;
        }
        .mt-bar-value b { color: #111827; font-size: 13px; }

        /* Heatmap (sin scroll, adaptable al ancho) */
        .mt-heatmap {
          width: 100%;
          overflow: visible;
        }
        .mt-heatmap-grid {
          display: grid;
          grid-template-columns: 48px repeat(6, minmax(0, 1fr));
          gap: 4px;
          width: 100%;
        }
        .mt-heatmap-head {
          font-size: 11px; font-weight: 700;
          color: #6b7280; text-align: center;
          padding: 4px 0;
          text-transform: uppercase; letter-spacing: .3px;
          min-width: 0;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .mt-heatmap-row { display: contents; }
        .mt-heatmap-day {
          display: grid; place-items: center;
          font-size: 12px; font-weight: 700;
          color: var(--text, #111827);
          padding: 6px 0;
        }
        .mt-heatmap-cell {
          height: 38px;
          border-radius: 8px;
          display: grid; place-items: center;
          font-size: 12px; font-weight: 700;
          color: #111827;
          border: 1px solid var(--border-color, #e5e7eb);
          transition: transform .12s ease;
          cursor: default;
          min-width: 0;
        }
        .mt-heatmap-cell:hover { transform: scale(1.05); }

        /* Responsive heatmap */
        @media (max-width: 640px) {
          .mt-heatmap-grid {
            grid-template-columns: 36px repeat(6, minmax(0, 1fr));
            gap: 3px;
          }
          .mt-heatmap-cell {
            height: 32px;
            font-size: 11px;
            border-radius: 6px;
          }
          .mt-heatmap-day { font-size: 11px; }
          .mt-heatmap-head { font-size: 10px; }
        }

        /* Grid 2 cols para rankings */
        .mt-grid-2 {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 20px;
        }
        @media (max-width: 900px) {
          .mt-grid-2 { grid-template-columns: 1fr; }
        }

        /* Ranking items */
        .mt-ranking { display: flex; flex-direction: column; gap: 10px; }
        .mt-rank-item {
          display: grid;
          grid-template-columns: 40px 1fr;
          gap: 12px; align-items: center;
          padding: 10px 12px;
          border-radius: 12px;
          transition: background .15s ease;
        }
        .mt-rank-item:hover { background: var(--input-bg, #f9fafb); }
        .mt-rank-pos {
          display: grid; place-items: center;
          width: 36px; height: 36px;
          border-radius: 10px;
          background: var(--input-bg, #f3f4f6);
          font-size: 12px; font-weight: 800;
          color: #6b7280;
        }
        .mt-rank-pos.medal {
          background: transparent; font-size: 22px;
        }
        .mt-rank-body { min-width: 0; }
        .mt-rank-top {
          display: flex; align-items: baseline; justify-content: space-between;
          gap: 8px; margin-bottom: 6px;
        }
        .mt-rank-name {
          font-size: 13px; font-weight: 700;
          color: var(--text, #111827);
          white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
        }
        .mt-rank-money {
          font-size: 13px; font-weight: 700;
          color: #4f46e5; white-space: nowrap;
        }
        .mt-rank-track {
          height: 6px;
          background: var(--input-bg, #f3f4f6);
          border-radius: 999px;
          overflow: hidden;
        }
        .mt-rank-fill {
          height: 100%;
          background: linear-gradient(90deg, #6366f1, #8b5cf6);
          border-radius: 999px;
          transition: width .4s ease;
        }
        .mt-rank-fill.alt {
          background: linear-gradient(90deg, #10b981, #059669);
        }
        .mt-rank-meta {
          margin-top: 4px;
          font-size: 11px; color: #6b7280;
        }

        /* Empty state */
        .mt-empty {
          padding: 28px 16px; text-align: center;
          border: 2px dashed var(--border-color, #e5e7eb);
          border-radius: 14px;
          background: var(--input-bg, #fafafa);
        }
        .mt-empty-icon { font-size: 32px; margin-bottom: 6px; }
        .mt-empty-title {
          font-weight: 700; color: var(--text, #111827);
          font-size: 14px;
        }
        .mt-empty-sub {
          font-size: 12px; color: #6b7280; margin-top: 4px;
        }
      `}</style>
    </div>
  );
}