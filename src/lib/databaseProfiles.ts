import { createClient, type SupabaseClient } from '@supabase/supabase-js';

export type ProfileMode = 'offline' | 'supabase';
export interface DatabaseProfile {
  id: string;
  name: string;
  mode: ProfileMode;
  url: string;
  key: string;
  createdAt: string;
}

const PROFILES_KEY = 'ventas.database-profiles.v1';
const ACTIVE_KEY = 'ventas.active-database-profile.v1';
const envUrl = import.meta.env.VITE_SUPABASE_URL ?? '';
const envKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? '';
const initialProfiles: DatabaseProfile[] = [{
  id: 'local-principal', name: envUrl && envKey ? 'Tienda principal' : 'Mi tienda',
  mode: envUrl && envKey ? 'supabase' : 'offline', url: envUrl, key: envKey,
  createdAt: new Date().toISOString(),
}];

const readProfiles = (): DatabaseProfile[] => {
  try {
    const value = JSON.parse(localStorage.getItem(PROFILES_KEY) ?? 'null');
    return Array.isArray(value) && value.length ? value : initialProfiles;
  } catch { return initialProfiles; }
};

export const getProfiles = () => readProfiles();
export const getActiveProfile = (): DatabaseProfile => {
  const profiles = readProfiles();
  const activeId = localStorage.getItem(ACTIVE_KEY);
  return profiles.find((profile) => profile.id === activeId) ?? profiles[0];
};
export const saveProfiles = (profiles: DatabaseProfile[]) => localStorage.setItem(PROFILES_KEY, JSON.stringify(profiles));
export const setActiveProfileId = (id: string) => localStorage.setItem(ACTIVE_KEY, id);

let cachedClientKey = '';
let cachedClient: SupabaseClient | null = null;
export const getSupabaseClient = (): SupabaseClient => {
  const profile = getActiveProfile();
  if (profile.mode !== 'supabase' || !profile.url || !profile.key) {
    throw new Error('El perfil activo usa solo la base de datos local.');
  }
  const clientKey = `${profile.id}:${profile.url}:${profile.key}`;
  if (!cachedClient || cachedClientKey !== clientKey) {
    cachedClient = createClient(profile.url, profile.key);
    cachedClientKey = clientKey;
  }
  return cachedClient;
};
export const hasSupabaseConfig = (profile = getActiveProfile()) => profile.mode === 'supabase' && !!profile.url && !!profile.key;

