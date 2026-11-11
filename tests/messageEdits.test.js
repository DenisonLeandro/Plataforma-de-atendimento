import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { extractMessageEdit, applyMessageEdit } from '../supabase/functions/_shared/message-edits.ts';

test('edição protocolMessage usa ID original, não ID do evento', () => {
  assert.deepEqual(extractMessageEdit({ key: { id: 'evento' }, message: {
    protocolMessage: { key: { id: 'original' }, editedMessage: { conversation: 'corrigida' } },
  } }), { messageId: 'original', content: 'corrigida' });
});

test('edição encapsulada e texto estendido mantêm o conteúdo', () => {
  assert.deepEqual(extractMessageEdit({ key: { id: 'original' }, message: {
    ephemeralMessage: { message: { editedMessage: { message: { extendedTextMessage: { text: '*novo texto*' } } } } },
  } }), { messageId: 'original', content: '*novo texto*' });
});

test('messages.update aceita texto e legenda editados', () => {
  assert.deepEqual(extractMessageEdit({ key: { id: 'original' }, update: {
    message: { imageMessage: { caption: 'nova legenda' } },
  } }), { messageId: 'original', content: 'nova legenda' });
});

test('mensagens comuns e confirmações não são edições', () => {
  assert.equal(extractMessageEdit({ key: { id: 'x' }, message: { conversation: 'Oi' } }), null);
  assert.equal(extractMessageEdit({ key: { id: 'x' }, update: { status: 3 } }), null);
});

function mockDatabase(current, latest = current?.id) {
  const calls = [];
  const db = { from(table) {
    const call = { table, filters: [] }; calls.push(call);
    const query = {
      select(value) { call.select = value; return query; },
      eq(key, value) { call.filters.push([key, value]); return query; },
      order() { return query; }, limit() { return query; },
      insert(value) { call.insert = value; return query; },
      update(value) { call.update = value; return query; },
      async maybeSingle() { return { data: call.select === 'id' ? { id: latest } : current, error: null }; },
      then(resolve) { return Promise.resolve({ error: null }).then(resolve); },
    };
    return query;
  } };
  return { db, calls };
}

test('atualiza mensagem existente da instância e preserva original e histórico', async () => {
  const { db, calls } = mockDatabase({ id: 'row', content: 'antes', original_content: 'primeiro', conversation_id: 'chat' });
  await applyMessageEdit(db, 'instancia', { messageId: 'original', content: 'depois' });
  assert.deepEqual(calls[0].filters, [['message_id', 'original'], ['whatsapp_conversations.instance_id', 'instancia']]);
  assert.equal(calls[1].insert.previous_content, 'antes');
  assert.equal(calls[2].update.content, 'depois');
  assert.equal(calls[2].update.original_content, 'primeiro');
  assert.deepEqual(calls[2].filters, [['id', 'row']]);
  assert.equal(calls[4].update.last_message_preview, 'depois');
});

test('edição repetida não duplica histórico; edição antiga não troca resumo mais recente', async () => {
  const same = mockDatabase({ id: 'row', content: 'depois' });
  await applyMessageEdit(same.db, 'instancia', { messageId: 'original', content: 'depois' });
  assert.equal(same.calls.length, 1);
  const older = mockDatabase({ id: 'row', content: 'antes', conversation_id: 'chat' }, 'nova');
  await applyMessageEdit(older.db, 'instancia', { messageId: 'original', content: 'depois' });
  assert.equal(older.calls.some(call => call.table === 'whatsapp_conversations'), false);
});

test('edição sem mensagem original retorna erro para permitir nova tentativa', async () => {
  const { db } = mockDatabase(null);
  await assert.rejects(applyMessageEdit(db, 'instancia', { messageId: 'original', content: 'depois' }), /ainda não encontrada/);
});