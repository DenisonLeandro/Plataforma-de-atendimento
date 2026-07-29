import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { fetchWithTimeout } from "../_shared/fetch-with-timeout.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface FixResult {
  contactId: string;
  phoneNumber: string;
  oldName: string | null;
  newName?: string;
  newPhone?: string;
  profilePictureUrl?: string;
  action: 'updated' | 'renamed' | 'skipped_duplicate' | 'unresolved' | 'failed';
  error?: string;
}

// Mesma heurística de resolve-lid-conversations: números com >= 14 dígitos
// são pseudo-IDs @lid do Baileys (telefones reais têm no máximo 13 dígitos).
function looksLikeLid(phone: string): boolean {
  if (!phone) return false;
  if (!/^\d+$/.test(phone)) return false;
  return phone.length >= 14;
}

function pickName(profile: any, phone: string): string | null {
  const candidates = [profile?.name, profile?.pushName, profile?.verifiedName, profile?.notify];
  for (const c of candidates) {
    if (typeof c === 'string' && c.trim() && c.trim() !== phone) return c.trim();
  }
  return null;
}

Deno.serve(async (req) => {
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
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);

    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const { data: isAdmin } = await supabaseAdmin.rpc('has_role', {
      _user_id: user.id,
      _role: 'admin'
    });

    if (!isAdmin) {
      return new Response(JSON.stringify({ error: 'Forbidden - Admin required' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const body = await req.json().catch(() => ({}));
    const instanceId: string | undefined = body?.instanceId;
    if (!instanceId) {
      return new Response(JSON.stringify({ error: 'instanceId is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Resolve instância + secrets uma única vez
    const { data: instance, error: instanceError } = await supabaseAdmin
      .from('whatsapp_instances')
      .select('id, instance_name, provider_type, instance_id_external')
      .eq('id', instanceId)
      .single();
    if (instanceError || !instance) {
      return new Response(JSON.stringify({ error: 'Instance not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const { data: secrets } = await supabaseAdmin
      .from('whatsapp_instance_secrets')
      .select('api_url, api_key')
      .eq('instance_id', instanceId)
      .maybeSingle();
    if (!secrets?.api_url || !secrets?.api_key) {
      return new Response(JSON.stringify({ error: 'Instance secrets not found' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const baseUrl = secrets.api_url.replace(/\/$/, '');
    const apiKey = secrets.api_key;
    const identifier = (instance as any).provider_type === 'cloud' && (instance as any).instance_id_external
      ? (instance as any).instance_id_external
      : instance.instance_name;

    // Contatos alvo: name nulo/vazio OU name == phone_number, na instância pedida
    const { data: allInstanceContacts, error: fetchError } = await supabaseAdmin
      .from('whatsapp_contacts')
      .select('id, phone_number, name, is_group')
      .eq('instance_id', instanceId);
    if (fetchError) {
      console.error('[fix-contact-names] Error fetching contacts:', fetchError);
      return new Response(
        JSON.stringify({ error: 'Failed to fetch contacts', details: fetchError }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const contactsToFix = (allInstanceContacts ?? []).filter((c: any) =>
      !c.is_group && (!c.name || c.name.trim() === '' || c.name === c.phone_number)
    );

    // Índice dos telefones existentes na instância para detectar duplicatas quando
    // resolvermos um @lid para o número real.
    const existingPhones = new Set(
      (allInstanceContacts ?? []).map((c: any) => c.phone_number as string),
    );

    if (contactsToFix.length === 0) {
      return new Response(
        JSON.stringify({
          message: 'Nenhum contato precisando de correção nesta instância',
          total: 0, updated: 0, renamed: 0, skipped_duplicate: 0, unresolved: 0, failed: 0,
          details: []
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[fix-contact-names] Instance ${instance.instance_name}: ${contactsToFix.length} contacts to fix`);

    const results: FixResult[] = [];
    let updated = 0;
    let renamed = 0;
    let skippedDuplicate = 0;
    let unresolved = 0;
    let failed = 0;

    async function fetchProfileAndUpdate(contactId: string, phone: string, oldName: string | null): Promise<void> {
      try {
        const r = await fetchWithTimeout(`${baseUrl}/chat/fetchProfile/${identifier}`, {
          timeout: 15000,
          method: 'POST',
          headers: { 'Content-Type': 'application/json', apikey: apiKey },
          body: JSON.stringify({ number: phone }),
        });
        if (!r.ok) {
          results.push({ contactId, phoneNumber: phone, oldName, action: 'unresolved', error: `fetchProfile ${r.status}` });
          unresolved++;
          return;
        }
        const profile = await r.json().catch(() => ({}));
        const newName = pickName(profile, phone);
        const profilePictureUrl = profile?.profilePictureUrl || profile?.picture || null;
        if (!newName && !profilePictureUrl) {
          results.push({ contactId, phoneNumber: phone, oldName, action: 'unresolved' });
          unresolved++;
          return;
        }
        const updateData: any = { updated_at: new Date().toISOString() };
        if (newName) updateData.name = newName;
        if (profilePictureUrl) updateData.profile_picture_url = profilePictureUrl;
        const { error: uErr } = await supabaseAdmin
          .from('whatsapp_contacts').update(updateData).eq('id', contactId);
        if (uErr) {
          results.push({ contactId, phoneNumber: phone, oldName, action: 'failed', error: uErr.message });
          failed++;
          return;
        }
        results.push({
          contactId, phoneNumber: phone, oldName,
          newName: newName ?? undefined,
          profilePictureUrl: profilePictureUrl ?? undefined,
          action: 'updated',
        });
        updated++;
      } catch (e: any) {
        results.push({ contactId, phoneNumber: phone, oldName, action: 'failed', error: e?.message ?? 'unknown' });
        failed++;
      }
    }

    for (const contact of contactsToFix) {
      const phone = contact.phone_number as string;
      const oldName = (contact.name as string | null) ?? null;
      try {
        if (looksLikeLid(phone)) {
          // 1) tenta resolver o @lid para o número real via findContacts
          let resolvedPhone: string | null = null;
          try {
            const r = await fetchWithTimeout(`${baseUrl}/chat/findContacts/${identifier}`, {
              timeout: 15000,
              method: 'POST',
              headers: { 'Content-Type': 'application/json', apikey: apiKey },
              body: JSON.stringify({ where: { id: `${phone}@lid` } }),
            });
            if (r.ok) {
              const arr = await r.json().catch(() => null);
              const c0 = Array.isArray(arr) ? arr[0] : null;
              const candidate = c0?.jid || c0?.remoteJid || c0?.id;
              if (typeof candidate === 'string' && candidate.includes('@s.whatsapp.net')) {
                resolvedPhone = candidate.split('@')[0];
              }
            }
          } catch (_) { /* ignore */ }

          if (!resolvedPhone) {
            results.push({ contactId: contact.id, phoneNumber: phone, oldName, action: 'unresolved' });
            unresolved++;
            await new Promise(r => setTimeout(r, 300));
            continue;
          }

          if (existingPhones.has(resolvedPhone) && resolvedPhone !== phone) {
            // Já existe outro contato "real" com esse número; a fusão é do
            // botão "Resolver conversas @lid". Aqui não mexemos para não quebrar nada.
            results.push({
              contactId: contact.id, phoneNumber: phone, oldName,
              newPhone: resolvedPhone, action: 'skipped_duplicate',
            });
            skippedDuplicate++;
            await new Promise(r => setTimeout(r, 300));
            continue;
          }

          // Renomeia o telefone deste contato para o número real e busca perfil.
          const { error: renameErr } = await supabaseAdmin
            .from('whatsapp_contacts')
            .update({ phone_number: resolvedPhone, updated_at: new Date().toISOString() })
            .eq('id', contact.id);
          if (renameErr) {
            results.push({ contactId: contact.id, phoneNumber: phone, oldName, action: 'failed', error: renameErr.message });
            failed++;
            await new Promise(r => setTimeout(r, 300));
            continue;
          }
          existingPhones.delete(phone);
          existingPhones.add(resolvedPhone);
          renamed++;
          results.push({ contactId: contact.id, phoneNumber: phone, oldName, newPhone: resolvedPhone, action: 'renamed' });

          // Best-effort: puxar nome/foto do perfil resolvido.
          await fetchProfileAndUpdate(contact.id, resolvedPhone, oldName);
        } else {
          await fetchProfileAndUpdate(contact.id, phone, oldName);
        }
      } catch (e: any) {
        results.push({ contactId: contact.id, phoneNumber: phone, oldName, action: 'failed', error: e?.message ?? 'unknown' });
        failed++;
      }
      await new Promise(r => setTimeout(r, 300));
    }

    const report = {
      message: 'Contact name correction completed',
      instanceId,
      total: contactsToFix.length,
      updated,
      renamed,
      skipped_duplicate: skippedDuplicate,
      unresolved,
      failed,
      details: results,
    };

    console.log('[fix-contact-names] Process completed:', report);

    return new Response(
      JSON.stringify(report),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[fix-contact-names] Unexpected error:', error);
    return new Response(
      JSON.stringify({ 
        error: 'Internal server error',
        details: error instanceof Error ? error.message : 'Unknown error'
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
