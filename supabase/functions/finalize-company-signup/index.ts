import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return json({ error: 'missing_authorization' }, 401);

    const { data: userRes, error: userErr } = await admin.auth.getUser(
      authHeader.replace('Bearer ', ''),
    );
    if (userErr || !userRes?.user) return json({ error: 'invalid_token' }, 401);
    const user = userRes.user;

    const body = await req.json().catch(() => ({}));
    const companyCode = typeof body?.companyCode === 'string'
      ? body.companyCode.trim().toUpperCase()
      : '';
    if (!companyCode) return json({ error: 'missing_company_code' }, 400);

    // Domain restriction (mirrors check-signup-eligibility)
    const { data: configs } = await admin
      .from('project_config')
      .select('key,value')
      .in('key', ['restrict_signup_by_domain', 'allowed_email_domains']);
    const restrictionEnabled = configs?.find((c: any) => c.key === 'restrict_signup_by_domain')?.value === 'true';
    const allowedDomains: string[] = (configs?.find((c: any) => c.key === 'allowed_email_domains')?.value || '')
      .split(',').map((d: string) => d.trim().toLowerCase()).filter(Boolean);
    if (restrictionEnabled && allowedDomains.length > 0) {
      const domain = (user.email ?? '').split('@')[1]?.toLowerCase() ?? '';
      if (!allowedDomains.includes(domain)) {
        return json({ error: 'domain_not_allowed' }, 403);
      }
    }

    const { data: company, error: companyErr } = await admin
      .from('companies')
      .select('id, status')
      .eq('code', companyCode)
      .maybeSingle();
    if (companyErr) return json({ error: 'company_lookup_failed' }, 500);
    if (!company) return json({ error: 'invalid_company_code' }, 404);
    if ((company as any).status === 'suspended') return json({ error: 'company_suspended' }, 403);

    const companyId = (company as any).id as string;

    // Idempotent link: only fills missing company_id
    const { error: profErr } = await admin
      .from('profiles')
      .update({ company_id: companyId })
      .eq('id', user.id)
      .is('company_id', null);
    if (profErr) console.error('[finalize-company-signup] profile update error:', profErr);

    const { error: roleErr } = await admin
      .from('user_roles')
      .update({ company_id: companyId })
      .eq('user_id', user.id)
      .is('company_id', null);
    if (roleErr) console.error('[finalize-company-signup] role update error:', roleErr);

    // Report the current linked company (may already have been set)
    const { data: current } = await admin
      .from('profiles')
      .select('company_id')
      .eq('id', user.id)
      .maybeSingle();

    return json({
      success: true,
      companyId,
      linkedCompanyId: (current as any)?.company_id ?? null,
    });
  } catch (error: any) {
    console.error('[finalize-company-signup] fatal:', error?.message);
    return json({ error: 'server_error' }, 500);
  }
});