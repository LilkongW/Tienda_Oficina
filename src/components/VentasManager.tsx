import { useState, useEffect, useMemo, useRef } from 'react';
import { ventasService } from '../services/ventasService';
import { clientesService } from '../services/clientesService';
import { productosService } from '../services/productosService';
import type { Venta, Cliente, Producto } from '../types/database';

interface ItemCarrito {
  id_producto: number;
  nombre: string;
  precio_venta: number;
  cantidad: number;
  stock_disponible: number;
}

export default function VentasManager() {
  const [ventas, setVentas] = useState<Venta[]>([]);
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [productos, setProductos] = useState<Producto[]>([]);
  const [loading, setLoading] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const submitEnCurso = useRef(false);
  const [showForm, setShowForm] = useState(false);

  // Formulario
  const [idCliente, setIdCliente] = useState(0);
  const [estadoPago, setEstadoPago] = useState<'Pagado' | 'Pendiente'>('Pendiente');
  const [carrito, setCarrito] = useState<ItemCarrito[]>([]);
  const [productoSeleccionado, setProductoSeleccionado] = useState(0);

  useEffect(() => {
    loadData();
  }, []);

  // Recargar cuando la pestaña gana foco
  useEffect(() => {
    const onVis = () => {
      if (!document.hidden) loadData();
    };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      const [ventasData, clientesData, productosData] = await Promise.all([
        ventasService.getAll(),
        clientesService.getAll(),
        productosService.getAll(),
      ]);
      setVentas(
        ventasData.sort(
          (a, b) => new Date(a.fecha).getTime() - new Date(b.fecha).getTime()
        )
      );
      setClientes([...clientesData].sort((a, b) => a.id_cliente - b.id_cliente));
      setProductos(
        [...productosData].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))
      );
    } catch (error) {
      console.error('Error loading data:', error);
      alert('Error al cargar datos');
    } finally {
      setLoading(false);
    }
  };

  // ── Carrito ──────────────────────────────────────────────
  const agregarAlCarrito = (idProducto: number) => {
    if (!idProducto) return;
    const prod = productos.find((p) => p.id_producto === idProducto);
    if (!prod) return;

    setCarrito((actual) => {
      const existe = actual.find((i) => i.id_producto === idProducto);
      if (existe) {
        return actual.map((i) =>
          i.id_producto === idProducto ? { ...i, cantidad: i.cantidad + 1 } : i
        );
      }
      return [
        ...actual,
        {
          id_producto: prod.id_producto,
          nombre: prod.nombre,
          precio_venta: prod.precio_venta,
          cantidad: 1,
          stock_disponible: prod.stock_actual,
        },
      ];
    });
    setProductoSeleccionado(0);
  };

  const cambiarCantidad = (idProducto: number, cantidad: number) => {
    const c = Math.max(1, Math.floor(cantidad) || 1);
    setCarrito((actual) =>
      actual.map((i) => (i.id_producto === idProducto ? { ...i, cantidad: c } : i))
    );
  };

  const quitarDelCarrito = (idProducto: number) => {
    setCarrito((actual) => actual.filter((i) => i.id_producto !== idProducto));
  };

  const limpiarFormulario = () => {
    setIdCliente(0);
    setEstadoPago('Pendiente');
    setCarrito([]);
    setProductoSeleccionado(0);
  };

  const totalCarrito = useMemo(
    () => carrito.reduce((s, i) => s + i.precio_venta * i.cantidad, 0),
    [carrito]
  );

  const totalItems = useMemo(
    () => carrito.reduce((s, i) => s + i.cantidad, 0),
    [carrito]
  );

  // ── Guardar venta ────────────────────────────────────────
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitEnCurso.current) return;

    if (!idCliente) {
      alert('Selecciona un cliente');
      return;
    }
    if (carrito.length === 0) {
      alert('Agrega al menos un producto');
      return;
    }

    const sinStock = carrito.filter((i) => i.cantidad > i.stock_disponible);
    if (sinStock.length > 0) {
      const detalle = sinStock
        .map((i) => `• ${i.nombre}: pides ${i.cantidad}, hay ${i.stock_disponible}`)
        .join('\n');
      if (!confirm(`Sin stock suficiente:\n\n${detalle}\n\n¿Continuar igual?`)) {
        return;
      }
    }

    submitEnCurso.current = true;
    try {
      setGuardando(true);

      await ventasService.crearVentaConItems({
        id_cliente: idCliente,
        estado_pago: estadoPago,
        items: carrito.map((i) => ({
          id_producto: i.id_producto,
          cantidad: i.cantidad,
          precio_unitario: i.precio_venta,
          subtotal: i.precio_venta * i.cantidad,
        })),
      });

      setShowForm(false);
      limpiarFormulario();
      await loadData();
    } catch (error) {
      console.error('Error saving venta:', error);
      alert('Error al guardar venta');
    } finally {
      submitEnCurso.current = false;
      setGuardando(false);
    }
  };

  const marcarPagada = async (id: number) => {
    try {
      await ventasService.marcarPagada(id);
      loadData();
    } catch (error) {
      console.error('Error marking as paid:', error);
      alert('Error al marcar como pagada');
    }
  };

  const totalVentas = ventas.length;
  const ventasPagadas = ventas.filter((v) => v.estado_pago === 'Pagado').length;
  const ventasPendientes = ventas.filter((v) => v.estado_pago === 'Pendiente').length;
  const montoTotal = ventas.reduce((s, v) => s + v.monto_total, 0);

  if (loading) {
    return (
      <div className="loading-container">
        <div className="loading-spinner"></div>
        <span className="loading-text">Cargando ventas...</span>
      </div>
    );
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">🛒 Ventas</h1>
          <p className="page-description">Registro y seguimiento de ventas</p>
        </div>
        <div className="flex gap-2">
          <button onClick={loadData} className="btn btn-secondary" disabled={loading}>
            🔄 {loading ? 'Actualizando...' : 'Recargar'}
          </button>
          <button
            onClick={() => {
              limpiarFormulario();
              setShowForm(true);
            }}
            className="btn btn-primary"
          >
            + Nueva Venta
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-card-icon blue">🛒</div>
          <div className="stat-card-label">Total Ventas</div>
          <div className="stat-card-value">{totalVentas}</div>
        </div>
        <div className="stat-card">
          <div className="stat-card-icon green">✅</div>
          <div className="stat-card-label">Pagadas</div>
          <div className="stat-card-value text-green">{ventasPagadas}</div>
        </div>
        <div className="stat-card">
          <div className="stat-card-icon red">⏳</div>
          <div className="stat-card-label">Pendientes</div>
          <div className="stat-card-value text-red">{ventasPendientes}</div>
        </div>
        <div
          className="stat-card blur-card"
          onClick={(e) => e.currentTarget.classList.toggle('blur-active')}
        >
          <div className="stat-card-icon yellow">💵</div>
          <div className="stat-card-label">Monto Total</div>
          <div className="stat-card-value">${montoTotal.toFixed(2)}</div>
          <div className="blur-hint">Click para ver/ocultar</div>
        </div>
      </div>

      {showForm && (
        <div className="vm-form-card">
          {/* Header */}
          <div className="vm-header">
            <div className="vm-header-left">
              <div className="vm-header-icon">🛒</div>
              <div>
                <h2 className="vm-title">Nueva Venta</h2>
                <p className="vm-subtitle">
                  Completa los datos para registrar la venta
                </p>
              </div>
            </div>
            <button
              type="button"
              className="vm-close"
              onClick={() => {
                setShowForm(false);
                limpiarFormulario();
              }}
              aria-label="Cerrar"
            >
              ✕
            </button>
          </div>

          <form onSubmit={handleSubmit} className="vm-form">
            {/* Sección 1: Cliente / Pago */}
            <section className="vm-section">
              <div className="vm-section-title">
                <span className="vm-step">1</span>
                <span>Datos del cliente</span>
              </div>

              <div className="vm-grid-2">
                <div className="vm-field">
                  <label className="vm-label">
                    <span className="vm-label-icon">👤</span> Cliente
                  </label>
                  <select
                    className="vm-select"
                    value={idCliente}
                    onChange={(e) => setIdCliente(parseInt(e.target.value))}
                  >
                    <option value={0}>Seleccionar cliente...</option>
                    {clientes.map((c) => (
                      <option key={c.id_cliente} value={c.id_cliente}>
                        #{c.id_cliente} — {c.nombre_cliente}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="vm-field">
                  <label className="vm-label">
                    <span className="vm-label-icon">💳</span> Estado de pago
                  </label>
                  <div className="vm-toggle">
                    <button
                      type="button"
                      className={`vm-toggle-btn ${
                        estadoPago === 'Pendiente' ? 'active pending' : ''
                      }`}
                      onClick={() => setEstadoPago('Pendiente')}
                    >
                      <span>⏳</span> Pendiente
                    </button>
                    <button
                      type="button"
                      className={`vm-toggle-btn ${
                        estadoPago === 'Pagado' ? 'active paid' : ''
                      }`}
                      onClick={() => setEstadoPago('Pagado')}
                    >
                      <span>✅</span> Pagado
                    </button>
                  </div>
                </div>
              </div>
            </section>

            {/* Sección 2: Productos */}
            <section className="vm-section">
              <div className="vm-section-title">
                <span className="vm-step">2</span>
                <span>Productos</span>
                {carrito.length > 0 && (
                  <span className="vm-badge">
                    {totalItems} {totalItems === 1 ? 'ítem' : 'ítems'}
                  </span>
                )}
              </div>

              <div className="vm-add-row">
                <select
                  className="vm-select"
                  value={productoSeleccionado}
                  onChange={(e) => setProductoSeleccionado(parseInt(e.target.value))}
                >
                  <option value={0}>Seleccionar producto...</option>
                  {productos.map((p) => (
                    <option key={p.id_producto} value={p.id_producto}>
                      {p.nombre} — ${p.precio_venta.toFixed(2)} (stock: {p.stock_actual})
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  className="vm-add-btn"
                  onClick={() => agregarAlCarrito(productoSeleccionado)}
                  disabled={!productoSeleccionado}
                >
                  ＋ Agregar
                </button>
              </div>

              {carrito.length === 0 ? (
                <div className="vm-empty">
                  <div className="vm-empty-icon">🛍️</div>
                  <div className="vm-empty-title">Carrito vacío</div>
                  <div className="vm-empty-sub">
                    Selecciona un producto y presiona <b>Agregar</b>
                  </div>
                </div>
              ) : (
                <div className="vm-cart">
                  {carrito.map((i) => {
                    const excede = i.cantidad > i.stock_disponible;
                    return (
                      <div
                        key={i.id_producto}
                        className={`vm-item ${excede ? 'warn' : ''}`}
                      >
                        <div className="vm-item-info">
                          <div className="vm-item-name">{i.nombre}</div>
                          <div className="vm-item-meta">
                            ${i.precio_venta.toFixed(2)} c/u · Stock:{' '}
                            {i.stock_disponible}
                          </div>
                          {excede && (
                            <div className="vm-item-warn">
                              ⚠️ Solo hay {i.stock_disponible} disponible(s)
                            </div>
                          )}
                        </div>

                        <div className="vm-qty">
                          <button
                            type="button"
                            className="vm-qty-btn"
                            onClick={() =>
                              cambiarCantidad(i.id_producto, i.cantidad - 1)
                            }
                            aria-label="Disminuir"
                          >
                            −
                          </button>
                          <input
                            type="number"
                            className="vm-qty-input"
                            min={1}
                            value={i.cantidad}
                            onChange={(e) =>
                              cambiarCantidad(
                                i.id_producto,
                                parseInt(e.target.value)
                              )
                            }
                          />
                          <button
                            type="button"
                            className="vm-qty-btn"
                            onClick={() =>
                              cambiarCantidad(i.id_producto, i.cantidad + 1)
                            }
                            aria-label="Aumentar"
                          >
                            +
                          </button>
                        </div>

                        <div className="vm-item-subtotal">
                          ${(i.precio_venta * i.cantidad).toFixed(2)}
                        </div>

                        <button
                          type="button"
                          className="vm-item-remove"
                          onClick={() => quitarDelCarrito(i.id_producto)}
                          title="Quitar"
                          aria-label="Quitar"
                        >
                          🗑️
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>

            {/* Footer con total y acciones */}
            <div className="vm-footer">
              <div className="vm-total">
                <span className="vm-total-label">Total</span>
                <span className="vm-total-value">${totalCarrito.toFixed(2)}</span>
              </div>

              <div className="vm-actions">
                <button
                  type="button"
                  className="vm-btn vm-btn-ghost"
                  onClick={() => {
                    setShowForm(false);
                    limpiarFormulario();
                  }}
                  disabled={guardando}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="vm-btn vm-btn-primary"
                  disabled={guardando}
                >
                  {guardando ? '⏳ Guardando…' : '💾 Registrar Venta'}
                </button>
              </div>
            </div>
          </form>

          {/* Estilos encapsulados con prefijo vm- para no chocar con tu CSS */}
          <style>{`
            .vm-form-card {
              background: var(--card-bg, #ffffff);
              border: 1px solid var(--border-color, #e5e7eb);
              border-radius: 16px;
              margin: 20px 0;
              box-shadow: 0 8px 24px rgba(15, 23, 42, 0.06);
              overflow: hidden;
            }

            /* Header */
            .vm-header {
              display: flex;
              align-items: center;
              justify-content: space-between;
              padding: 18px 22px;
              background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%);
              color: #fff;
            }
            .vm-header-left { display: flex; align-items: center; gap: 14px; }
            .vm-header-icon {
              width: 44px; height: 44px;
              display: grid; place-items: center;
              background: rgba(255,255,255,0.18);
              border-radius: 12px;
              font-size: 22px;
            }
            .vm-title { margin: 0; font-size: 18px; font-weight: 700; color: #fff; }
            .vm-subtitle { margin: 2px 0 0; font-size: 13px; opacity: 0.9; }
            .vm-close {
              background: rgba(255,255,255,0.15);
              border: none; color: #fff;
              width: 34px; height: 34px; border-radius: 10px;
              cursor: pointer; font-size: 14px;
              transition: background .15s ease;
            }
            .vm-close:hover { background: rgba(255,255,255,0.3); }

            /* Form */
            .vm-form { padding: 22px; }

            .vm-section { margin-bottom: 22px; }
            .vm-section-title {
              display: flex; align-items: center; gap: 10px;
              font-weight: 700; color: var(--text, #111827);
              font-size: 14px; margin-bottom: 12px;
              text-transform: uppercase; letter-spacing: .4px;
            }
            .vm-step {
              display: grid; place-items: center;
              width: 22px; height: 22px; border-radius: 50%;
              background: #6366f1; color: #fff;
              font-size: 12px; font-weight: 700;
            }
            .vm-badge {
              margin-left: auto;
              background: #eef2ff; color: #4f46e5;
              padding: 3px 10px; border-radius: 999px;
              font-size: 11px; font-weight: 600;
            }

            .vm-grid-2 {
              display: grid;
              grid-template-columns: 1fr 1fr;
              gap: 14px;
            }
            @media (max-width: 640px) {
              .vm-grid-2 { grid-template-columns: 1fr; }
            }

            .vm-field { display: flex; flex-direction: column; gap: 6px; }
            .vm-label {
              font-size: 13px; font-weight: 600;
              color: var(--text-secondary, #374151);
              display: flex; align-items: center; gap: 6px;
            }
            .vm-label-icon { font-size: 14px; }

            .vm-select, .vm-qty-input {
              width: 100%;
              padding: 10px 12px;
              border-radius: 10px;
              border: 1.5px solid var(--border-color, #e5e7eb);
              background: var(--input-bg, #fff);
              color: var(--text, #111827);
              font-size: 14px;
              outline: none;
              transition: border-color .15s ease, box-shadow .15s ease;
            }
            .vm-select:focus {
              border-color: #6366f1;
              box-shadow: 0 0 0 3px rgba(99,102,241,0.15);
            }

            /* Toggle pago */
            .vm-toggle {
              display: grid;
              grid-template-columns: 1fr 1fr;
              gap: 8px;
              background: var(--input-bg, #f3f4f6);
              padding: 4px;
              border-radius: 12px;
              border: 1.5px solid var(--border-color, #e5e7eb);
            }
            .vm-toggle-btn {
              display: flex; align-items: center; justify-content: center;
              gap: 6px;
              padding: 9px 10px;
              border: none; border-radius: 9px;
              background: transparent;
              font-size: 13px; font-weight: 600;
              color: #6b7280;
              cursor: pointer;
              transition: all .15s ease;
            }
            .vm-toggle-btn:hover { color: #111827; }
            .vm-toggle-btn.active.pending {
              background: #fff7ed; color: #c2410c;
              box-shadow: 0 1px 3px rgba(0,0,0,0.08);
            }
            .vm-toggle-btn.active.paid {
              background: #ecfdf5; color: #047857;
              box-shadow: 0 1px 3px rgba(0,0,0,0.08);
            }

            /* Agregar producto */
            .vm-add-row {
              display: grid;
              grid-template-columns: 1fr auto;
              gap: 10px;
              margin-bottom: 14px;
            }
            .vm-add-btn {
              padding: 0 18px;
              border: none; border-radius: 10px;
              background: linear-gradient(135deg, #6366f1, #8b5cf6);
              color: #fff; font-weight: 600; font-size: 14px;
              cursor: pointer;
              transition: transform .1s ease, opacity .15s ease;
              white-space: nowrap;
            }
            .vm-add-btn:hover:not(:disabled) { transform: translateY(-1px); }
            .vm-add-btn:disabled {
              opacity: 0.5; cursor: not-allowed;
            }

            /* Carrito vacío */
            .vm-empty {
              border: 2px dashed var(--border-color, #e5e7eb);
              border-radius: 14px;
              padding: 28px 16px;
              text-align: center;
              background: var(--input-bg, #fafafa);
            }
            .vm-empty-icon { font-size: 34px; margin-bottom: 6px; }
            .vm-empty-title {
              font-weight: 700; color: var(--text, #111827);
              font-size: 15px;
            }
            .vm-empty-sub {
              font-size: 13px; color: #6b7280; margin-top: 4px;
            }

            /* Carrito */
            .vm-cart { display: flex; flex-direction: column; gap: 10px; }
            .vm-item {
              display: grid;
              grid-template-columns: 1fr auto auto auto;
              align-items: center;
              gap: 12px;
              padding: 12px 14px;
              border: 1.5px solid var(--border-color, #e5e7eb);
              border-radius: 12px;
              background: var(--input-bg, #fff);
              transition: border-color .15s ease, background .15s ease;
            }
            .vm-item.warn {
              border-color: #fbbf24;
              background: #fffbeb;
            }
            .vm-item-info { min-width: 0; }
            .vm-item-name {
              font-weight: 600; color: var(--text, #111827);
              font-size: 14px;
              white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
            }
            .vm-item-meta { font-size: 12px; color: #6b7280; margin-top: 2px; }
            .vm-item-warn {
              font-size: 12px; color: #b45309; margin-top: 4px;
              font-weight: 600;
            }

            .vm-qty {
              display: flex; align-items: center;
              gap: 4px;
              background: var(--input-bg, #f3f4f6);
              border-radius: 10px;
              padding: 3px;
            }
            .vm-qty-btn {
              width: 28px; height: 28px;
              border: none; border-radius: 8px;
              background: #fff; color: #111827;
              font-size: 16px; font-weight: 700;
              cursor: pointer;
              display: grid; place-items: center;
              box-shadow: 0 1px 2px rgba(0,0,0,0.06);
            }
            .vm-qty-btn:hover { background: #eef2ff; color: #4f46e5; }
            .vm-qty-input {
              width: 52px; text-align: center;
              border: none; background: transparent;
              font-size: 14px; font-weight: 600; color: #111827;
              padding: 4px 0;
              -moz-appearance: textfield;
            }
            .vm-qty-input::-webkit-outer-spin-button,
            .vm-qty-input::-webkit-inner-spin-button {
              -webkit-appearance: none; margin: 0;
            }

            .vm-item-subtotal {
              min-width: 90px; text-align: right;
              font-weight: 700; color: #4f46e5; font-size: 15px;
            }

            .vm-item-remove {
              background: transparent;
              border: none; cursor: pointer;
              font-size: 16px; padding: 6px;
              border-radius: 8px;
              transition: background .15s ease;
            }
            .vm-item-remove:hover { background: #fee2e2; }

            /* Footer */
            .vm-footer {
              display: flex; align-items: center; justify-content: space-between;
              gap: 16px;
              padding-top: 18px;
              border-top: 1.5px solid var(--border-color, #e5e7eb);
              flex-wrap: wrap;
            }
            .vm-total {
              display: flex; flex-direction: column;
              padding: 10px 16px;
              background: linear-gradient(135deg, #eef2ff, #f5f3ff);
              border-radius: 12px;
              border: 1.5px solid #ddd6fe;
            }
            .vm-total-label {
              font-size: 11px; font-weight: 700;
              color: #6d28d9;
              text-transform: uppercase; letter-spacing: .5px;
            }
            .vm-total-value {
              font-size: 22px; font-weight: 800;
              color: #4f46e5; line-height: 1.1;
            }

            .vm-actions { display: flex; gap: 10px; }
            .vm-btn {
              padding: 11px 20px;
              border-radius: 10px;
              font-size: 14px; font-weight: 600;
              cursor: pointer;
              border: none;
              transition: transform .1s ease, opacity .15s ease;
            }
            .vm-btn:disabled { opacity: 0.6; cursor: not-allowed; }
            .vm-btn-ghost {
              background: transparent;
              color: var(--text-secondary, #374151);
              border: 1.5px solid var(--border-color, #e5e7eb);
            }
            .vm-btn-ghost:hover:not(:disabled) { background: #f3f4f6; }
            .vm-btn-primary {
              background: linear-gradient(135deg, #10b981, #059669);
              color: #fff;
              box-shadow: 0 6px 14px rgba(16,185,129,0.3);
            }
            .vm-btn-primary:hover:not(:disabled) { transform: translateY(-1px); }
          `}</style>
        </div>
      )}

      {ventas.length === 0 ? (
        <div className="card">
          <div className="empty-state">
            <div className="empty-state-icon">🛒</div>
            <div className="empty-state-text">No hay ventas registradas</div>
            <div className="empty-state-subtext">
              Registra tu primera venta para comenzar
            </div>
          </div>
        </div>
      ) : (
        <div className="table-wrapper">
          <table>
            <thead>
              <tr>
                <th>ID</th>
                <th>Fecha</th>
                <th>Cliente</th>
                <th>Estado</th>
                <th>Monto</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {ventas.map((venta) => {
                const cliente = clientes.find(
                  (c) => c.id_cliente === venta.id_cliente
                );
                return (
                  <tr key={venta.id_venta}>
                    <td className="table-cell-bold">#{venta.id_venta}</td>
                    <td>
                      {new Date(venta.fecha).toLocaleDateString('es-ES', {
                        year: 'numeric',
                        month: 'short',
                        day: 'numeric',
                      })}
                    </td>
                    <td className="table-cell-bold">
                      {cliente?.nombre_cliente || 'N/A'}
                    </td>
                    <td>
                      <span
                        className={`status-badge ${
                          venta.estado_pago === 'Pagado'
                            ? 'status-pagado'
                            : 'status-pendiente'
                        }`}
                      >
                        {venta.estado_pago}
                      </span>
                    </td>
                    <td className="table-cell-money text-red">
                      ${venta.monto_total.toFixed(2)}
                    </td>
                    <td>
                      {venta.estado_pago === 'Pendiente' && (
                        <button
                          onClick={() => marcarPagada(venta.id_venta)}
                          className="btn btn-success btn-sm"
                        >
                          ✅ Marcar Pagada
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}