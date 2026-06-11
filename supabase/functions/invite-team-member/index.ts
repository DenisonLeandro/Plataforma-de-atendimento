import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface InviteRequest {
  email: string;
  fullName: string;
  role: 'admin' | 'supervisor' | 'agent';
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false
        }
      }
    );

    const { email, fullName, role }: InviteRequest = await req.json();

    console.log('Creating user:', { email, fullName, role });

    // Create user via Admin API
    const { data: userData, error: createError } = await supabaseAdmin.auth.admin.createUser({
      email,
      email_confirm: false, // Require email confirmation
      user_metadata: {
        full_name: fullName
      }
    });

    let userId: string | null = null;

    if (createError) {
      const code = (createError as any).code || (createError as any).status;
      const msg = createError.message || '';
      const isExisting = code === 'email_exists' || /already been registered|already registered|already exists/i.test(msg);
      if (!isExisting) {
        console.error('Error creating user:', createError);
        throw createError;
      }

      // User exists in auth.users — find and ensure profile/role exist
      let page = 1;
      let existing: any = null;
      while (!existing) {
        const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage: 200 });
        if (error) throw error;
        existing = data.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
        if (existing || data.users.length < 200) break;
        page++;
      }
      if (!existing) {
        return new Response(JSON.stringify({ error: 'Email já registrado, mas usuário não localizável.' }), {
          status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Check if profile + role are already complete
      const { data: existingProfile } = await supabaseAdmin
        .from('profiles').select('id').eq('id', existing.id).maybeSingle();
      const { data: existingRole } = await supabaseAdmin
        .from('user_roles').select('user_id').eq('user_id', existing.id).maybeSingle();
      if (existingProfile && existingRole) {
        return new Response(JSON.stringify({ error: 'Este email já está cadastrado na plataforma.' }), {
          status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      userId = existing.id;
    } else {
      userId = userData.user.id;
    }

    console.log('User ready:', userId);

    // Ensure profile row exists and is approved
    const { error: profErr } = await supabaseAdmin.from('profiles').upsert({
      id: userId!,
      email,
      full_name: fullName,
      is_active: true,
      is_approved: true,
    }, { onConflict: 'id' });
    if (profErr) {
      console.error('Error upserting profile:', profErr);
      throw profErr;
    }

    // Ensure role
    await supabaseAdmin.from('user_roles').delete().eq('user_id', userId!);
    const { error: roleError } = await supabaseAdmin
      .from('user_roles')
      .insert({ user_id: userId!, role });

    if (roleError) {
      console.error('Error setting role:', roleError);
      throw roleError;
    }

    console.log('Role updated successfully to:', role);

    return new Response(
      JSON.stringify({ 
        success: true, 
        userId: userData.user.id,
        message: 'Convite enviado com sucesso. O membro receberá um email para confirmar o cadastro.' 
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );

  } catch (error: any) {
    console.error('Error in invite-team-member:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
