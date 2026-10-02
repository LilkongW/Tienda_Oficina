import { useCallback, useEffect, useState } from 'react';
import { getActiveProfile, getProfiles, hasSupabaseConfig, saveProfiles, setActiveProfileId, type DatabaseProfile, type ProfileMode } from '../lib/databaseProfiles';
import { localDatabase } from '../lib/localDatabase';
import { refreshLocalCopy, synchronizePending } from '../lib/dataAccess';

type MessageKind = 'success' | 'error' | 'info';
interface StatusMessage { kind: MessageKind; text: string; }

const messageStyles: Record<MessageKind, { bg: string; fg: string; border: string; icon: string }> = {
  success: { bg: '#dcfce7', fg: '#14532d', border: '#86efac', icon: '✅' },
  error:   { bg: '#fee2e2', fg: '#7f1d1d', border: '#fca5a5', icon: '⛔' },
  info:    { bg: '#dbeafe', fg: '#1e3a8a', border: '#93c5fd', icon: 'ℹ️' },
};

const Pill = ({ tone, children }: { tone: 'ok' | 'warn' | 'err' | 'neutral'; children: React.ReactNode }) => {
  const palette = {
    ok:      { bg: '#dcfce7', fg: '#166534', dot: '#16a34a' },
    warn:    { bg: '#fef3c7', fg: '#78350f', dot: '#d97706' },
    err:     { bg: '#fee2e2', fg: '#991b1b', dot: '#dc2626' },
    neutral: { bg: '#f3f4f6', fg: '#374151', dot: '#9ca3af' },
  }[tone];
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 6,
      padding: '4px 12px', borderRadius: 999, fontSize: 13, fontWeight: 600,
      background: palette.bg, color: palette.fg,
      border: `1px solid ${palette.bg}`,
    }}>
      <span style={{ width: 8, height: 8, borderRadius: '50%', background: palette.dot }} />
      {children}
    </span>
  );
};

export default function DatabaseTest() {
  const [profiles, setProfiles] = useState(getProfiles());
  const [profile, setProfile] = useState(getActiveProfile());
  const [pending, setPending] = useState(0);
  const [working, setWorking] = useState(false);
  const [message, setMessage] = useState<StatusMessage | null>(null);
  const [online, setOnline] = useState(navigator.onLine);
  const [dirty, setDirty] = useState(false);

  const loadPending = useCallback(
    async () => setPending((await localDatabase(getActiveProfile().id).pending()).length),
    [],
  );

  useEffect(() => {
    void loadPending();
    const update = () => setOnline(navigator.onLine);
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
    };
  }, [loadPending]);

  const updateProfile = (changes: Partial<DatabaseProfile>) => {
    setProfile((current) => ({ ...current, ...changes }));
    setDirty(true);
  };

  const persist = () => {
    if (!profile.name.trim()) {
      setMessage({ kind: 'error', text: 'Escribe un nombre para la tienda.' });
      return;
    }
    if (profile.mode === 'supabase' && (!profile.url.trim() || !profile.key.trim())) {
      setMessage({ kind: 'error', text: 'Completa la URL y la clave pública de Supabase.' });
      return;
    }
    const next = profiles.map((item) => (item.id === profile.id ? profile : item));
    saveProfiles(next);
    setProfiles(next);
    setActiveProfileId(profile.id);
    setMessage({ kind: 'success', text: 'Configuración guardada.' });
    setDirty(false);
    window.location.reload();
  };

  const selectProfile = (id: string) => {
    if (id === profile.id) return;
    if (dirty && !window.confirm('Tienes cambios sin guardar. ¿Cambiar de perfil de todas formas?')) return;
    setActiveProfileId(id);
    window.location.reload();
  };

  const createProfile = () => {
    const created: DatabaseProfile = {
      id: crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`,
      name: `Nueva tienda ${profiles.length + 1}`,
      mode: 'offline',
      url: '',
      key: '',
      createdAt: new Date().toISOString(),
    };
    const next = [...profiles, created];
    saveProfiles(next);
    setActiveProfileId(created.id);
    window.location.reload();
  };

  const removeProfile = () => {
    if (profiles.length <= 1) {
      setMessage({ kind: 'error', text: 'Debe conservarse al menos un perfil.' });
      return;
    }
    if (!window.confirm(`¿Eliminar el perfil “${profile.name}” y todos sus datos locales de este equipo?`)) return;
    const next = profiles.filter((item) => item.id !== profile.id);
    indexedDB.deleteDatabase(`ventas-local-${profile.id}`);
    saveProfiles(next);
    setActiveProfileId(next[0].id);
    window.location.reload();
  };

  const synchronize = async () => {
    setWorking(true);
    setMessage({ kind: 'info', text: 'Sincronizando…' });
    try {
      const count = await synchronizePending();
      await refreshLocalCopy();
      setMessage({
        kind: 'success',
        text:
          count > 0
            ? `Sincronización completada. ${count} cambio${count === 1 ? '' : 's'} enviado${count === 1 ? '' : 's'}.`
            : 'Todo está al día. No había cambios pendientes.',
      });
    } catch (error) {
      setMessage({
        kind: 'error',
        text: `No se pudo completar la sincronización: ${error instanceof Error ? error.message : 'error desconocido'}`,
      });
    } finally {
      await loadPending();
      setWorking(false);
    }
  };

  const runDiagnostics = async () => {
    setWorking(true);
    setMessage({ kind: 'info', text: 'Revisando almacenamiento local…' });
    try {
      const local = localDatabase(profile.id);
      const [productos, clientes, ventas, detalles] = await Promise.all([
        local.all('productos'),
        local.all('clientes'),
        local.all('ventas'),
        local.all('detalle_venta'),
      ]);
      let status = `Base local disponible: ${productos.length} productos, ${clientes.length} clientes, ${ventas.length} ventas y ${detalles.length} detalles.`;
      let kind: MessageKind = 'success';
      if (hasSupabaseConfig(profile) && navigator.onLine) {
        await refreshLocalCopy();
        status += ' Supabase respondió y la copia local fue actualizada.';
      } else if (profile.mode === 'supabase') {
        status += ' Supabase configurado; se usará la copia local mientras no haya conexión.';
        kind = 'info';
      } else {
        status += ' Perfil configurado para trabajar solo sin conexión.';
        kind = 'info';
      }
      setMessage({ kind, text: status });
    } catch (error) {
      setMessage({ kind: 'error', text: error instanceof Error ? error.message : 'Error de diagnóstico' });
    } finally {
      await loadPending();
      setWorking(false);
    }
  };

  const isSupabaseReady = profile.mode === 'supabase' && hasSupabaseConfig(profile);
  const canSync = isSupabaseReady && online && !working;
  const modeTone: 'ok' | 'warn' | 'err' | 'neutral' =
    profile.mode === 'offline' ? 'neutral' : isSupabaseReady ? 'ok' : 'warn';
  const modeLabel =
    profile.mode === 'offline'
      ? 'Solo local'
      : isSupabaseReady
      ? 'Local + Supabase'
      : 'Faltan credenciales';

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">🔧 Diagnóstico de Base de Datos</h1>
          <p className="page-description">Perfiles locales y conexión opcional con Supabase</p>
        </div>
        <button className="btn btn-primary" onClick={() => void runDiagnostics()} disabled={working}>
          {working ? '⏳ Revisando…' : '🚀 Ejecutar diagnóstico'}
        </button>
      </div>

      {/* ── Estado (arriba: es lo que uno quiere ver primero) ─────────── */}
      <div className="card" style={{ marginBottom: 16 }}>
        <h2 className="form-title mb-4">Estado</h2>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: message ? 14 : 0 }}>
          <Pill tone={online ? 'ok' : 'err'}>
            {online ? 'Conectado' : 'Sin conexión'}
          </Pill>
          <Pill tone={modeTone}>{modeLabel}</Pill>
          <Pill tone={pending > 0 ? 'warn' : 'neutral'}>
            {pending > 0
              ? `${pending} pendiente${pending === 1 ? '' : 's'}`
              : 'Sin pendientes'}
          </Pill>
        </div>

        {message && (
          <div
            style={{
              padding: '12px 14px',
              borderRadius: 8,
              background: messageStyles[message.kind].bg,
              color: messageStyles[message.kind].fg,
              border: `1px solid ${messageStyles[message.kind].border}`,
              fontSize: 14,
              display: 'flex',
              gap: 10,
              alignItems: 'flex-start',
            }}
          >
            <span aria-hidden>{messageStyles[message.kind].icon}</span>
            <span style={{ whiteSpace: 'pre-wrap', lineHeight: 1.4 }}>{message.text}</span>
          </div>
        )}
      </div>

      {/* ── Perfil ────────────────────────────────────────────────────── */}
      <div className="card" style={{ marginBottom: 16 }}>
        <h2 className="form-title mb-4">Perfil activo</h2>

        {/* Selector a lo ancho, con su propia fila */}
        <div className="form-group" style={{ marginBottom: 16 }}>
          <label htmlFor="database-profile">Perfil</label>
          <select
            id="database-profile"
            value={profile.id}
            onChange={(event) => selectProfile(event.target.value)}
            style={{ width: '100%' }}
          >
            {profiles.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name} · {item.mode === 'offline' ? 'Solo local' : 'Supabase'}
              </option>
            ))}
          </select>
        </div>

        {/* Barra de acciones: separada visualmente con un divisor sutil */}
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: 10,
            paddingTop: 16,
            borderTop: '1px solid var(--border-color, #e5e7eb)',
          }}
        >
          <button
            className="btn btn-secondary"
            onClick={createProfile}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              padding: '10px 18px',
              minWidth: 160,
              justifyContent: 'center',
            }}
          >
            <span aria-hidden style={{ fontSize: 16, lineHeight: 1 }}>＋</span>
            Nueva base local
          </button>

          <button
            className="btn btn-secondary"
            onClick={removeProfile}
            disabled={profiles.length <= 1}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              padding: '10px 18px',
              minWidth: 140,
              justifyContent: 'center',
              color: profiles.length <= 1 ? undefined : '#b91c1c',
            }}
            title={profiles.length <= 1 ? 'Debe conservarse al menos un perfil' : undefined}
          >
            <span aria-hidden style={{ fontSize: 16, lineHeight: 1 }}>🗑</span>
            Eliminar perfil
          </button>
        </div>
      </div>
      {/* ── Configuración ─────────────────────────────────────────────── */}
      <div className="card">
        <h2 className="form-title mb-4">Configuración</h2>

        <div className="form-grid">
          <div className="form-group">
            <label htmlFor="profile-name">Nombre de tienda</label>
            <input
              id="profile-name"
              value={profile.name}
              onChange={(event) => updateProfile({ name: event.target.value })}
            />
          </div>
          <div className="form-group">
            <label htmlFor="profile-mode">Modo de base de datos</label>
            <select
              id="profile-mode"
              value={profile.mode}
              onChange={(event) => updateProfile({ mode: event.target.value as ProfileMode })}
            >
              <option value="offline">Solo base local</option>
              <option value="supabase">Local con sincronización Supabase</option>
            </select>
          </div>
        </div>

        {profile.mode === 'supabase' && (
          <div className="form-grid mt-4">
            <div className="form-group">
              <label htmlFor="supabase-url">URL de Supabase</label>
              <input
                id="supabase-url"
                type="url"
                placeholder="https://tu-proyecto.supabase.co"
                value={profile.url}
                onChange={(event) => updateProfile({ url: event.target.value })}
              />
            </div>
            <div className="form-group">
              <label htmlFor="supabase-key">Publishable / anon key</label>
              <input
                id="supabase-key"
                type="password"
                autoComplete="off"
                placeholder="eyJhbGciOi…"
                value={profile.key}
                onChange={(event) => updateProfile({ key: event.target.value })}
              />
            </div>
          </div>
        )}

        <div
          className="flex gap-4 mt-4"
          style={{ alignItems: 'center', flexWrap: 'wrap' }}
        >
          <button className="btn btn-primary" onClick={persist} disabled={!dirty}>
            💾 Guardar perfil
          </button>

          {isSupabaseReady && (
            <button
              className="btn btn-secondary"
              onClick={() => void synchronize()}
              disabled={!canSync}
            >
              {working
                ? '⏳ Sincronizando…'
                : pending > 0
                ? `🔄 Sincronizar (${pending})`
                : '🔄 Sincronizar ahora'}
            </button>
          )}

          {dirty && (
            <span style={{ fontSize: 13, color: '#b45309', fontWeight: 500 }}>
              ● Cambios sin guardar
            </span>
          )}
        </div>
      </div>
    </div>
  );
}