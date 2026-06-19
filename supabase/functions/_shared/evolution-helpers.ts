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

// Detect whether a JID is a WhatsApp LID (Linked Identity) rather than a real phone.
// Since set/2025 the WhatsApp/Meta sends `@lid` (or addressingMode === 'lid') for
// contacts that are NOT saved in the connected number's agenda (mostly Android senders).
export function isLid(jid?: string, addressingMode?: string): boolean {
  if (addressingMode === 'lid') return true;
  return typeof jid === 'string' && jid.includes('@lid');
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
  const addressingMode = key?.addressingMode ?? data?.addressingMode;

  // Not a LID (real phone JID, group, etc.) → use as-is.
  if (!isLid(primary, addressingMode)) return primary;

  const candidates = [
    key?.senderPn,
    key?.remoteJidAlt,
    key?.participantPn,
    key?.participantAlt,
    key?.participant,
    data?.senderPn,
  ];

  for (const candidate of candidates) {
    if (
      typeof candidate === 'string' &&
      (candidate.includes('@s.whatsapp.net') || candidate.includes('@c.us'))
    ) {
      return candidate;
    }
  }

  // No real phone JID available; keep current behaviour.
  return primary;
}

// Extract the real phone JID from a payload key, or null if only a LID is available.
export function extractRealPhoneFromKey(key: any, data?: any): string | null {
  const resolved = resolvePhoneJid(key, data);
  if (!resolved) return null;
  if (isLid(resolved, key?.addressingMode ?? data?.addressingMode)) return null;
  return resolved;
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

// Reject a promise if it doesn't settle within `ms`. Used to bound the Storage upload,
// whose client does not accept an AbortSignal. Resolves/rejects with the original result.
export function withTimeout<T>(promise: PromiseLike<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`${label} timed out after ${ms}ms`)),
      ms,
    );
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}

// Download media from Evolution API (base64-decoded by the server) and upload to Supabase Storage.
// Shared by `evolution-webhook` (live) and `sync-whatsapp-history` (history backfill).
// `timeoutMs` bounds BOTH legs independently: an AbortController on the getBase64 fetch and a
// withTimeout wrapper on the Storage upload. Returns the public URL, or null on any failure
// (caller treats null as "no media_url" — grava NULL e segue).
export async function downloadAndUploadMedia(
  apiUrl: string,
  apiKey: string,
  instanceName: string,
  messageData: { key: any; message: any },
  supabase: any,
  mimetype: string,
  providerType: string = 'self_hosted',
  timeoutMs: number = 20000,
): Promise<string | null> {
  try {
    console.log('[media-helpers] Downloading media from Evolution API...');

    // Determine correct auth header based on provider type
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (providerType === 'cloud') {
      headers['Authorization'] = `Bearer ${apiKey}`;
    } else {
      headers['apikey'] = apiKey;
    }

    // Bound the getBase64 fetch with an AbortController.
    const controller = new AbortController();
    const fetchTimer = setTimeout(() => controller.abort(), timeoutMs);
    let response: Response;
    try {
      response = await fetch(
        `${apiUrl.replace(/\/+$/, "").replace(/\/manager$/, "")}/chat/getBase64FromMediaMessage/${instanceName}`,
        {
          method: 'POST',
          headers,
          body: JSON.stringify({
            message: {
              key: messageData.key,
              message: messageData.message,
            },
            convertToMp4: false,
          }),
          signal: controller.signal,
        }
      );
    } finally {
      clearTimeout(fetchTimer);
    }

    if (!response.ok) {
      const errText = await response.text().catch(() => '');
      console.error('[media-helpers] Failed to download media:', response.status, errText);
      return null;
    }

    const data = await response.json();
    const base64Data = data.base64;

    if (!base64Data) {
      console.error('[media-helpers] No base64 data in response');
      return null;
    }

    // Convert base64 to blob
    const base64String = base64Data.split(',')[1] || base64Data;
    const binaryString = atob(base64String);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    const blob = new Blob([bytes], { type: mimetype });

    // Generate unique filename
    // Extract extension correctly, removing codec info
    const extension = (mimetype.split('/')[1] || 'bin').split(';')[0].trim();
    const filename = `${Date.now()}-${messageData.key.id}.${extension}`;
    const filePath = `${instanceName}/${filename}`;

    console.log('[media-helpers] Uploading to Supabase Storage:', filePath);

    // Upload to Supabase Storage (bounded by withTimeout — the client has no AbortSignal).
    const { error: uploadError } = await withTimeout(
      supabase.storage
        .from('whatsapp-media')
        .upload(filePath, blob, {
          contentType: mimetype,
          upsert: false,
        }),
      timeoutMs,
      'storage upload',
    );

    if (uploadError) {
      console.error('[media-helpers] Storage upload error:', uploadError);
      return null;
    }

    // Get public URL
    const { data: publicUrlData } = supabase.storage
      .from('whatsapp-media')
      .getPublicUrl(filePath);

    console.log('[media-helpers] Media uploaded successfully:', publicUrlData.publicUrl);
    return publicUrlData.publicUrl;
  } catch (error) {
    console.error('[media-helpers] Error in downloadAndUploadMedia:', error);
    return null;
  }
}