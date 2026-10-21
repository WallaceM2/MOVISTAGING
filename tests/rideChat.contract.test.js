const test = require('node:test');
const assert = require('node:assert/strict');
const pool = require('../src/config/database');
const RideChat = require('../src/models/RideChat');
const { createMessageSchema } = require('../src/validators/rideChatValidator');
const { validateChatMediaSignature } = require('../src/middlewares/chatUpload');

test('contrato do chat aceita texto idempotente e rejeita payload inválido', () => {
  const valid = createMessageSchema.safeParse({
    client_message_id: 'ride-chat_0123456789',
    tipo: 'texto',
    mensagem: 'Estou chegando ao embarque.',
  });
  assert.equal(valid.success, true);
  assert.equal(createMessageSchema.safeParse({ client_message_id: 'short', tipo: 'texto', mensagem: '' }).success, false);
  assert.equal(createMessageSchema.safeParse({ client_message_id: 'ride-chat_0123456789', tipo: 'arquivo', mensagem: 'oi' }).success, false);
  assert.equal(createMessageSchema.safeParse({ client_message_id: 'ride-chat_0123456789', tipo: 'texto', mensagem: 'x'.repeat(1001) }).success, false);
});

test('contrato do chat aceita imagem JPG com assinatura e rejeita arquivo incompatível', () => {
  const validReq = { file: { mimetype: 'image/jpeg', buffer: Buffer.from([0xff, 0xd8, 0xff, 0x00]) } };
  let validError = null;
  validateChatMediaSignature(validReq, {}, (error) => { validError = error ?? null; });
  assert.equal(validError, null);

  const invalidReq = { file: { mimetype: 'image/png', buffer: Buffer.from('não é png') } };
  let invalidError = null;
  validateChatMediaSignature(invalidReq, {}, (error) => { invalidError = error; });
  assert.equal(invalidError?.code, 'INVALID_CHAT_MEDIA_CONTENT');
});

test('contrato do chat reconhece cabeçalho M4A/MP4 de áudio', () => {
  const buffer = Buffer.alloc(16);
  buffer.write('ftyp', 4, 'ascii');
  let error = null;
  validateChatMediaSignature({ file: { mimetype: 'audio/mp4', buffer } }, {}, (nextError) => { error = nextError ?? null; });
  assert.equal(error, null);
});

test('chat só libera participantes da corrida aceita ou em andamento', async () => {
  const originalQuery = pool.query;
  try {
    pool.query = async (_sql, [rideId]) => ({ rows: [{ id: rideId, passageiro_id: 12, motorista_id: 34, status: 'aceita' }] });
    await assert.doesNotReject(RideChat.assertCanSend({ rideId: 9, tipo: 'passageiro', usuarioId: 12 }));
    await assert.doesNotReject(RideChat.assertCanSend({ rideId: 9, tipo: 'motorista', usuarioId: 34 }));
    await assert.rejects(RideChat.assertCanSend({ rideId: 9, tipo: 'passageiro', usuarioId: 13 }), (error) => error.code === 'RIDE_NOT_FOUND');

    pool.query = async () => ({ rows: [{ id: 9, passageiro_id: 12, motorista_id: 34, status: 'concluida' }] });
    await assert.rejects(RideChat.assertCanSend({ rideId: 9, tipo: 'passageiro', usuarioId: 12 }), (error) => error.code === 'RIDE_CHAT_UNAVAILABLE');
  } finally {
    pool.query = originalQuery;
  }
});
