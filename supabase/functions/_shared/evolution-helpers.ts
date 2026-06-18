// Shared helpers for Evolution API payloads.
// Used by both `evolution-webhook` and `sync-whatsapp-history` edge functions.

// Normalize phone number by removing WhatsApp suffixes.
// Also adds the 9th digit for Brazilian numbers with 12 digits.
export function normalizePhoneNumber(remoteJid: string): { phone: string; isGroup: boolean } {
  const isGroup = remoteJid.includes('@g.us');
  let phone = remoteJid
    .replace('@s.whatsapp.net', '')
    .replace('@g.us', '')
    .replace('@lid', '')
    .replace(/:\d+/, '');

  if (phone.startsWith('55') && phone.length === 12) {
    const countryCode = phone.substring(0, 2);
    const ddd = phone.substring(2, 4);
    const number = phone.substring(4);
    phone = `${countryCode}${ddd}9${number}`;
  }

  return { phone, isGroup };
}

// Resolve the best JID to derive the real phone number from.
// For contacts NOT saved in the agenda, WhatsApp/Baileys sends a `@lid` identifier
// (a long internal integer) in `key.remoteJid` instead of the real phone JID
// (`<phone>@s.whatsapp.net`). When that happens, look for the real phone JID in
// alternative payload fields. Best-effort: field names vary across Evolution versions,
// so we scan a set of candidates and only accept a value that is clearly a phone JID.
// If none is found, fall back to the original remoteJid (no regression).
export function resolvePhoneJid(key: any, data?: any): string {
  const primary: string = key?.remoteJid ?? '';

  // Not a @lid (real phone JID, group, etc.) → use as-is.
  if (!primary.includes('@lid')) return primary;

  const candidates = [
    key?.senderPn,
    key?.remoteJidAlt,
    key?.participantPn,
    key?.participantAlt,
    key?.participant,
    data?.senderPn,
  ];

  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.includes('@s.whatsapp.net')) {
      return candidate;
    }
  }

  // No real phone JID available; keep current behaviour.
  return primary;
}

// Detect message type from Evolution API message object
export function getMessageType(message: any): string {
  if (!message) return 'text';
  if (message.reactionMessage) return 'reaction';
  if (message.conversation || message.extendedTextMessage) return 'text';
  if (message.imageMessage) return 'image';
  if (message.audioMessage) return 'audio';
  if (message.videoMessage) return 'video';
  if (message.documentMessage) return 'document';
  if (message.stickerMessage) return 'sticker';
  if (message.contactMessage) return 'contact';
  if (message.contactsArrayMessage) return 'contacts';
  return 'text';
}

// Detect if message is an edited message
export function isEditedMessage(message: any): boolean {
  return !!(message?.editedMessage || message?.protocolMessage?.editedMessage);
}

// Extract content/caption from message
export function getMessageContent(message: any, type: string): string {
  if (!message) return 'Mensagem';
  if (message.conversation) return message.conversation;
  if (message.extendedTextMessage?.text) return message.extendedTextMessage.text;

  if (message.contactMessage) {
    return message.contactMessage.displayName || '📇 Contato';
  }
  if (message.contactsArrayMessage) {
    const count = message.contactsArrayMessage.contacts?.length || 0;
    return `📇 ${count} contato${count !== 1 ? 's' : ''}`;
  }

  const mediaMessage = message[`${type}Message`];
  if (mediaMessage?.caption) return mediaMessage.caption;

  const descriptions: Record<string, string> = {
    image: '📷 Imagem',
    audio: '🎵 Áudio',
    video: '🎥 Vídeo',
    document: '📄 Documento',
    sticker: '🎨 Sticker',
  };

  return descriptions[type] || 'Mensagem';
}