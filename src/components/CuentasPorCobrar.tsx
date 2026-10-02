import { useState, useEffect, useMemo, useRef } from 'react';
import { ventasService } from '../services/ventasService';
import { readTable } from '../lib/dataAccess';
import {
  enviarTelegram,
  normalizarTelefono,
  esperar,
  enlaceVinculacion,
  obtenerVinculaciones,
} from '../services/telegramService';
import type { Cliente } from '../types/database';
import './CuentasPorCobrar.css';

// Datos que aparecen al final de la factura
const DATOS_FACTURA = ['25560651', '04247805075', 'Venezuela'];

interface ItemVenta {
  nombre: string;
  cantidad: number;
  subtotal: number;
}

interface VentaPendiente {
  id_venta: number;
  fecha: string;
  monto_total: number;
  items: ItemVenta[];
}

interface CuentaPorCliente {
  cliente: Cliente;
  ventas: VentaPendiente[];
  total: number;
}

type FaseEnvio = 'confirmar' | 'enviando' | 'resumen';

interface FilaEnvio {
  idCliente: number;
  cliente: string;
  telefono: string | null;
  chatId: number | null;
  estado: 'pendiente' | 'enviando' | 'ok' | 'sin-telefono' | 'error';
  error?: string;
}

const money = (n: number) => `$${n.toFixed(2)}`;

const moneyBs = (n: number) => `Bs. ${n.toFixed(2).replace('.', ',')}`;

const fechaCorta = (fecha: string) =>
  new Date(fecha).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' });

/** Obtiene la tasa del BCV desde localStorage (la misma que usa la calculadora) */
const obtenerTasaBCV = (): number | null => {
  try {
    const raw = localStorage.getItem('bcv_tasa_cache');
    if (!raw) return null;
    const t = JSON.parse(raw) as { valor: number };
    return t && t.valor > 0 ? t.valor : null;
  } catch {
    return null;
  }
};

/** Convierte una fila de detalle_venta (con su producto) en un item simple */
const mapearItem = (d: any): ItemVenta => {
  const cantidad = Number(d.cantidad ?? 1);
  const precio = Number(d.precio_unitario ?? d.precio ?? d.producto?.precio ?? 0);
  return {
    nombre: d.producto?.nombre_producto ?? d.producto?.nombre ?? 'Producto',
    cantidad,
    subtotal: d.subtotal != null ? Number(d.subtotal) : cantidad * precio,
  };
};

/** Arma el texto de la factura para un cliente */
const armarFactura = (cuenta: CuentaPorCliente): string => {
  const items = cuenta.ventas
    .flatMap((v) =>
      v.items.length > 0
        ? v.items.map((i) => `• ${i.cantidad} x ${i.nombre} — ${money(i.subtotal)}`)
        : [`• Venta #${v.id_venta} — ${money(v.monto_total)}`]
    )
    .join('\n');

  const tasa = obtenerTasaBCV();
  const lineas = [
    `Hola ${cuenta.cliente.nombre_cliente}, tienes pendiente lo de las ventas:`,
    items,
    `Total en $: ${money(cuenta.total)}`,
  ];

  if (tasa) {
    const totalBs = cuenta.total * tasa;
    lineas.push(`Total en Bs: ${moneyBs(totalBs)}`);
  }

  lineas.push('', ...DATOS_FACTURA, 'Mensaje generado automáticamente');

  return lineas.join('\n');
};

export default function CuentasPorCobrar() {
  const [cuentas, setCuentas] = useState<CuentaPorCliente[]>([]);
  const [loading, setLoading] = useState(true);
  const [pagando, setPagando] = useState<number | null>(null);

  // Factura abierta en el modal
  const [factura, setFactura] = useState<{ nombre: string } | null>(null);
  const [facturaTexto, setFacturaTexto] = useState('');
  const [copiado, setCopiado] = useState(false);

  // Envío masivo por Telegram
  const [envioAbierto, setEnvioAbierto] = useState(false);
  const [faseEnvio, setFaseEnvio] = useState<FaseEnvio>('confirmar');
  const [filasEnvio, setFilasEnvio] = useState<FilaEnvio[]>([]);
  const [enviando, setEnviando] = useState(false);
  const [sincronizando, setSincronizando] = useState(false);
  const cancelarEnvioRef = useRef(false);

  useEffect(() => {
    loadCuentas();
  }, []);

  // Recargar cuando la pestaña gana foco
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (!document.hidden) {
        loadCuentas();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  // Esc cierra el modal de la factura o el de envío (si no está enviando)
  useEffect(() => {
    const alPresionar = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (envioAbierto && !enviando) {
        setEnvioAbierto(false);
      } else if (factura) {
        setFactura(null);
      }
    };
    document.addEventListener('keydown', alPresionar);
    return () => document.removeEventListener('keydown', alPresionar);
  }, [factura, envioAbierto, enviando]);

  const loadCuentas = async (mostrarSpinner = true) => {
    try {
      if (mostrarSpinner) setLoading(true);

      const [ventas, clientes, detalles, productos] = await Promise.all([
        readTable('ventas'), readTable('clientes'), readTable('detalle_venta'), readTable('productos'),
      ]);
      const data = ventas.filter((venta) => venta.estado_pago === 'Pendiente').sort((a, b) => b.fecha.localeCompare(a.fecha)).map((venta) => ({
        ...venta,
        cliente: clientes.find((cliente) => cliente.id_cliente === venta.id_cliente),
        detalle_venta: detalles.filter((detalle) => detalle.id_venta === venta.id_venta).map((detalle) => ({
          ...detalle, producto: productos.find((producto) => producto.id_producto === detalle.id_producto),
        })),
      }));

      const agrupadas: Record<number, CuentaPorCliente> = {};

      for (const v of (data ?? []) as any[]) {
        const cliente = Array.isArray(v.cliente) ? v.cliente[0] : v.cliente;
        if (!cliente) continue;

        if (!agrupadas[cliente.id_cliente]) {
          agrupadas[cliente.id_cliente] = { cliente, ventas: [], total: 0 };
        }

        const monto = Number(v.monto_total) || 0;
        agrupadas[cliente.id_cliente].ventas.push({
          id_venta: v.id_venta,
          fecha: v.fecha,
          monto_total: monto,
          items: (v.detalle_venta ?? []).map(mapearItem),
        });
        agrupadas[cliente.id_cliente].total += monto;
      }

      setCuentas(Object.values(agrupadas).sort((a, b) => b.total - a.total));
    } catch (error) {
      console.error('Error loading cuentas:', error);
      alert('Error al cargar cuentas por cobrar');
    } finally {
      setLoading(false);
    }
  };

  const pagarTodo = async (cuenta: CuentaPorCliente) => {
    const { id_cliente, nombre_cliente } = cuenta.cliente;
    const n = cuenta.ventas.length;

    if (!confirm(`¿Marcar como pagadas las ${n} venta${n !== 1 ? 's' : ''} de ${nombre_cliente} por ${money(cuenta.total)}?`)) {
      return;
    }

    setPagando(id_cliente);
    const resultados = await Promise.allSettled(
      cuenta.ventas.map((v) => ventasService.marcarPagada(v.id_venta))
    );
    const fallidas = resultados.filter((r) => r.status === 'rejected').length;

    if (fallidas > 0) {
      console.error('Ventas que fallaron:', resultados);
      alert(`${fallidas} de ${n} ventas no se pudieron marcar como pagadas. Intenta de nuevo.`);
    }

    await loadCuentas(false);
    setPagando(null);
  };

  const abrirFactura = (cuenta: CuentaPorCliente) => {
    setFacturaTexto(armarFactura(cuenta));
    setFactura({ nombre: cuenta.cliente.nombre_cliente });
    setCopiado(false);
  };

  const copiarFactura = async () => {
    try {
      await navigator.clipboard.writeText(facturaTexto);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    } catch {
      alert('No se pudo copiar. Selecciona el texto y cópialo manualmente.');
    }
  };

  // ── Envío masivo por Telegram ──────────────────────────────
  const abrirEnvioMasivo = () => {
    const filas: FilaEnvio[] = cuentas.map((c) => {
      const chatId = c.cliente.telegram_chat_id ?? null;
      return {
        idCliente: c.cliente.id_cliente,
        cliente: c.cliente.nombre_cliente,
        telefono: normalizarTelefono(c.cliente.telefono),
        chatId,
        // 'sin-telefono' = sin Telegram vinculado (se conserva el nombre por el CSS)
        estado: chatId ? 'pendiente' : 'sin-telefono',
      };
    });
    setFilasEnvio(filas);
    setFaseEnvio('confirmar');
    cancelarEnvioRef.current = false;
    setEnvioAbierto(true);
  };

  const ejecutarEnvioMasivo = async () => {
    setEnviando(true);
    setFaseEnvio('enviando');
    cancelarEnvioRef.current = false;

    const filas = [...filasEnvio];

    for (let i = 0; i < filas.length; i++) {
      if (cancelarEnvioRef.current) break;

      const fila = filas[i];
      if (!fila.chatId) continue;

      filas[i] = { ...fila, estado: 'enviando' };
      setFilasEnvio([...filas]);

      const cuenta = cuentas.find((c) => c.cliente.id_cliente === fila.idCliente);
      if (!cuenta) {
        filas[i] = { ...fila, estado: 'error', error: 'Cliente no encontrado' };
        setFilasEnvio([...filas]);
        continue;
      }

      const mensaje = armarFactura(cuenta);
      const resultado = await enviarTelegram({
        chatId: fila.chatId,
        mensaje,
      });

      filas[i] = {
        ...fila,
        estado: resultado.ok ? 'ok' : 'error',
        error: resultado.error,
      };
      setFilasEnvio([...filas]);

      if (i < filas.length - 1) await esperar(1200);
    }

    setEnviando(false);
    setFaseEnvio('resumen');
  };

  const cancelarEnvioMasivo = () => {
    cancelarEnvioRef.current = true;
  };

  // ── Vinculación de clientes con el bot ─────────────────────
  const copiarEnlaceTelegram = async (idCliente: number) => {
    const enlace = enlaceVinculacion(idCliente);
    if (!enlace) {
      alert('Falta VITE_TELEGRAM_BOT_USERNAME en el .env');
      return;
    }
    try {
      await navigator.clipboard.writeText(enlace);
      alert('Enlace copiado. Envíaselo al cliente para que presione "Iniciar" en el bot.');
    } catch {
      prompt('Copia este enlace y envíaselo al cliente:', enlace);
    }
  };

  const sincronizarTelegram = async () => {
    setSincronizando(true);
    try {
      const vinculos = await obtenerVinculaciones();
      const conocidos = new Set(cuentas.map((c) => c.cliente.id_cliente));
      const guardados = vinculos.filter((v) => conocidos.has(v.idCliente)).length;

      await loadCuentas(false);
      alert(
        guardados > 0
          ? `Se vincularon ${guardados} cliente(s) con Telegram.`
          : 'No hay vinculaciones nuevas. Los clientes deben abrir su enlace y presionar "Iniciar".'
      );
    } catch (e) {
      alert(`No se pudo sincronizar: ${e instanceof Error ? e.message : 'error desconocido'}`);
    } finally {
      setSincronizando(false);
    }
  };

  const totalPorCobrar = useMemo(() => cuentas.reduce((sum, c) => sum + c.total, 0), [cuentas]);

  if (loading) {
    return (
      <div className="loading-container">
        <div className="loading-spinner"></div>
        <span className="loading-text">Cargando cuentas por cobrar...</span>
      </div>
    );
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">💰 Cuentas por Cobrar</h1>
          <p className="page-description">Fiados y pagos pendientes por cliente</p>
        </div>
        <div className="cxc-header-acciones">
          <button
            onClick={abrirEnvioMasivo}
            className="btn btn-telegram"
            disabled={loading || cuentas.length === 0}
            title="Enviar la factura a todos los clientes con deuda"
          >
            ✈️ Enviar a todos
          </button>
          <button
            onClick={sincronizarTelegram}
            className="btn btn-secondary"
            disabled={sincronizando || cuentas.length === 0}
            title="Registra los clientes que ya presionaron Iniciar en el bot"
          >
            {sincronizando ? 'Sincronizando…' : '🔗 Sincronizar Telegram'}
          </button>
          <button
            onClick={() => loadCuentas()}
            className="btn btn-secondary"
            disabled={loading}
          >
            🔄 {loading ? 'Actualizando...' : 'Recargar'}
          </button>
        </div>
      </div>

      {/* Summary Banner con blur */}
      <div className="summary-banner blur-card" onClick={(e) => e.currentTarget.classList.toggle('blur-active')}>
        <div className="summary-banner-row">
          <div>
            <div className="summary-banner-label">💸 Total por cobrar</div>
            <div className="summary-banner-sub">
              {cuentas.length} cliente{cuentas.length !== 1 ? 's' : ''} con deuda
            </div>
          </div>
          <div className="summary-banner-value">{money(totalPorCobrar)}</div>
        </div>
        <div className="blur-hint">Click para ver/ocultar</div>
      </div>

      {cuentas.length === 0 ? (
        <div className="card">
          <div className="empty-state">
            <div className="empty-state-icon">🎉</div>
            <div className="empty-state-text">¡No hay cuentas por cobrar!</div>
            <div className="empty-state-subtext">Todas las ventas están pagadas. ¡Excelente!</div>
          </div>
        </div>
      ) : (
        <div className="cxc-lista">
          {cuentas.map((cuenta) => {
            const n = cuenta.ventas.length;
            const ocupado = pagando === cuenta.cliente.id_cliente;

            return (
              <div key={cuenta.cliente.id_cliente} className="card cxc-cliente">
                <div className="cxc-cliente-header">
                  <div>
                    <h3 className="cxc-cliente-nombre">{cuenta.cliente.nombre_cliente}</h3>
                    <p className="cxc-cliente-sub">
                      {n} venta{n !== 1 ? 's' : ''} pendiente{n !== 1 ? 's' : ''}
                    </p>
                  </div>
                  <div className="cxc-cliente-total">{money(cuenta.total)}</div>
                </div>

                <div className="cxc-ventas">
                  {cuenta.ventas.map((venta) => (
                    <div key={venta.id_venta} className="cxc-venta">
                      <div className="cxc-venta-head">
                        <span>
                          <strong>#{venta.id_venta}</strong> · {fechaCorta(venta.fecha)}
                        </span>
                        <span className="cxc-venta-monto">{money(venta.monto_total)}</span>
                      </div>
                      {venta.items.length > 0 && (
                        <ul className="cxc-items">
                          {venta.items.map((item, i) => (
                            <li key={i} className="cxc-item">
                              <span>
                                {item.cantidad} x {item.nombre}
                              </span>
                              <span>{money(item.subtotal)}</span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  ))}
                </div>

                <div className="cxc-cliente-pie">
                  {!cuenta.cliente.telegram_chat_id && (
                    <button
                      type="button"
                      className="cxc-btn"
                      onClick={() => copiarEnlaceTelegram(cuenta.cliente.id_cliente)}
                    >
                      🔗 Enlace de Telegram
                    </button>
                  )}
                  <button type="button" className="cxc-btn" onClick={() => abrirFactura(cuenta)}>
                    🧾 Generar factura
                  </button>
                  <button
                    type="button"
                    className="btn btn-success"
                    onClick={() => pagarTodo(cuenta)}
                    disabled={ocupado}
                  >
                    {ocupado ? 'Procesando…' : `✅ Pagar todo (${money(cuenta.total)})`}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modal de factura individual */}
      {factura && (
        <div
          className="cxc-backdrop"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setFactura(null);
          }}
        >
          <div className="cxc-modal" role="dialog" aria-modal="true" aria-labelledby="cxc-factura-titulo">
            <h2 id="cxc-factura-titulo" className="cxc-modal-titulo">
              Factura de {factura.nombre}
            </h2>
            <label htmlFor="cxc-factura-texto" className="cxc-modal-ayuda">
              Puedes editar el texto antes de copiarlo o enviarlo.
            </label>
            <textarea
              id="cxc-factura-texto"
              className="cxc-textarea"
              value={facturaTexto}
              onChange={(e) => setFacturaTexto(e.target.value)}
              rows={12}
            />
            <div className="cxc-modal-acciones">
              <button type="button" className="cxc-btn" onClick={() => setFactura(null)}>
                Cerrar
              </button>
              <a
                className="cxc-btn"
                href={`https://t.me/share/url?text=${encodeURIComponent(facturaTexto)}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                Enviar por Telegram
              </a>
              <button type="button" className="cxc-btn cxc-btn-primario" onClick={copiarFactura}>
                {copiado ? '¡Copiado!' : 'Copiar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de envío masivo */}
      {envioAbierto && (
        <div
          className="cxc-backdrop"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget && !enviando) setEnvioAbierto(false);
          }}
        >
          <div className="cxc-modal cxc-modal-envio" role="dialog" aria-modal="true" aria-labelledby="cxc-envio-titulo">
            <h2 id="cxc-envio-titulo" className="cxc-modal-titulo">
              ✈️ Enviar facturas por Telegram
            </h2>

            {faseEnvio === 'confirmar' && (
              <>
                <p className="cxc-modal-ayuda">
                  Se enviará el mensaje de la factura a{' '}
                  <strong>{filasEnvio.filter((f) => f.chatId).length}</strong> cliente(s).
                  {filasEnvio.some((f) => !f.chatId) && (
                    <> Los que no han vinculado Telegram se omitirán.</>
                  )}
                </p>
                <ul className="cxc-envio-lista">
                  {filasEnvio.map((f) => (
                    <li key={f.idCliente} className={`cxc-envio-fila cxc-envio-${f.estado}`}>
                      <span className="cxc-envio-nombre">{f.cliente}</span>
                      <span className="cxc-envio-tel">
                        {f.chatId ? (f.telefono ? `+${f.telefono}` : 'Vinculado') : 'Sin vincular'}
                      </span>
                    </li>
                  ))}
                </ul>
                <div className="cxc-modal-acciones">
                  <button type="button" className="cxc-btn" onClick={() => setEnvioAbierto(false)}>
                    Cancelar
                  </button>
                  <button
                    type="button"
                    className="cxc-btn cxc-btn-primario"
                    onClick={ejecutarEnvioMasivo}
                    disabled={filasEnvio.every((f) => !f.chatId)}
                  >
                    Enviar {filasEnvio.filter((f) => f.chatId).length} mensaje(s)
                  </button>
                </div>
              </>
            )}

            {faseEnvio === 'enviando' && (
              <>
                <p className="cxc-modal-ayuda">Enviando… no cierres esta ventana.</p>
                <ul className="cxc-envio-lista">
                  {filasEnvio.map((f) => (
                    <li key={f.idCliente} className={`cxc-envio-fila cxc-envio-${f.estado}`}>
                      <span className="cxc-envio-nombre">{f.cliente}</span>
                      <span className="cxc-envio-tel">
                        {f.estado === 'ok' && '✅'}
                        {f.estado === 'error' && '❌'}
                        {f.estado === 'enviando' && '⏳'}
                        {f.estado === 'sin-telefono' && '—'}
                        {f.estado === 'pendiente' && ''}
                      </span>
                    </li>
                  ))}
                </ul>
                <div className="cxc-modal-acciones">
                  <button type="button" className="cxc-btn" onClick={cancelarEnvioMasivo}>
                    Detener
                  </button>
                </div>
              </>
            )}

            {faseEnvio === 'resumen' && (
              <>
                <p className="cxc-modal-ayuda">
                  ✅ {filasEnvio.filter((f) => f.estado === 'ok').length} enviados ·{' '}
                  ❌ {filasEnvio.filter((f) => f.estado === 'error').length} con error ·{' '}
                  ⚠️ {filasEnvio.filter((f) => f.estado === 'sin-telefono').length} sin vincular
                </p>
                <ul className="cxc-envio-lista">
                  {filasEnvio.map((f) => (
                    <li key={f.idCliente} className={`cxc-envio-fila cxc-envio-${f.estado}`}>
                      <span className="cxc-envio-nombre">{f.cliente}</span>
                      <span className="cxc-envio-tel">
                        {f.estado === 'ok' && '✅'}
                        {f.estado === 'error' && `❌ ${f.error ?? ''}`}
                        {f.estado === 'sin-telefono' && 'Sin vincular'}
                        {f.estado === 'pendiente' && 'No enviado'}
                      </span>
                    </li>
                  ))}
                </ul>
                <div className="cxc-modal-acciones">
                  <button
                    type="button"
                    className="cxc-btn cxc-btn-primario"
                    onClick={() => setEnvioAbierto(false)}
                  >
                    Cerrar
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
