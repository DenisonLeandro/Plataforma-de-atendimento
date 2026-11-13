import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { storedAtMs, storeLagMinutes, extractHistoryMessages } from '../supabase/functions/_shared/evolution-store.ts';

test('lê a hora de gravação do cuid da Evolution', () => {
  // cuid real do Centro gravado em 2026-11-13 14:24:06 UTC
  const ms = storedAtMs({ id: 'cmwf2i7o73v3krw4qlqd469xq' });
  assert.equal(new Date(ms).toISOString().slice(0, 16), '2026-11-13T14:24');
});

test('mede atraso entre envio e gravação', () => {
  const lag = storeLagMinutes({ id: 'cmwf2i7o73v3krw4qlqd469xq', messageTimestamp: 1794577452 });
  assert.ok(lag > 30 && lag < 60, String(lag));
});

test('histórico: remove duplicadas e mensagens com mais de 7 dias', () => {
  const now = 1794580000000;
  const recent = now / 1000 - 3600, old = now / 1000 - 8 * 86400;
  const out = extractHistoryMessages({ messages: [
    { key: { id: 'A', remoteJid: '1@lid' }, messageTimestamp: recent },
    { key: { id: 'A', remoteJid: '1@lid' }, messageTimestamp: recent },
    { key: { id: 'B', remoteJid: '1@lid' }, messageTimestamp: old },
    { key: { id: 'C', remoteJid: 'status@broadcast' }, messageTimestamp: recent },
  ] }, now);
  assert.deepEqual(out.map((m) => m.key.id), ['A']);
});
