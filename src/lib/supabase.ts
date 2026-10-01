import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Error: VITE_SUPABASE_URL y VITE_SUPABASE_PUBLISHABLE_KEY deben estar en .env');
  throw new Error('Faltan credenciales de Supabase. Verifica tu archivo .env');
}

export const supabase = createClient(supabaseUrl, supabaseKey);

// Test de conexión (solo en desarrollo)
if (import.meta.env.DEV) {
  supabase.from('productos').select('count', { count: 'exact', head: true })
    .then(({ count, error }) => {
      if (error) {
        console.error('❌ Error de conexión con Supabase:', error.message);
      } else {
        console.log(`✅ Conectado a Supabase — ${count ?? 0} productos en la base de datos`);
      }
    });
}
