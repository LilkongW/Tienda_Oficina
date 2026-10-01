import { useState, useEffect } from 'react';
import { clientesService } from '../services/clientesService';
import type { Cliente, ClienteInput } from '../types/database';

export default function ClientesManager() {
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingCliente, setEditingCliente] = useState<Cliente | null>(null);
  const [formData, setFormData] = useState<ClienteInput>({
    nombre_cliente: '',
    telefono: ''
  });

  useEffect(() => {
    loadClientes();
  }, []);

  const loadClientes = async () => {
    try {
      setLoading(true);
      const data = await clientesService.getAll();
      // Ordenar por id_cliente ascendente
      const ordenados = [...data].sort((a, b) => a.id_cliente - b.id_cliente);
      setClientes(ordenados);
    } catch (error) {
      console.error('Error loading clientes:', error);
      alert('Error al cargar clientes');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editingCliente) {
        await clientesService.update(editingCliente.id_cliente, formData);
      } else {
        await clientesService.create(formData);
      }
      setShowForm(false);
      setEditingCliente(null);
      setFormData({ nombre_cliente: '', telefono: '' });
      loadClientes();
    } catch (error) {
      console.error('Error saving cliente:', error);
      alert('Error al guardar cliente');
    }
  };

  const handleEdit = (cliente: Cliente) => {
    setEditingCliente(cliente);
    setFormData({
      nombre_cliente: cliente.nombre_cliente,
      telefono: cliente.telefono || ''
    });
    setShowForm(true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleDelete = async (id: number) => {
    if (confirm('¿Estás seguro de eliminar este cliente?')) {
      try {
        await clientesService.delete(id);
        loadClientes();
      } catch (error) {
        console.error('Error deleting cliente:', error);
        alert('Error al eliminar cliente. Verifica que no tenga ventas asociadas.');
      }
    }
  };

  if (loading) {
    return (
      <div className="loading-container">
        <div className="loading-spinner"></div>
        <span className="loading-text">Cargando clientes...</span>
      </div>
    );
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">👥 Clientes</h1>
          <p className="page-description">{clientes.length} cliente{clientes.length !== 1 ? 's' : ''} registrado{clientes.length !== 1 ? 's' : ''}</p>
        </div>
        <button
          onClick={() => {
            setEditingCliente(null);
            setFormData({ nombre_cliente: '', telefono: '' });
            setShowForm(true);
            window.scrollTo({ top: 0, behavior: 'smooth' });
          }}
          className="btn btn-primary"
        >
          + Nuevo Cliente
        </button>
      </div>

      {showForm && (
        <div className="form-card">
          <h2 className="form-title">
            {editingCliente ? '✏️ Editar Cliente' : '➕ Nuevo Cliente'}
          </h2>
          <form onSubmit={handleSubmit}>
            <div className="form-grid">
              <div className="form-group">
                <label>Nombre</label>
                <input
                  type="text"
                  value={formData.nombre_cliente}
                  onChange={(e) => setFormData({ ...formData, nombre_cliente: e.target.value })}
                  placeholder="Nombre del cliente"
                  required
                />
              </div>
              <div className="form-group">
                <label>Teléfono (opcional)</label>
                <input
                  type="text"
                  value={formData.telefono}
                  onChange={(e) => setFormData({ ...formData, telefono: e.target.value })}
                  placeholder="+58 412-1234567"
                />
              </div>
            </div>
            <div className="form-actions">
              <button type="submit" className="btn btn-success">
                {editingCliente ? '💾 Actualizar' : '💾 Guardar'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowForm(false);
                  setEditingCliente(null);
                }}
                className="btn btn-secondary"
              >
                Cancelar
              </button>
            </div>
          </form>
        </div>
      )}

      {clientes.length === 0 ? (
        <div className="card">
          <div className="empty-state">
            <div className="empty-state-icon">👥</div>
            <div className="empty-state-text">No hay clientes registrados</div>
            <div className="empty-state-subtext">Agrega tu primer cliente para comenzar</div>
          </div>
        </div>
      ) : (
        <div className="table-wrapper">
          <table>
            <thead>
              <tr>
                <th>ID</th>
                <th>Nombre</th>
                <th>Teléfono</th>
                <th>Registrado</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {clientes.map((cliente) => (
                <tr key={cliente.id_cliente}>
                  <td className="table-cell-bold">#{cliente.id_cliente}</td>
                  <td className="table-cell-bold">{cliente.nombre_cliente}</td>
                  <td>{cliente.telefono || '—'}</td>
                  <td>
                    {new Date(cliente.created_at).toLocaleDateString('es-ES', {
                      day: 'numeric',
                      month: 'short',
                      year: 'numeric'
                    })}
                  </td>
                  <td>
                    <div className="table-cell-actions">
                      <button onClick={() => handleEdit(cliente)} className="btn btn-primary btn-sm">
                        ✏️ Editar
                      </button>
                      <button onClick={() => handleDelete(cliente.id_cliente)} className="btn btn-danger btn-sm">
                        🗑️ Eliminar
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
