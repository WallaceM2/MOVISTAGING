const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

process.env.MP_TOKEN_ENCRYPTION_KEY = 'a'.repeat(64);
process.env.PAYMENT_PROVIDER = 'none';
process.env.MP_CHECKOUT_ENABLED = 'false';
const mercadoPago = require('../src/services/mercadoPagoMarketplace');

test('credenciais Mercado Pago são criptografadas com autenticação e não aparecem em claro', () => {
  const credential = 'TEST-secret-do-vendedor';
  const sealed = mercadoPago.encryptSecret(credential);
  assert.notEqual(sealed, credential);
  assert.equal(sealed.startsWith('v1:'), true);
  assert.equal(mercadoPago.decryptSecret(sealed), credential);

  const tampered = `${sealed.slice(0, -1)}${sealed.endsWith('A') ? 'B' : 'A'}`;
  assert.throws(() => mercadoPago.decryptSecret(tampered), { code: 'MP_CREDENTIAL_DECRYPTION_FAILED' });
});

test('manifest de webhook segue a assinatura HMAC documentada', () => {
  assert.equal(
    mercadoPago.buildWebhookManifest({ dataId: 'ABC123', requestId: 'req-1', timestamp: '1742505638683' }),
    'id:abc123;request-id:req-1;ts:1742505638683;',
  );
});

test('webhook de teste valida HMAC em tempo constante e rejeita alteração ou timestamp vencido', () => {
  const secret = 'sandbox-webhook-secret';
  const dataId = '123456789';
  const requestId = 'request-123';
  const now = Date.now();
  const timestamp = String(now);
  const manifest = mercadoPago.buildWebhookManifest({ dataId, requestId, timestamp });
  const digest = crypto.createHmac('sha256', secret).update(manifest).digest('hex');
  const signature = `ts=${timestamp},v1=${digest}`;

  assert.equal(mercadoPago.verifyWebhookSignature({ signature, requestId, dataId, secret, now }), true);
  assert.equal(mercadoPago.verifyWebhookSignature({ signature, requestId, dataId: '999', secret, now }), false);
  assert.equal(mercadoPago.verifyWebhookSignature({ signature, requestId, dataId, secret, now: now + 6 * 60 * 1000 }), false);
  assert.equal(mercadoPago.verifyWebhookSignature({ signature: 'ts=abc,v1=nope', requestId, dataId, secret, now }), false);
});

test('status externos são normalizados sem promover pagamento pendente a pago', () => {
  assert.equal(mercadoPago.mapProviderStatus('approved'), 'pago');
  assert.equal(mercadoPago.mapProviderStatus('pending', 'pending_waiting_payment'), 'pendente');
  assert.equal(mercadoPago.mapProviderStatus('rejected'), 'falhou');
  assert.equal(mercadoPago.mapProviderStatus('cancelled'), 'cancelado');
  assert.equal(mercadoPago.mapProviderStatus('unknown'), null);
});

test('snapshot Marketplace mantém tarifa, taxa do meio e comissão 85/15 em ciclos separados', () => {
  assert.deepEqual(mercadoPago.calcularSnapshotPagamento({
    tarifaBase: 40,
    taxaProcessamento: 2.37,
    versaoCalculo: 'sandbox-rate-2026-10',
  }), {
    tarifa_base: 40,
    taxa_processamento: 2.37,
    valor_total: 42.37,
    comissao_marketplace: 6,
    repasse_economico_motorista: 34,
    percentual_comissao: 15,
    percentual_motorista: 85,
    versao_calculo_financeiro: 'sandbox-rate-2026-10',
  });
  assert.throws(() => mercadoPago.calcularSnapshotPagamento({ tarifaBase: 0, taxaProcessamento: 1, versaoCalculo: 'x' }), { code: 'MP_PAYMENT_SNAPSHOT_INVALID' });
});
