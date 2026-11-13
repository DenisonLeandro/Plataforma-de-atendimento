import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { fetchWithTimeout } from "../_shared/fetch-with-timeout.ts";
import { authorizeInstanceAction } from "../_shared/instance-auth.ts";

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

const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

// Quantos contatos consultamos na Evolution ao mesmo tempo. Antes era um por
// vez com pausa de 300 ms: instâncias com centenas de contatos passavam do
// tempo máximo da função e o botão terminava em erro sem corrigir nada.
const CONCURRENCY = 6;
// Orçamento de tempo do trabalho em segundo plano.
const BUDGET_MS = 340_000;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

    const body = await req.json().catch(() => ({}));
    const instanceId: string | undefined = body?.instanceId;
    if (!instanceId) return json({ error: 'Informe a instância.' }, 400);

    const token = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '').trim();
    const { data: { user } } = token ? await supabaseAdmin.auth.getUser(token) : { data: { user: null } };
    if (!user) return json({ error: 'Sessão expirada. Entre novamente.' }, 401);

    // Mesma regra do botão "Recuperar mensagens": super admin, ou admin/supervisor
    // da empresa dona da instância. Corrigir nomes não desliga nada.
    const { data: isSuper } = await supabaseAdmin.rpc('is_super_admin', { _user_id: user.id });
    if (!isSuper) {
      const auth = await authorizeInstanceAction(supabaseAdmin, req, instanceId);
      if (!auth.ok) {
        return json({ error: auth.status === 404 ? 'Você não tem permissão para esta empresa ou instância.' : auth.error }, auth.status);
      }
    }

    const { data: instance } = await supabaseAdmin
      .from('whatsapp_instances')
      .select('id, instance_name, provider_type, instance_id_external')
      .eq('id', instanceId)
      .maybeSingle();
    if (!instance) return json({ error: 'Instância não encontrada.' }, 404);

    const { data: secrets } = await supabaseAdmin
      .from('whatsapp_instance_secrets')
      .select('api_url, api_key')
      .eq('instance_id', instanceId)
      .maybeSingle();
    if (!secrets?.api_url || !secrets?.api_key) return json({ error: 'Credenciais da instância não configuradas.' }, 400);

    const baseUrl = secrets.api_url.replace(/\/+$/, '').replace(/\/manager$/, '');
    const apiKey = secrets.api_key;
    const identifier = (instance as any).provider_type === 'cloud' && (instance as any).instance_id_external
      ? (instance as any).instance_id_external
      : instance.instance_name;

    // Paginado: o cliente devolve no máximo 1000 linhas por consulta.
    const allInstanceContacts: any[] = [];
    for (let from = 0; ; from += 1000) {
      const { data, error } = await supabaseAdmin
        .from('whatsapp_contacts')
        .select('id, phone_number, name, is_group, updated_at')
        .eq('instance_id', instanceId)
        .range(from, from + 999);
      if (error) {
        console.error('[fix-contact-names] Error fetching contacts:', error);
        return json({ error: 'Falha ao ler os contatos.' }, 500);
      }
      allInstanceContacts.push(...(data ?? []));
      if (!data || data.length < 1000) break;
    }

    const contactsToFix = allInstanceContacts
      .filter((c: any) => !c.is_group && (!c.name || c.name.trim() === '' || c.name === c.phone_number))
      // Os mais recentes primeiro: são as conversas que a equipe está atendendo.
      .sort((a: any, b: any) => String(b.updated_at).localeCompare(String(a.updated_at)));

    if (contactsToFix.length === 0) {
      return json({ message: 'Nenhum contato precisando de correção nesta instância', total: 0, background: false });
    }

    const existingPhones = new Set(allInstanceContacts.map((c: any) => c.phone_number as string));
    const stats = { updated: 0, renamed: 0, skipped_duplicate: 0, unresolved: 0, failed: 0 };

    async function evo(path: string, payload: unknown) {
      return await fetchWithTimeout(`${baseUrl}${path}/${identifier}`, {
        timeout: 15000,
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: apiKey },
        body: JSON.stringify(payload),
      });
    }

    async function fetchProfileAndUpdate(contactId: string, phone: string) {
      const r = await evo('/chat/fetchProfile', { number: phone });
      if (!r.ok) { stats.unresolved++; return; }
      const profile = await r.json().catch(() => ({}));
      const newName = pickName(profile, phone);
      const pic = profile?.profilePictureUrl || profile?.picture || null;
      if (!newName && !pic) { stats.unresolved++; return; }
      const updateData: any = { updated_at: new Date().toISOString() };
      if (newName) updateData.name = newName;
      if (pic) updateData.profile_picture_url = pic;
      const { error } = await supabaseAdmin.from('whatsapp_contacts').update(updateData).eq('id', contactId);
      if (error) stats.failed++; else stats.updated++;
    }

    async function fixOne(contact: any) {
      const phone = contact.phone_number as string;
      try {
        if (!looksLikeLid(phone)) return await fetchProfileAndUpdate(contact.id, phone);

        let resolvedPhone: string | null = null;
        try {
          const r = await evo('/chat/findContacts', { where: { id: `${phone}@lid` } });
          if (r.ok) {
            const arr = await r.json().catch(() => null);
            const c0 = Array.isArray(arr) ? arr[0] : null;
            const candidates = [c0?.jid, c0?.remoteJid, c0?.id, c0?.remoteJidAlt, c0?.phoneNumber];
            const hit = candidates.find((x) => typeof x === 'string' && x.includes('@s.whatsapp.net'));
            if (hit) resolvedPhone = hit.split('@')[0];
            const pushName = pickName(c0, phone);
            if (!resolvedPhone && pushName) {
              // Sem número real, mas a Evolution conhece o nome: já ajuda a equipe.
              await supabaseAdmin.from('whatsapp_contacts')
                .update({ name: pushName, updated_at: new Date().toISOString() }).eq('id', contact.id);
              stats.updated++;
              return;
            }
          }
        } catch (_) { /* ignora */ }

        if (!resolvedPhone) { stats.unresolved++; return; }
        if (existingPhones.has(resolvedPhone) && resolvedPhone !== phone) { stats.skipped_duplicate++; return; }

        const { error } = await supabaseAdmin.from('whatsapp_contacts')
          .update({ phone_number: resolvedPhone, updated_at: new Date().toISOString() })
          .eq('id', contact.id);
        if (error) { stats.failed++; return; }
        existingPhones.delete(phone);
        existingPhones.add(resolvedPhone);
        stats.renamed++;
        await fetchProfileAndUpdate(contact.id, resolvedPhone);
      } catch (_) {
        stats.failed++;
      }
    }

    const work = (async () => {
      const started = Date.now();
      let cursor = 0;
      let processed = 0;
      const worker = async () => {
        while (cursor < contactsToFix.length && Date.now() - started < BUDGET_MS) {
          const c = contactsToFix[cursor++];
          await fixOne(c);
          processed++;
        }
      };
      await Promise.all(Array.from({ length: CONCURRENCY }, worker));
      console.log('[fix-contact-names] done', instance.instance_name, { total: contactsToFix.length, processed, ...stats });
    })();

    // @ts-ignore EdgeRuntime existe no ambiente das funções
    if (typeof EdgeRuntime !== 'undefined' && EdgeRuntime?.waitUntil) {
      // @ts-ignore
      EdgeRuntime.waitUntil(work);
      return json({ background: true, total: contactsToFix.length });
    }
    await work;
    return json({ background: false, total: contactsToFix.length, ...stats });
  } catch (error) {
    console.error('[fix-contact-names] Unexpected error:', error);
    return json({ error: 'Erro inesperado ao corrigir os contatos.' }, 500);
  }
});
