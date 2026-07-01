import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : '';
    if (!email || !email.includes('@')) {
      return new Response(JSON.stringify({ allowed: false, reason: 'invalid_email' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const { data: configs } = await supabase
      .from('project_config')
      .select('key,value')
      .in('key', ['restrict_signup_by_domain', 'allowed_email_domains', 'require_account_approval']);

    const restrictionEnabled = configs?.find((c: any) => c.key === 'restrict_signup_by_domain')?.value === 'true';
    const requireApproval = configs?.find((c: any) => c.key === 'require_account_approval')?.value === 'true';
    const allowedDomainsRaw = configs?.find((c: any) => c.key === 'allowed_email_domains')?.value || '';
    const allowedDomains: string[] = allowedDomainsRaw
      .split(',')
      .map((d: string) => d.trim().toLowerCase())
      .filter(Boolean);

    let allowed = true;
    if (restrictionEnabled && allowedDomains.length > 0) {
      const domain = email.split('@')[1] ?? '';
      allowed = allowedDomains.includes(domain);
    }

    return new Response(
      JSON.stringify({ allowed, requireApproval, restrictionEnabled }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (error: any) {
    console.error('[check-signup-eligibility] error:', error?.message);
    return new Response(
      JSON.stringify({ allowed: false, reason: 'server_error' }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});