import { useState, useEffect } from 'react';
import { productosService } from '../services/productosService';
import type { Producto, ProductoInput } from '../types/database';

export default function ProductosManager() {
  const [productos, setProductos] = useState<Producto[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingProducto, setEditingProducto] = useState<Producto | null>(null);
  const [formData, setFormData] = useState<ProductoInput>({
    nombre: '',
    unidades_por_paquete: 1,
    costo_paquete: 0,
    precio_venta: 0,
    stock_actual: 0
  });

  useEffect(() => {
    loadProductos();
  }, []);

  // Recargar cuando la pestaña gana foco
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (!document.hidden) {
        loadProductos();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  const loadProductos = async () => {
    try {
      setLoading(true);
      const data = await productosService.getAll();
      setProductos(data);
    } catch (error) {
      console.error('Error loading productos:', error);
      alert('Error al cargar productos');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editingProducto) {
        await productosService.update(editingProducto.id_producto, formData);
      } else {
        await productosService.create(formData);
      }
      setShowForm(false);
      setEditingProducto(null);
      setFormData({
        nombre: '',
        unidades_por_paquete: 1,
        costo_paquete: 0,
        precio_venta: 0,
        stock_actual: 0
      });
      loadProductos();
    } catch (error) {
      console.error('Error saving producto:', error);
      alert('Error al guardar producto');
    }
  };

  const handleEdit = (producto: Producto) => {
    setEditingProducto(producto);
    setFormData({
      nombre: producto.nombre,
      unidades_por_paquete: producto.unidades_por_paquete,
      costo_paquete: producto.costo_paquete,
      precio_venta: producto.precio_venta,
      stock_actual: producto.stock_actual
    });
    setShowForm(true);
  };

  const handleDelete = async (id: number) => {
    if (confirm('¿Estás seguro de eliminar este producto?')) {
      try {
        await productosService.delete(id);
        loadProductos();
      } catch (error) {
        console.error('Error deleting producto:', error);
        alert('Error al eliminar producto. Verifica que no tenga ventas asociadas.');
      }
    }
  };

  const costoUnitario = formData.unidades_por_paquete > 0
    ? formData.costo_paquete / formData.unidades_por_paquete
    : 0;
  const gananciaUnitaria = formData.precio_venta - costoUnitario;

  const totalProductos = productos.length;
  const stockBajo = productos.filter(p => p.stock_actual <= 10).length;
  const sinStock = productos.filter(p => p.stock_actual === 0).length;

  if (loading) {
    return (
      <div className="loading-container">
        <div className="loading-spinner"></div>
        <span className="loading-text">Cargando productos...</span>
      </div>
    );
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">📦 Productos</h1>
          <p className="page-description">Gestión de inventario y precios</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={loadProductos}
            className="btn btn-secondary"
            disabled={loading}
          >
            🔄 {loading ? 'Actualizando...' : 'Recargar'}
          </button>
          <button
            onClick={() => {
              setEditingProducto(null);
              setFormData({
                nombre: '',
                unidades_por_paquete: 1,
                costo_paquete: 0,
                precio_venta: 0,
                stock_actual: 0
              });
              setShowForm(true);
            }}
            className="btn btn-primary"
          >
            + Nuevo Producto
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-card-icon blue">📦</div>
          <div className="stat-card-label">Total Productos</div>
          <div className="stat-card-value">{totalProductos}</div>
        </div>
        <div className="stat-card">
          <div className="stat-card-icon yellow">⚠️</div>
          <div className="stat-card-label">Stock Bajo (≤10)</div>
          <div className="stat-card-value text-yellow">{stockBajo}</div>
        </div>
        <div className="stat-card">
          <div className="stat-card-icon red">🚫</div>
          <div className="stat-card-label">Sin Stock</div>
          <div className="stat-card-value text-red">{sinStock}</div>
        </div>
      </div>

      {showForm && (
        <div className="form-card">
          <h2 className="form-title">
            {editingProducto ? '✏️ Editar Producto' : '➕ Nuevo Producto'}
          </h2>
          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label>Nombre del producto</label>
              <input
                type="text"
                value={formData.nombre}
                onChange={(e) => setFormData({ ...formData, nombre: e.target.value })}
                placeholder="Ej: Golpe, Cocosette..."
                required
              />
            </div>
            <div className="form-grid">
              <div className="form-group">
                <label>Unidades por paquete</label>
                <input
                  type="number"
                  value={formData.unidades_por_paquete}
                  onChange={(e) => setFormData({ ...formData, unidades_por_paquete: parseInt(e.target.value) || 1 })}
                  required
                  min="1"
                />
              </div>
              <div className="form-group">
                <label>Costo paquete ($)</label>
                <input
                  type="number"
                  step="0.01"
                  value={formData.costo_paquete}
                  onChange={(e) => setFormData({ ...formData, costo_paquete: parseFloat(e.target.value) || 0 })}
                  required
                  min="0"
                />
              </div>
            </div>
            <div className="form-grid">
              <div className="form-group">
                <label>Costo unitario ($) — calculado</label>
                <input
                  type="number"
                  step="0.01"
                  value={costoUnitario.toFixed(2)}
                  disabled
                />
              </div>
              <div className="form-group">
                <label>Precio venta ($)</label>
                <input
                  type="number"
                  step="0.01"
                  value={formData.precio_venta}
                  onChange={(e) => setFormData({ ...formData, precio_venta: parseFloat(e.target.value) || 0 })}
                  required
                  min="0"
                />
              </div>
            </div>
            <div className="form-group">
              <label>Stock actual (unidades)</label>
              <input
                type="number"
                value={formData.stock_actual}
                onChange={(e) => setFormData({ ...formData, stock_actual: parseInt(e.target.value) || 0 })}
                required
                min="0"
              />
            </div>
            {formData.precio_venta > 0 && (
              <div className={`form-info ${gananciaUnitaria >= 0 ? 'success' : ''}`}
                style={gananciaUnitaria < 0 ? { background: 'var(--danger-50)', color: 'var(--danger-800)', border: '1px solid var(--danger-100)' } : undefined}
              >
                {gananciaUnitaria >= 0 ? '📈' : '📉'} Ganancia unitaria: ${gananciaUnitaria.toFixed(2)}
              </div>
            )}
            <div className="form-actions">
              <button type="submit" className="btn btn-success">
                {editingProducto ? '💾 Actualizar' : '💾 Guardar'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowForm(false);
                  setEditingProducto(null);
                }}
                className="btn btn-secondary"
              >
                Cancelar
              </button>
            </div>
          </form>
        </div>
      )}

      {productos.length === 0 ? (
        <div className="card">
          <div className="empty-state">
            <div className="empty-state-icon">📦</div>
            <div className="empty-state-text">No hay productos registrados</div>
            <div className="empty-state-subtext">Agrega tu primer producto para comenzar</div>
          </div>
        </div>
      ) : (
        <div className="table-wrapper">
          <table>
            <thead>
              <tr>
                <th>Producto</th>
                <th>Uds/Paquete</th>
                <th>Costo Paq.</th>
                <th>Costo Unit.</th>
                <th>Precio Venta</th>
                <th>Ganancia</th>
                <th>Stock</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {productos.map((producto) => {
                const ganancia = producto.precio_venta - producto.costo_unitario;
                return (
                  <tr key={producto.id_producto}>
                    <td className="table-cell-bold">{producto.nombre}</td>
                    <td>{producto.unidades_por_paquete}</td>
                    <td className="table-cell-money">${producto.costo_paquete.toFixed(2)}</td>
                    <td className="table-cell-money">${producto.costo_unitario.toFixed(2)}</td>
                    <td className="table-cell-money">${producto.precio_venta.toFixed(2)}</td>
                    <td className={`table-cell-money ${ganancia >= 0 ? 'text-green' : 'text-red'}`}>
                      ${ganancia.toFixed(2)}
                    </td>
                    <td>
                      <span className={producto.stock_actual <= 10 ? 'stock-low' : 'stock-ok'}>
                        {producto.stock_actual === 0 ? '⛔ 0' : producto.stock_actual <= 10 ? `⚠️ ${producto.stock_actual}` : producto.stock_actual}
                      </span>
                    </td>
                    <td>
                      <div className="table-cell-actions">
                        <button onClick={() => handleEdit(producto)} className="btn btn-primary btn-sm">
                          ✏️ Editar
                        </button>
                        <button onClick={() => handleDelete(producto.id_producto)} className="btn btn-danger btn-sm">
                          🗑️
                        </button>
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
  );
}
