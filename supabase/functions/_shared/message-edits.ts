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