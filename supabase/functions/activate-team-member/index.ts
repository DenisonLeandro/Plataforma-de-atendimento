import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ActivateRequest {
  email: string;
  password: string;
  fullName?: string;
  role?: 'admin' | 'supervisor' | 'agent';
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const ANON = Deno.env.get('SUPABASE_ANON_KEY')!;

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // Verify caller is an admin (best effort). Skip if no auth header.
    const authHeader = req.headers.get('Authorization');
    console.log('authHeader present:', !!authHeader, 'len:', authHeader?.length);
    if (authHeader?.startsWith('Bearer ')) {
      const userClient = createClient(SUPABASE_URL, ANON, {
        global: { headers: { Authorization: authHeader } },
      });
      const { data: userInfo, error: getUserErr } = await userClient.auth.getUser();
      console.log('getUser err:', getUserErr?.message, 'user:', userInfo?.user?.email);
      if (userInfo?.user) {
        const { data: isAdmin } = await admin.rpc('has_role', {
          _user_id: userInfo.user.id,
          _role: 'admin',
        });
        if (!isAdmin) {
          return new Response(JSON.stringify({ error: 'Apenas admins podem ativar contas.' }), {
            status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
      } else {
        return new Response(JSON.stringify({ error: 'Sessão inválida.' }), {
          status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    } else {
      return new Response(JSON.stringify({ error: 'Auth header ausente.' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { email, password, fullName, role = 'agent' }: ActivateRequest = await req.json();
    if (!email || !password) {
      return new Response(JSON.stringify({ error: 'email e password são obrigatórios.' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Find user by email (paginate just in case)
    let target: any = null;
    let page = 1;
    while (!target) {
      const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
      if (error) throw error;
      target = data.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
      if (target || data.users.length < 200) break;
      page++;
    }

    if (!target) {
      return new Response(JSON.stringify({ error: 'Usuário não encontrado em auth.users.' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Update password + confirm email
    const { error: updErr } = await admin.auth.admin.updateUserById(target.id, {
      password,
      email_confirm: true,
      user_metadata: { ...(target.user_metadata || {}), full_name: fullName || target.user_metadata?.full_name || email.split('@')[0] },
    });
    if (updErr) throw updErr;

    // Upsert profile
    const { error: profErr } = await admin.from('profiles').upsert({
      id: target.id,
      email,
      full_name: fullName || target.user_metadata?.full_name || email.split('@')[0],
      is_active: true,
      is_approved: true,
    }, { onConflict: 'id' });
    if (profErr) throw profErr;

    // Upsert role
    await admin.from('user_roles').delete().eq('user_id', target.id);
    const { error: roleErr } = await admin.from('user_roles').insert({
      user_id: target.id,
      role,
    });
    if (roleErr) throw roleErr;

    return new Response(JSON.stringify({
      success: true,
      userId: target.id,
      message: `Conta ${email} ativada com sucesso como ${role}.`,
    }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e: any) {
    console.error('activate-team-member error:', e);
    return new Response(JSON.stringify({ error: e.message || 'Erro interno' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});