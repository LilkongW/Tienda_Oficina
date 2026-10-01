import { useState } from 'react'
import Navigation from './components/Navigation'
import VentasManager from './components/VentasManager'
import ProductosManager from './components/ProductosManager'
import ClientesManager from './components/ClientesManager'
import CuentasPorCobrar from './components/CuentasPorCobrar'
import MetricasManager from './components/MetricasManager'
import DatabaseTest from './components/DatabaseTest'
import CalculadoraBCV from './components/Calculadorabcv'
import './App.css'

function App() {
  const [currentView, setCurrentView] = useState('ventas')

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
        {renderView()}
      </main>
      <CalculadoraBCV />
    </div>
  )
}

export default App