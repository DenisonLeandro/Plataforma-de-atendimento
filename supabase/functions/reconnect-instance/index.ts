import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { fetchWithTimeout } from "../_shared/fetch-with-timeout.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const DELIVERY_FAILURE_THRESHOLD = 3;
const DELIVERY_FAILURE_LOOKBACK_MS = 24 * 60 * 60 * 1000;

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
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: isAdmin } = await supabaseAdmin.rpc('has_role', { _user_id: user.id, _role: 'admin' });
    const { data: isSupervisor } = await supabaseAdmin.rpc('has_role', { _user_id: user.id, _role: 'supervisor' });
    if (!isAdmin && !isSupervisor) {
      return new Response(JSON.stringify({ error: 'Forbidden' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { instanceId, clean = false } = await req.json();
    if (!instanceId) {
      return new Response(JSON.stringify({ error: 'instanceId required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: instance, error: instanceError } = await supabaseAdmin
      .from('whatsapp_instances')
      .select('instance_name, provider_type, instance_id_external, metadata')
      .eq('id', instanceId)
      .single();
    if (instanceError || !instance) {
      return new Response(JSON.stringify({ error: 'Instance not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: secrets, error: secretsError } = await supabaseAdmin
      .from('whatsapp_instance_secrets')
      .select('api_key, api_url')
      .eq('instance_id', instanceId)
      .single();
    if (secretsError || !secrets) {
      return new Response(JSON.stringify({ error: 'Instance secrets not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const providerType = (instance as any).provider_type || 'self_hosted';
    const instanceIdExternal = (instance as any).instance_id_external;
    const identifier = providerType === 'cloud' && instanceIdExternal
      ? instanceIdExternal
      : instance.instance_name;

    const baseUrl = (secrets.api_url.endsWith('/') ? secrets.api_url.slice(0, -1) : secrets.api_url).replace(/\/manager$/, '');
    const metadata = ((instance as any).metadata || {}) as Record<string, any>;
    const recentDeliveryFailures = await countRecentOutboundFailures(supabaseAdmin, instanceId);
    const needsCleanReconnect =
      clean === true ||
      metadata.delivery_degraded === true ||
      recentDeliveryFailures >= DELIVERY_FAILURE_THRESHOLD;

    // 1) Checa estado atual antes de forçar nada. Bater em /instance/connect
    //    numa instância já `open` causava status "connecting" falso no banco.
    const stateUrl = `${baseUrl}/instance/connectionState/${identifier}`;
    const stateResp = await fetchWithTimeout(stateUrl, { timeout: 20000, headers: { apikey: secrets.api_key } });
    let stateData: any = {};
    if (stateResp.ok) {
      const t = await stateResp.text();
      if (t) { try { stateData = JSON.parse(t); } catch {} }
    }
    const currentState = stateData?.state ?? stateData?.instance?.state;

    if ((currentState === 'open' || currentState === 'connected') && !needsCleanReconnect) {
      // Já está conectada — só sincronizamos o banco e saímos.
      await supabaseAdmin
        .from('whatsapp_instances')
        .update({ status: 'connected', updated_at: new Date().toISOString() })
        .eq('id', instanceId);
      return new Response(
        JSON.stringify({ success: true, alreadyConnected: true }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (needsCleanReconnect) {
      const logoutUrl = `${baseUrl}/instance/logout/${identifier}`;
      const logoutResp = await fetchWithTimeout(logoutUrl, {
        timeout: 20000,
        method: 'DELETE',
        headers: { apikey: secrets.api_key },
      });
      const logoutText = await logoutResp.text().catch(() => '');

      if (!logoutResp.ok && logoutResp.status !== 404) {
        console.error('[reconnect-instance] Falha no logout limpo:', logoutResp.status, logoutText);
        return new Response(JSON.stringify({ error: 'Falha ao derrubar sessão atual', details: logoutText }), {
          status: logoutResp.status,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      await supabaseAdmin
        .from('whatsapp_instances')
        .update({
          status: 'connecting',
          qr_code: null,
          metadata: {
            ...metadata,
            delivery_degraded: false,
            delivery_failure_count: recentDeliveryFailures,
            clean_reconnect_started_at: new Date().toISOString(),
            clean_reconnect_reason: metadata.delivery_degraded_reason || 'Reconexão limpa solicitada',
          },
          updated_at: new Date().toISOString(),
        })
        .eq('id', instanceId);

      await new Promise((resolve) => setTimeout(resolve, 1500));
    }

    if (currentState === 'connecting' && !needsCleanReconnect) {
      // Baileys já está tentando reconectar sozinho. Não força de novo.
      await supabaseAdmin
        .from('whatsapp_instances')
        .update({ status: 'connecting', updated_at: new Date().toISOString() })
        .eq('id', instanceId);
      return new Response(
        JSON.stringify({ success: true, stillConnecting: true }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 2) Só agora força o reconnect (estado close/closed/desconhecido).
    const url = `${baseUrl}/instance/connect/${identifier}`;

    const response = await fetchWithTimeout(url, {
      timeout: 20000,
      method: 'GET',
      headers: { apikey: secrets.api_key },
    });

    const text = await response.text();
    let data: any = {};
    if (text) {
      try { data = JSON.parse(text); } catch {}
    }

    if (!response.ok) {
      console.error('[reconnect-instance] Evolution erro:', response.status, text);
      return new Response(JSON.stringify({ error: 'Falha ao reconectar', details: text }), {
        status: response.status,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Só considera "QR" se realmente vier uma string base64 não-vazia.
    const qr = (typeof data?.code === 'string' && data.code.length > 20)
      ? data.code
      : (typeof data?.base64 === 'string' && data.base64.length > 20)
        ? data.base64
        : null;

    await supabaseAdmin
      .from('whatsapp_instances')
      .update({
        status: 'connecting',
        qr_code: qr,
        metadata: {
          ...metadata,
          delivery_degraded: false,
          delivery_failure_count: recentDeliveryFailures,
          clean_reconnect_required: false,
          reconnect_started_at: new Date().toISOString(),
        },
        updated_at: new Date().toISOString(),
      })
      .eq('id', instanceId);

    console.log('[reconnect-instance] Reconexão disparada (qr=' + !!qr + ')');
    return new Response(
      JSON.stringify({ success: true, qr, cleanReconnect: needsCleanReconnect }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('[reconnect-instance] Erro:', error);
    const msg = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});