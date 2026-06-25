import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { fetchWithTimeout } from "../_shared/fetch-with-timeout.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

async function fetchJson(url: string, headers: Record<string, string>) {
  try {
    const r = await fetchWithTimeout(url, { timeout: 20000, headers });
    const txt = await r.text();
    let body: any = null;
    if (txt) { try { body = JSON.parse(txt); } catch { body = txt; } }
    return { ok: r.ok, status: r.status, body };
  } catch (e) {
    return { ok: false, status: 0, body: { error: e instanceof Error ? e.message : 'fetch failed' } };
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: isAdmin } = await supabase.rpc('has_role', { _user_id: user.id, _role: 'admin' });
    const { data: isSupervisor } = await supabase.rpc('has_role', { _user_id: user.id, _role: 'supervisor' });
    if (!isAdmin && !isSupervisor) {
      return new Response(JSON.stringify({ error: 'Forbidden' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { instanceId } = await req.json();
    if (!instanceId) {
      return new Response(JSON.stringify({ error: 'instanceId required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: instance } = await supabase
      .from('whatsapp_instances')
      .select('id, instance_name, provider_type, instance_id_external, status, metadata, updated_at')
      .eq('id', instanceId).single();
    const { data: secrets } = await supabase
      .from('whatsapp_instance_secrets')
      .select('api_url, api_key')
      .eq('instance_id', instanceId).single();

    if (!instance || !secrets) {
      return new Response(JSON.stringify({ error: 'Instance or secrets not found' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const providerType = (instance as any).provider_type || 'self_hosted';
    const idExt = (instance as any).instance_id_external;
    const identifier = providerType === 'cloud' && idExt ? idExt : instance.instance_name;
    const baseUrl = (secrets.api_url.endsWith('/') ? secrets.api_url.slice(0, -1) : secrets.api_url).replace(/\/manager$/, '');
    const headers = { apikey: secrets.api_key };

    const connectionState = await fetchJson(`${baseUrl}/instance/connectionState/${identifier}`, headers);
    const fetchInstances = await fetchJson(`${baseUrl}/instance/fetchInstances?instanceName=${encodeURIComponent(identifier)}`, headers);

    // Tenta extrair info útil do payload de fetchInstances
    let instanceDetails: any = null;
    if (fetchInstances.ok && Array.isArray(fetchInstances.body)) {
      instanceDetails = fetchInstances.body[0] || null;
    } else if (fetchInstances.ok && fetchInstances.body?.instance) {
      instanceDetails = fetchInstances.body;
    }

    const evolutionState = connectionState.body?.state ?? connectionState.body?.instance?.state ?? null;

    const result = {
      identifier,
      providerType,
      apiUrl: baseUrl,
      databaseStatus: (instance as any).status,
      databaseUpdatedAt: (instance as any).updated_at,
      databaseMetadata: (instance as any).metadata || {},
      evolution: {
        connectionStateHttp: connectionState.status,
        connectionState: evolutionState,
        connectionStateRaw: connectionState.body,
        fetchInstancesHttp: fetchInstances.status,
        instanceDetails,
      },
      verdict: (() => {
        if (!connectionState.ok) return 'evolution_unreachable';
        if (evolutionState === 'open' || evolutionState === 'connected') return 'evolution_says_connected';
        if (evolutionState === 'connecting') return 'evolution_reconnecting';
        if (evolutionState === 'close' || evolutionState === 'closed') return 'evolution_socket_closed';
        return 'unknown';
      })(),
    };

    return new Response(JSON.stringify(result, null, 2), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: msg }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});