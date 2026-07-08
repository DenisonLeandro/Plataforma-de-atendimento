import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.85.0';
import { fetchWithTimeout } from '../_shared/fetch-with-timeout.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ReactionRequest {
  conversationId: string;
  messageId: string; // whatsapp key.id of the target message
  emoji: string;     // '' to remove
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get('Authorization') || '';
    const token = authHeader.replace(/^Bearer\s+/i, '');
    if (!token) {
      return json({ success: false, error: 'Missing auth' }, 401);
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const { data: userData, error: userErr } = await supabase.auth.getUser(token);
    if (userErr || !userData?.user) {
      return json({ success: false, error: 'Invalid session' }, 401);
    }
    const userId = userData.user.id;

    const body: ReactionRequest = await req.json();
    if (!body.conversationId || !body.messageId) {
      return json({ success: false, error: 'conversationId and messageId are required' }, 400);
    }

    // Load target message + conversation + instance
    const { data: message, error: msgErr } = await supabase
      .from('whatsapp_messages')
      .select('id, message_id, remote_jid, is_from_me, conversation_id, whatsapp_conversations!inner(id, instance_id, whatsapp_instances!inner(id, instance_name, provider_type, instance_id_external))')
      .eq('conversation_id', body.conversationId)
      .eq('message_id', body.messageId)
      .maybeSingle();

    if (msgErr || !message) {
      return json({ success: false, error: 'Message not found' }, 404);
    }

    const instance = (message as any).whatsapp_conversations.whatsapp_instances;
    const { data: secrets, error: secretsErr } = await supabase
      .from('whatsapp_instance_secrets')
      .select('api_url, api_key')
      .eq('instance_id', instance.id)
      .single();
    if (secretsErr || !secrets) {
      return json({ success: false, error: 'Instance secrets not found' }, 404);
    }

    const instanceIdentifier = instance.provider_type === 'cloud' && instance.instance_id_external
      ? instance.instance_id_external
      : instance.instance_name;

    const baseUrl = (secrets.api_url.endsWith('/') ? secrets.api_url.slice(0, -1) : secrets.api_url).replace(/\/manager$/, '');

    const evolutionBody = {
      key: {
        remoteJid: (message as any).remote_jid,
        fromMe: (message as any).is_from_me,
        id: (message as any).message_id,
      },
      reaction: body.emoji || '',
    };

    const resp = await fetchWithTimeout(`${baseUrl}/message/sendReaction/${instanceIdentifier}`, {
      timeout: 15000,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: secrets.api_key },
      body: JSON.stringify(evolutionBody),
    });

    const respText = await resp.text();
    if (!resp.ok) {
      console.error('[send-whatsapp-reaction] Evolution error', resp.status, respText);
      return json(
        { success: false, error: `Evolution API (${resp.status}): ${respText || 'falha ao enviar reação'}` },
        502,
      );
    }

    // Persist / remove agent reaction row
    if (!body.emoji) {
      await supabase
        .from('whatsapp_reactions')
        .delete()
        .eq('message_id', body.messageId)
        .eq('user_id', userId);
    } else {
      const { data: existing, error: selErr } = await supabase
        .from('whatsapp_reactions')
        .select('id')
        .eq('message_id', body.messageId)
        .eq('user_id', userId)
        .maybeSingle();
      if (selErr) {
        console.error('[send-whatsapp-reaction] DB select error', selErr);
        return json({ success: false, error: selErr.message }, 500);
      }
      if (existing) {
        const { error: updErr } = await supabase
          .from('whatsapp_reactions')
          .update({ emoji: body.emoji })
          .eq('id', existing.id);
        if (updErr) {
          console.error('[send-whatsapp-reaction] DB update error', updErr);
          return json({ success: false, error: updErr.message }, 500);
        }
      } else {
        const { error: insErr } = await supabase
          .from('whatsapp_reactions')
          .insert({
            message_id: body.messageId,
            conversation_id: body.conversationId,
            emoji: body.emoji,
            reactor_jid: `agent:${userId}`,
            is_from_me: true,
            user_id: userId,
          });
        if (insErr) {
          console.error('[send-whatsapp-reaction] DB insert error', insErr);
          return json({ success: false, error: insErr.message }, 500);
        }
      }
    }

    return json({ success: true });
  } catch (err) {
    console.error('[send-whatsapp-reaction] Unexpected', err);
    const message = err instanceof Error ? err.message : 'Internal error';
    return json({ success: false, error: message }, 500);
  }
});

function json(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}