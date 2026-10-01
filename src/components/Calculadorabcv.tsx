import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { KeyboardEvent } from 'react'
import './CalculadoraBCV.css'

// API pública con la tasa oficial del BCV (DolarApi Venezuela)
const API_URL = 'https://ve.dolarapi.com/v1/dolares/oficial'
const CACHE_KEY = 'bcv_tasa_cache'
const REFRESCO_MS = 10 * 60 * 1000 // vuelve a consultar al abrir si pasaron 10 min

type Moneda = 'ves' | 'usd'
type Estado = 'idle' | 'cargando' | 'ok' | 'error'

interface Tasa {
  valor: number
  actualizada: string | null
  manual?: boolean
}

/** "1234,5" o "1234.5" -> 1234.5 */
const aNumero = (texto: string): number => {
  const n = parseFloat(texto.replace(',', '.'))
  return Number.isFinite(n) ? n : NaN
}

/** Deja solo dígitos y un separador decimal (coma o punto), máximo 2 decimales */
const limpiar = (texto: string): string => {
  const t = texto.replace(/[^\d.,]/g, '')
  const ultimo = Math.max(t.lastIndexOf('.'), t.lastIndexOf(','))
  if (ultimo === -1) return t
  const entero = t.slice(0, ultimo).replace(/[.,]/g, '')
  const decimales = t.slice(ultimo + 1).replace(/[.,]/g, '').slice(0, 2)
  return `${entero}${t[ultimo]}${decimales}`
}

/** Siempre 2 decimales, con coma decimal (formato venezolano) */
const formatear = (n: number): string => n.toFixed(2).replace('.', ',')

const leerCache = (): Tasa | null => {
  try {
    const raw = localStorage.getItem(CACHE_KEY)
    if (!raw) return null
    const t = JSON.parse(raw) as Tasa
    return t && t.valor > 0 ? t : null
  } catch {
    return null
  }
}

const guardarCache = (t: Tasa) => {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(t))
  } catch {
    /* almacenamiento no disponible: se ignora */
  }
}

interface CalculadoraBCVProps {
  forceOpen?: boolean;
}

export default function CalculadoraBCV({ forceOpen }: CalculadoraBCVProps = {}) {
  const [abierto, setAbierto] = useState(forceOpen || false)
  const [tasa, setTasa] = useState<Tasa | null>(() => leerCache())

  // Abrir automáticamente cuando forceOpen cambia a true
  useEffect(() => {
    if (forceOpen && !abierto) {
      setAbierto(true)
    }
  }, [forceOpen, abierto])
  const [estado, setEstado] = useState<Estado>('idle')
  const [editandoTasa, setEditandoTasa] = useState(false)
  const [tasaTexto, setTasaTexto] = useState('')

  // Se escribe en un campo (origen) y el otro se calcula solo
  const [origen, setOrigen] = useState<Moneda>('usd')
  const [texto, setTexto] = useState('')

  const fabRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const vesRef = useRef<HTMLInputElement>(null)
  const ultimaConsulta = useRef(0)
  const yaAbrio = useRef(false)

  const cargarTasa = useCallback(async () => {
    setEstado('cargando')
    try {
      const res = await fetch(API_URL)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      const valor = Number(data.promedio ?? data.venta ?? data.compra)
      if (!Number.isFinite(valor) || valor <= 0) throw new Error('Tasa inválida')

      const nueva: Tasa = { valor, actualizada: data.fechaActualizacion ?? null }
      setTasa(nueva)
      guardarCache(nueva)
      setEstado('ok')
      setEditandoTasa(false)
      ultimaConsulta.current = Date.now()
    } catch {
      setEstado('error')
      // Sin tasa guardada, deja escribirla a mano
      setTasa((actual) => {
        if (!actual) setEditandoTasa(true)
        return actual
      })
    }
  }, [])

  // Al abrir: consulta la tasa si hace falta y enfoca el primer campo
  useEffect(() => {
    if (!abierto) {
      if (yaAbrio.current) fabRef.current?.focus()
      return
    }
    yaAbrio.current = true
    if (Date.now() - ultimaConsulta.current > REFRESCO_MS) cargarTasa()
    vesRef.current?.focus()
  }, [abierto, cargarTasa])

  // Esc cierra el modal
  useEffect(() => {
    if (!abierto) return
    const alPresionar = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape') setAbierto(false)
    }
    document.addEventListener('keydown', alPresionar)
    return () => document.removeEventListener('keydown', alPresionar)
  }, [abierto])

  // Mantiene el foco del teclado dentro del modal
  const atraparFoco = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'Tab' || !panelRef.current) return
    const items = Array.from(
      panelRef.current.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled])')
    )
    if (items.length === 0) return
    const primero = items[0]
    const ultimo = items[items.length - 1]
    if (e.shiftKey && document.activeElement === primero) {
      e.preventDefault()
      ultimo.focus()
    } else if (!e.shiftKey && document.activeElement === ultimo) {
      e.preventDefault()
      primero.focus()
    }
  }

  const derivado = useMemo(() => {
    const n = aNumero(texto)
    if (!tasa || !Number.isFinite(n)) return ''
    return formatear(origen === 'usd' ? n * tasa.valor : n / tasa.valor)
  }, [texto, origen, tasa])

  const valorVes = origen === 'ves' ? texto : derivado
  const valorUsd = origen === 'usd' ? texto : derivado

  const alEscribir = (moneda: Moneda, valor: string) => {
    setOrigen(moneda)
    setTexto(limpiar(valor))
  }

  const aplicarTasaManual = () => {
    const n = aNumero(tasaTexto)
    if (!Number.isFinite(n) || n <= 0) return
    const manual: Tasa = { valor: Number(n.toFixed(4)), actualizada: null, manual: true }
    setTasa(manual)
    guardarCache(manual)
    setEditandoTasa(false)
    setEstado('idle')
  }

  const empezarEdicion = () => {
    setTasaTexto(tasa ? formatear(tasa.valor) : '')
    setEditandoTasa(true)
  }

  const fechaTasa = tasa?.actualizada
    ? new Date(tasa.actualizada).toLocaleString('es-VE', { dateStyle: 'short', timeStyle: 'short' })
    : null

  let mensaje = ''
  if (estado === 'cargando') mensaje = 'Consultando la tasa del BCV…'
  else if (estado === 'error' && tasa)
    mensaje = 'No se pudo consultar el BCV. Se usa la última tasa guardada.'
  else if (estado === 'error') mensaje = 'No se pudo consultar el BCV. Escribe la tasa manualmente.'
  else if (tasa?.manual) mensaje = 'Tasa escrita manualmente.'
  else if (fechaTasa) mensaje = `Actualizada el ${fechaTasa}`

  return (
    <>
      <button
        ref={fabRef}
        type="button"
        className="bcv-fab"
        aria-label="Abrir calculadora BCV"
        aria-haspopup="dialog"
        aria-expanded={abierto}
        title="Calculadora BCV"
        onClick={() => setAbierto(true)}
      >
        <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <rect x="5" y="2.5" width="14" height="19" rx="2.5" />
          <rect x="8" y="5.5" width="8" height="3.5" rx="0.8" />
          <path d="M8.5 13h.01M12 13h.01M15.5 13h.01M8.5 16.5h.01M12 16.5h.01M15.5 16.5h.01" strokeWidth="2.4" />
        </svg>
      </button>

      {abierto && (
        <div
          className="bcv-backdrop"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setAbierto(false)
          }}
        >
          <div
            ref={panelRef}
            className="bcv-panel"
            role="dialog"
            aria-modal="true"
            aria-labelledby="bcv-titulo"
            onKeyDown={atraparFoco}
          >
            <header className="bcv-header">
              <h2 id="bcv-titulo" className="bcv-titulo">Calculadora BCV</h2>
              <button type="button" className="bcv-icono" aria-label="Cerrar calculadora" onClick={() => setAbierto(false)}>
                <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                  <path d="M6 6l12 12M18 6L6 18" />
                </svg>
              </button>
            </header>

            <section className="bcv-tasa" aria-live="polite">
              {editandoTasa ? (
                <div className="bcv-tasa-edicion">
                  <label htmlFor="bcv-tasa-input" className="bcv-tasa-etiqueta">1 USD =</label>
                  <div className="bcv-campo bcv-campo-chico">
                    <span className="bcv-prefijo">Bs.</span>
                    <input
                      id="bcv-tasa-input"
                      className="bcv-input bcv-input-chico"
                      inputMode="decimal"
                      autoComplete="off"
                      value={tasaTexto}
                      onChange={(e) => setTasaTexto(e.target.value.replace(/[^\d.,]/g, ''))}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') aplicarTasaManual()
                      }}
                    />
                  </div>
                  <button type="button" className="bcv-boton" onClick={aplicarTasaManual}>Usar tasa</button>
                </div>
              ) : (
                <div className="bcv-tasa-fila">
                  <p className="bcv-tasa-valor">
                    1 USD = <strong>Bs. {tasa ? formatear(tasa.valor) : '—'}</strong>
                  </p>
                  <div className="bcv-tasa-acciones">
                    <button
                      type="button"
                      className="bcv-icono"
                      aria-label="Actualizar tasa desde el BCV"
                      title="Actualizar tasa"
                      onClick={cargarTasa}
                      disabled={estado === 'cargando'}
                    >
                      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={estado === 'cargando' ? 'bcv-girando' : undefined}>
                        <path d="M20 11a8 8 0 0 0-14.9-3M4 5v4h4" />
                        <path d="M4 13a8 8 0 0 0 14.9 3M20 19v-4h-4" />
                      </svg>
                    </button>
                    <button type="button" className="bcv-icono" aria-label="Editar tasa manualmente" title="Editar tasa" onClick={empezarEdicion}>
                      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d="M4 20h4L19 9l-4-4L4 16v4zM13.5 6.5l4 4" />
                      </svg>
                    </button>
                  </div>
                </div>
              )}
              {mensaje && (
                <p className={`bcv-mensaje${estado === 'error' ? ' bcv-mensaje-error' : ''}`}>{mensaje}</p>
              )}
            </section>

            <div className="bcv-campos">
              <div className="bcv-grupo">
                <label htmlFor="bcv-ves" className="bcv-etiqueta">Bolívares</label>
                <div className="bcv-campo">
                  <span className="bcv-prefijo">Bs.</span>
                  <input
                    ref={vesRef}
                    id="bcv-ves"
                    className="bcv-input"
                    inputMode="decimal"
                    autoComplete="off"
                    placeholder="0,00"
                    value={valorVes}
                    disabled={!tasa}
                    onFocus={(e) => e.currentTarget.select()}
                    onChange={(e) => alEscribir('ves', e.target.value)}
                  />
                </div>
              </div>

              <div className="bcv-grupo">
                <label htmlFor="bcv-usd" className="bcv-etiqueta">Dólares</label>
                <div className="bcv-campo">
                  <span className="bcv-prefijo">$</span>
                  <input
                    id="bcv-usd"
                    className="bcv-input"
                    inputMode="decimal"
                    autoComplete="off"
                    placeholder="0,00"
                    value={valorUsd}
                    disabled={!tasa}
                    onFocus={(e) => e.currentTarget.select()}
                    onChange={(e) => alEscribir('usd', e.target.value)}
                  />
                </div>
              </div>
            </div>

            <footer className="bcv-pie">
              <button
                type="button"
                className="bcv-boton bcv-boton-suave"
                onClick={() => {
                  setTexto('')
                  vesRef.current?.focus()
                }}
                disabled={!texto}
              >
                Limpiar
              </button>
            </footer>
          </div>
        </div>
      )}
    </>
  )
}