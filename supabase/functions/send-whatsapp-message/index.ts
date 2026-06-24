import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.85.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface SendMessageRequest {
  conversationId: string;
  content?: string;
  messageType: 'text' | 'image' | 'audio' | 'video' | 'document';
  mediaUrl?: string;
  mediaBase64?: string;
  mediaMimetype?: string;
  fileName?: string;
  quotedMessageId?: string;
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

    const body: SendMessageRequest = await req.json();
    console.log('[send-whatsapp-message] Request received:', { 
      conversationId: body.conversationId, 
      messageType: body.messageType 
    });

    // Validate request
    if (!body.conversationId || !body.messageType) {
      return new Response(
        JSON.stringify({ success: false, error: 'conversationId and messageType are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (body.messageType === 'text' && !body.content) {
      return new Response(
        JSON.stringify({ success: false, error: 'content is required for text messages' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (body.messageType !== 'text' && !body.mediaUrl && !body.mediaBase64) {
      return new Response(
        JSON.stringify({ success: false, error: 'mediaUrl or mediaBase64 is required for media messages' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get conversation details including instance info and provider_type
    const { data: conversation, error: convError } = await supabase
      .from('whatsapp_conversations')
      .select(`
        *,
        whatsapp_contacts!inner (
          phone_number,
          name
        ),
        whatsapp_instances!inner (
          id,
          instance_name,
          provider_type,
          instance_id_external
        )
      `)
      .eq('id', body.conversationId)
      .single();

    if (convError || !conversation) {
      console.error('[send] Conversation not found:', convError);
      return new Response(JSON.stringify({ success: false, error: 'Conversation not found' }), {
        status: 404,
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
      console.error('[send] Failed to fetch instance secrets:', secretsError);
      return new Response(JSON.stringify({ success: false, error: 'Instance secrets not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const instanceName = (conversation as any).whatsapp_instances.instance_name;
    const providerType = (conversation as any).whatsapp_instances.provider_type || 'self_hosted';
    const instanceIdExternal = (conversation as any).whatsapp_instances.instance_id_external;
    const contact = (conversation as any).whatsapp_contacts;

    // For Cloud, use instance_id_external (UUID) instead of instance_name
    const instanceIdentifier = providerType === 'cloud' && instanceIdExternal
      ? instanceIdExternal
      : instanceName;

    console.log('[send-whatsapp-message] Sending to:', contact.phone_number, 'Provider:', providerType, 'Instance:', instanceIdentifier);

    const instanceRowId = (conversation as any).whatsapp_instances.id;
    const baseEvolutionUrl = (secrets.api_url.endsWith('/') ? secrets.api_url.slice(0, -1) : secrets.api_url).replace(/\/manager$/, '');

    // Pré-check do socket Baileys: a Evolution às vezes mantém a instância como
    // "open" mas o socket interno está fechado, e o sendText devolve
    // "Error: Connection Closed". Antes de enviar, conferimos o estado e, se
    // estiver fechado, tentamos um connect leve para reabrir o socket.
    try {
      const stateResp = await fetch(`${baseEvolutionUrl}/instance/connectionState/${instanceIdentifier}`, {
        headers: { apikey: secrets.api_key },
      });
      if (stateResp.ok) {
        const stateText = await stateResp.text();
        let stateData: any = {};
        if (stateText) { try { stateData = JSON.parse(stateText); } catch {} }
        const s = stateData?.state ?? stateData?.instance?.state;
        if (s === 'close' || s === 'closed') {
          console.warn('[send-whatsapp-message] Socket fechado, tentando reabrir antes do envio');
          await fetch(`${baseEvolutionUrl}/instance/connect/${instanceIdentifier}`, {
            headers: { apikey: secrets.api_key },
          }).catch(() => null);
          await new Promise((r) => setTimeout(r, 1500));
        }
      }
    } catch (e) {
      console.warn('[send-whatsapp-message] Pré-check de estado falhou (ignorado):', e);
    }

    // Determine destination number format
    const destinationNumber = getDestinationNumber(contact.phone_number);

    // Para mensagens de mídia, baixamos o arquivo do Storage e enviamos como
    // base64. Isso evita que o envio falhe quando a Evolution API não consegue
    // acessar a URL pública do Supabase (causa comum do "arquivo somindo").
    if (
      body.messageType !== 'text' &&
      !body.mediaBase64 &&
      body.mediaUrl
    ) {
      try {
        body.mediaBase64 = await fetchMediaAsBase64(body.mediaUrl, supabase);
        console.log('[send-whatsapp-message] Media converted to base64, length:', body.mediaBase64.length);
      } catch (mediaError) {
        // Bucket é privado: sem base64 a Evolution não consegue baixar o arquivo.
        console.error('[send-whatsapp-message] Failed to convert media to base64:', mediaError);
        return new Response(
          JSON.stringify({
            success: false,
            error: `Não foi possível ler o arquivo do storage: ${mediaError instanceof Error ? mediaError.message : 'erro desconhecido'}`,
          }),
          { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    // Build request for Evolution API
    const { endpoint, requestBody } = buildEvolutionRequest(
      secrets.api_url,
      instanceIdentifier,
      destinationNumber,
      body
    );

    console.log('[send-whatsapp-message] Evolution API endpoint:', endpoint);

    // Get correct auth headers based on provider type
    const authHeaders = getEvolutionAuthHeaders(secrets.api_key, providerType);

    // Função de envio (usada para o envio inicial e para o retry após recuperar o socket)
    const doSend = async () => {
      const r = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders },
        body: JSON.stringify(requestBody),
      });
      const txt = await r.text();
      return { ok: r.ok, status: r.status, text: txt };
    };

    let attempt = await doSend();

    // Se a Evolution devolveu "Connection Closed", o socket Baileys caiu.
    // Tentamos reabrir uma vez via /instance/connect e reenviar.
    const looksLikeConnectionClosed = (txt: string) =>
      /Connection\s*Closed/i.test(txt || '');

    if (!attempt.ok && looksLikeConnectionClosed(attempt.text)) {
      console.warn('[send-whatsapp-message] Connection Closed no envio, tentando recuperar socket e reenviar');
      try {
        await fetch(`${baseEvolutionUrl}/instance/connect/${instanceIdentifier}`, {
          headers: { apikey: secrets.api_key },
        }).catch(() => null);
        // marca instância como "connecting" para refletir o estado real
        await supabase
          .from('whatsapp_instances')
          .update({ status: 'connecting', updated_at: new Date().toISOString() })
          .eq('id', instanceRowId);
        await new Promise((r) => setTimeout(r, 2500));
        attempt = await doSend();
      } catch (e) {
        console.error('[send-whatsapp-message] Falha ao tentar recuperar socket:', e);
      }
    }

    if (!attempt.ok) {
      console.error('[send-whatsapp-message] Evolution API error:', attempt.status, attempt.text);

      // Mensagem amigável quando for o caso clássico do socket fechado
      const friendly = looksLikeConnectionClosed(attempt.text)
        ? 'A conexão com o WhatsApp caiu nesta instância (socket fechado). Vá em Configurações → Instâncias e clique em "Reconectar". Se persistir, leia o QR Code novamente.'
        : `Evolution API (${attempt.status}): ${attempt.text || 'falha ao enviar mensagem'}`;

      // Sincroniza o status no banco quando for connection closed
      if (looksLikeConnectionClosed(attempt.text)) {
        await supabase
          .from('whatsapp_instances')
          .update({ status: 'connecting', updated_at: new Date().toISOString() })
          .eq('id', instanceRowId)
          .catch?.(() => null);
      }

      return new Response(
        JSON.stringify({ success: false, error: friendly, code: looksLikeConnectionClosed(attempt.text) ? 'CONNECTION_CLOSED' : 'EVOLUTION_ERROR' }),
        { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const evolutionData = attempt.text ? JSON.parse(attempt.text) : {};
    console.log('[send-whatsapp-message] Evolution API response:', evolutionData);

    // Extract message ID from Evolution API response
    const messageId = evolutionData.key?.id || `msg_${Date.now()}`;

    // Extract media URL from Evolution API response
    let extractedMediaUrl: string | null = null;
    
    if (body.messageType === 'audio' && evolutionData.message?.audioMessage?.url) {
      extractedMediaUrl = evolutionData.message.audioMessage.url;
    } else if (body.messageType === 'image' && evolutionData.message?.imageMessage?.url) {
      extractedMediaUrl = evolutionData.message.imageMessage.url;
    } else if (body.messageType === 'video' && evolutionData.message?.videoMessage?.url) {
      extractedMediaUrl = evolutionData.message.videoMessage.url;
    } else if (body.messageType === 'document' && evolutionData.message?.documentMessage?.url) {
      extractedMediaUrl = evolutionData.message.documentMessage.url;
    }

    if (extractedMediaUrl) {
      console.log('[send-whatsapp-message] Extracted media URL:', extractedMediaUrl);
    }

    // Save message to database
    const messageContent = body.messageType === 'text' 
      ? (body.content || '') 
      : (body.content || `Sent ${body.messageType}`);

    // UPSERT em vez de INSERT: a Evolution dispara um webhook (messages.upsert)
    // com o MESMO message_id da mensagem que acabamos de enviar. Se o webhook
    // gravar a linha primeiro, um INSERT aqui violaria UNIQUE(conversation_id,
    // message_id) e a mensagem apareceria como "falhou" mesmo já tendo sido
    // entregue. Com onConflict apenas atualizamos a linha existente.
    const { data: savedMessage, error: saveError } = await supabase
      .from('whatsapp_messages')
      .upsert({
        conversation_id: body.conversationId,
        message_id: messageId,
        remote_jid: contact.phone_number,
        content: messageContent,
        message_type: body.messageType,
        // Preferimos a nossa cópia no Storage (renderizável via signed URL). O
        // extractedMediaUrl é o link cru do CDN do WhatsApp (.enc), que o
        // frontend trata como "mídia indisponível" — só serve de fallback
        // quando não temos URL própria (ex.: áudio gravado enviado em base64).
        media_url: body.mediaUrl || extractedMediaUrl || null,
        media_mimetype: body.mediaMimetype || null,
        status: 'sent',
        is_from_me: true,
        timestamp: new Date().toISOString(),
        quoted_message_id: body.quotedMessageId || null,
        metadata: {
          fileName: body.fileName,
        },
      }, {
        onConflict: 'conversation_id,message_id',
      })
      .select()
      .single();

    if (saveError) {
      console.error('[send-whatsapp-message] Error saving message:', saveError);
      return new Response(
        JSON.stringify({ success: false, error: `Failed to save message: ${saveError.message}` }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Update conversation metadata
    await supabase
      .from('whatsapp_conversations')
      .update({
        last_message_at: new Date().toISOString(),
        last_message_preview: messageContent.substring(0, 100),
        updated_at: new Date().toISOString(),
      })
      .eq('id', body.conversationId);

    console.log('[send-whatsapp-message] Message sent and saved:', savedMessage.id);

    return new Response(
      JSON.stringify({ success: true, message: savedMessage }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[send-whatsapp-message] Unexpected error:', error);
    const message = error instanceof Error ? error.message : 'Internal server error';
    return new Response(
      JSON.stringify({ success: false, error: message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

async function fetchMediaAsBase64(url: string, supabase: any): Promise<string> {
  let bytes: Uint8Array | null = null;

  // Se for uma URL do Supabase Storage, baixa autenticado (bucket pode ser privado)
  const storageMatch = url.match(/\/storage\/v1\/object\/(?:public|sign|authenticated)\/([^/]+)\/(.+?)(\?|$)/);
  if (storageMatch) {
    const bucket = storageMatch[1];
    const path = decodeURIComponent(storageMatch[2]);
    const { data, error } = await supabase.storage.from(bucket).download(path);
    if (error || !data) {
      throw new Error(`Storage download failed: ${error?.message || 'no data'}`);
    }
    bytes = new Uint8Array(await data.arrayBuffer());
  } else {
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`Failed to fetch media: ${res.status}`);
    }
    bytes = new Uint8Array(await res.arrayBuffer());
  }

  // Converte em chunks para não estourar o stack do String.fromCharCode
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

function getDestinationNumber(phoneNumber: string): string {
  // If phone ends with @lid (LinkedIn format), use complete format
  if (phoneNumber.includes('@lid')) {
    return phoneNumber;
  }
  // Otherwise, use only digits
  return phoneNumber.replace(/\D/g, '');
}

function buildEvolutionRequest(
  apiUrl: string,
  instanceName: string,
  number: string,
  body: SendMessageRequest
): { endpoint: string; requestBody: any } {
  // Remove trailing slash
  let baseUrl = apiUrl.endsWith('/') ? apiUrl.slice(0, -1) : apiUrl;
  
  // Remove /manager suffix if present (message endpoints are at root level)
  baseUrl = baseUrl.replace(/\/manager$/, '');

  switch (body.messageType) {
    case 'text': {
      const requestBody: any = {
        number,
        text: body.content,
      };

      if (body.quotedMessageId) {
        requestBody.quoted = {
          key: {
            id: body.quotedMessageId,
          },
        };
      }

      return {
        endpoint: `${baseUrl}/message/sendText/${instanceName}`,
        requestBody,
      };
    }

    case 'audio': {
      // Evolution API expects either a plain base64 string or a public URL
      let audioData: string | undefined;

      if (body.mediaBase64) {
        // Strip possible data URI prefix and keep only the base64 payload
        const base64 = body.mediaBase64.startsWith('data:')
          ? body.mediaBase64.split(',')[1] || ''
          : body.mediaBase64;

        audioData = base64;
      } else if (body.mediaUrl) {
        audioData = body.mediaUrl;
      }

      if (!audioData) {
        throw new Error('Missing audio data');
      }

      console.log('[send-whatsapp-message] Audio payload prepared:', {
        type: body.mediaBase64 ? 'base64' : 'url',
        length: audioData.length,
      });
      
      return {
        endpoint: `${baseUrl}/message/sendWhatsAppAudio/${instanceName}`,
        requestBody: {
          number,
          audio: audioData,
        },
      };
    }

    case 'image':
    case 'video':
    case 'document': {
      const requestBody: any = {
        number,
        mediatype: body.messageType,
        media: body.mediaBase64 || body.mediaUrl,
      };

      if (body.content) {
        requestBody.caption = body.content;
      }

      if (body.messageType === 'document' && body.fileName) {
        requestBody.fileName = body.fileName;
      }

      return {
        endpoint: `${baseUrl}/message/sendMedia/${instanceName}`,
        requestBody,
      };
    }

    default:
      throw new Error(`Unsupported message type: ${body.messageType}`);
  }
}
