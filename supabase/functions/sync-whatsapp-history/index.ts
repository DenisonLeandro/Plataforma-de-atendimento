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
const MAX_DIAGNOSTICS = 10;
const CONTACTS_PER_INVOCATION = 200;
const CHATS_PER_INVOCATION = 25;
const MAX_INVOCATION_MS = 25_000;

interface SyncCursor {
  contacts_done?: boolean;
  contact_index?: number;
  chat_index?: number;
  message_page?: number;
  message_offset?: number;
  message_body_format?: 'A' | 'B';
}

interface SyncRequest {
  instance_id: string;
  cursor?: SyncCursor;
}

interface Diagnostic {
  step: string;
  url: string;
  status: number;
  content_type: string;
  raw_sample: string;
  parsed_count: number;
}

function pushDiagnostic(arr: Diagnostic[], d: Diagnostic) {
  if (arr.length < MAX_DIAGNOSTICS) {
    arr.push(d);
  } else {
    // keep the first MAX_DIAGNOSTICS - 1 (anchors) and overwrite last slot
    arr[MAX_DIAGNOSTICS - 1] = d;
  }
}

function extractList(payload: any): any[] {
  if (!payload) return [];
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload.records)) return payload.records;
  if (Array.isArray(payload.data)) return payload.data;
  if (payload.messages && Array.isArray(payload.messages.records)) return payload.messages.records;
  if (Array.isArray(payload.contacts)) return payload.contacts;
  if (Array.isArray(payload.chats)) return payload.chats;
  if (Array.isArray(payload.items)) return payload.items;
  return [];
}

function parsePositiveInt(value: unknown, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}

function getTotalPages(payload: any, recordsLength: number): number {
  const pages = payload?.messages?.pages ?? payload?.pages;
  const total = payload?.messages?.total ?? payload?.total;
  if (pages) return parsePositiveInt(pages, 1);
  if (total) return Math.max(1, Math.ceil(parsePositiveInt(total, recordsLength) / PAGE_SIZE));
  return recordsLength < PAGE_SIZE ? 1 : Number.MAX_SAFE_INTEGER;
}

function scheduleNextChunk(instanceId: string, cursor: SyncCursor) {
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY') || Deno.env.get('SUPABASE_PUBLISHABLE_KEY');
  if (!supabaseUrl || !anonKey) {
    console.warn('[sync-whatsapp-history] Missing env to schedule next chunk');
    return;
  }

  const url = `${supabaseUrl}/functions/v1/sync-whatsapp-history`;
  const promise = fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: anonKey,
      Authorization: `Bearer ${anonKey}`,
    },
    body: JSON.stringify({ instance_id: instanceId, cursor }),
  })
    .then(async (res) => {
      const raw = await res.text().catch(() => '');
      console.log('[sync-whatsapp-history] next chunk response', res.status, raw.slice(0, 500));
    })
    .catch((error) => {
      console.error('[sync-whatsapp-history] next chunk failed', error);
    });

  EdgeRuntime.waitUntil(promise);
}

async function fetchWithDiagnostics(
  step: string,
  url: string,
  init: RequestInit,
): Promise<{ status: number; contentType: string; rawSample: string; parsed: any; raw: string }> {
  console.log('[sync] ->', step, url, init.body);
  let res: Response;
  try {
    res = await fetch(url, init);
  } catch (e) {
    console.error('[sync] fetch threw', step, (e as Error).message);
    return { status: 0, contentType: '', rawSample: `THROW: ${(e as Error).message}`, parsed: null, raw: '' };
  }
  const contentType = res.headers.get('content-type') || '';
  const raw = await res.text().catch(() => '');
  const rawSample = raw.slice(0, 800);
  console.log(`[sync] <- ${step} status=${res.status} ct=${contentType} body[0..800]=${rawSample}`);
  let parsed: any = null;
  try {
    parsed = raw ? JSON.parse(raw) : null;
  } catch {
    parsed = null;
  }
  return { status: res.status, contentType, rawSample, parsed, raw };
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

  const result = await runSync(supabase, body.instance_id, body.cursor || {});
  return new Response(JSON.stringify(result), {
    status: 200,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
});

async function runSync(supabase: any, instanceId: string, cursor: SyncCursor = {}): Promise<any> {
  const diagnostics: Diagnostic[] = [];
  const errors: { chat?: string; error: string }[] = [];
  let chats_synced = 0;
  let messages_synced = 0;
  let contacts_synced = 0;
  const startedAt = Date.now();

  try {
    console.log('[sync-whatsapp-history] Starting sync for instance:', instanceId);

    const { data: instance, error: instanceErr } = await supabase
      .from('whatsapp_instances')
      .select('id, instance_name, provider_type, instance_id_external')
      .eq('id', instanceId)
      .single();

    if (instanceErr || !instance) {
      console.error('[sync-whatsapp-history] Instance not found:', instanceErr);
      return { success: false, error: 'Instance not found', diagnostics, errors, chats_synced, messages_synced, contacts_synced };
    }

    const { data: secrets, error: secretsErr } = await supabase
      .from('whatsapp_instance_secrets')
      .select('api_url, api_key')
      .eq('instance_id', instance.id)
      .single();

    if (secretsErr || !secrets) {
      console.error('[sync-whatsapp-history] Secrets not found:', secretsErr);
      return { success: false, error: 'Secrets not found', diagnostics, errors, chats_synced, messages_synced, contacts_synced };
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

    // ---- 1. Sync contacts (best-effort, chunked) ----
    if (!cursor.contacts_done) {
      const url = `${apiUrl}/chat/findContacts/${instanceIdentifier}`;
      const d = await fetchWithDiagnostics('findContacts', url, {
        method: 'POST',
        headers,
        body: JSON.stringify({ where: {} }),
      });
      const list = extractList(d.parsed);
      const startIndex = cursor.contact_index || 0;
      const contactsSlice = list.slice(startIndex, startIndex + CONTACTS_PER_INVOCATION);
      pushDiagnostic(diagnostics, {
        step: 'findContacts',
        url,
        status: d.status,
        content_type: d.contentType,
        raw_sample: d.rawSample,
        parsed_count: contactsSlice.length,
      });
      if (d.status >= 200 && d.status < 300) {
        for (const c of contactsSlice) {
          const remoteJid: string | undefined = c.remoteJid || c.id || c.jid;
          if (!remoteJid) continue;
          const { phone, isGroup: parsedGroup } = normalizePhoneNumber(remoteJid);
          if (!phone) continue;
          const isGroup = parsedGroup || remoteJid.endsWith('@g.us');
          const name = c.pushName || c.name || c.notify || c.verifiedName || phone;
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

        if (startIndex + CONTACTS_PER_INVOCATION < list.length) {
          const next_cursor = {
            ...cursor,
            contact_index: startIndex + CONTACTS_PER_INVOCATION,
            contacts_done: false,
          };
          scheduleNextChunk(instanceId, next_cursor);
          return { success: true, continued: true, next_cursor, chats_synced, messages_synced, contacts_synced, diagnostics, errors };
        }

        cursor = { ...cursor, contacts_done: true, contact_index: list.length, chat_index: cursor.chat_index || 0 };
      } else {
        errors.push({ error: `findContacts ${d.status}: ${d.rawSample.slice(0, 200)}` });
        cursor = { ...cursor, contacts_done: true, chat_index: cursor.chat_index || 0 };
      }
    }

    // ---- 2. List chats ----
    let chats: any[] = [];
    {
      const url = `${apiUrl}/chat/findChats/${instanceIdentifier}`;
      const d = await fetchWithDiagnostics('findChats', url, {
        method: 'POST',
        headers,
        body: JSON.stringify({ where: {} }),
      });
      chats = extractList(d.parsed);
      pushDiagnostic(diagnostics, {
        step: 'findChats',
        url,
        status: d.status,
        content_type: d.contentType,
        raw_sample: d.rawSample,
        parsed_count: chats.length,
      });
      if (d.status < 200 || d.status >= 300) {
        errors.push({ error: `findChats ${d.status}: ${d.rawSample.slice(0, 200)}` });
        return { success: false, error: 'findChats failed', diagnostics, errors, chats_synced, messages_synced, contacts_synced };
      }
    }

    // ---- 3. Iterate chats and import messages ----
    let batch: PendingMessage[] = [];
    let msgDiagSamples = 0;

    const startChatIndex = cursor.chat_index || 0;
    const maxChatIndex = Math.min(chats.length, startChatIndex + CHATS_PER_INVOCATION);

    for (let chatIndex = startChatIndex; chatIndex < maxChatIndex; chatIndex++) {
      const chat = chats[chatIndex];
      const remoteJid: string | undefined = chat.remoteJid || chat.id || chat.jid;
      if (!remoteJid) continue;

      const { phone, isGroup: parsedGroup } = normalizePhoneNumber(remoteJid);
      if (!phone) continue;
      const isGroup = parsedGroup || remoteJid.endsWith('@g.us');

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
      let offset = chatIndex === startChatIndex ? cursor.message_offset || 0 : 0;
      let page = chatIndex === startChatIndex ? cursor.message_page || 1 : 1;
      let totalPages = 1;
      let bodyFormat: 'A' | 'B' = chatIndex === startChatIndex ? cursor.message_body_format || 'A' : 'A';
      let triedB = bodyFormat === 'B';

      while (true) {
        const url = `${apiUrl}/chat/findMessages/${instanceIdentifier}`;
        const bodyA = { where: { key: { remoteJid } }, limit: PAGE_SIZE, offset, page };
        const bodyB = { where: { remoteJid }, limit: PAGE_SIZE, page };
        const reqBody = bodyFormat === 'A' ? bodyA : bodyB;
        const d = await fetchWithDiagnostics(
          `findMessages:${remoteJid}:body${bodyFormat}`,
          url,
          { method: 'POST', headers, body: JSON.stringify(reqBody) },
        );

        if (d.status === 404) {
          break; // empty chat
        }
        if (d.status < 200 || d.status >= 300) {
          errors.push({
            chat: remoteJid,
            error: `findMessages ${d.status}: ${d.rawSample.slice(0, 200)}`,
          });
          break;
        }

        const payload = d.parsed;
        let records: any[] = extractList(payload);
        if (payload?.messages?.pages) totalPages = payload.messages.pages;
        else if (payload?.pages) totalPages = payload.pages;

        // First-page fallback to body B
        if (records.length === 0 && page === 1 && bodyFormat === 'A' && !triedB) {
          triedB = true;
          bodyFormat = 'B';
          if (msgDiagSamples < 2) {
            pushDiagnostic(diagnostics, {
              step: `findMessages:${remoteJid}:bodyA`,
              url,
              status: d.status,
              content_type: d.contentType,
              raw_sample: d.rawSample,
              parsed_count: 0,
            });
            msgDiagSamples++;
          }
          continue;
        }

        if (msgDiagSamples < 2) {
          pushDiagnostic(diagnostics, {
            step: `findMessages:${remoteJid}:body${bodyFormat}`,
            url,
            status: d.status,
            content_type: d.contentType,
            raw_sample: d.rawSample,
            parsed_count: records.length,
          });
          msgDiagSamples++;
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

    return {
      success: true,
      chats_synced,
      messages_synced,
      contacts_synced,
      diagnostics,
      errors,
    };
  } catch (error) {
    console.error('[sync-whatsapp-history] Unexpected error:', error);
    return {
      success: false,
      error: (error as Error).message,
      chats_synced,
      messages_synced,
      contacts_synced,
      diagnostics,
      errors,
    };
  }
}