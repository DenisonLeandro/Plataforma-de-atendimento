import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const COMPANY_ID = 'd68c2a97-9ebb-44f8-afe0-357857ec9007';
const PASSWORD = 'power@2015';
const USERS = [
  { email: 'vitor@desenvol.com.br', name: 'Vitor' },
  { email: 'leonardo@desenvol.com.br', name: 'Leonardo' },
  { email: 'juliano@desenvol.com.br', name: 'Juliano' },
  { email: 'lucas@desenvol.com.br', name: 'Lucas' },
];

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

  const results: any[] = [];

  for (const u of USERS) {
    try {
      let userId: string | null = null;
      const { data: created, error: createErr } = await admin.auth.admin.createUser({
        email: u.email,
        password: PASSWORD,
        email_confirm: true,
        user_metadata: { full_name: u.name, company_id: COMPANY_ID },
      });

      if (createErr) {
        const exists = (createErr as any).code === 'email_exists' || /already/i.test(createErr.message);
        if (!exists) throw createErr;
        // find existing
        let page = 1;
        while (page <= 20 && !userId) {
          const { data: list } = await admin.auth.admin.listUsers({ page, perPage: 200 });
          const found = list.users.find(x => (x.email || '').toLowerCase() === u.email.toLowerCase());
          if (found) { userId = found.id; break; }
          if (list.users.length < 200) break;
          page++;
        }
        if (userId) {
          await admin.auth.admin.updateUserById(userId, { password: PASSWORD, email_confirm: true });
        }
      } else {
        userId = created.user!.id;
      }

      if (!userId) throw new Error('user id not resolved');

      // wait for handle_new_user trigger
      await new Promise(r => setTimeout(r, 800));

      // clear default role and set supervisor for this company
      await admin.from('user_roles').delete().eq('user_id', userId);
      await new Promise(r => setTimeout(r, 200));
      const { error: roleErr } = await admin.from('user_roles').insert({
        user_id: userId, role: 'supervisor', company_id: COMPANY_ID,
      });
      if (roleErr) throw roleErr;

      // upsert profile scoped to Desenvol
      const { error: profErr } = await admin.from('profiles').upsert({
        id: userId,
        full_name: u.name,
        email: u.email,
        company_id: COMPANY_ID,
        is_active: true,
        is_approved: true,
      }, { onConflict: 'id' });
      if (profErr) throw profErr;

      results.push({ email: u.email, userId, ok: true });
    } catch (e) {
      results.push({ email: u.email, ok: false, error: (e as Error).message });
    }
  }

  return new Response(JSON.stringify({ results }, null, 2), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
});