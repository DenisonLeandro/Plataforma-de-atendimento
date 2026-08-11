// Desconecta (logout) a sessão de WhatsApp de uma instância.
//
// Ação destrutiva por natureza: derruba o pareamento com o celular e exige
// leitura de um QR Code novo para voltar a atender. A UI cobre isso com dupla
// confirmação; aqui garantimos papel, empresa e auditoria.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { fetchWithTimeout } from "../_shared/fetch-with-timeout.ts";
import {
  acquireConnectionLock,
  authorizeInstanceAction,
  logInstanceActivity,
  releaseConnectionLock,
} from "../_shared/instance-auth.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const { instanceId } = await req.json();

    const auth = await authorizeInstanceAction(supabaseAdmin, req, instanceId);
    if (!auth.ok) return json({ error: auth.error }, auth.status);
    const { ctx } = auth;

    const gotLock = await acquireConnectionLock(supabaseAdmin, ctx, 'disconnect');
    if (!gotLock) {
      return json(
        { error: 'Já existe uma operação de conexão em andamento nesta instância. Aguarde alguns segundos.' },
        409,
      );
    }

    try {
      const response = await fetchWithTimeout(
        `${ctx.baseUrl}/instance/logout/${ctx.identifier}`,
        { timeout: 20000, method: 'DELETE', headers: { apikey: ctx.apiKey } },
      );

      // 404 = a Evolution já não tem sessão ativa. Para o usuário o resultado
      // é idêntico ao sucesso, então tratamos como desconectado e seguimos.
      if (!response.ok && response.status !== 404) {
        const details = await response.text().catch(() => '');
        console.error('[disconnect-instance] Evolution erro:', response.status, details);
        await releaseConnectionLock(supabaseAdmin, ctx);
        return json({ error: 'A Evolution recusou a desconexão. Tente novamente em alguns segundos.' }, 502);
      }

      await releaseConnectionLock(
        supabaseAdmin,
        ctx,
        { status: 'disconnected', qr_code: null },
        {
          qr_base64: null,
          qr_updated_at: null,
          delivery_degraded: false,
          disconnected_at: new Date().toISOString(),
          disconnected_by: ctx.userId,
          // Marca que a queda foi intencional: o monitor não deve tratar isso
          // como incidente nem alarmar a equipe.
          disconnect_reason: 'manual',
        },
      );

      await logInstanceActivity(supabaseAdmin, ctx, 'instance.disconnect', {
        already_logged_out: response.status === 404,
      });

      console.log('[disconnect-instance] Sessão encerrada para', ctx.instance.instance_name);
      return json({ success: true, status: 'disconnected' });
    } catch (inner) {
      await releaseConnectionLock(supabaseAdmin, ctx);
      throw inner;
    }
  } catch (error) {
    console.error('[disconnect-instance] Erro:', error);
    return json({ error: 'Não foi possível desconectar agora. Tente novamente.' }, 500);
  }
});
