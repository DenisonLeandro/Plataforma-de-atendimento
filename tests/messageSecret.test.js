import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { webcrypto as crypto } from 'node:crypto';
import { decryptSecretEdit, textFromDecryptedEdit, findMessageSecret, bytesFrom } from '../supabase/functions/_shared/message-secret.ts';

const enc = new TextEncoder();
async function hmac(key, data) {
  const k = await crypto.subtle.importKey('raw', key, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return new Uint8Array(await crypto.subtle.sign('HMAC', k, data));
}
// protocolMessage(12){ type=14, editedMessage(14){ conversation(1) } }
function editProto(text) {
  const t = enc.encode(text);
  const edited = Uint8Array.from([0x0a, t.length, ...t]);
  const protocol = Uint8Array.from([0x10, 0x0e, 0x72, edited.length, ...edited]);
  return Uint8Array.from([0x62, protocol.length, ...protocol]);
}
async function encryptEdit(secret, id, orig, mod, text) {
  const prk = await hmac(new Uint8Array(32), secret);
  const info = Uint8Array.from([...enc.encode(id + orig + mod + 'Message Edit'), 1]);
  const key = await crypto.subtle.importKey('raw', await hmac(prk, info), 'AES-GCM', false, ['encrypt']);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  return { iv, payload: new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, editProto(text))) };
}

test('edição criptografada do contato é lida com o LID certo entre os candidatos', async () => {
  const secret = crypto.getRandomValues(new Uint8Array(32));
  const lid = '110316587327578@lid';
  const { iv, payload } = await encryptEdit(secret, 'ORIG1', lid, lid, 'Olá');
  const plain = await decryptSecretEdit({ secret, encPayload: payload, encIv: iv, originalId: 'ORIG1',
    jids: ['554391915369@s.whatsapp.net', '251942831919156@lid', lid] });
  assert.equal(textFromDecryptedEdit(plain), 'Olá');
});

test('sem o remetente certo a edição não é lida (não inventa texto)', async () => {
  const secret = crypto.getRandomValues(new Uint8Array(32));
  const { iv, payload } = await encryptEdit(secret, 'ORIG2', 'a@lid', 'a@lid', 'novo');
  const plain = await decryptSecretEdit({ secret, encPayload: payload, encIv: iv, originalId: 'ORIG2', jids: ['b@lid'] });
  assert.equal(plain, null);
});

test('chave da mensagem é encontrada em formato de bytes ou base64', () => {
  const bytes = Object.fromEntries([...Array(32).keys()].map((i) => [String(i), i]));
  const b64 = findMessageSecret({ conversation: 'Oi', messageContextInfo: { messageSecret: bytes } });
  assert.deepEqual([...bytesFrom(b64)], [...Array(32).keys()]);
  assert.equal(findMessageSecret({ conversation: 'Oi' }), null);
});
