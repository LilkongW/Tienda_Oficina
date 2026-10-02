import { getSupabaseClient } from '../lib/databaseProfiles';

const BOT_USERNAME = import.meta.env.VITE_TELEGRAM_BOT_USERNAME as string | undefined;

export interface EnvioTelegram {
  chatId: string | number;
  mensaje: string;
}

export interface ResultadoEnvio {
  chatId: string | number;
  ok: boolean;
  error?: string;
}

export const esperar = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export const normalizarTelefono = (telefono?: string | null): string | null => {
  const limpio = (telefono ?? '').replace(/\D/g, '');
  return limpio.length >= 7 ? limpio : null;
};

export const enlaceVinculacion = (idCliente: number): string | null =>
  BOT_USERNAME ? `https://t.me/${BOT_USERNAME}?start=${idCliente}` : null;

const invocarBot = async <T>(body: Record<string, unknown>): Promise<T> => {
  const { data, error } = await getSupabaseClient().functions.invoke('telegram-bot', { body });
  if (error) throw new Error(error.message || 'No se pudo conectar con la función Telegram');
  if (data?.error) throw new Error(data.error);
  return data as T;
};

export const enviarTelegram = async (
  { chatId, mensaje }: EnvioTelegram,
): Promise<ResultadoEnvio> => {
  try {
    const result = await invocarBot<{ ok: boolean; error?: string }>({
      action: 'sendMessage',
      chatId,
      mensaje,
    });
    return { chatId, ok: result.ok, error: result.error };
  } catch (error) {
    return { chatId, ok: false, error: error instanceof Error ? error.message : 'Error desconocido' };
  }
};

export const obtenerVinculaciones = () =>
  invocarBot<{ idCliente: number; chatId: number }[]>({ action: 'syncLinks' });
