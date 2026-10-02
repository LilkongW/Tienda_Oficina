import { useCallback, useEffect, useState } from 'react';
import { getActiveProfile, getProfiles, hasSupabaseConfig, saveProfiles, setActiveProfileId, type DatabaseProfile, type ProfileMode } from '../lib/databaseProfiles';
import { localDatabase } from '../lib/localDatabase';
import { refreshLocalCopy, synchronizePending } from '../lib/dataAccess';

export default function DatabaseTest() {
  const [profiles, setProfiles] = useState(getProfiles());
  const [profile, setProfile] = useState(getActiveProfile());
  const [pending, setPending] = useState(0);
  const [working, setWorking] = useState(false);
  const [message, setMessage] = useState('');
  const [online, setOnline] = useState(navigator.onLine);

  const loadPending = useCallback(async () => setPending((await localDatabase(getActiveProfile().id).pending()).length), []);
  useEffect(() => {
    void loadPending();
    const update = () => setOnline(navigator.onLine);
    window.addEventListener('online', update); window.addEventListener('offline', update);
    return () => { window.removeEventListener('online', update); window.removeEventListener('offline', update); };
  }, [loadPending]);

  const updateProfile = (changes: Partial<DatabaseProfile>) => setProfile((current) => ({ ...current, ...changes }));
  const persist = () => {
    if (!profile.name.trim()) { setMessage('Escribe un nombre para la tienda.'); return; }
    if (profile.mode === 'supabase' && (!profile.url.trim() || !profile.key.trim())) { setMessage('Completa la URL y la clave pública de Supabase.'); return; }
    const next = profiles.map((item) => item.id === profile.id ? profile : item);
    saveProfiles(next); setProfiles(next); setActiveProfileId(profile.id); setMessage('Configuración guardada.');
    window.location.reload();
  };
  const selectProfile = (id: string) => { setActiveProfileId(id); window.location.reload(); };
  const createProfile = () => {
    const created: DatabaseProfile = { id: crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`, name: `Nueva tienda ${profiles.length + 1}`, mode: 'offline', url: '', key: '', createdAt: new Date().toISOString() };
    const next = [...profiles, created]; saveProfiles(next); setActiveProfileId(created.id); window.location.reload();
  };
  const removeProfile = () => {
    if (profiles.length <= 1) { setMessage('Debe conservarse al menos un perfil.'); return; }
    if (!window.confirm(`¿Eliminar el perfil “${profile.name}” y todos sus datos locales de este equipo?`)) return;
    const next = profiles.filter((item) => item.id !== profile.id);
    indexedDB.deleteDatabase(`ventas-local-${profile.id}`);
    saveProfiles(next); setActiveProfileId(next[0].id); window.location.reload();
  };
  const synchronize = async () => {
    setWorking(true); setMessage('Sincronizando…');
    try {
      const count = await synchronizePending();
      await refreshLocalCopy();
      setMessage(`Sincronización completada. Cambios enviados: ${count}.`);
    } catch (error) { setMessage(`No se pudo completar la sincronización: ${error instanceof Error ? error.message : 'error desconocido'}`); }
    finally { await loadPending(); setWorking(false); }
  };
  const runDiagnostics = async () => {
    setWorking(true); setMessage('Revisando almacenamiento local…');
    try {
      const local = localDatabase(profile.id);
      const [productos, clientes, ventas, detalles] = await Promise.all([local.all('productos'), local.all('clientes'), local.all('ventas'), local.all('detalle_venta')]);
      let status = `Base local disponible: ${productos.length} productos, ${clientes.length} clientes, ${ventas.length} ventas y ${detalles.length} detalles.`;
      if (hasSupabaseConfig(profile) && navigator.onLine) {
        await refreshLocalCopy(); status += ' Supabase respondió y la copia local fue actualizada.';
      } else if (profile.mode === 'supabase') status += ' Supabase configurado; se usará la copia local mientras no haya conexión.';
      else status += ' Perfil configurado para trabajar solo sin conexión.';
      setMessage(status);
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Error de diagnóstico'); }
    finally { await loadPending(); setWorking(false); }
  };

  return <div>
    <div className="page-header"><div><h1 className="page-title">🔧 Diagnóstico de Base de Datos</h1><p className="page-description">Perfiles locales y conexión opcional con Supabase</p></div>
      <button className="btn btn-primary" onClick={() => void runDiagnostics()} disabled={working}>{working ? '⏳ Revisando…' : '🚀 Ejecutar diagnóstico'}</button>
    </div>
    <div className="card">
      <h2 className="form-title mb-4">Bases de datos guardadas</h2>
      <div className="form-grid">
        <div className="form-group"><label htmlFor="database-profile">Perfil activo</label><select id="database-profile" value={profile.id} onChange={(event) => selectProfile(event.target.value)}>
          {profiles.map((item) => <option key={item.id} value={item.id}>{item.name} · {item.mode === 'offline' ? 'Solo local' : 'Supabase'}</option>)}
        </select></div>
        <div className="form-group" style={{ justifyContent: 'end', flexDirection: 'row', gap: 8, alignItems: 'end' }}>
          <button className="btn btn-secondary" onClick={createProfile}>＋ Nueva base local</button>
          <button className="btn btn-secondary" onClick={removeProfile} disabled={profiles.length <= 1}>Eliminar perfil</button>
        </div>
      </div>
      <div className="form-grid mt-4">
        <div className="form-group"><label htmlFor="profile-name">Nombre de tienda</label><input id="profile-name" value={profile.name} onChange={(event) => updateProfile({ name: event.target.value })} /></div>
        <div className="form-group"><label htmlFor="profile-mode">Modo de base de datos</label><select id="profile-mode" value={profile.mode} onChange={(event) => updateProfile({ mode: event.target.value as ProfileMode })}>
          <option value="offline">Solo base local</option><option value="supabase">Local con sincronización Supabase</option>
        </select></div>
      </div>
      {profile.mode === 'supabase' && <div className="form-grid mt-4">
        <div className="form-group"><label htmlFor="supabase-url">URL de Supabase</label><input id="supabase-url" type="url" placeholder="https://tu-proyecto.supabase.co" value={profile.url} onChange={(event) => updateProfile({ url: event.target.value })} /></div>
        <div className="form-group"><label htmlFor="supabase-key">Publishable / anon key</label><input id="supabase-key" type="password" autoComplete="off" value={profile.key} onChange={(event) => updateProfile({ key: event.target.value })} /></div>
      </div>}
      <div className="flex gap-4 mt-4">
        <button className="btn btn-primary" onClick={persist}>Guardar perfil</button>
        {profile.mode === 'supabase' && <button className="btn btn-secondary" onClick={() => void synchronize()} disabled={working || !online || !hasSupabaseConfig(profile)}>{working ? 'Sincronizando…' : '🔄 Sincronizar ahora'}</button>}
      </div>
    </div>
    <div className="card">
      <h2 className="form-title mb-4">Estado</h2>
      <p><strong>Conexión a internet:</strong> {online ? 'Disponible' : 'Sin conexión'}</p>
      <p><strong>Modo actual:</strong> {profile.mode === 'offline' ? 'Solo local' : hasSupabaseConfig(profile) ? 'Base local + Supabase' : 'Faltan credenciales de Supabase'}</p>
      <p><strong>Cambios pendientes de sincronizar:</strong> {pending}</p>
      {message && <div className="alert alert-success mt-4"><div className="alert-body">{message}</div></div>}
    </div>
  </div>;
}
