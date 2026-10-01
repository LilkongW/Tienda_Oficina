import { useState } from 'react';
import { supabase } from '../lib/supabase';
import { productosService } from '../services/productosService';
import { clientesService } from '../services/clientesService';
import { ventasService } from '../services/ventasService';

interface TestResult {
  name: string;
  status: 'pending' | 'success' | 'error';
  message: string;
  duration?: number;
}

export default function DatabaseTest() {
  const [tests, setTests] = useState<TestResult[]>([]);
  const [isRunning, setIsRunning] = useState(false);

  const runTests = async () => {
    setIsRunning(true);
    const results: TestResult[] = [];

    // Test 1: Conexión básica
    results.push({ name: 'Conexión con Supabase', status: 'pending', message: 'Conectando...' });
    setTests([...results]);
    
    try {
      const start = performance.now();
      const { data, error } = await supabase.from('productos').select('count', { count: 'exact', head: true });
      const duration = performance.now() - start;
      
      if (error) throw error;
      results[0] = { 
        name: 'Conexión con Supabase', 
        status: 'success', 
        message: `Conectado - ${data?.[0]?.count ?? 0} productos en BD`,
        duration 
      };
    } catch (error: any) {
      results[0] = { 
        name: 'Conexión con Supabase', 
        status: 'error', 
        message: error.message || 'Error de conexión' 
      };
    }
    setTests([...results]);

    // Test 2: Leer productos
    results.push({ name: 'GET /productos', status: 'pending', message: 'Consultando productos...' });
    setTests([...results]);
    
    try {
      const start = performance.now();
      const productos = await productosService.getAll();
      const duration = performance.now() - start;
      
      results[1] = { 
        name: 'GET /productos', 
        status: 'success', 
        message: `${productos.length} productos recuperados`,
        duration 
      };
    } catch (error: any) {
      results[1] = { 
        name: 'GET /productos', 
        status: 'error', 
        message: error.message || 'Error al consultar productos' 
      };
    }
    setTests([...results]);

    // Test 3: Leer clientes
    results.push({ name: 'GET /clientes', status: 'pending', message: 'Consultando clientes...' });
    setTests([...results]);
    
    try {
      const start = performance.now();
      const clientes = await clientesService.getAll();
      const duration = performance.now() - start;
      
      results[2] = { 
        name: 'GET /clientes', 
        status: 'success', 
        message: `${clientes.length} clientes recuperados`,
        duration 
      };
    } catch (error: any) {
      results[2] = { 
        name: 'GET /clientes', 
        status: 'error', 
        message: error.message || 'Error al consultar clientes' 
      };
    }
    setTests([...results]);

    // Test 4: Leer ventas
    results.push({ name: 'GET /ventas', status: 'pending', message: 'Consultando ventas...' });
    setTests([...results]);
    
    try {
      const start = performance.now();
      const ventas = await ventasService.getAll();
      const duration = performance.now() - start;
      
      results[3] = { 
        name: 'GET /ventas', 
        status: 'success', 
        message: `${ventas.length} ventas recuperadas`,
        duration 
      };
    } catch (error: any) {
      results[3] = { 
        name: 'GET /ventas', 
        status: 'error', 
        message: error.message || 'Error al consultar ventas' 
      };
    }
    setTests([...results]);

    // Test 5: Cuentas por cobrar
    results.push({ name: 'GET /ventas?estado=Pendiente', status: 'pending', message: 'Consultando cuentas por cobrar...' });
    setTests([...results]);
    
    try {
      const start = performance.now();
      const cuentas = await ventasService.getCuentasPorCobrar();
      const duration = performance.now() - start;
      
      results[4] = { 
        name: 'GET /ventas?estado=Pendiente', 
        status: 'success', 
        message: `${cuentas.length} cuentas por cobrar`,
        duration 
      };
    } catch (error: any) {
      results[4] = { 
        name: 'GET /ventas?estado=Pendiente', 
        status: 'error', 
        message: error.message || 'Error al consultar cuentas por cobrar' 
      };
    }
    setTests([...results]);

    setIsRunning(false);
  };

  const getStatusIcon = (status: TestResult['status']) => {
    switch (status) {
      case 'pending': return '⏳';
      case 'success': return '✅';
      case 'error': return '❌';
    }
  };

  const getStatusClass = (status: TestResult['status']) => {
    switch (status) {
      case 'pending': return 'test-pending';
      case 'success': return 'test-success';
      case 'error': return 'test-error';
    }
  };

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">🔧 Diagnóstico de Base de Datos</h1>
          <p className="page-description">Prueba de conexión y endpoints API</p>
        </div>
        <button
          onClick={runTests}
          disabled={isRunning}
          className="btn btn-primary"
        >
          {isRunning ? '⏳ Ejecutando...' : '🚀 Ejecutar Pruebas'}
        </button>
      </div>

      <div className="card">
        <h2 className="form-title mb-4">Configuración de Supabase</h2>
        <div className="form-grid">
          <div className="form-group">
            <label>URL de Supabase</label>
            <input
              type="text"
              value={import.meta.env.VITE_SUPABASE_URL || 'No configurada'}
              disabled
              className="bg-gray-100"
            />
          </div>
          <div className="form-group">
            <label>API Key</label>
            <input
              type="text"
              value={import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ? 'Configurada ✓' : 'No configurada ✗'}
              disabled
              className="bg-gray-100"
            />
          </div>
        </div>
      </div>

      {tests.length > 0 && (
        <div className="card">
          <h2 className="form-title mb-4">Resultados de Pruebas</h2>
          <div className="space-y-3">
            {tests.map((test, index) => (
              <div key={index} className={`test-result ${getStatusClass(test.status)}`}>
                <div className="test-result-header">
                  <span className="test-result-icon">{getStatusIcon(test.status)}</span>
                  <span className="test-result-name">{test.name}</span>
                  {test.duration && (
                    <span className="test-result-duration">{test.duration.toFixed(0)}ms</span>
                  )}
                </div>
                <div className="test-result-message">{test.message}</div>
              </div>
            ))}
          </div>

          <div className="mt-4 pt-4 border-t">
            <div className="flex gap-4">
              <div className="flex items-center gap-2">
                <span className="text-success">✅</span>
                <span className="text-sm">
                  {tests.filter(t => t.status === 'success').length} exitosas
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-danger">❌</span>
                <span className="text-sm">
                  {tests.filter(t => t.status === 'error').length} fallidas
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      {tests.length > 0 && tests.every(t => t.status === 'success') && (
        <div className="alert alert-success">
          <div className="alert-title">🎉 ¡Todas las pruebas pasaron!</div>
          <div className="alert-body">
            La conexión con la base de datos está funcionando correctamente. Todos los endpoints están respondiendo como esperado.
          </div>
        </div>
      )}

      {tests.length > 0 && tests.some(t => t.status === 'error') && (
        <div className="alert alert-danger">
          <div className="alert-title">⚠️ Algunas pruebas fallaron</div>
          <div className="alert-body">
            Revisa los mensajes de error arriba. Posibles causas:
            <ul className="mt-2">
              <li>Credenciales de Supabase incorrectas</li>
              <li>La base de datos no está inicializada</li>
              <li>Problemas de red o firewall</li>
              <li>Políticas RLS restrictivas en Supabase</li>
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}
