import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { fetchWithTimeout } from "../_shared/fetch-with-timeout.ts";
import {
  acquireConnectionLock,
  authorizeInstanceAction,
  extractQrCode,
  logInstanceActivity,
  releaseConnectionLock,
} from "../_shared/instance-auth.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const DELIVERY_FAILURE_THRESHOLD = 3;
const DELIVERY_FAILURE_LOOKBACK_MS = 24 * 60 * 60 * 1000;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

async function countRecentOutboundFailures(supabaseAdmin: any, instanceId: string): Promise<number> {
  const since = new Date(Date.now() - DELIVERY_FAILURE_LOOKBACK_MS).toISOString();
  const { count } = await supabaseAdmin
    .from('whatsapp_messages')
    .select('id, whatsapp_conversations!inner(instance_id)', { count: 'exact', head: true })
    .eq('is_from_me', true)
    .eq('status', 'failed')
    .gte('created_at', since)
    .eq('whatsapp_conversations.instance_id', instanceId);

  return count ?? 0;
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

    const { instanceId, clean = false } = await req.json();

    // authZ completa: JWT + papel + empresa dona da instância.
    const auth = await authorizeInstanceAction(supabaseAdmin, req, instanceId);
    if (!auth.ok) return json({ error: auth.error }, auth.status);
    const { ctx } = auth;

    const metadata = ctx.instance.metadata;
    const recentDeliveryFailures = await countRecentOutboundFailures(supabaseAdmin, ctx.instance.id);
    const needsCleanReconnect =
      clean === true ||
      metadata.delivery_degraded === true ||
      recentDeliveryFailures >= DELIVERY_FAILURE_THRESHOLD;

    // 1) Confere o estado real antes de forçar qualquer coisa. Bater em
    //    /instance/connect numa instância já `open` gerava status "connecting"
    //    falso no banco.
    const stateResp = await fetchWithTimeout(
      `${ctx.baseUrl}/instance/connectionState/${ctx.identifier}`,
      { timeout: 20000, headers: { apikey: ctx.apiKey } },
    );
    let stateData: any = {};
    if (stateResp.ok) {
      const t = await stateResp.text();
      if (t) { try { stateData = JSON.parse(t); } catch { /* corpo não-JSON */ } }
    }
    const currentState = stateData?.state ?? stateData?.instance?.state;

    // Já conectada e saudável: nada a fazer além de sincronizar o banco.
    if ((currentState === 'open' || currentState === 'connected') && !needsCleanReconnect) {
      await supabaseAdmin
        .from('whatsapp_instances')
        .update({ status: 'connected', qr_code: null, updated_at: new Date().toISOString() })
        .eq('id', ctx.instance.id);
      return json({ success: true, alreadyConnected: true, status: 'connected' });
    }

    // Baileys já está reconectando sozinho: não atropelamos.
    if (currentState === 'connecting' && !needsCleanReconnect) {
      await supabaseAdmin
        .from('whatsapp_instances')
        .update({ status: 'connecting', updated_at: new Date().toISOString() })
        .eq('id', ctx.instance.id);
      return json({ success: true, stillConnecting: true, status: 'connecting' });
    }

    // A partir daqui vamos escrever na Evolution — serializa.
    const gotLock = await acquireConnectionLock(supabaseAdmin, ctx, 'reconnect');
    if (!gotLock) {
      return json(
        { error: 'Já existe uma operação de conexão em andamento nesta instância. Aguarde alguns segundos.' },
        409,
      );
    }

    try {
      if (needsCleanReconnect) {
        // Sessão suja: derruba antes de reconectar, senão a Evolution aceita o
        // socket mas continua rejeitando envios.
        const logoutResp = await fetchWithTimeout(
          `${ctx.baseUrl}/instance/logout/${ctx.identifier}`,
          { timeout: 20000, method: 'DELETE', headers: { apikey: ctx.apiKey } },
        );

        if (!logoutResp.ok && logoutResp.status !== 404) {
          const details = await logoutResp.text().catch(() => '');
          console.error('[reconnect-instance] Falha no logout limpo:', logoutResp.status, details);
          await releaseConnectionLock(supabaseAdmin, ctx);
          return json({ error: 'Falha ao derrubar a sessão atual' }, 502);
        }

        await new Promise((resolve) => setTimeout(resolve, 1500));
      }

      // 2) Força o reconnect (estado close/closed/desconhecido ou pós-logout).
      const response = await fetchWithTimeout(
        `${ctx.baseUrl}/instance/connect/${ctx.identifier}`,
        { timeout: 20000, method: 'GET', headers: { apikey: ctx.apiKey } },
      );

      const text = await response.text();
      let data: any = {};
      if (text) { try { data = JSON.parse(text); } catch { /* corpo não-JSON */ } }

      if (!response.ok) {
        console.error('[reconnect-instance] Evolution erro:', response.status, text);
        await releaseConnectionLock(supabaseAdmin, ctx);
        return json({ error: 'A Evolution recusou a reconexão. Tente novamente em alguns segundos.' }, 502);
      }

      // QR da resposta do connect: serve de ponte até o primeiro
      // `qrcode.updated` chegar pelo webhook. Na prática é o mesmo código, e
      // qualquer divergência se corrige sozinha na rotação seguinte (~40s).
      const { code, base64 } = extractQrCode(data);
      const nowIso = new Date().toISOString();

      await releaseConnectionLock(
        supabaseAdmin,
        ctx,
        { status: 'connecting', qr_code: code },
        {
          qr_base64: base64,
          qr_updated_at: code || base64 ? nowIso : null,
          delivery_degraded: false,
          delivery_failure_count: recentDeliveryFailures,
          clean_reconnect_required: false,
          reconnect_started_at: nowIso,
        },
      );

      await logInstanceActivity(supabaseAdmin, ctx, 'instance.reconnect', {
        clean: needsCleanReconnect,
        had_qr: !!(code || base64),
        previous_state: currentState ?? null,
      });

      console.log('[reconnect-instance] Reconexão disparada (qr=' + !!(code || base64) + ')');
      return json({
        success: true,
        qr: code,
        qrBase64: base64,
        cleanReconnect: needsCleanReconnect,
        status: 'connecting',
      });
    } catch (inner) {
      // Nunca deixa o lock preso por exceção no meio do caminho.
      await releaseConnectionLock(supabaseAdmin, ctx);
      throw inner;
    }
  } catch (error) {
    console.error('[reconnect-instance] Erro:', error);
    return json({ error: 'Não foi possível reconectar agora. Tente novamente.' }, 500);
  }
});
