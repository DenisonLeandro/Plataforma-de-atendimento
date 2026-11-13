import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { fetchWithTimeout } from "../_shared/fetch-with-timeout.ts";
import { authorizeInstanceAction } from "../_shared/instance-auth.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Heurística: phone_number puramente numérico, comprimento >= 14 (telefones
// reais BR têm 12-13). Casos como Brasil/EUA com DDI nunca chegam a 14 dígitos.
function looksLikeLid(phone: string): boolean {
  if (!phone) return false;
  if (!/^\d+$/.test(phone)) return false;
  return phone.length >= 14;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const { instanceId, dryRun } = await req.json().catch(() => ({}));
    if (!instanceId) {
      return new Response(JSON.stringify({ error: 'Informe a instância.' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const token = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '').trim();
    const { data: { user } } = token ? await supabase.auth.getUser(token) : { data: { user: null } };
    if (!user) {
      return new Response(JSON.stringify({ error: 'Sessão expirada. Entre novamente.' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    // Super admin, ou admin/supervisor da empresa dona da instância.
    const { data: isSuper } = await supabase.rpc('is_super_admin', { _user_id: user.id });
    if (!isSuper) {
      const auth = await authorizeInstanceAction(supabase, req, instanceId);
      if (!auth.ok) {
        return new Response(JSON.stringify({ error: auth.status === 404 ? 'Você não tem permissão para esta empresa ou instância.' : auth.error }), {
          status: auth.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }

    const { data: instance } = await supabase
      .from('whatsapp_instances')
      .select('instance_name, provider_type, instance_id_external')
      .eq('id', instanceId)
      .single();
    if (!instance) {
      return new Response(JSON.stringify({ error: 'Instance not found' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const { data: secrets } = await supabase
      .from('whatsapp_instance_secrets')
      .select('api_key, api_url')
      .eq('instance_id', instanceId)
      .single();

    const baseUrl = secrets?.api_url?.replace(/\/$/, '') ?? '';
    const apiKey = secrets?.api_key ?? '';
    const identifier = (instance as any).provider_type === 'cloud' && (instance as any).instance_id_external
      ? (instance as any).instance_id_external
      : instance.instance_name;

    // 1) Carrega todas as conversas + contato da instância
    const { data: convs, error: convErr } = await supabase
      .from('whatsapp_conversations')
      .select('id, contact_id, last_message_at, last_message_preview, assigned_to, status, unread_count, last_message_is_from_me, whatsapp_contacts!inner(id, phone_number, name)')
      .eq('instance_id', instanceId);
    if (convErr) throw convErr;

    // Conta mensagens por conv
    const convIds = (convs ?? []).map((c: any) => c.id);
    const msgCounts = new Map<string, number>();
    if (convIds.length) {
      // Para não estourar URL, processa em batches
      const batch = 100;
      for (let i = 0; i < convIds.length; i += batch) {
        const chunk = convIds.slice(i, i + batch);
        const { data: rows } = await supabase
          .from('whatsapp_messages')
          .select('conversation_id')
          .in('conversation_id', chunk);
        for (const r of (rows ?? []) as Array<{ conversation_id: string }>) {
          msgCounts.set(r.conversation_id, (msgCounts.get(r.conversation_id) ?? 0) + 1);
        }
      }
    }

    // 2) Identifica @lid órfãs (sem mensagens) e potenciais gêmeas
    const lidConvs: any[] = [];
    const realConvs: any[] = [];
    for (const c of (convs ?? []) as any[]) {
      const phone = c.whatsapp_contacts.phone_number as string;
      const msgs = msgCounts.get(c.id) ?? 0;
      if (looksLikeLid(phone) && msgs === 0) lidConvs.push(c);
      else realConvs.push({ ...c, _msgs: msgs });
    }

    let merged = 0;
    let renamed = 0;
    let unresolved = 0;
    const report: any[] = [];

    // Funde `from` em `into`: mensagens repetidas (mesmo id do WhatsApp) são
    // apagadas da duplicata; as demais migram para a conversa original.
    async function mergeInto(from: any, into: any) {
      const { data: intoIds } = await supabase
        .from('whatsapp_messages').select('message_id').eq('conversation_id', into.id).limit(5000);
      const have = new Set(((intoIds ?? []) as any[]).map((r) => r.message_id));
      const { data: fromRows } = await supabase
        .from('whatsapp_messages').select('id, message_id').eq('conversation_id', from.id).limit(5000);
      const dupIds = ((fromRows ?? []) as any[]).filter((r) => have.has(r.message_id)).map((r) => r.id);
      for (let i = 0; i < dupIds.length; i += 200) {
        await supabase.from('whatsapp_messages').delete().in('id', dupIds.slice(i, i + 200));
      }
      await supabase.from('whatsapp_messages').update({ conversation_id: into.id }).eq('conversation_id', from.id);
      for (const t of ['whatsapp_reactions', 'conversation_assignments', 'whatsapp_conversation_notes',
        'whatsapp_conversation_summaries', 'whatsapp_sentiment_analysis', 'whatsapp_sentiment_history',
        'whatsapp_message_edit_history', 'whatsapp_topics_history']) {
        await supabase.from(t).update({ conversation_id: into.id }).eq('conversation_id', from.id);
      }
      if (from.last_message_at && (!into.last_message_at || new Date(from.last_message_at) > new Date(into.last_message_at))) {
        await supabase.from('whatsapp_conversations').update({
          last_message_at: from.last_message_at,
          last_message_preview: from.last_message_preview,
          last_message_is_from_me: from.last_message_is_from_me,
        }).eq('id', into.id);
      }
      const lid = from.whatsapp_contacts?.phone_number;
      if (lid && looksLikeLid(lid)) {
        const { data: ct } = await supabase.from('whatsapp_contacts').select('metadata').eq('id', into.contact_id).maybeSingle();
        await supabase.from('whatsapp_contacts').update({ metadata: { ...(ct?.metadata || {}), lid } }).eq('id', into.contact_id);
      }
      await supabase.from('whatsapp_conversations').delete().eq('id', from.id);
      await supabase.from('whatsapp_contacts').delete().eq('id', from.contact_id);
    }

    // 2b) Conversas @lid COM mensagens que repetem mensagens de outra conversa
    // da mesma instância: são a mesma pessoa vista pelo número interno (ex.:
    // criadas pela sincronização de histórico). Funde na conversa mais antiga.
    let mergedByMessages = 0;
    const byId = new Map(((convs ?? []) as any[]).map((c) => [c.id, c]));
    const removed = new Set<string>();
    for (const c of realConvs) {
      if (removed.has(c.id)) continue;
      if (!looksLikeLid(c.whatsapp_contacts.phone_number) || !c._msgs) continue;
      const { data: mine } = await supabase
        .from('whatsapp_messages').select('message_id').eq('conversation_id', c.id).limit(50);
      const ids = ((mine ?? []) as any[]).map((r) => r.message_id);
      if (!ids.length) continue;
      const { data: others } = await supabase
        .from('whatsapp_messages').select('conversation_id').in('message_id', ids).neq('conversation_id', c.id).limit(50);
      const candidates = [...new Set(((others ?? []) as any[]).map((r) => r.conversation_id))]
        .map((id) => byId.get(id))
        .filter((x: any) => x && !removed.has(x.id))
        // Prefere número real; depois a conversa mais antiga.
        .sort((a: any, b: any) => Number(looksLikeLid(a.whatsapp_contacts.phone_number)) - Number(looksLikeLid(b.whatsapp_contacts.phone_number)));
      const twin = candidates[0];
      if (!twin) continue;
      report.push({ orphanConvId: c.id, orphanPhone: c.whatsapp_contacts.phone_number, action: 'merge_duplicate', twinConvId: twin.id, twinPhone: twin.whatsapp_contacts.phone_number });
      if (!dryRun) await mergeInto(c, twin);
      removed.add(c.id);
      mergedByMessages++;
    }

    for (const orphan of lidConvs) {
      const orphanPhone = orphan.whatsapp_contacts.phone_number;
      // a) procura gêmea local: mesma instância, last_message_at idêntico e preview idêntico
      let twin = realConvs.find((r) =>
        r.last_message_at && orphan.last_message_at &&
        new Date(r.last_message_at).getTime() === new Date(orphan.last_message_at).getTime() &&
        (r.last_message_preview ?? '') === (orphan.last_message_preview ?? '') &&
        r.contact_id !== orphan.contact_id
      );

      // b) fallback: tenta resolver pela Evolution (best-effort, pode falhar)
      let resolvedJid: string | null = null;
      if (!twin && baseUrl && apiKey) {
        try {
          const r = await fetchWithTimeout(
            `${baseUrl}/chat/findContacts/${identifier}`,
            {
              timeout: 15000,
              method: 'POST',
              headers: { apikey: apiKey, 'Content-Type': 'application/json' },
              body: JSON.stringify({ where: { id: `${orphanPhone}@lid` } }),
            },
          );
          if (r.ok) {
            const arr = await r.json().catch(() => null);
            const c0 = Array.isArray(arr) ? arr[0] : null;
            const candidate = c0?.lid || c0?.jid || c0?.remoteJid || c0?.id;
            if (typeof candidate === 'string' && candidate.includes('@s.whatsapp.net')) {
              resolvedJid = candidate.split('@')[0];
            }
          }
        } catch (_) { /* ignore */ }
        if (resolvedJid) {
          twin = realConvs.find((r) => r.whatsapp_contacts.phone_number === resolvedJid);
        }
      }

      if (twin) {
        report.push({ orphanConvId: orphan.id, orphanPhone, action: 'merge', twinConvId: twin.id, twinPhone: twin.whatsapp_contacts.phone_number, twinName: twin.whatsapp_contacts.name });
        if (!dryRun) await mergeInto(orphan, twin);
        merged++;
      } else if (resolvedJid) {
        report.push({ orphanConvId: orphan.id, orphanPhone, action: 'rename', newPhone: resolvedJid });
        if (!dryRun) {
          await supabase.from('whatsapp_contacts').update({ phone_number: resolvedJid }).eq('id', orphan.contact_id);
        }
        renamed++;
      } else {
        report.push({ orphanConvId: orphan.id, orphanPhone, action: 'unresolved' });
        unresolved++;
      }
    }

    return new Response(JSON.stringify({
      success: true,
      dryRun: !!dryRun,
      stats: { totalOrphans: lidConvs.length, merged: merged + mergedByMessages, mergedByMessages, renamed, unresolved },
      report,
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (error) {
    console.error('[resolve-lid-conversations] Erro:', error);
    const msg = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: msg }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});