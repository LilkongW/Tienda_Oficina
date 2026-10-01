import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return json({ error: 'Método no permitido' }, 405);

  const token = Deno.env.get('TELEGRAM_BOT_TOKEN');
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!token || !supabaseUrl || !serviceKey) return json({ error: 'Falta configuración de la función' }, 500);

  try {
    const body = await request.json();
    const botApi = `https://api.telegram.org/bot${token}`;
    const supabase = createClient(supabaseUrl, serviceKey);

    if (body.action === 'sendMessage') {
      const chatId = Number(body.chatId);
      const mensaje = typeof body.mensaje === 'string' ? body.mensaje : '';
      if (!Number.isSafeInteger(chatId) || !mensaje || mensaje.length > 4096) {
        return json({ error: 'Chat o mensaje inválido' }, 400);
      }
      const { data: cliente, error: clienteError } = await supabase
        .from('clientes')
        .select('id_cliente')
        .eq('telegram_chat_id', chatId)
        .maybeSingle();
      if (clienteError) return json({ error: 'No se pudo validar el chat del cliente' }, 500);
      if (!cliente) return json({ error: 'Ese chat no está vinculado a un cliente' }, 403);
      const telegramResponse = await fetch(`${botApi}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: chatId, text: mensaje }),
      });
      const result = await telegramResponse.json();
      if (!telegramResponse.ok || !result.ok) {
        const description = result.description || `HTTP ${telegramResponse.status}`;
        const error = /blocked|chat not found|deactivated/i.test(description)
          ? 'El cliente no ha iniciado el bot o lo bloqueó'
          : description;
        return json({ ok: false, error });
      }
      return json({ ok: true });
    }

    if (body.action === 'syncLinks') {
      const telegramResponse = await fetch(`${botApi}/getUpdates?limit=100&allowed_updates=%5B%22message%22%5D`);
      const result = await telegramResponse.json();
      if (!telegramResponse.ok || !result.ok) return json({ error: result.description || 'No se pudieron leer los mensajes del bot' }, 502);

      const links = new Map<number, number>();
      for (const update of result.result ?? []) {
        const message = update.message;
        if (message?.chat?.type !== 'private' || typeof message.text !== 'string') continue;
        const match = message.text.match(/^\/start\s+(\d+)$/);
        if (match) links.set(Number(match[1]), Number(message.chat.id));
      }

      const saved: { idCliente: number; chatId: number }[] = [];
      for (const [idCliente, chatId] of links) {
        const { data, error } = await supabase
          .from('clientes')
          .update({ telegram_chat_id: chatId })
          .eq('id_cliente', idCliente)
          .select('id_cliente')
          .maybeSingle();
        if (error) return json({ error: `No se pudo guardar la vinculación del cliente ${idCliente}: ${error.message}` }, 500);
        if (data) saved.push({ idCliente, chatId });
      }
      return json(saved);
    }

    return json({ error: 'Acción no reconocida' }, 400);
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : 'Error interno' }, 500);
  }
});
