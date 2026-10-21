const test = require('node:test');
const assert = require('node:assert/strict');

process.env.FINANCIAL_DATA_ENCRYPTION_KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
const payout = require('../src/services/driverPayoutSetupService');

test('destino de recebimento é cifrado e não aparece em texto aberto', () => {
  const secret = { chave_pix: 'motorista@example.test', banco: 'Banco Teste', conta: '12345678' };
  const encrypted = payout.encryptDestination(secret);
  assert.match(encrypted, /^v1:/);
  assert.equal(encrypted.includes(secret.chave_pix), false);
  assert.equal(encrypted.includes(secret.conta), false);
  assert.deepEqual(payout.decryptDestination(encrypted), secret);
});

test('cifra autenticada rejeita alterações no destino persistido', () => {
  const encrypted = payout.encryptDestination({ chave_pix: 'chave-sintetica' });
  const altered = `${encrypted.slice(0, -1)}${encrypted.endsWith('A') ? 'B' : 'A'}`;
  assert.throws(() => payout.decryptDestination(altered), { code: 'PAYOUT_DESTINATION_DECRYPT_FAILED' });
});

test('respostas de recebimento mascaram chave Pix e conta', () => {
  assert.equal(payout.maskPixKey('email', 'motorista@example.test'), 'm***@example.test');
  assert.equal(payout.maskAccount('12345678'), '••••5678');
});
