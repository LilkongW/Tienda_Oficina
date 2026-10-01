interface NavigationProps {
  currentView: string;
  onViewChange: (view: string) => void;
}

export default function Navigation({ currentView, onViewChange }: NavigationProps) {
  const menuItems = [
    { id: 'ventas', label: 'Ventas', icon: '🛒' },
    { id: 'productos', label: 'Productos', icon: '📦' },
    { id: 'clientes', label: 'Clientes', icon: '👥' },
    { id: 'cuentas', label: 'Por Cobrar', icon: '💰' },
    { id: 'metricas', label: 'Métricas', icon: '📊' },
    { id: 'database', label: 'Diagnóstico', icon: '🔧' }
  ];

  return (
    <nav className="nav">
      <div className="nav-inner">
        <div className="nav-top">
          <div className="nav-brand">
            <div className="nav-logo">🏪</div>
            <div>
              <div className="nav-title">Sistema de Ventas</div>
              <div className="nav-subtitle">Panel de administración</div>
            </div>
          </div>
          <div className="nav-status">
            <span className="nav-status-dot"></span>
            Conectado
          </div>
        </div>
        <div className="nav-tabs">
          {menuItems.map((item) => (
            <button
              key={item.id}
              onClick={() => onViewChange(item.id)}
              className={`nav-tab ${currentView === item.id ? 'active' : ''}`}
            >
              <span className="nav-tab-icon">{item.icon}</span>
              <span className="nav-tab-label">{item.label}</span>
            </button>
          ))}
        </div>
      </div>
    </nav>
  );
}
