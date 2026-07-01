import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

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
      return new Response(JSON.stringify({ error: "missing authorization" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;

    // 1. Authenticate caller
    const userClient = createClient(SUPABASE_URL, ANON, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData?.user) {
      return new Response(JSON.stringify({ error: "invalid token" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const adminClient = createClient(SUPABASE_URL, SERVICE_ROLE);

    // 2. Check if caller is super_admin
    const { data: superAdminRole, error: roleError } = await adminClient
      .from("user_roles")
      .select("role")
      .eq("user_id", userData.user.id)
      .eq("role", "super_admin")
      .maybeSingle();

    if (roleError || !superAdminRole) {
      return new Response(JSON.stringify({ error: "Unauthorized: only super_admins can perform this action" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 3. Parse request payload
    const body: CreateAdminRequest = await req.json();
    const { company_id, name, email, password } = body;

    if (!company_id || !name || !email || !password) {
      return new Response(JSON.stringify({ error: "missing required fields (company_id, name, email, password)" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

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
      return new Response(JSON.stringify({ error: createError.message }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 5. Update user_roles and profiles to ensure they are correct (override default agent role from trigger)
    // Delete any default roles created by trigger for this user
    await adminClient
      .from("user_roles")
      .delete()
      .eq("user_id", newUser.user.id);

    // Insert admin role
    const { error: insertRoleErr } = await adminClient
      .from("user_roles")
      .insert({
        user_id: newUser.user.id,
        role: "admin",
        company_id: company_id
      });

    if (insertRoleErr) {
      return new Response(JSON.stringify({ error: `User created but failed to assign role: ${insertRoleErr.message}` }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Update profile to be active and approved
    const { error: profileErr } = await adminClient
      .from("profiles")
      .update({
        is_approved: true,
        full_name: name,
        company_id: company_id
      })
      .eq("id", newUser.user.id);

    if (profileErr) {
      return new Response(JSON.stringify({ error: `User created but failed to approve profile: ${profileErr.message}` }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ success: true, userId: newUser.user.id }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
