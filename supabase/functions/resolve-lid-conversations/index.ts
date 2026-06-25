import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { fetchWithTimeout } from "../_shared/fetch-with-timeout.ts";

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

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const { data: isAdmin } = await supabase.rpc('has_role', { _user_id: user.id, _role: 'admin' });
    if (!isAdmin) {
      return new Response(JSON.stringify({ error: 'Forbidden' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { instanceId, dryRun } = await req.json().catch(() => ({}));
    if (!instanceId) {
      return new Response(JSON.stringify({ error: 'instanceId required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
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
        if (!dryRun) {
          // Move mensagens e dados relacionados para a gêmea
          await supabase.from('whatsapp_messages').update({ conversation_id: twin.id }).eq('conversation_id', orphan.id);
          await supabase.from('whatsapp_reactions').update({ conversation_id: twin.id }).eq('conversation_id', orphan.id);
          await supabase.from('conversation_assignments').update({ conversation_id: twin.id }).eq('conversation_id', orphan.id);
          await supabase.from('whatsapp_conversation_notes').update({ conversation_id: twin.id }).eq('conversation_id', orphan.id);
          await supabase.from('whatsapp_conversation_summaries').update({ conversation_id: twin.id }).eq('conversation_id', orphan.id);
          await supabase.from('whatsapp_sentiment_analysis').update({ conversation_id: twin.id }).eq('conversation_id', orphan.id);
          await supabase.from('whatsapp_sentiment_history').update({ conversation_id: twin.id }).eq('conversation_id', orphan.id);
          await supabase.from('whatsapp_message_edit_history').update({ conversation_id: twin.id }).eq('conversation_id', orphan.id);
          await supabase.from('whatsapp_topics_history').update({ conversation_id: twin.id }).eq('conversation_id', orphan.id);

          // Se a órfã estiver mais "fresca" copia metadados para a gêmea
          if (orphan.last_message_at && (!twin.last_message_at || new Date(orphan.last_message_at) > new Date(twin.last_message_at))) {
            await supabase.from('whatsapp_conversations').update({
              last_message_at: orphan.last_message_at,
              last_message_preview: orphan.last_message_preview,
              last_message_is_from_me: orphan.last_message_is_from_me,
              unread_count: (twin.unread_count ?? 0) + (orphan.unread_count ?? 0),
              status: orphan.status ?? twin.status,
              assigned_to: twin.assigned_to ?? orphan.assigned_to,
            }).eq('id', twin.id);
          }

          // Apaga órfã e seu contato lid
          await supabase.from('whatsapp_conversations').delete().eq('id', orphan.id);
          await supabase.from('whatsapp_contacts').delete().eq('id', orphan.contact_id);
        }
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
      stats: { totalOrphans: lidConvs.length, merged, renamed, unresolved },
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