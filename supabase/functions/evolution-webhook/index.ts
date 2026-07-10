import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import {
  normalizePhoneNumber,
  resolvePhoneJid,
  extractRealPhoneFromKey,
  isLid,
  getMessageType,
  getMessageContent,
  isEditedMessage,
  downloadAndUploadMedia,
} from '../_shared/evolution-helpers.ts';
import { fetchWithTimeout } from '../_shared/fetch-with-timeout.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const WEBHOOK_MAX_ATTEMPTS = 5;
const WEBHOOK_RETRY_BASE_MS = 15_000;
const MEDIA_TYPES = ['audio', 'image', 'video', 'document', 'sticker'];

// Auto sentiment analysis threshold (number of client messages to trigger analysis)
const AUTO_SENTIMENT_THRESHOLD = 5;

// Auto categorization threshold (number of client messages to trigger categorization)
const AUTO_CATEGORIZATION_THRESHOLD = 5;

interface EvolutionWebhookPayload {
  event: string;
  instance: string;
  data: any;
}

async function sha256(value: string): Promise<string> {
  const data = new TextEncoder().encode(value);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function getWebhookMessageId(payload: EvolutionWebhookPayload): string | null {
  return payload?.data?.key?.id
    || payload?.data?.update?.key?.id
    || payload?.data?.message?.key?.id
    || payload?.data?.message?.protocolMessage?.key?.id
    || null;
}

async function findInstanceIdForWebhook(supabase: any, instanceIdentifier: string): Promise<string | null> {
  const { data: byName } = await supabase
    .from('whatsapp_instances')
    .select('id')
    .eq('instance_name', instanceIdentifier)
    .maybeSingle();

  if (byName?.id) return byName.id;

  const { data: byExternalId } = await supabase
    .from('whatsapp_instances')
    .select('id')
    .eq('instance_id_external', instanceIdentifier)
    .maybeSingle();

  return byExternalId?.id ?? null;
}

async function enqueueWebhookEvent(supabase: any, payload: EvolutionWebhookPayload) {
  const raw = JSON.stringify(payload);
  const messageId = getWebhookMessageId(payload);
  const eventKey = `${payload.event}:${payload.instance}:${messageId ?? 'no-message'}:${await sha256(raw)}`;
  const instanceId = await findInstanceIdForWebhook(supabase, payload.instance);

  const { data, error } = await supabase
    .from('whatsapp_webhook_events')
    .insert({
      instance_id: instanceId,
      instance_identifier: payload.instance,
      event: payload.event,
      message_id: messageId,
      event_key: eventKey,
      payload,
      status: 'pending',
    })
    .select('id, status')
    .single();

  if (!error && data) return data;

  // Evolution can retry the same webhook. Keep the first raw event and avoid
  // duplicate message writes, but return its id so a pending/failed event can be kicked again.
  if (error?.code === '23505') {
    const { data: existing } = await supabase
      .from('whatsapp_webhook_events')
      .select('id, status')
      .eq('event_key', eventKey)
      .maybeSingle();
    if (existing) return existing;
  }

  throw new Error(error?.message || 'failed to enqueue webhook event');
}

async function routeWebhookPayload(payload: EvolutionWebhookPayload, supabase: any) {
  switch (payload.event) {
    case 'messages.upsert':
      if (isEditedMessage(payload.data?.message)) {
        await processMessageEdit(payload, supabase);
      } else {
        await processMessageUpsert(payload, supabase);
      }
      break;
    case 'messages.update':
      await processMessageUpdate(payload, supabase);
      break;
    case 'messages.read':
    case 'message.read':
    case 'send.message.read':
      await processMessagesRead(payload, supabase);
      break;
    case 'chats.update':
    case 'chat.update':
      await processChatsUpdate(payload, supabase);
      break;
    case 'connection.update':
      await processConnectionUpdate(payload, supabase);
      break;
    default:
      console.warn('[evolution-webhook] Unhandled event type:', payload.event);
  }
}

async function scheduleWebhookRetry(eventId: string, delayMs: number) {
  await new Promise((resolve) => setTimeout(resolve, delayMs));
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const res = await fetch(`${supabaseUrl}/functions/v1/evolution-webhook`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
    },
    body: JSON.stringify({ internal: true, event_id: eventId }),
  });
  if (!res.ok) {
    console.error('[evolution-webhook] webhook retry self-call failed:', res.status, await res.text().catch(() => ''));
  }
}

async function processStoredWebhookEvent(supabase: any, eventId: string) {
  const { data: locked, error: lockError } = await supabase
    .from('whatsapp_webhook_events')
    .update({ status: 'processing', locked_at: new Date().toISOString() })
    .eq('id', eventId)
    .in('status', ['pending', 'failed'])
    .select('id, payload, attempts')
    .maybeSingle();

  if (lockError) throw new Error(lockError.message);
  if (!locked) return;

  const nextAttempt = (locked.attempts || 0) + 1;
  await supabase
    .from('whatsapp_webhook_events')
    .update({ attempts: nextAttempt })
    .eq('id', eventId);

  try {
    await routeWebhookPayload(locked.payload as EvolutionWebhookPayload, supabase);
    await supabase
      .from('whatsapp_webhook_events')
      .update({
        status: 'processed',
        processed_at: new Date().toISOString(),
        locked_at: null,
        last_error: null,
        next_retry_at: null,
      })
      .eq('id', eventId);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const isDead = nextAttempt >= WEBHOOK_MAX_ATTEMPTS;
    const retryDelay = WEBHOOK_RETRY_BASE_MS * Math.pow(2, Math.max(0, nextAttempt - 1));
    const nextRetryAt = new Date(Date.now() + retryDelay).toISOString();

    await supabase
      .from('whatsapp_webhook_events')
      .update({
        status: isDead ? 'dead_letter' : 'failed',
        last_error: message,
        locked_at: null,
        next_retry_at: isDead ? null : nextRetryAt,
      })
      .eq('id', eventId);

    console.error('[evolution-webhook] Stored event processing failed:', eventId, message);
    if (!isDead) {
      // @ts-ignore EdgeRuntime is provided by Supabase Edge Runtime
      EdgeRuntime.waitUntil(scheduleWebhookRetry(eventId, retryDelay));
    }
  }
}

async function drainWebhookQueue(supabase: any, preferredEventId?: string) {
  if (preferredEventId) {
    await processStoredWebhookEvent(supabase, preferredEventId);
  }

  const now = new Date().toISOString();
  const { data: events } = await supabase
    .from('whatsapp_webhook_events')
    .select('id')
    .in('status', ['pending', 'failed'])
    .or(`next_retry_at.is.null,next_retry_at.lte.${now}`)
    .order('created_at', { ascending: true })
    .limit(5);

  for (const event of events || []) {
    if (event.id === preferredEventId) continue;
    await processStoredWebhookEvent(supabase, event.id);
  }
}

// Fetch and update profile picture in background
async function fetchAndUpdateProfilePicture(
  supabase: any,
  apiUrl: string,
  apiKey: string,
  instanceName: string,
  phoneNumber: string,
  contactId: string,
  instanceId: string,
  providerType: string = 'self_hosted'
): Promise<void> {
  try {
    // Determine correct auth header based on provider type
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (providerType === 'cloud') {
      headers['Authorization'] = `Bearer ${apiKey}`;
    } else {
      headers['apikey'] = apiKey;
    }
    
    const response = await fetchWithTimeout(
      `${apiUrl}/chat/fetchProfile/${instanceName}`,
      {
        timeout: 15000,
        method: 'POST',
        headers,
        body: JSON.stringify({ number: phoneNumber }),
      }
    );

    if (!response.ok) {
      console.warn(`[evolution-webhook] Failed to fetch profile for ${phoneNumber}: ${response.status}`);
      return;
    }

    const data = await response.json();
    const profilePictureUrl = data.profilePictureUrl || data.picture;

    if (profilePictureUrl) {
      // As URLs do CDN do Facebook (scontent.*.fbcdn.net) expiram e passam a dar
      // 403 depois de alguns dias. Baixamos a imagem e guardamos no Storage,
      // gravando o PATH local em vez da URL externa. Se o download falhar,
      // gravamos null (avatar genérico) — nunca uma URL quebrada.
      let storedPath: string | null = null;
      try {
        const imgResp = await fetchWithTimeout(profilePictureUrl, { timeout: 10000 });
        if (imgResp.ok) {
          const contentType = imgResp.headers.get('content-type') || 'image/jpeg';
          const bytes = new Uint8Array(await imgResp.arrayBuffer());
          const path = `${instanceId}/profiles/${phoneNumber}.jpg`;
          const { error: uploadError } = await supabase.storage
            .from('whatsapp-media')
            .upload(path, bytes, { contentType, upsert: true });
          if (uploadError) {
            console.warn(`[evolution-webhook] Falha ao subir foto de perfil pro Storage (${phoneNumber}):`, uploadError.message);
            return; // erro transitório de upload — não sobrescreve o valor atual
          }
          storedPath = path;
        } else {
          console.warn(`[evolution-webhook] Foto de perfil retornou ${imgResp.status} para ${phoneNumber} — gravando sem foto`);
        }
      } catch (e) {
        console.warn(`[evolution-webhook] Falha ao baixar foto de perfil de ${phoneNumber}:`, e instanceof Error ? e.message : e);
      }

      await supabase
        .from('whatsapp_contacts')
        .update({
          profile_picture_url: storedPath,
          updated_at: new Date().toISOString(),
        })
        .eq('id', contactId);

      console.log(`[evolution-webhook] Profile picture ${storedPath ? 'stored in Storage' : 'cleared (download failed)'} for contact: ${contactId}`);
    }
  } catch (error) {
    console.warn('[evolution-webhook] Failed to fetch profile picture:', error);
    // Erro silencioso - cron job vai pegar depois
  }
}

// Find or create contact - only update name if message is FROM contact
async function findOrCreateContact(
  supabase: any,
  instanceId: string,
  phoneNumber: string,
  name: string,
  isGroup: boolean,
  isFromMe: boolean,
  apiUrl?: string,
  apiKey?: string,
  instanceName?: string,
  providerType: string = 'self_hosted',
  lid: string | null = null
): Promise<string | null> {
  try {
    // Gerar variantes do número para números brasileiros
    // Isso trata casos onde contatos existentes podem ter formatos diferentes
    const phoneVariants = [phoneNumber];

    // Se 13 dígitos (com 9), também buscar versão de 12 dígitos
    if (phoneNumber.startsWith('55') && phoneNumber.length === 13) {
      const withoutNinth = phoneNumber.slice(0, 4) + phoneNumber.slice(5);
      phoneVariants.push(withoutNinth);
    }
    // Se 12 dígitos (sem 9), também buscar versão de 13 dígitos
    if (phoneNumber.startsWith('55') && phoneNumber.length === 12) {
      const withNinth = phoneNumber.slice(0, 4) + '9' + phoneNumber.slice(4);
      phoneVariants.push(withNinth);
    }

    // Buscar contato existente.
    // Para contatos de LID, primeiro tenta pelo metadata.lid — assim reencontramos o
    // contato mesmo depois que o usuário corrigiu o phone_number manualmente.
    let existingContact: any = null;
    if (lid) {
      const { data: byLid } = await supabase
        .from('whatsapp_contacts')
        .select('id, name, phone_number, metadata')
        .eq('instance_id', instanceId)
        .filter('metadata->>lid', 'eq', lid)
        .maybeSingle();
      existingContact = byLid ?? null;
    }
    if (!existingContact) {
      const { data: byPhone } = await supabase
        .from('whatsapp_contacts')
        .select('id, name, phone_number, metadata')
        .eq('instance_id', instanceId)
        .in('phone_number', phoneVariants)
        .maybeSingle();
      existingContact = byPhone ?? null;
    }

    if (existingContact) {
      const metadata = existingContact.metadata || {};
      // Lock: nunca sobrescrever phone_number/name de um contato editado manualmente.
      const manualEdit = metadata.manual_edit === true;

      // Garantir o mapeamento metadata.lid (para reencontrar o contato em mensagens futuras).
      if (lid && metadata.lid !== lid) {
        await supabase
          .from('whatsapp_contacts')
          .update({ metadata: { ...metadata, lid }, updated_at: new Date().toISOString() })
          .eq('id', existingContact.id);
      }

      // Atualizar phone_number para o formato resolvido/normalizado (inclui auto-upgrade
      // de LID → número real), exceto quando travado por edição manual.
      if (!manualEdit && existingContact.phone_number !== phoneNumber) {
        await supabase
          .from('whatsapp_contacts')
          .update({ phone_number: phoneNumber, updated_at: new Date().toISOString() })
          .eq('id', existingContact.id);
        console.log(`[evolution-webhook] Contact phone updated: ${existingContact.phone_number} -> ${phoneNumber}`);
      }

      // Only update name if: not manual edit, message is NOT from me, we have a real name,
      // and the current name is just the phone number.
      const shouldUpdateName = !manualEdit &&
                               !isFromMe &&
                               name !== phoneNumber &&
                               existingContact.name === existingContact.phone_number;

      if (shouldUpdateName) {
        await supabase
          .from('whatsapp_contacts')
          .update({ name: name, updated_at: new Date().toISOString() })
          .eq('id', existingContact.id);
        console.log(`[evolution-webhook] Contact name updated: ${existingContact.id} -> ${name}`);
      }

      return existingContact.id;
    }

    // Create new contact
    // If message is from me, use phone number as name (to avoid using instance owner's name).
    // When the phone is actually a LID (no real number resolved) and there's no real pushName,
    // store an empty name instead of the LID digits — the UI shows "Sem nome" and the user edits it.
    const phoneIsLid = /^\d{14,}$/.test(phoneNumber);
    const hasRealName = !!name && name !== phoneNumber;
    const contactName = isFromMe
      ? phoneNumber
      : (hasRealName ? name : (phoneIsLid ? '' : phoneNumber));

    const { data: newContact, error } = await supabase
      .from('whatsapp_contacts')
      .insert({
        instance_id: instanceId,
        phone_number: phoneNumber,
        name: contactName,
        is_group: isGroup,
        metadata: lid ? { lid } : {},
      })
      .select('id')
      .single();

    if (error) {
      console.error('[evolution-webhook] Error creating contact:', error);
      return null;
    }

    console.log(`[evolution-webhook] Contact created: ${newContact.id} Name: ${name}`);
    
    // Buscar foto de perfil em background (fire-and-forget)
    if (apiUrl && apiKey && instanceName) {
      fetchAndUpdateProfilePicture(supabase, apiUrl, apiKey, instanceName, phoneNumber, newContact.id, instanceId, providerType)
        .catch(err => console.warn('[evolution-webhook] Background profile fetch error:', err));
    }
    
    return newContact.id;
  } catch (error) {
    console.error('[evolution-webhook] Error in findOrCreateContact:', error);
    return null;
  }
}

// Apply auto-assignment rules
async function applyAutoAssignment(
  supabase: any,
  instanceId: string,
  conversationId: string
): Promise<void> {
  try {
    // 1. Buscar regra ativa para a instância
    const { data: rule } = await supabase
      .from('assignment_rules')
      .select('*')
      .eq('instance_id', instanceId)
      .eq('is_active', true)
      .maybeSingle();

    if (!rule) {
      return; // Sem regra, conversa fica na fila
    }

    let assignedTo: string | null = null;

    if (rule.rule_type === 'fixed') {
      // Atribuição fixa
      assignedTo = rule.fixed_agent_id;
      console.log('[auto-assignment] Fixed assignment to:', assignedTo);
    } else if (rule.rule_type === 'round_robin') {
      // Round-robin
      const agents = rule.round_robin_agents || [];
      if (agents.length === 0) {
        console.warn('[auto-assignment] No agents in round-robin list');
        return;
      }

      const nextIndex = (rule.round_robin_last_index + 1) % agents.length;
      assignedTo = agents[nextIndex];
      console.log(`[auto-assignment] Round-robin assignment to: ${assignedTo} (index: ${nextIndex})`);

      // Atualizar índice para próxima vez
      await supabase
        .from('assignment_rules')
        .update({ round_robin_last_index: nextIndex })
        .eq('id', rule.id);
    }

    if (assignedTo) {
      // Atribuir conversa
      await supabase
        .from('whatsapp_conversations')
        .update({ assigned_to: assignedTo })
        .eq('id', conversationId);

      // Registrar no histórico
      await supabase
        .from('conversation_assignments')
        .insert({
          conversation_id: conversationId,
          assigned_to: assignedTo,
          reason: `Auto-atribuição: ${rule.name}`,
        });

      console.log('[auto-assignment] Conversation assigned successfully');
    }
  } catch (error) {
    console.error('[auto-assignment] Error applying auto-assignment:', error);
  }
}

// Find or create conversation
async function findOrCreateConversation(
  supabase: any,
  instanceId: string,
  contactId: string,
  isFromMe: boolean
): Promise<string | null> {
  try {
    // Try to find existing conversation
    const { data: existingConversation, error: findError } = await supabase
      .from('whatsapp_conversations')
      .select('id, status')
      .eq('instance_id', instanceId)
      .eq('contact_id', contactId)
      .maybeSingle();

    if (findError) {
      console.error('[evolution-webhook] Error finding conversation:', findError);
    }

    if (existingConversation) {
      // Auto-reopen closed conversation on inbound message, if company setting allows
      if (
        !isFromMe &&
        existingConversation.status === 'closed'
      ) {
        try {
          const { data: inst } = await supabase
            .from('whatsapp_instances')
            .select('company_id')
            .eq('id', instanceId)
            .maybeSingle();

          if (inst?.company_id) {
            const { data: cfg } = await supabase
              .from('project_config')
              .select('value')
              .eq('key', 'auto_reopen_on_inbound')
              .eq('company_id', inst.company_id)
              .maybeSingle();

            const shouldReopen = (cfg?.value ?? 'true') === 'true';
            if (shouldReopen) {
              await supabase
                .from('whatsapp_conversations')
                .update({ status: 'active', updated_at: new Date().toISOString() })
                .eq('id', existingConversation.id);
              console.log('[evolution-webhook] Reopened conversation on inbound:', existingConversation.id);
            }
          }
        } catch (e) {
          console.error('[evolution-webhook] auto-reopen check failed:', e);
        }
      }
      return existingConversation.id;
    }

    // Create new conversation
    const { data: newConversation, error: createError } = await supabase
      .from('whatsapp_conversations')
      .insert({
        instance_id: instanceId,
        contact_id: contactId,
        status: 'active',
      })
      .select('id')
      .single();

    if (createError) {
      console.error('[evolution-webhook] Error creating conversation:', createError);
      return null;
    }

    console.log('[evolution-webhook] Conversation created:', newConversation.id);
    
    // Apply auto-assignment for new conversations
    await applyAutoAssignment(supabase, instanceId, newConversation.id);
    
    return newConversation.id;
  } catch (error) {
    console.error('[evolution-webhook] Error in findOrCreateConversation:', error);
    return null;
  }
}

// Check and trigger automatic sentiment analysis
async function checkAndTriggerAutoSentiment(
  supabase: any,
  conversationId: string,
  supabaseUrl: string
) {
  try {
    // 1. Buscar última análise de sentimento
    const { data: lastAnalysis } = await supabase
      .from('whatsapp_sentiment_analysis')
      .select('created_at')
      .eq('conversation_id', conversationId)
      .maybeSingle();

    // 2. Contar mensagens do cliente desde última análise
    let query = supabase
      .from('whatsapp_messages')
      .select('id', { count: 'exact', head: true })
      .eq('conversation_id', conversationId)
      .eq('is_from_me', false);

    // Se há análise anterior, contar apenas mensagens mais recentes
    if (lastAnalysis?.created_at) {
      query = query.gt('timestamp', lastAnalysis.created_at);
    }

    const { count } = await query;

    console.log(`[auto-sentiment] Messages since last analysis: ${count}`);

    // 3. Se atingiu threshold, disparar análise (async, não bloqueia)
    if (count && count >= AUTO_SENTIMENT_THRESHOLD) {
      console.log(`[auto-sentiment] Triggering auto analysis for ${conversationId}`);
      
      // Chamar edge function de análise de sentimento (fire and forget)
      fetch(`${supabaseUrl}/functions/v1/analyze-whatsapp-sentiment`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${Deno.env.get('SUPABASE_ANON_KEY')}`,
        },
        body: JSON.stringify({ conversationId }),
      }).catch(err => console.error('[auto-sentiment] Error triggering:', err));
    }
  } catch (error) {
    console.error('[auto-sentiment] Error checking sentiment:', error);
  }
}

// Check and trigger automatic categorization
async function checkAndTriggerAutoCategorization(
  supabase: any,
  conversationId: string,
  supabaseUrl: string
) {
  try {
    // 1. Buscar metadata da conversa para ver última categorização
    const { data: conversation } = await supabase
      .from('whatsapp_conversations')
      .select('metadata')
      .eq('id', conversationId)
      .maybeSingle();

    const lastCategorizedAt = conversation?.metadata?.categorized_at;

    // 2. Contar mensagens do cliente desde última categorização
    let query = supabase
      .from('whatsapp_messages')
      .select('id', { count: 'exact', head: true })
      .eq('conversation_id', conversationId)
      .eq('is_from_me', false);

    // Se há categorização anterior, contar apenas mensagens mais recentes
    if (lastCategorizedAt) {
      query = query.gt('timestamp', lastCategorizedAt);
    }

    const { count } = await query;

    console.log(`[auto-categorization] Messages since last categorization: ${count}`);

    // 3. Se atingiu threshold, disparar categorização (async, não bloqueia)
    if (count && count >= AUTO_CATEGORIZATION_THRESHOLD) {
      console.log(`[auto-categorization] Triggering auto categorization for ${conversationId}`);
      
      // Chamar edge function de categorização (fire and forget)
      fetch(`${supabaseUrl}/functions/v1/categorize-whatsapp-conversation`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${Deno.env.get('SUPABASE_ANON_KEY')}`,
        },
        body: JSON.stringify({ conversationId }),
      }).catch(err => console.error('[auto-categorization] Error triggering:', err));
    }
  } catch (error) {
    console.error('[auto-categorization] Error checking categorization:', error);
  }
}

// Process reaction message
async function processReaction(payload: EvolutionWebhookPayload, supabase: any) {
  try {
    const { data } = payload;
    const { key, message } = data;
    const reaction = message.reactionMessage;
    
    if (!reaction?.key?.id) {
      console.warn('[evolution-webhook] Invalid reaction data');
      return;
    }
    
    const targetMessageId = reaction.key.id;
    const emoji = reaction.text;
    const reactorJid = key.remoteJid;

    // Ignora eco da própria instância: quando o atendente reage pela
    // plataforma, a Evolution devolve o evento com fromMe=true. Já gravamos
    // essa reação no fluxo do frontend (send-whatsapp-reaction), então
    // reprocessá-la duplicaria a linha (user_id vs owner_jid).
    if (key.fromMe === true) {
      console.log('[evolution-webhook] Skipping fromMe reaction echo');
      return;
    }

    // Find the target message to get conversation_id
    const { data: targetMessage } = await supabase
      .from('whatsapp_messages')
      .select('conversation_id')
      .eq('message_id', targetMessageId)
      .maybeSingle();
    
    if (!targetMessage) {
      console.warn('[evolution-webhook] Target message not found:', targetMessageId);
      return;
    }
    
    // If emoji is empty, it's a reaction removal
    if (!emoji || emoji === '') {
      const { error } = await supabase
        .from('whatsapp_reactions')
        .delete()
        .eq('message_id', targetMessageId)
        .eq('reactor_jid', reactorJid)
        .is('user_id', null);
      
      if (error) {
        console.error('[evolution-webhook] Error removing reaction:', error);
      } else {
        console.log('[evolution-webhook] Reaction removed successfully');
      }
      return;
    }
    
    // UPSERT restrito ao "canal externo" (reações vindas do WhatsApp).
    // Reações de atendentes (user_id != null) NUNCA são tocadas aqui.
    const { error } = await supabase
      .from('whatsapp_reactions')
      .upsert({
        message_id: targetMessageId,
        conversation_id: targetMessage.conversation_id,
        emoji,
        reactor_jid: reactorJid,
        is_from_me: key.fromMe,
        user_id: null,
      }, {
        onConflict: 'message_id,reactor_jid',
        ignoreDuplicates: false,
      });
    
    if (error) {
      console.error('[evolution-webhook] Error saving reaction:', error);
    } else {
      console.log('[evolution-webhook] Reaction saved successfully');
    }
  } catch (error) {
    console.error('[evolution-webhook] Error in processReaction:', error);
  }
}

async function downloadAndAttachWebhookMedia(
  supabase: any,
  params: {
    secrets: { api_url: string; api_key: string };
    instanceData: any;
    evolutionInstanceId: string;
    key: any;
    message: any;
    messageRowId: string;
    conversationId: string;
    mediaMimetype: string;
    messageType: string;
  },
) {
  const { secrets, instanceData, evolutionInstanceId, key, message, messageRowId, conversationId, mediaMimetype, messageType } = params;
  const delays = [0, 5_000, 20_000];
  let lastError = 'media download failed';

  for (let attempt = 1; attempt <= delays.length; attempt++) {
    if (delays[attempt - 1] > 0) {
      await new Promise((resolve) => setTimeout(resolve, delays[attempt - 1]));
    }

    try {
      const mediaUrl = await downloadAndUploadMedia(
        secrets.api_url,
        secrets.api_key,
        evolutionInstanceId,
        { key, message },
        supabase,
        mediaMimetype,
        instanceData.provider_type || 'self_hosted',
        15_000,
      );

      if (mediaUrl) {
        await supabase
          .from('whatsapp_messages')
          .update({
            media_url: mediaUrl,
            media_mimetype: mediaMimetype,
            media_status: 'available',
            media_error: null,
            media_retry_count: attempt,
          })
          .eq('id', messageRowId);

        console.log('[evolution-webhook] Background media saved:', messageRowId);

        if (messageType === 'audio') {
          const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
          const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
          fetch(`${supabaseUrl}/functions/v1/transcribe-audio`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${serviceRoleKey}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ messageId: messageRowId }),
          }).catch(err => console.error('[evolution-webhook] Error triggering auto-transcription:', err));
        }

        return;
      }
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
      console.error('[evolution-webhook] Background media attempt failed:', attempt, lastError);
    }

    await supabase
      .from('whatsapp_messages')
      .update({
        media_status: attempt >= delays.length ? 'failed' : 'pending',
        media_error: lastError,
        media_retry_count: attempt,
      })
      .eq('id', messageRowId);
  }

  console.error('[evolution-webhook] Background media failed after retries:', { messageRowId, conversationId, messageType });
}

// Process message upsert event
async function processMessageUpsert(payload: EvolutionWebhookPayload, supabase: any) {
  try {
    const { instance, data } = payload;
    const { key, pushName, message, messageTimestamp } = data;

    // Get instance data - try by instance_name first (self-hosted), then by instance_id_external (Cloud)
    let { data: instanceData } = await supabase
      .from('whatsapp_instances')
      .select('id, instance_name, instance_id_external, provider_type, status')
      .eq('instance_name', instance)
      .maybeSingle();

    // If not found by name, try by instance_id_external (Evolution Cloud sends UUID)
    if (!instanceData) {
      const { data: cloudInstance } = await supabase
        .from('whatsapp_instances')
        .select('id, instance_name, instance_id_external, provider_type, status')
        .eq('instance_id_external', instance)
        .maybeSingle();
      instanceData = cloudInstance;
    }

    if (!instanceData) {
      console.error('[evolution-webhook] Instance not found:', instance);
      throw new Error(`Instance not found: ${instance}`);
    }
    
    // Determine which identifier to use for Evolution API calls
    // Cloud instances use instance_id_external (UUID), self-hosted use instance_name
    const evolutionInstanceId = instanceData.provider_type === 'cloud' && instanceData.instance_id_external
      ? instanceData.instance_id_external
      : instanceData.instance_name;
    
    // Update status to 'connected' if processing a message (instance is clearly connected)
    if (instanceData.status !== 'connected') {
      await supabase
        .from('whatsapp_instances')
        .update({ 
          status: 'connected',
          updated_at: new Date().toISOString()
        })
        .eq('id', instanceData.id);
      console.log(`[evolution-webhook] Updated instance ${instanceData.instance_name} status to connected`);
    }
    
    // Get instance secrets
    const { data: secrets, error: secretsError } = await supabase
      .from('whatsapp_instance_secrets')
      .select('api_url, api_key')
      .eq('instance_id', instanceData.id)
      .single();

    if (secretsError || !secrets) {
      console.error('[evolution-webhook] Failed to fetch instance secrets:', secretsError);
      throw new Error(`Failed to fetch instance secrets: ${secretsError?.message || 'not found'}`);
    }

    // Normalize phone number.
    // For non-saved contacts the remoteJid may be a `@lid` identifier (a long internal
    // integer, not the real phone). Prefer a real phone JID from the payload when available.
    const realJid = extractRealPhoneFromKey(key, data);
    const lidContact = isLid(key.remoteJid, key?.addressingMode ?? data?.addressingMode);
    const phoneJid = realJid ?? key.remoteJid;
    const { phone, isGroup } = normalizePhoneNumber(phoneJid);
    // LID digits (kept to re-match the contact later, even after a manual phone edit).
    const lidValue = lidContact ? normalizePhoneNumber(key.remoteJid).phone : null;

    // Find or create contact
    // If message is from me, use phone number instead of pushName (which would be the instance owner's name)
    const contactId = await findOrCreateContact(
      supabase,
      instanceData.id,
      phone,
      pushName || phone,
      isGroup,
      key.fromMe,
      secrets.api_url,
      secrets.api_key,
      evolutionInstanceId,
      instanceData.provider_type || 'self_hosted',
      lidValue
    );

    if (!contactId) {
      console.error('[evolution-webhook] Failed to create/find contact');
      throw new Error('Failed to create/find contact');
    }

    // Find or create conversation
    const conversationId = await findOrCreateConversation(
      supabase,
      instanceData.id,
      contactId,
      !!key.fromMe
    );

    if (!conversationId) {
      console.error('[evolution-webhook] Failed to create/find conversation');
      throw new Error('Failed to create/find conversation');
    }

    // Detect message type and content
    const messageType = getMessageType(message);
    
    // If it's a reaction, process it separately
    if (messageType === 'reaction') {
      await processReaction(payload, supabase);
      return;
    }
    
    const content = getMessageContent(message, messageType);

    // Detect media metadata only. The actual download runs after the message row
    // is already saved, in background, so a slow/failed audio/image never makes
    // the whole webhook disappear.
    let mediaMimetype: string | null = null;
    let shouldFetchMedia = false;

    if (MEDIA_TYPES.includes(messageType)) {
      const mediaMessage = message[`${messageType}Message`];
      if (mediaMessage) {
        mediaMimetype = mediaMessage.mimetype || null;
        // WhatsApp voice notes often come back without a mimetype; default to OGG/Opus.
        if (!mediaMimetype || mediaMimetype === `${messageType}/*`) {
          if (messageType === 'audio') mediaMimetype = 'audio/ogg; codecs=opus';
          else mediaMimetype = `${messageType}/*`;
        }
        shouldFetchMedia = !!mediaMimetype;
      }
    }

    // Get quoted message ID if this is a reply
    const quotedMessageId = message.extendedTextMessage?.contextInfo?.stanzaId || null;

    // Create message timestamp
    const timestamp = new Date(messageTimestamp * 1000).toISOString();

    // Save message first. Media is intentionally marked as pending and fetched
    // after the row exists, avoiding data loss when Evolution/media/storage is slow.
    const mediaStatus = shouldFetchMedia ? 'pending' : 'none';
    let insertedMessage: any = null;
    const { data: inserted, error: messageError } = await supabase
      .from('whatsapp_messages')
      .insert({
        conversation_id: conversationId,
        remote_jid: key.remoteJid,
        message_id: key.id,
        content,
        message_type: messageType,
        media_url: null,
        media_mimetype: mediaMimetype,
        media_status: mediaStatus,
        media_error: null,
        is_from_me: key.fromMe || false,
        status: 'sent',
        quoted_message_id: quotedMessageId,
        timestamp,
      })
      .select('id, media_url, media_status')
      .single();

    if (messageError) {
      if (messageError.code === '23505') {
        const { data: existingMessage } = await supabase
          .from('whatsapp_messages')
          .select('id, media_url, media_status')
          .eq('conversation_id', conversationId)
          .eq('message_id', key.id)
          .maybeSingle();
        insertedMessage = existingMessage;
      } else {
        console.error('[evolution-webhook] Error saving message:', messageError);
        throw new Error(`Error saving message: ${messageError.message}`);
      }
    } else {
      insertedMessage = inserted;
    }

    console.log('[evolution-webhook] Message saved successfully');

    if (shouldFetchMedia && insertedMessage?.id && !insertedMessage.media_url) {
      // @ts-ignore EdgeRuntime is provided by Supabase Edge Runtime
      EdgeRuntime.waitUntil(downloadAndAttachWebhookMedia(supabase, {
        secrets,
        instanceData,
        evolutionInstanceId,
        key,
        message,
        messageRowId: insertedMessage.id,
        conversationId,
        mediaMimetype: mediaMimetype!,
        messageType,
      }));
    }

    // Update conversation metadata
    const updateData: any = {
      last_message_at: timestamp,
      last_message_preview: content.substring(0, 100),
    };

    // Increment unread count only if message is not from me
    if (!key.fromMe) {
      const { data: currentConv } = await supabase
        .from('whatsapp_conversations')
        .select('unread_count')
        .eq('id', conversationId)
        .single();

      updateData.unread_count = (currentConv?.unread_count || 0) + 1;
    }

    const { error: updateError } = await supabase
      .from('whatsapp_conversations')
      .update(updateData)
      .eq('id', conversationId);

    if (updateError) {
      console.error('[evolution-webhook] Error updating conversation:', updateError);
    } else {
      console.log('[evolution-webhook] Conversation updated successfully');
    }

    // Se mensagem é do cliente (não é minha), verificar análises automáticas
    if (!key.fromMe) {
      const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
      checkAndTriggerAutoSentiment(supabase, conversationId, supabaseUrl);
      checkAndTriggerAutoCategorization(supabase, conversationId, supabaseUrl);
    }
  } catch (error) {
    console.error('[evolution-webhook] Error in processMessageUpsert:', error);
    throw error;
  }
}

// Process message update event (status changes)
// Rank monotônico de status de entrega. Nunca deve retroceder.
const STATUS_RANK: Record<string, number> = {
  pending: 0,
  sending: 0,
  sent: 1,
  delivered: 2,
  read: 3,
};

function mapEvolutionStatus(raw: any): string | null {
  if (raw === undefined || raw === null) return null;
  if (typeof raw === 'number') {
    if (raw === -1) return 'failed';
    if (raw === 0) return 'pending';
    if (raw === 1) return 'sent';
    if (raw === 2) return 'delivered';
    if (raw === 3 || raw === 4) return 'read';
    return null;
  }
  const s = String(raw).toUpperCase();
  if (s === 'ERROR' || s === 'FAILED') return 'failed';
  if (s === 'PENDING') return 'pending';
  if (s === 'SENT' || s === 'SERVER_ACK') return 'sent';
  if (s === 'DELIVERED' || s === 'DELIVERY_ACK') return 'delivered';
  if (s === 'READ' || s === 'PLAYED') return 'read';
  return null;
}

// Atualiza status apenas se avançar (ou for failed). Usa filtro .in() para
// evitar sobrescrever delivered/read com sent, etc.
async function advanceMessageStatus(supabase: any, messageId: string, newStatus: string) {
  if (!messageId || !newStatus) return;
  let query = supabase.from('whatsapp_messages').update({ status: newStatus }).eq('message_id', messageId);
  if (newStatus !== 'failed') {
    const rank = STATUS_RANK[newStatus];
    if (rank === undefined) return;
    // Permitir apenas status atuais com rank menor OU nulos (mensagem antiga sem status).
    const lower = Object.entries(STATUS_RANK)
      .filter(([, r]) => r < rank)
      .map(([k]) => k);
    // is null OR status in (lower)
    query = query.or(`status.is.null,status.in.(${lower.join(',')})`);
  }
  const { error } = await query;
  if (error) console.error('[evolution-webhook] advanceMessageStatus error:', error);
}

async function processMessageUpdate(payload: EvolutionWebhookPayload, supabase: any) {
  try {
    const { data } = payload;
    const updates = data.update || data;

    // Evolution manda status em campos variados: status (string/num) ou ack (num).
    const rawStatus = updates.status ?? updates.ack ?? updates.messageStatus;
    const mapped = mapEvolutionStatus(rawStatus);
    // Evolution manda o ID em formatos diferentes conforme versão/evento:
    // key.id (upsert clássico), keyId (messages.update self-hosted v2),
    // messageId, id. Tentamos todos.
    const messageId =
      updates.key?.id ||
      data.key?.id ||
      updates.keyId ||
      data.keyId ||
      updates.messageId ||
      data.messageId ||
      updates.id ||
      data.id;

    if (!mapped || !messageId) {
      console.log('[evolution-webhook] messages.update sem status/id utilizável:', {
        rawStatus,
        messageId,
        dataKeys: Object.keys(data || {}),
        updatesKeys: updates ? Object.keys(updates) : null,
      });
      return;
    }

    await advanceMessageStatus(supabase, messageId, mapped);
    console.log('[evolution-webhook] Message status →', mapped, 'for', messageId);
  } catch (error) {
    console.error('[evolution-webhook] Error in processMessageUpdate:', error);
  }
}

// Process connection update event
async function processConnectionUpdate(payload: EvolutionWebhookPayload, supabase: any) {
  try {
    const { instance, data } = payload;
    const state = data.state || data.connection;

    console.log('[evolution-webhook] Connection update for:', instance, 'State:', state);

    // Map Evolution API states to our status
    let status = 'disconnected';
    if (state === 'open' || state === 'connected') status = 'connected';
    else if (state === 'connecting') status = 'connecting';
    else if (state === 'close' || state === 'closed') status = 'disconnected';

    // Update instance status
    const { error } = await supabase
      .from('whatsapp_instances')
      .update({ status })
      .eq('instance_name', instance);

    if (error) {
      console.error('[evolution-webhook] Error updating instance status:', error);
    } else {
      console.log('[evolution-webhook] Instance status updated to:', status);
    }
  } catch (error) {
    console.error('[evolution-webhook] Error in processConnectionUpdate:', error);
  }
}

// Process message edit
async function processMessageEdit(payload: EvolutionWebhookPayload, supabase: any) {
  try {
    const { data } = payload;
    const editedMessage = data.message?.editedMessage || data.message?.protocolMessage?.editedMessage;
    
    if (!editedMessage) {
      console.log('[evolution-webhook] No editedMessage found in payload');
      return;
    }
    
    const messageId = editedMessage.key?.id || data.key?.id;
    const newContent = editedMessage.conversation || editedMessage.extendedTextMessage?.text || '';
    
    console.log('[evolution-webhook] Processing message edit:', messageId);
    
    // 1. Fetch current message
    const { data: currentMessage, error: fetchError } = await supabase
      .from('whatsapp_messages')
      .select('id, content, original_content, conversation_id')
      .eq('message_id', messageId)
      .maybeSingle();
    
    if (fetchError || !currentMessage) {
      console.error('[evolution-webhook] Error fetching message or message not found:', fetchError);
      return;
    }
    
    // 2. Save to edit history
    const { error: historyError } = await supabase
      .from('whatsapp_message_edit_history')
      .insert({
        message_id: messageId,
        conversation_id: currentMessage.conversation_id,
        previous_content: currentMessage.content,
      });
    
    if (historyError) {
      console.error('[evolution-webhook] Error saving edit history:', historyError);
    }
    
    // 3. Update message
    const { error: updateError } = await supabase
      .from('whatsapp_messages')
      .update({
        content: newContent,
        edited_at: new Date().toISOString(),
        // Store original content only on first edit
        original_content: currentMessage.original_content || currentMessage.content,
      })
      .eq('message_id', messageId);
    
    if (updateError) {
      console.error('[evolution-webhook] Error updating message:', updateError);
    } else {
      console.log('[evolution-webhook] Message edited successfully:', messageId);
    }
  } catch (error) {
    console.error('[evolution-webhook] Error in processMessageEdit:', error);
  }
}

// Resolve conversation IDs from a list of remoteJids for a given instance.
async function resolveConversationIdsForJids(
  supabase: any,
  instanceId: string,
  remoteJids: string[]
): Promise<string[]> {
  const unique = Array.from(new Set(remoteJids.filter(Boolean)));
  if (unique.length === 0) return [];

  const phones = new Set<string>();
  for (const jid of unique) {
    try {
      const { phone } = normalizePhoneNumber(jid);
      if (phone) phones.add(phone);
    } catch (_e) {
      // ignore malformed jid
    }
  }
  if (phones.size === 0) return [];

  const { data: contacts } = await supabase
    .from('whatsapp_contacts')
    .select('id')
    .eq('instance_id', instanceId)
    .in('phone_number', Array.from(phones));

  const contactIds = (contacts || []).map((c: any) => c.id);
  if (contactIds.length === 0) return [];

  const { data: convs } = await supabase
    .from('whatsapp_conversations')
    .select('id')
    .eq('instance_id', instanceId)
    .in('contact_id', contactIds);

  return (convs || []).map((c: any) => c.id);
}

// messages.read — agent leu mensagens fora da plataforma (no celular/web).
// Zera o unread_count das conversas envolvidas e marca as mensagens como 'read'.
async function processMessagesRead(payload: EvolutionWebhookPayload, supabase: any) {
  try {
    const { instance, data } = payload;
    const instanceId = await findInstanceIdForWebhook(supabase, instance);
    if (!instanceId) {
      console.log('[evolution-webhook] messages.read: instance not found for', instance);
      return;
    }

    // Evolution pode mandar um array de chaves ou uma única chave.
    const rawKeys: any[] = Array.isArray(data?.keys)
      ? data.keys
      : Array.isArray(data?.readMessages)
      ? data.readMessages
      : Array.isArray(data)
      ? data
      : data?.key
      ? [data.key]
      : [];

    const messageIds = rawKeys.map((k) => k?.id).filter(Boolean);
    const remoteJids = rawKeys.map((k) => k?.remoteJid).filter(Boolean);

    if (messageIds.length > 0) {
      // Só avança para 'read' se o status atual não for 'failed'.
      await supabase
        .from('whatsapp_messages')
        .update({ status: 'read' })
        .in('message_id', messageIds)
        .or('status.is.null,status.in.(pending,sending,sent,delivered)');
    }

    const convIds = await resolveConversationIdsForJids(supabase, instanceId, remoteJids);
    if (convIds.length > 0) {
      await supabase
        .from('whatsapp_conversations')
        .update({ unread_count: 0, updated_at: new Date().toISOString() })
        .in('id', convIds);
      console.log('[evolution-webhook] messages.read: cleared unread for', convIds.length, 'conv(s)');
    }
  } catch (error) {
    console.error('[evolution-webhook] Error in processMessagesRead:', error);
  }
}

// chats.update — Evolution informa estado do chat (ex.: unreadCount=0 quando lido).
async function processChatsUpdate(payload: EvolutionWebhookPayload, supabase: any) {
  try {
    const { instance, data } = payload;
    const instanceId = await findInstanceIdForWebhook(supabase, instance);
    if (!instanceId) {
      console.log('[evolution-webhook] chats.update: instance not found for', instance);
      return;
    }

    const chats: any[] = Array.isArray(data) ? data : data?.chats ? data.chats : [data];
    const jidsToClear: string[] = [];
    for (const chat of chats) {
      if (!chat) continue;
      const remoteJid = chat.id || chat.remoteJid || chat.jid;
      if (!remoteJid) continue;
      // Algumas versões mandam unreadCount, outras unread_count.
      const unread = chat.unreadCount ?? chat.unread_count;
      if (unread === 0 || unread === '0') {
        jidsToClear.push(remoteJid);
      }
    }

    if (jidsToClear.length === 0) return;

    const convIds = await resolveConversationIdsForJids(supabase, instanceId, jidsToClear);
    if (convIds.length > 0) {
      await supabase
        .from('whatsapp_conversations')
        .update({ unread_count: 0, updated_at: new Date().toISOString() })
        .in('id', convIds);
      console.log('[evolution-webhook] chats.update: cleared unread for', convIds.length, 'conv(s)');
    }
  } catch (error) {
    console.error('[evolution-webhook] Error in processChatsUpdate:', error);
  }
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const authHeader = req.headers.get('Authorization') || '';

    const body = await req.json();

    if (body?.internal === true && authHeader === `Bearer ${supabaseServiceKey}`) {
      // @ts-ignore EdgeRuntime is provided by Supabase Edge Runtime
      EdgeRuntime.waitUntil(drainWebhookQueue(supabase, body.event_id));
      return new Response(
        JSON.stringify({ success: true, status: 'processing', event_id: body.event_id }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 202 }
      );
    }

    const payload = body as EvolutionWebhookPayload;
    console.log('[evolution-webhook] Event received:', payload.event, 'Instance:', payload.instance);

    const queued = await enqueueWebhookEvent(supabase, payload);

    // Acknowledge Evolution immediately. The processing continues in background
    // from the durable raw-event queue, so browser/edge timeouts don't lose messages.
    // @ts-ignore EdgeRuntime is provided by Supabase Edge Runtime
    EdgeRuntime.waitUntil(drainWebhookQueue(supabase, queued.id));

    return new Response(
      JSON.stringify({ success: true, queued: true, event_id: queued.id, event: payload.event }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    );
  } catch (error) {
    console.error('[evolution-webhook] Fatal error:', error);
    
    // Still return 200 to prevent reprocessing
    return new Response(
      JSON.stringify({ success: false, error: String(error) }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    );
  }
});
