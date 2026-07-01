import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface CreateAdminRequest {
  company_id: string;
  name: string;
  email: string;
  password?: string;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      console.error('Error: missing authorization header');
      return new Response(JSON.stringify({ error: "missing authorization" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const PUBLISHABLE_KEY = Deno.env.get("SUPABASE_PUBLISHABLE_KEY")
      ?? Deno.env.get("SUPABASE_ANON_KEY")!;

    // 1. Authenticate caller
    const userClient = createClient(SUPABASE_URL, PUBLISHABLE_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData?.user) {
      console.error('Error: invalid authentication token', userErr);
      return new Response(JSON.stringify({ error: "invalid token" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log('Step 1: Auth verified', userData.user.id);

    const adminClient = createClient(SUPABASE_URL, SERVICE_ROLE);

    // 2. Check if caller is super_admin
    const { data: roles, error: rolesError } = await adminClient
      .from("user_roles")
      .select("role")
      .eq("user_id", userData.user.id);

    if (rolesError) {
      console.error('Error fetching user roles:', rolesError);
    }

    const isSuperAdmin = roles?.some(r => r.role === 'super_admin');
    console.log('Step 2: super_admin check', isSuperAdmin);

    if (!isSuperAdmin) {
      return new Response(JSON.stringify({ error: "Unauthorized: only super_admins can perform this action" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 3. Parse request payload
    const body: CreateAdminRequest = await req.json();
    const { company_id, name, email, password } = body;

    if (!company_id || !name || !email || !password) {
      console.error('Error: missing required fields');
      return new Response(JSON.stringify({ error: "missing required fields (company_id, name, email, password)" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log('Step 3: creating user', email);

    // 4. Create new user in Auth
    const { data: newUser, error: createError } = await adminClient.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        full_name: name,
        company_id: company_id
      }
    });

    if (createError) {
      console.error('Error creating user in Auth:', createError);
      return new Response(JSON.stringify({ error: createError.message }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log('Step 4: user created', newUser?.user?.id);

    // 5. Update user_roles (override default agent role from trigger)
    console.log('Step 5: assigning role');
    await adminClient
      .from("user_roles")
      .delete()
      .eq("user_id", newUser.user.id);

    // Aguarda 500ms para garantir consistência
    await new Promise(resolve => setTimeout(resolve, 500));

    // Insert admin role
    const { error: insertRoleErr } = await adminClient
      .from("user_roles")
      .insert({
        user_id: newUser.user.id,
        role: "admin",
        company_id: company_id
      });

    if (insertRoleErr) {
      console.error('Error assigning admin role:', insertRoleErr);
      return new Response(JSON.stringify({ error: `User created but failed to assign role: ${insertRoleErr.message}` }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 6. Update profile (upsert to prevent race conditions from handle_new_user trigger)
    console.log('Step 6: updating profile');
    // Aguarda 1 segundo para garantir que o trigger handle_new_user já tenha finalizado
    await new Promise(resolve => setTimeout(resolve, 1000));

    const { error: profileErr } = await adminClient
      .from("profiles")
      .upsert({
        id: newUser.user.id,
        full_name: name,
        company_id: company_id,
        is_approved: true,
        is_active: true
      }, { onConflict: 'id' });

    if (profileErr) {
      console.error('Error updating/upserting profile:', profileErr);
      return new Response(JSON.stringify({ error: `User created but failed to approve profile: ${profileErr.message}` }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log('Admin user provisioned successfully');

    return new Response(JSON.stringify({ success: true, userId: newUser.user.id }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error('Unhandled edge function exception:', e);
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
