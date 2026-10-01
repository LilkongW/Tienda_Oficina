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

  // ── Guardar venta ────────────────────────────────────────
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    // El estado de React se actualiza en el siguiente render; el ref cierra
    // la ventana en la que dos envíos rápidos podrían iniciar dos ventas.
    if (submitEnCurso.current) return;

    if (!idCliente) {
      alert('Selecciona un cliente');
      return;
    }
    if (carrito.length === 0) {
      alert('Agrega al menos un producto');
      return;
    }

    // Aviso de stock (no bloquea)
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
        <div className="form-card">
          <h2 className="form-title">➕ Nueva Venta</h2>
          <form onSubmit={handleSubmit}>
            <div className="form-grid">
              <div className="form-group">
                <label>Cliente</label>
                <select
                  value={idCliente}
                  onChange={(e) => setIdCliente(parseInt(e.target.value))}
                  required
                >
                  <option value={0}>Seleccionar cliente...</option>
                  {clientes.map((c) => (
                    <option key={c.id_cliente} value={c.id_cliente}>
                      #{c.id_cliente} — {c.nombre_cliente}
                    </option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label>Estado de Pago</label>
                <select
                  value={estadoPago}
                  onChange={(e) =>
                    setEstadoPago(e.target.value as 'Pagado' | 'Pendiente')
                  }
                >
                  <option value="Pendiente">⏳ Pendiente (Fiado)</option>
                  <option value="Pagado">✅ Pagado</option>
                </select>
              </div>
            </div>

            {/* Productos */}
            <div className="venta-productos">
              <h3 className="venta-subtitulo">🛍️ Productos</h3>

              <div className="form-group">
                <label>Agregar producto</label>
                <div className="venta-add-row">
                  <select
                    value={productoSeleccionado}
                    onChange={(e) =>
                      setProductoSeleccionado(parseInt(e.target.value))
                    }
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
                    className="btn btn-primary"
                    onClick={() => agregarAlCarrito(productoSeleccionado)}
                    disabled={!productoSeleccionado}
                  >
                    + Agregar
                  </button>
                </div>
              </div>

              {carrito.length === 0 ? (
                <div className="venta-carrito-vacio">
                  Aún no has agregado productos a esta venta.
                </div>
              ) : (
                <div className="table-wrapper venta-carrito">
                  <table>
                    <thead>
                      <tr>
                        <th>Producto</th>
                        <th>Precio</th>
                        <th>Cantidad</th>
                        <th>Subtotal</th>
                        <th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {carrito.map((i) => {
                        const excede = i.cantidad > i.stock_disponible;
                        return (
                          <tr key={i.id_producto}>
                            <td className="table-cell-bold">
                              {i.nombre}
                              {excede && (
                                <span className="venta-alerta-stock">
                                  ⚠️ solo hay {i.stock_disponible}
                                </span>
                              )}
                            </td>
                            <td className="table-cell-money">
                              ${i.precio_venta.toFixed(2)}
                            </td>
                            <td>
                              <input
                                type="number"
                                className="venta-input-cantidad"
                                min={1}
                                value={i.cantidad}
                                onChange={(e) =>
                                  cambiarCantidad(
                                    i.id_producto,
                                    parseInt(e.target.value)
                                  )
                                }
                              />
                            </td>
                            <td className="table-cell-money">
                              ${(i.precio_venta * i.cantidad).toFixed(2)}
                            </td>
                            <td>
                              <button
                                type="button"
                                className="btn btn-danger btn-sm"
                                onClick={() => quitarDelCarrito(i.id_producto)}
                                title="Quitar"
                              >
                                🗑️
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                    <tfoot>
                      <tr>
                        <td colSpan={3} className="venta-total-label">
                          Total
                        </td>
                        <td className="venta-total-monto">
                          ${totalCarrito.toFixed(2)}
                        </td>
                        <td></td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}
            </div>

            <div className="form-actions">
              <button type="submit" className="btn btn-success" disabled={guardando}>
                {guardando ? 'Guardando…' : '💾 Registrar Venta'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowForm(false);
                  limpiarFormulario();
                }}
                className="btn btn-secondary"
                disabled={guardando}
              >
                Cancelar
              </button>
            </div>
          </form>
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
