import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { fetchWithTimeout } from "../_shared/fetch-with-timeout.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Helper function to get Evolution API auth headers based on provider type
function getEvolutionAuthHeaders(apiKey: string, providerType: string): Record<string, string> {
  // Evolution Cloud confirmou: ambos usam header 'apikey'
  return { apikey: apiKey };
}

// Mapeia qualquer formato de resposta da Evolution para um status nosso.
// A Evolution devolve `{ state }`, `{ instance: { state } }` ou (Cloud) body vazio em 200.
function mapEvolutionState(data: any, hasBody: boolean): 'connected' | 'connecting' | 'disconnected' {
  if (!hasBody) return 'connected'; // Cloud 200 sem corpo = conectado
  const s = data?.state ?? data?.instance?.state;
  if (s === 'open' || s === 'connected') return 'connected';
  if (s === 'connecting') return 'connecting';
  if (s === 'close' || s === 'closed') return 'disconnected';
  return 'disconnected';
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

    // Extract user from JWT token
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);

    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Verify admin or supervisor role
    const { data: isAdmin } = await supabaseAdmin.rpc('has_role', {
      _user_id: user.id,
      _role: 'admin'
    });

    const { data: isSupervisor } = await supabaseAdmin.rpc('has_role', {
      _user_id: user.id,
      _role: 'supervisor'
    });

    if (!isAdmin && !isSupervisor) {
      return new Response(JSON.stringify({ error: 'Forbidden - Admin or Supervisor required' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const { instanceId } = await req.json();

    // Fetch secrets with service role (bypasses RLS)
    const { data: secrets, error: secretsError } = await supabaseAdmin
      .from('whatsapp_instance_secrets')
      .select('api_key, api_url')
      .eq('instance_id', instanceId)
      .single();

    if (secretsError || !secrets) {
      console.error('[test-instance-connection] Failed to fetch secrets:', secretsError);
      return new Response(JSON.stringify({ error: 'Instance secrets not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Fetch instance name, provider_type, and instance_id_external
    const { data: instance, error: instanceError } = await supabaseAdmin
      .from('whatsapp_instances')
      .select('instance_name, provider_type, instance_id_external, status, metadata')
      .eq('id', instanceId)
      .single();

    if (instanceError || !instance) {
      console.error('[test-instance-connection] Failed to fetch instance:', instanceError);
      return new Response(JSON.stringify({ error: 'Instance not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const providerType = (instance as any).provider_type || 'self_hosted';
    const instanceIdExternal = (instance as any).instance_id_external;

    // For Cloud, use instance_id_external (UUID) instead of instance_name
    const instanceIdentifier = providerType === 'cloud' && instanceIdExternal
      ? instanceIdExternal
      : instance.instance_name;

    // Test connection with Evolution API using correct auth headers
    const authHeaders = getEvolutionAuthHeaders(secrets.api_key, providerType);
    
    const response = await fetchWithTimeout(
      `${secrets.api_url}/instance/connectionState/${instanceIdentifier}`,
      { timeout: 15000, headers: authHeaders }
    );

    if (!response.ok) {
      console.error('[test-instance-connection] Evolution API returned error:', response.status);
      const errorText = await response.text();
      console.error('[test-instance-connection] Error details:', errorText);
      return new Response(JSON.stringify({ error: 'Connection test failed', details: errorText }), {
        status: response.status,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Handle empty response body (Evolution Cloud returns empty body on success)
    const responseText = await response.text();
    let data: any = {};

    if (responseText) {
      try {
        data = JSON.parse(responseText);
      } catch (e) {
        console.warn('[test-instance-connection] Response is not JSON:', responseText);
      }
    }

    const mapped = mapEvolutionState(data, !!responseText);
    const currentStatus = (instance as any).status as string | undefined;
    const metadata = ((instance as any).metadata || {}) as Record<string, any>;
    const isDeliveryDegraded = metadata.delivery_degraded === true;

    // Importante: `connecting` é um estado intermediário do Baileys que aparece
    // por alguns segundos quando o socket renova. Se a instância já estava
    // `connected`, NÃO rebaixamos — isso evitava o falso "Desconectado" depois
    // de clicar em testar.
    let newStatus: string;
    if (isDeliveryDegraded) {
      newStatus = 'connecting';
    } else if (mapped === 'connecting' && currentStatus === 'connected') {
      newStatus = 'connected';
    } else {
      newStatus = mapped;
    }

    await supabaseAdmin
      .from('whatsapp_instances')
      .update({
        status: newStatus,
        ...(newStatus === 'connected' ? { qr_code: null } : {}),
        updated_at: new Date().toISOString(),
      })
      .eq('id', instanceId);

    console.log(`[test-instance-connection] Updated instance status to ${newStatus} (evolution=${mapped}, degraded=${isDeliveryDegraded})`);

    return new Response(
      JSON.stringify({ ...data, mappedStatus: newStatus, evolutionState: mapped, deliveryDegraded: isDeliveryDegraded }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('[test-instance-connection] Error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});