import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { fetchWithTimeout } from "../_shared/fetch-with-timeout.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const EVENTS = [
  'MESSAGES_UPSERT',
  'MESSAGES_UPDATE',
  'MESSAGES_DELETE',
  'SEND_MESSAGE',
  'CONNECTION_UPDATE',
  'CONTACTS_UPSERT',
  'CONTACTS_UPDATE',
  'CHATS_UPSERT',
  'CHATS_UPDATE',
];

function buildHeaders(providerType: string, apiKey: string) {
  const h: Record<string, string> = { 'Content-Type': 'application/json' };
  if (providerType === 'cloud') h['Authorization'] = `Bearer ${apiKey}`;
  else h['apikey'] = apiKey;
  return h;
}

async function configureOne(
  supabaseAdmin: any,
  instanceRow: any,
  webhookUrl: string,
): Promise<{ instanceId: string; ok: boolean; message: string }> {
  const instanceId = instanceRow.id;
  const { data: secrets } = await supabaseAdmin
    .from('whatsapp_instance_secrets')
    .select('api_key, api_url')
    .eq('instance_id', instanceId)
    .maybeSingle();
  if (!secrets?.api_key || !secrets?.api_url) {
    return { instanceId, ok: false, message: 'Sem credenciais salvas para a instância' };
  }

  const providerType = instanceRow.provider_type || 'self_hosted';
  const identifier = providerType === 'cloud' && instanceRow.instance_id_external
    ? instanceRow.instance_id_external
    : instanceRow.instance_name;
  const baseUrl = String(secrets.api_url).replace(/\/+$/, '').replace(/\/manager$/, '');
  const url = `${baseUrl}/webhook/set/${identifier}`;

  const body = {
    webhook: {
      url: webhookUrl,
      enabled: true,
      webhookByEvents: false,
      webhook_by_events: false,
      events: EVENTS,
    },
    url: webhookUrl,
    enabled: true,
    webhookByEvents: false,
    webhook_by_events: false,
    events: EVENTS,
  };

  try {
    const resp = await fetchWithTimeout(url, {
      timeout: 20000,
      method: 'POST',
      headers: buildHeaders(providerType, secrets.api_key),
      body: JSON.stringify(body),
    });
    const text = await resp.text().catch(() => '');
    if (!resp.ok) {
      return { instanceId, ok: false, message: `Evolution ${resp.status}: ${text.slice(0, 300)}` };
    }
    return { instanceId, ok: true, message: 'Webhook sincronizado' };
  } catch (e: any) {
    return { instanceId, ok: false, message: e?.message || 'Falha de rede ao configurar webhook' };
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    let payload: any = {};
    try { payload = await req.json(); } catch { payload = {}; }
    const instanceId: string | undefined = payload.instanceId;
    const runAll: boolean = payload.all === true;

    const webhookUrl = `${supabaseUrl}/functions/v1/evolution-webhook`;

    // Escopo: uma instância ou todas as que o usuário pode ver.
    let instances: any[] = [];
    if (instanceId) {
      const { data: canSee } = await supabaseAdmin.rpc('can_user_see_instance', {
        _user_id: user.id, _instance_id: instanceId,
      });
      if (!canSee) {
        return new Response(JSON.stringify({ error: 'Forbidden' }), {
          status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      const { data: inst, error } = await supabaseAdmin
        .from('whatsapp_instances')
        .select('id, instance_name, provider_type, instance_id_external')
        .eq('id', instanceId)
        .maybeSingle();
      if (error || !inst) {
        return new Response(JSON.stringify({ error: 'Instance not found' }), {
          status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      instances = [inst];
    } else if (runAll) {
      const { data: isSuper } = await supabaseAdmin.rpc('is_super_admin', { _user_id: user.id });
      if (!isSuper) {
        return new Response(JSON.stringify({ error: 'Only super_admin can run for all' }), {
          status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      const { data: list, error } = await supabaseAdmin
        .from('whatsapp_instances')
        .select('id, instance_name, provider_type, instance_id_external');
      if (error) throw error;
      instances = list || [];
    } else {
      return new Response(JSON.stringify({ error: 'instanceId or all=true required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const results = await Promise.all(
      instances.map((inst) => configureOne(supabaseAdmin, inst, webhookUrl)),
    );
    const okCount = results.filter((r) => r.ok).length;
    return new Response(
      JSON.stringify({ success: true, okCount, total: results.length, results }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (e: any) {
    console.error('[sync-instance-webhook] error:', e);
    return new Response(JSON.stringify({ error: e?.message || 'unknown' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});