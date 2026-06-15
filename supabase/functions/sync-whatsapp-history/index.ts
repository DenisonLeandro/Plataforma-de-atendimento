import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import {
  normalizePhoneNumber,
  getMessageType,
  getMessageContent,
  isEditedMessage,
} from '../_shared/evolution-helpers.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const PAGE_SIZE = 100;
const UPSERT_BATCH = 50;

interface SyncRequest {
  instance_id: string;
}

interface PendingMessage {
  conversation_id: string;
  remote_jid: string;
  message_id: string;
  content: string;
  message_type: string;
  media_url: string | null;
  media_mimetype: string | null;
  is_from_me: boolean;
  status: string;
  quoted_message_id: string | null;
  timestamp: string;
  edited_at: string | null;
}

function trimApiUrl(apiUrl: string): string {
  let base = apiUrl.endsWith('/') ? apiUrl.slice(0, -1) : apiUrl;
  base = base.replace(/\/manager$/, '');
  return base;
}

function buildBrazilianVariants(phone: string): string[] {
  const variants = [phone];
  if (phone.startsWith('55') && phone.length === 13) {
    variants.push(phone.slice(0, 4) + phone.slice(5));
  }
  if (phone.startsWith('55') && phone.length === 12) {
    variants.push(phone.slice(0, 4) + '9' + phone.slice(4));
  }
  return variants;
}

async function findOrCreateContactLite(
  supabase: any,
  instanceId: string,
  phone: string,
  name: string,
  isGroup: boolean,
  isFromMe: boolean,
  profilePictureUrl?: string | null,
): Promise<string | null> {
  const variants = buildBrazilianVariants(phone);

  const { data: existing } = await supabase
    .from('whatsapp_contacts')
    .select('id, name, phone_number, profile_picture_url')
    .eq('instance_id', instanceId)
    .in('phone_number', variants)
    .maybeSingle();

  if (existing) {
    const updates: Record<string, any> = {};
    if (existing.phone_number !== phone) updates.phone_number = phone;
    const shouldUpdateName =
      !isFromMe && name && name !== phone && existing.name === existing.phone_number;
    if (shouldUpdateName) updates.name = name;
    if (profilePictureUrl && !existing.profile_picture_url) {
      updates.profile_picture_url = profilePictureUrl;
    }
    if (Object.keys(updates).length > 0) {
      updates.updated_at = new Date().toISOString();
      await supabase.from('whatsapp_contacts').update(updates).eq('id', existing.id);
    }
    return existing.id;
  }

  const contactName = isFromMe ? phone : name || phone;
  const { data: created, error } = await supabase
    .from('whatsapp_contacts')
    .insert({
      instance_id: instanceId,
      phone_number: phone,
      name: contactName,
      is_group: isGroup,
      profile_picture_url: profilePictureUrl || null,
    })
    .select('id')
    .single();

  if (error) {
    console.error('[sync-whatsapp-history] Error creating contact:', error);
    return null;
  }
  return created.id;
}

async function findOrCreateConversationLite(
  supabase: any,
  instanceId: string,
  contactId: string,
): Promise<string | null> {
  const { data: existing } = await supabase
    .from('whatsapp_conversations')
    .select('id')
    .eq('instance_id', instanceId)
    .eq('contact_id', contactId)
    .maybeSingle();

  if (existing) return existing.id;

  const { data: created, error } = await supabase
    .from('whatsapp_conversations')
    .insert({
      instance_id: instanceId,
      contact_id: contactId,
      status: 'active',
    })
    .select('id')
    .single();

  if (error) {
    console.error('[sync-whatsapp-history] Error creating conversation:', error);
    return null;
  }
  return created.id;
}

async function flushBatch(supabase: any, batch: PendingMessage[]): Promise<number> {
  if (batch.length === 0) return 0;
  const { error, count } = await supabase
    .from('whatsapp_messages')
    .upsert(batch, { onConflict: 'conversation_id,message_id', count: 'exact' });
  if (error) {
    console.error('[sync-whatsapp-history] Upsert error:', error);
    return 0;
  }
  return count ?? batch.length;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  let body: SyncRequest;
  try {
    body = (await req.json()) as SyncRequest;
  } catch {
    return new Response(
      JSON.stringify({ success: false, error: 'Invalid JSON body' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }

  if (!body?.instance_id) {
    return new Response(
      JSON.stringify({ success: false, error: 'instance_id is required' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  // Run the long-running sync in the background to avoid the 150s edge timeout.
  // The client receives an immediate acknowledgement and progress can be observed via logs.
  const work = runSync(supabase, body.instance_id).catch((e) => {
    console.error('[sync-whatsapp-history] background error:', e);
  });
  // @ts-ignore EdgeRuntime is provided by Supabase Edge Runtime
  if (typeof EdgeRuntime !== 'undefined' && EdgeRuntime?.waitUntil) {
    // @ts-ignore
    EdgeRuntime.waitUntil(work);
  }

  return new Response(
    JSON.stringify({
      success: true,
      started: true,
      message:
        'Sincronização iniciada em segundo plano. Acompanhe o progresso nos logs e atualize a página em alguns minutos.',
    }),
    { status: 202, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
  );
});

async function runSync(supabase: any, instanceId: string): Promise<void> {
  try {
    console.log('[sync-whatsapp-history] Starting sync for instance:', instanceId);

    const { data: instance, error: instanceErr } = await supabase
      .from('whatsapp_instances')
      .select('id, instance_name, provider_type, instance_id_external')
      .eq('id', instanceId)
      .single();

    if (instanceErr || !instance) {
      console.error('[sync-whatsapp-history] Instance not found:', instanceErr);
      return;
    }

    const { data: secrets, error: secretsErr } = await supabase
      .from('whatsapp_instance_secrets')
      .select('api_url, api_key')
      .eq('instance_id', instance.id)
      .single();

    if (secretsErr || !secrets) {
      console.error('[sync-whatsapp-history] Secrets not found:', secretsErr);
      return;
    }

    const apiUrl = trimApiUrl(secrets.api_url);
    const apiKey = secrets.api_key;
    const providerType = instance.provider_type || 'self_hosted';
    const instanceIdentifier =
      providerType === 'cloud' && instance.instance_id_external
        ? instance.instance_id_external
        : instance.instance_name;

    const headers = {
      'Content-Type': 'application/json',
      apikey: apiKey,
    };

    const errors: { chat?: string; error: string }[] = [];
    let chats_synced = 0;
    let messages_synced = 0;
    let contacts_synced = 0;

    // ---- 1. Sync contacts (best-effort) ----
    try {
      console.log('[sync-whatsapp-history] Fetching contacts...');
      const res = await fetch(`${apiUrl}/chat/findContacts/${instanceIdentifier}`, {
        method: 'POST',
        headers,
        body: JSON.stringify({}),
      });
      if (res.ok) {
        const data = await res.json();
        const list: any[] = Array.isArray(data) ? data : data?.records || [];
        console.log(`[sync-whatsapp-history] Contacts returned: ${list.length}`);
        for (const c of list) {
          const remoteJid: string | undefined = c.remoteJid || c.id;
          if (!remoteJid) continue;
          const { phone, isGroup } = normalizePhoneNumber(remoteJid);
          if (!phone) continue;
          const name = c.pushName || c.name || c.notify || phone;
          const pic = c.profilePicUrl || c.profilePictureUrl || null;
          const id = await findOrCreateContactLite(
            supabase,
            instance.id,
            phone,
            name,
            isGroup,
            false,
            pic,
          );
          if (id) contacts_synced++;
        }
      } else {
        const txt = await res.text().catch(() => '');
        errors.push({ error: `findContacts ${res.status}: ${txt.slice(0, 200)}` });
      }
    } catch (e) {
      errors.push({ error: `findContacts: ${(e as Error).message}` });
    }

    // ---- 2. List chats ----
    let chats: any[] = [];
    try {
      console.log('[sync-whatsapp-history] Fetching chats...');
      const res = await fetch(`${apiUrl}/chat/findChats/${instanceIdentifier}`, {
        method: 'POST',
        headers,
        body: JSON.stringify({}),
      });
      if (!res.ok) {
        const txt = await res.text().catch(() => '');
        console.error(`[sync-whatsapp-history] findChats failed ${res.status}: ${txt.slice(0, 300)}`);
        return;
      }
      const data = await res.json();
      chats = Array.isArray(data) ? data : data?.records || [];
      console.log(`[sync-whatsapp-history] Chats returned: ${chats.length}`);
    } catch (e) {
      console.error('[sync-whatsapp-history] findChats error:', (e as Error).message);
      return;
    }

    // ---- 3. Iterate chats and import messages ----
    let batch: PendingMessage[] = [];

    for (const chat of chats) {
      const remoteJid: string | undefined = chat.remoteJid || chat.id;
      if (!remoteJid) continue;

      const { phone, isGroup } = normalizePhoneNumber(remoteJid);
      if (!phone) continue;

      const chatName = chat.pushName || chat.name || phone;
      const contactId = await findOrCreateContactLite(
        supabase,
        instance.id,
        phone,
        chatName,
        isGroup,
        false,
        chat.profilePicUrl || null,
      );
      if (!contactId) {
        errors.push({ chat: remoteJid, error: 'contact create failed' });
        continue;
      }

      const conversationId = await findOrCreateConversationLite(supabase, instance.id, contactId);
      if (!conversationId) {
        errors.push({ chat: remoteJid, error: 'conversation create failed' });
        continue;
      }

      chats_synced++;

      // Paginate messages for this chat
      let offset = 0;
      let page = 1;
      let totalPages = 1;

      while (true) {
        let res: Response;
        try {
          res = await fetch(`${apiUrl}/chat/findMessages/${instanceIdentifier}`, {
            method: 'POST',
            headers,
            body: JSON.stringify({
              where: { key: { remoteJid } },
              limit: PAGE_SIZE,
              offset,
              page,
            }),
          });
        } catch (e) {
          errors.push({ chat: remoteJid, error: `findMessages fetch: ${(e as Error).message}` });
          break;
        }

        if (res.status === 404) {
          break; // empty chat
        }
        if (!res.ok) {
          const txt = await res.text().catch(() => '');
          errors.push({
            chat: remoteJid,
            error: `findMessages ${res.status}: ${txt.slice(0, 200)}`,
          });
          break;
        }

        const payload = await res.json().catch(() => null);
        if (!payload) break;

        // Evolution v2: { messages: { records, total, pages, currentPage } }
        // Some versions: direct array
        let records: any[] = [];
        if (Array.isArray(payload)) {
          records = payload;
        } else if (payload.messages?.records) {
          records = payload.messages.records;
          totalPages = payload.messages.pages ?? totalPages;
        } else if (Array.isArray(payload.records)) {
          records = payload.records;
          totalPages = payload.pages ?? totalPages;
        }

        if (records.length === 0) break;

        for (const rec of records) {
          try {
            const key = rec.key;
            const message = rec.message;
            if (!key?.id || !message) continue;

            // Skip reactions and pure protocol/edit envelopes
            if (message.reactionMessage) continue;
            if (isEditedMessage(message) && !message.conversation && !message.extendedTextMessage) {
              continue;
            }

            const type = getMessageType(message);
            const content = getMessageContent(message, type);

            const ts = rec.messageTimestamp ?? rec.timestamp ?? Math.floor(Date.now() / 1000);
            const tsIso = new Date(Number(ts) * 1000).toISOString();

            const mediaMessage = type !== 'text' ? message[`${type}Message`] : null;
            const mediaUrl = mediaMessage?.url || null;
            const mediaMimetype = mediaMessage?.mimetype || null;

            const quotedMessageId =
              message.extendedTextMessage?.contextInfo?.stanzaId || null;

            batch.push({
              conversation_id: conversationId,
              remote_jid: remoteJid,
              message_id: key.id,
              content,
              message_type: type,
              media_url: mediaUrl,
              media_mimetype: mediaMimetype,
              is_from_me: !!key.fromMe,
              status: rec.status || 'sent',
              quoted_message_id: quotedMessageId,
              timestamp: tsIso,
              edited_at: isEditedMessage(message) ? new Date().toISOString() : null,
            });

            if (batch.length >= UPSERT_BATCH) {
              const inserted = await flushBatch(supabase, batch);
              messages_synced += inserted;
              console.log(
                `[sync-whatsapp-history] chat=${remoteJid} batch flushed (${inserted}); total=${messages_synced}`,
              );
              batch = [];
            }
          } catch (e) {
            errors.push({ chat: remoteJid, error: `record: ${(e as Error).message}` });
          }
        }

        // Pagination control
        if (records.length < PAGE_SIZE) break;
        page += 1;
        offset += records.length;
        if (page > totalPages && totalPages > 0) break;
      }
    }

    // Final flush
    if (batch.length > 0) {
      const inserted = await flushBatch(supabase, batch);
      messages_synced += inserted;
      console.log(`[sync-whatsapp-history] final flush (${inserted}); total=${messages_synced}`);
      batch = [];
    }

    console.log('[sync-whatsapp-history] Done:', {
      chats_synced,
      messages_synced,
      contacts_synced,
      errors: errors.length,
    });
  } catch (error) {
    console.error('[sync-whatsapp-history] Unexpected error:', error);
  }
}