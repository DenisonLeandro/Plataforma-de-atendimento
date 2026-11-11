// WhatsApp now sends edits as secretEncryptedMessage, encrypted with the original
// message's messageSecret. Pure WebCrypto so it runs in Deno and Node tests.

const enc = new TextEncoder();
const dec = new TextDecoder();
const USE_CASE_EDIT = 'Message Edit';

export function bytesFrom(value: any): Uint8Array | null {
  if (!value) return null;
  if (value instanceof Uint8Array) return value;
  if (typeof value === 'string') {
    try {
      const bin = atob(value);
      return Uint8Array.from(bin, (c) => c.charCodeAt(0));
    } catch { return null; }
  }
  if (Array.isArray(value)) return Uint8Array.from(value);
  if (typeof value === 'object') {
    if (value.type === 'Buffer' && Array.isArray(value.data)) return Uint8Array.from(value.data);
    const keys = Object.keys(value).filter((k) => /^\d+$/.test(k)).sort((a, b) => Number(a) - Number(b));
    if (keys.length) return Uint8Array.from(keys.map((k) => Number(value[k])));
  }
  return null;
}

export function bytesToBase64(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}

/** Returns base64 messageSecret found anywhere in a webhook message object. */
export function findMessageSecret(message: any): string | null {
  const stack = [message];
  for (let i = 0; stack.length && i < 50; i++) {
    const node = stack.pop();
    if (!node || typeof node !== 'object') continue;
    const raw = node.messageContextInfo?.messageSecret;
    const bytes = bytesFrom(raw);
    if (bytes && bytes.length === 32) return bytesToBase64(bytes);
    for (const v of Object.values(node)) if (v && typeof v === 'object') stack.push(v);
  }
  return null;
}

function concat(...parts: Uint8Array[]) {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
}

async function hmac(key: Uint8Array, data: Uint8Array) {
  const k = await crypto.subtle.importKey('raw', key, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return new Uint8Array(await crypto.subtle.sign('HMAC', k, data));
}

function nonAd(jid: string) {
  const [user, server] = jid.split('@');
  return `${user.split(':')[0]}@${server}`;
}

/** Tries every (original sender, edit sender) pair; AES-GCM auth confirms the right one. */
export async function decryptSecretEdit(opts: {
  secret: Uint8Array; encPayload: Uint8Array; encIv: Uint8Array; originalId: string; jids: string[];
}): Promise<Uint8Array | null> {
  const jids = [...new Set(opts.jids.filter((j) => typeof j === 'string' && j.includes('@')).map(nonAd))];
  const prk = await hmac(new Uint8Array(32), opts.secret);
  for (const orig of jids) {
    for (const mod of jids) {
      const info = concat(enc.encode(opts.originalId), enc.encode(orig), enc.encode(mod),
        enc.encode(USE_CASE_EDIT), new Uint8Array([1]));
      const keyBytes = await hmac(prk, info);
      try {
        const key = await crypto.subtle.importKey('raw', keyBytes, 'AES-GCM', false, ['decrypt']);
        return new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: opts.encIv }, key, opts.encPayload));
      } catch { /* wrong pair */ }
    }
  }
  return null;
}

// --- Minimal protobuf reader for the decrypted Message ---
type Field = { no: number; wire: number; bytes?: Uint8Array; num?: number };

function readVarint(buf: Uint8Array, pos: number): [number, number] {
  let result = 0, shift = 0;
  while (pos < buf.length) {
    const b = buf[pos++];
    result += (b & 0x7f) * 2 ** shift;
    if (!(b & 0x80)) break;
    shift += 7;
  }
  return [result, pos];
}

function fields(buf: Uint8Array): Field[] {
  const out: Field[] = [];
  let pos = 0;
  while (pos < buf.length) {
    let tag; [tag, pos] = readVarint(buf, pos);
    const no = Math.floor(tag / 8), wire = tag & 7;
    if (wire === 0) { let n; [n, pos] = readVarint(buf, pos); out.push({ no, wire, num: n }); }
    else if (wire === 2) {
      let len; [len, pos] = readVarint(buf, pos);
      out.push({ no, wire, bytes: buf.subarray(pos, pos + len) }); pos += len;
    } else if (wire === 1) pos += 8;
    else if (wire === 5) pos += 4;
    else throw new Error('protobuf inválido');
  }
  return out;
}

const sub = (fs: Field[], no: number) => fs.find((f) => f.no === no && f.wire === 2)?.bytes;

/** Extracts the new text from a decrypted Message (protocolMessage.editedMessage). */
export function textFromDecryptedEdit(plain: Uint8Array): string | null {
  try {
    let msg = plain;
    for (let depth = 0; depth < 6; depth++) {
      const fs = fields(msg);
      const protocol = sub(fs, 12);
      if (protocol) {
        const edited = sub(fields(protocol), 14);
        if (edited) { msg = edited; continue; }
      }
      const conversation = sub(fs, 1);
      if (conversation) return dec.decode(conversation);
      const ext = sub(fs, 6);
      if (ext) { const t = sub(fields(ext), 1); if (t) return dec.decode(t); }
      const image = sub(fs, 3);
      if (image) { const t = sub(fields(image), 3); if (t) return dec.decode(t); }
      const video = sub(fs, 9);
      if (video) { const t = sub(fields(video), 7); if (t) return dec.decode(t); }
      return null;
    }
  } catch { /* fallthrough */ }
  return null;
}
