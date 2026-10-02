import { useEffect, useState } from 'react'
import Navigation from './components/Navigation'
import VentasManager from './components/VentasManager'
import ProductosManager from './components/ProductosManager'
import ClientesManager from './components/ClientesManager'
import CuentasPorCobrar from './components/CuentasPorCobrar'
import MetricasManager from './components/MetricasManager'
import DatabaseTest from './components/DatabaseTest'
import CalculadoraBCV from './components/Calculadorabcv'
import { refreshLocalCopy, synchronizePending } from './lib/dataAccess'
import './App.css'

function App() {
  const [currentView, setCurrentView] = useState('ventas')
  const [dataRevision, setDataRevision] = useState(0)

  useEffect(() => {
    void refreshLocalCopy().catch(() => undefined)
    const refreshView = () => setDataRevision((revision) => revision + 1)
    const onOnline = () => { void synchronizePending().then(() => refreshLocalCopy()).catch(() => undefined) }
    window.addEventListener('database:refreshed', refreshView)
    window.addEventListener('online', onOnline)
    return () => {
      window.removeEventListener('database:refreshed', refreshView)
      window.removeEventListener('online', onOnline)
    }
  }, [])

  const renderView = () => {
    switch (currentView) {
      case 'ventas':
        return <VentasManager />
      case 'productos':
        return <ProductosManager />
      case 'clientes':
        return <ClientesManager />
      case 'cuentas':
        return <CuentasPorCobrar />
      case 'metricas':
        return <MetricasManager />
      case 'database':
        return <DatabaseTest />
      default:
        return <VentasManager />
    }
  }

  return (
    <div className="app-layout">
      <Navigation currentView={currentView} onViewChange={setCurrentView} />
      <main className="app-main">
        <div key={`${currentView}-${dataRevision}`}>
          {renderView()}
        </div>
      </main>
      <CalculadoraBCV />
    </div>
  )
}

export default App
