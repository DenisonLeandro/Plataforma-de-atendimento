import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

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

    const { instanceId } = await req.json();
    if (!instanceId) {
      return new Response(JSON.stringify({ error: 'instanceId required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: instance, error: instanceError } = await supabaseAdmin
      .from('whatsapp_instances')
      .select('instance_name, provider_type, instance_id_external')
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

    const baseUrl = secrets.api_url.endsWith('/') ? secrets.api_url.slice(0, -1) : secrets.api_url;
    const url = `${baseUrl}/instance/connect/${identifier}`;
    console.log('[reconnect-instance] Forçando reconexão:', url);

    const response = await fetch(url, {
      method: 'GET', // Evolution aceita GET no /instance/connect e devolve QR/pairing
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

    // Marca como connecting e zera contador de falhas
    await supabaseAdmin
      .from('whatsapp_instances')
      .update({
        status: 'connecting',
        qr_code: data?.code || data?.base64 || null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', instanceId);

    console.log('[reconnect-instance] Reconexão disparada com sucesso');
    return new Response(
      JSON.stringify({ success: true, qr: data?.code || data?.base64 || null, raw: data }),
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