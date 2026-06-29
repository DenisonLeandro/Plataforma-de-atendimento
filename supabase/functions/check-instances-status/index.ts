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

function mapEvolutionState(data: any, hasBody: boolean): 'connected' | 'connecting' | 'disconnected' {
  if (!hasBody) return 'connected';
  const s = data?.state ?? data?.instance?.state;
  if (s === 'open' || s === 'connected') return 'connected';
  if (s === 'connecting') return 'connecting';
  if (s === 'close' || s === 'closed') return 'disconnected';
  return 'disconnected';
}

const FAILURE_THRESHOLD = 3;

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

    // Fetch all instances including provider_type, instance_id_external, status e metadata
    const { data: instances, error: instancesError } = await supabaseAdmin
      .from('whatsapp_instances')
      .select('id, instance_name, provider_type, instance_id_external, status, metadata');

    if (instancesError) {
      console.error('[check-instances-status] Failed to fetch instances:', instancesError);
      return new Response(JSON.stringify({ error: 'Failed to fetch instances' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    let updatedCount = 0;
    let errorCount = 0;

    // Check each instance
    for (const instance of instances || []) {
      try {
        // Fetch secrets for this instance
        const { data: secrets, error: secretsError } = await supabaseAdmin
          .from('whatsapp_instance_secrets')
          .select('api_key, api_url')
          .eq('instance_id', instance.id)
          .single();

        if (secretsError || !secrets) {
          console.error(`[check-instances-status] Failed to fetch secrets for instance ${instance.id}`);
          errorCount++;
          continue;
        }

        const providerType = (instance as any).provider_type || 'self_hosted';
        const instanceIdExternal = (instance as any).instance_id_external;
        const authHeaders = getEvolutionAuthHeaders(secrets.api_key, providerType);

        // For Cloud, use instance_id_external (UUID) instead of instance_name
        const instanceIdentifier = providerType === 'cloud' && instanceIdExternal
          ? instanceIdExternal
          : instance.instance_name;

        // Check connection state via Evolution API
        const response = await fetchWithTimeout(
          `${secrets.api_url}/instance/connectionState/${instanceIdentifier}`,
          { timeout: 15000, headers: authHeaders }
        );

        const currentStatus = (instance as any).status as string | undefined;
        const currentMeta = ((instance as any).metadata as Record<string, any>) || {};
        const prevFailures = Number(currentMeta.consecutive_failures || 0);

        if (!response.ok) {
          // Falha transitória: incrementa contador. Só marca disconnected após N falhas seguidas.
          const failures = prevFailures + 1;
          const shouldDowngrade =
            failures >= FAILURE_THRESHOLD && currentStatus === 'connected';
          const newMeta = { ...currentMeta, consecutive_failures: failures, last_check_error: response.status };
          await supabaseAdmin
            .from('whatsapp_instances')
            .update({
              ...(shouldDowngrade ? { status: 'disconnected' } : {}),
              metadata: newMeta,
              updated_at: new Date().toISOString(),
            })
            .eq('id', instance.id);

          console.warn(
            `[check-instances-status] ${instance.instance_name}: Evolution erro ${response.status} (falhas=${failures}/${FAILURE_THRESHOLD}, downgrade=${shouldDowngrade})`
          );
          errorCount++;
          continue;
        }

        const responseText = await response.text();
        let connectionData: any = {};
        if (responseText) {
          try { connectionData = JSON.parse(responseText); } catch {}
        }

        const mapped = mapEvolutionState(connectionData, !!responseText);

        // Não rebaixa connected -> disconnected/connecting por estado transitório:
        // só atualiza se vier `open` (zerando falhas) ou se já estávamos fora de connected.
        let newStatus = currentStatus || 'disconnected';
        if (mapped === 'connected') {
          newStatus = 'connected';
        } else if (currentStatus !== 'connected') {
          newStatus = mapped;
        }

        const newMeta = { ...currentMeta, consecutive_failures: 0, last_check_error: null };
        await supabaseAdmin
          .from('whatsapp_instances')
          .update({
            status: newStatus,
            metadata: newMeta,
            updated_at: new Date().toISOString(),
          })
          .eq('id', instance.id);

        updatedCount++;

      } catch (error) {
        console.error(`[check-instances-status] Error checking instance ${instance.instance_name}:`, error);
        errorCount++;
      }
    }

    console.log(`[check-instances-status] Check complete: ${updatedCount} updated, ${errorCount} errors`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        updated: updatedCount,
        errors: errorCount
      }), 
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  } catch (error) {
    console.error('[check-instances-status] Error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});