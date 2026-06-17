// Shared authentication & authorization helpers for edge functions.
import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function jsonResponse(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

export function getAdminClient(): SupabaseClient {
  return createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

export interface AuthResult {
  user: { id: string; email?: string } | null;
  response?: Response;
  admin: SupabaseClient;
}

/**
 * Authenticate the caller via the Authorization Bearer token.
 * Also verifies the user's profile is active and (optionally) approved.
 */
export async function authenticateUser(
  req: Request,
  opts: { requireApproved?: boolean } = { requireApproved: true }
): Promise<AuthResult> {
  const admin = getAdminClient();
  const authHeader = req.headers.get('Authorization') ?? '';
  if (!authHeader.startsWith('Bearer ')) {
    return { user: null, admin, response: jsonResponse({ error: 'Unauthorized' }, 401) };
  }
  const token = authHeader.replace('Bearer ', '').trim();
  const { data, error } = await admin.auth.getUser(token);
  if (error || !data?.user) {
    return { user: null, admin, response: jsonResponse({ error: 'Unauthorized' }, 401) };
  }

  // Verify the profile is active and approved.
  const { data: profile } = await admin
    .from('profiles')
    .select('is_active, is_approved')
    .eq('id', data.user.id)
    .maybeSingle();

  if (!profile || profile.is_active !== true) {
    return { user: null, admin, response: jsonResponse({ error: 'Account inactive' }, 403) };
  }
  if (opts.requireApproved !== false && profile.is_approved !== true) {
    return { user: null, admin, response: jsonResponse({ error: 'Account not approved' }, 403) };
  }

  return { user: { id: data.user.id, email: data.user.email }, admin };
}

export async function userHasAnyRole(
  admin: SupabaseClient,
  userId: string,
  roles: Array<'admin' | 'supervisor' | 'agent'>
): Promise<boolean> {
  const { data, error } = await admin
    .from('user_roles')
    .select('role')
    .eq('user_id', userId)
    .in('role', roles);
  if (error) return false;
  return (data?.length ?? 0) > 0;
}

export async function canAccessConversation(
  admin: SupabaseClient,
  userId: string,
  conversationId: string
): Promise<boolean> {
  const { data, error } = await admin.rpc('can_access_conversation', {
    _user_id: userId,
    _conversation_id: conversationId,
  });
  if (error) {
    console.error('[auth] can_access_conversation error:', error);
    return false;
  }
  return data === true;
}

export function unauthorized(message = 'Unauthorized'): Response {
  return jsonResponse({ error: message }, 401);
}

export function forbidden(message = 'Forbidden'): Response {
  return jsonResponse({ error: message }, 403);
}