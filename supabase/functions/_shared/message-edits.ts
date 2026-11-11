import { bytesFrom, findMessageSecret, decryptSecretEdit, textFromDecryptedEdit } from './message-secret.ts';
// Evolution/Baileys uses different envelopes for edits across versions.
export function extractMessageEdit(data: any): { messageId: string; content: string } | null {
  const update = data?.update || data;
  let message = update?.message || data?.message;
  let targetId: string | undefined;
  let foundEdit = false;

  for (let depth = 0; message && depth < 12; depth++) {
    if (message.protocolMessage?.editedMessage) {
      targetId = message.protocolMessage.key?.id || targetId;
      message = message.protocolMessage.editedMessage;
      foundEdit = true;
    } else if (message.editedMessage) {
      targetId = message.editedMessage.key?.id || targetId;
      message = message.editedMessage;
      foundEdit = true;
    } else {
      const inner = message.ephemeralMessage?.message
        || message.viewOnceMessage?.message
        || message.viewOnceMessageV2?.message
        || message.deviceSentMessage?.message
        || message.message;
      if (!inner) break;
      message = inner;
    }
  }

  // A messages.update with replacement text can carry no protocol envelope.
  if (!foundEdit && !data?.update) return null;
  const messageId = targetId || update?.key?.id || data?.key?.id
    || update?.keyId || data?.keyId || update?.messageId || data?.messageId;
  const content = message?.conversation ?? message?.extendedTextMessage?.text
    ?? message?.imageMessage?.caption ?? message?.videoMessage?.caption
    ?? message?.documentMessage?.caption;
  return typeof messageId === 'string' && typeof content === 'string'
    ? { messageId, content } : null;
}

export async function applyMessageEdit(supabase: any, instanceId: string, edit: { messageId: string; content: string }) {
  const { data: current, error: fetchError } = await supabase
    .from('whatsapp_messages')
    .select('id, content, original_content, conversation_id, whatsapp_conversations!inner(instance_id)')
    .eq('message_id', edit.messageId)
    .eq('whatsapp_conversations.instance_id', instanceId)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();
  if (fetchError) throw new Error(fetchError.message);
  // Throw so the existing webhook queue retries out-of-order edits.
  if (!current) throw new Error('Mensagem original da edição ainda não encontrada');
  if (current.content === edit.content) return;

  const { error: historyError } = await supabase.from('whatsapp_message_edit_history').insert({
    message_id: edit.messageId,
    conversation_id: current.conversation_id,
    previous_content: current.content,
  });
  if (historyError) throw new Error(historyError.message);

  const { error: updateError } = await supabase.from('whatsapp_messages').update({
    content: edit.content,
    edited_at: new Date().toISOString(),
    original_content: current.original_content ?? current.content,
  }).eq('id', current.id);
  if (updateError) throw new Error(updateError.message);

  const { data: latest, error: latestError } = await supabase.from('whatsapp_messages')
    .select('id').eq('conversation_id', current.conversation_id)
    .order('timestamp', { ascending: false }).limit(1).maybeSingle();
  if (latestError) throw new Error(latestError.message);
  if (latest?.id === current.id) {
    const { error } = await supabase.from('whatsapp_conversations')
      .update({ last_message_preview: edit.content.substring(0, 100) })
      .eq('id', current.conversation_id).eq('instance_id', instanceId);
    if (error) throw new Error(error.message);
  }
}
// ---------------------------------------------------------------------------
// Encrypted edits (secretEncryptedMessage, secretEncType 2 = MESSAGE_EDIT).
// ---------------------------------------------------------------------------

export function getSecretEdit(data: any) {
  const se = data?.message?.secretEncryptedMessage;
  if (!se?.targetMessageKey?.id || !se.encPayload || !se.encIv) return null;
  // 2 = MESSAGE_EDIT. Other types (event edits, etc.) are ignored.
  if (se.secretEncType !== undefined && Number(se.secretEncType) !== 2 && se.secretEncType !== 'MESSAGE_EDIT') return null;
  return se;
}

const jidsFromMeta = (m: any) => [m?.ack_remote_jid, m?.last_remote_jid, m?.preferred_send_jid, m?.resolved_phone_jid];

/**
 * Decrypts an encrypted edit and applies it to the original bubble. When the
 * edit can't be read, the original bubble is only flagged — never a fake new message.
 * Returns 'applied' | 'unreadable'.
 */
export async function applySecretEncryptedEdit(
  supabase: any, instanceId: string, data: any, sender?: string | null,
): Promise<'applied' | 'unreadable'> {
  const se = getSecretEdit(data);
  if (!se) return 'unreadable';
  const target = se.targetMessageKey;
  const key = data.key || {};

  const { data: instance } = await supabase.from('whatsapp_instances')
    .select('metadata').eq('id', instanceId).maybeSingle();
  const instanceMeta = instance?.metadata || {};
  // On an edit from the contact, the target key is seen from their side: its remoteJid is our own LID.
  if (!key.fromMe && typeof target.remoteJid === 'string' && target.remoteJid.endsWith('@lid')
      && instanceMeta.own_lid !== target.remoteJid) {
    await supabase.from('whatsapp_instances')
      .update({ metadata: { ...instanceMeta, own_lid: target.remoteJid } }).eq('id', instanceId);
    instanceMeta.own_lid = target.remoteJid;
  }

  const { data: original, error } = await supabase.from('whatsapp_messages')
    .select('id, remote_jid, metadata, edited_at, conversation_id, whatsapp_conversations!inner(instance_id, metadata, whatsapp_contacts(phone_number, metadata))')
    .eq('message_id', target.id)
    .eq('whatsapp_conversations.instance_id', instanceId)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!original) throw new Error('Mensagem original da edição ainda não encontrada');

  let secret: string | null = original.metadata?.message_secret || null;
  const inboxJids: string[] = [];
  if (!secret) {
    const { data: events } = await supabase.from('whatsapp_webhook_events')
      .select('payload').eq('message_id', target.id).eq('instance_id', instanceId).limit(5);
    for (const ev of events || []) {
      const d = ev.payload?.data;
      inboxJids.push(d?.key?.remoteJid, d?.key?.remoteJidAlt);
      secret = secret || findMessageSecret(d?.message);
    }
  }

  let text: string | null = null;
  if (secret) {
    const conv = original.whatsapp_conversations || {};
    const contact = conv.whatsapp_contacts || {};
    const jids = [
      key.remoteJid, key.remoteJidAlt, key.participant, key.senderLid, key.senderPn, target.remoteJid,
      sender, instanceMeta.own_lid, original.remote_jid, ...inboxJids,
      ...jidsFromMeta(original.metadata), ...jidsFromMeta(conv.metadata), ...jidsFromMeta(contact.metadata),
      contact.phone_number && String(contact.phone_number).length >= 14 ? `${contact.phone_number}@lid` : null,
    ].filter(Boolean) as string[];
    const plain = await decryptSecretEdit({
      secret: bytesFrom(secret)!, encPayload: bytesFrom(se.encPayload)!, encIv: bytesFrom(se.encIv)!,
      originalId: target.id, jids,
    });
    if (plain) text = textFromDecryptedEdit(plain);
  }

  if (text !== null) {
    await applyMessageEdit(supabase, instanceId, { messageId: target.id, content: text });
    return 'applied';
  }

  if (!original.edited_at && !original.metadata?.edited_unreadable) {
    const { error: flagError } = await supabase.from('whatsapp_messages')
      .update({ metadata: { ...(original.metadata || {}), edited_unreadable: true, edited_unreadable_at: new Date().toISOString() } })
      .eq('id', original.id);
    if (flagError) throw new Error(flagError.message);
  }
  return 'unreadable';
}
