import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.85.0';
import { fetchWithTimeout } from '../_shared/fetch-with-timeout.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface EditMessageRequest {
  messageId: string;
  conversationId: string;
  newContent: string;
}

// Helper function to get Evolution API auth headers based on provider type
function getEvolutionAuthHeaders(apiKey: string, providerType: string): Record<string, string> {
  // Evolution Cloud confirmou: ambos usam header 'apikey'
  return { apikey: apiKey };
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const body: EditMessageRequest = await req.json();

    // Validate request
    if (!body.messageId || !body.conversationId || !body.newContent) {
      return new Response(
        JSON.stringify({ success: false, error: 'messageId, conversationId, and newContent are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get conversation and instance details including provider_type
    const { data: conversation, error: convError } = await supabase
      .from('whatsapp_conversations')
      .select(`
        *,
        whatsapp_contacts!inner (phone_number),
        whatsapp_instances!inner (id, instance_name, provider_type)
      `)
      .eq('id', body.conversationId)
      .single();

    if (convError || !conversation) {
      console.error('[edit-message] Conversation not found:', convError);
      return new Response(JSON.stringify({ success: false, error: 'Conversation not found' }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Fetch instance secrets
    const { data: secrets, error: secretsError } = await supabase
      .from('whatsapp_instance_secrets')
      .select('api_url, api_key')
      .eq('instance_id', (conversation as any).whatsapp_instances.id)
      .single();

    if (secretsError || !secrets) {
      console.error('[edit-message] Failed to fetch instance secrets:', secretsError);
      return new Response(JSON.stringify({ success: false, error: 'Instance secrets not found' }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Get message details
    const { data: message, error: msgError } = await supabase
      .from('whatsapp_messages')
      .select('*')
      .eq('message_id', body.messageId)
      .eq('conversation_id', body.conversationId)
      .single();

    if (msgError || !message) {
      console.error('[edit-message] Message not found:', msgError);
      return new Response(JSON.stringify({ success: false, error: 'Mensagem não encontrada' }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Check if message is from the user
    if (!message.is_from_me) {
      return new Response(
        JSON.stringify({ success: false, error: 'Você só pode editar suas próprias mensagens' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check 15-minute edit window
    const messageTime = new Date(message.timestamp).getTime();
    const now = Date.now();
    const fifteenMinutes = 15 * 60 * 1000;

    if (now - messageTime > fifteenMinutes) {
      return new Response(
        JSON.stringify({ success: false, error: 'Mensagens só podem ser editadas em até 15 minutos após o envio' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Build Evolution API request
    let baseUrl = secrets.api_url.endsWith('/') ? secrets.api_url.slice(0, -1) : secrets.api_url;
    baseUrl = baseUrl.replace(/\/manager$/, '');

    const endpoint = `${baseUrl}/chat/updateMessage/${(conversation as any).whatsapp_instances.instance_name}`;

    // Evolution valida que `number` (após createJid) bate com key.remoteJid.
    // Para conversas @lid, o key.remoteJid original é @lid, mas nós armazenamos
    // o remote_jid normalizado como @s.whatsapp.net. O JID técnico correto vive
    // em metadata.ack_remote_jid (quando disponível). Tentamos os candidatos
    // em ordem até um funcionar.
    const ackJid = (message.metadata as any)?.ack_remote_jid as string | undefined;
    const candidates: string[] = [];
    if (ackJid) candidates.push(ackJid);
    if (message.remote_jid && !candidates.includes(message.remote_jid)) {
      candidates.push(message.remote_jid);
    }

    const providerType = (conversation as any).whatsapp_instances.provider_type || 'self_hosted';
    const authHeaders = getEvolutionAuthHeaders(secrets.api_key, providerType);

    let evolutionOk = false;
    let lastStatus = 0;
    let lastBody = '';
    for (const jid of candidates) {
      const requestBody = {
        number: jid,
        text: body.newContent,
        key: {
          remoteJid: jid,
          fromMe: true,
          id: body.messageId,
        },
      };
      console.log('[edit-whatsapp-message] attempt', {
        endpoint,
        instance: (conversation as any).whatsapp_instances.instance_name,
        messageId: body.messageId,
        jid,
      });
      try {
        const evolutionResponse = await fetchWithTimeout(endpoint, {
          timeout: 15000,
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...authHeaders },
          body: JSON.stringify(requestBody),
        });
        if (evolutionResponse.ok) {
          await evolutionResponse.text().catch(() => '');
          evolutionOk = true;
          console.log('[edit-whatsapp-message] Evolution accepted with jid=', jid);
          break;
        }
        lastStatus = evolutionResponse.status;
        lastBody = (await evolutionResponse.text().catch(() => '')).slice(0, 500);
        console.error('[edit-whatsapp-message] Evolution rejected', {
          jid,
          status: lastStatus,
          body: lastBody,
        });
      } catch (err) {
        lastStatus = 0;
        lastBody = err instanceof Error ? err.message : String(err);
        console.error('[edit-whatsapp-message] Evolution fetch error', { jid, err: lastBody });
      }
    }

    if (!evolutionOk) {
      return new Response(
        JSON.stringify({
          success: false,
          error: `Falha ao editar mensagem no WhatsApp${lastBody ? `: ${lastBody}` : ''}`,
          code: 'EVOLUTION_REJECTED',
          evolutionStatus: lastStatus,
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('[edit-whatsapp-message] Message edited successfully in Evolution API');

    // Save previous version to edit history
    const { error: historyError } = await supabase
      .from('whatsapp_message_edit_history')
      .insert({
        message_id: body.messageId,
        conversation_id: body.conversationId,
        previous_content: message.content,
        edited_at: new Date().toISOString(),
      });

    if (historyError) {
      console.error('[edit-whatsapp-message] Error saving edit history:', historyError);
    }

    // Update message in database
    const originalContent = message.original_content || message.content;
    
    const { data: updatedMessage, error: updateError } = await supabase
      .from('whatsapp_messages')
      .update({
        content: body.newContent,
        original_content: originalContent,
        edited_at: new Date().toISOString(),
      })
      .eq('message_id', body.messageId)
      .eq('conversation_id', body.conversationId)
      .select()
      .single();

    if (updateError) {
      console.error('[edit-whatsapp-message] Error updating message:', updateError);
      return new Response(
        JSON.stringify({ success: false, error: 'Erro ao atualizar mensagem no banco de dados', code: 'DB_UPDATE_FAILED' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('[edit-whatsapp-message] Message updated in database:', updatedMessage.id);

    return new Response(
      JSON.stringify({ success: true, message: updatedMessage }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[edit-whatsapp-message] Unexpected error:', error);
    const msg = error instanceof Error ? error.message : 'Erro interno do servidor';
    return new Response(
      JSON.stringify({ success: false, error: msg, code: 'UNEXPECTED' }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});