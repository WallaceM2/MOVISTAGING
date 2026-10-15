const crypto = require('crypto');
const AppError = require('../errors/AppError');
const env = require('../config/env');
const pool = require('../config/database');

const API_BASE = 'https://api.mercadopago.com';
const AUTH_BASE = 'https://auth.mercadopago.com/authorization';
const TOKEN_URL = `${API_BASE}/oauth/token`;
const TOKEN_TTL_MS = 10 * 60 * 1000;
const MAX_WEBHOOK_AGE_MS = 5 * 60 * 1000;

function getEncryptionKey() {
  const encoded = String(env.MP_TOKEN_ENCRYPTION_KEY || '').trim();
  let key;
  if (/^[a-f0-9]{64}$/i.test(encoded)) key = Buffer.from(encoded, 'hex');
  else key = Buffer.from(encoded, 'base64');
  if (key.length !== 32) throw new AppError('A chave de criptografia do Mercado Pago precisa ter 32 bytes.', 503, 'MP_ENCRYPTION_KEY_MISSING');
  return key;
}

function encryptSecret(value) {
  if (typeof value !== 'string' || !value) throw new TypeError('Secret must be a non-empty string');
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', getEncryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  return `v1:${iv.toString('base64url')}:${cipher.getAuthTag().toString('base64url')}:${ciphertext.toString('base64url')}`;
}

function decryptSecret(serialized) {
  const [version, ivEncoded, tagEncoded, bodyEncoded, extra] = String(serialized || '').split(':');
  if (version !== 'v1' || !ivEncoded || !tagEncoded || !bodyEncoded || extra) {
    throw new AppError('Credencial Mercado Pago armazenada em formato inválido.', 503, 'MP_STORED_CREDENTIAL_INVALID');
  }
  try {
    const decodeCanonicalBase64Url = (value) => {
      if (!/^[A-Za-z0-9_-]+$/.test(value)) throw new Error('Invalid base64url');
      const decoded = Buffer.from(value, 'base64url');
      if (decoded.toString('base64url') !== value) throw new Error('Non-canonical base64url');
      return decoded;
    };
    const iv = decodeCanonicalBase64Url(ivEncoded);
    const tag = decodeCanonicalBase64Url(tagEncoded);
    const ciphertext = decodeCanonicalBase64Url(bodyEncoded);
    if (iv.length !== 12 || tag.length !== 16 || ciphertext.length === 0) throw new Error('Invalid credential size');
    const decipher = crypto.createDecipheriv('aes-256-gcm', getEncryptionKey(), iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
  } catch (_) {
    throw new AppError('Não foi possível desbloquear a credencial Mercado Pago.', 503, 'MP_CREDENTIAL_DECRYPTION_FAILED');
  }
}

function assertOAuthConfig() {
  if (!env.MP_APP_ID || !env.MP_CLIENT_SECRET || !env.MP_REDIRECT_URI) {
    throw new AppError('A configuração OAuth de sandbox do Mercado Pago está incompleta.', 503, 'MP_OAUTH_NOT_CONFIGURED');
  }
  let parsed;
  try { parsed = new URL(env.MP_REDIRECT_URI); } catch (_) {}
  if (!parsed || (env.isProduction && parsed.protocol !== 'https:')) {
    throw new AppError('A URL de retorno do Mercado Pago precisa ser válida e HTTPS em produção.', 503, 'MP_REDIRECT_URI_INVALID');
  }
}

function assertSandboxOnly() {
  if (env.MP_ENVIRONMENT !== 'sandbox') {
    throw new AppError('A vinculação Marketplace permanece limitada ao sandbox até a homologação financeira.', 503, 'MP_PRODUCTION_DISABLED');
  }
}

function mapProviderStatus(status, statusDetail) {
  if (statusDetail === 'partially_refunded') return 'parcial';
  if (status === 'approved') return 'pago';
  if (status === 'refunded' || status === 'charged_back') return 'reembolsado';
  if (status === 'cancelled') return 'cancelado';
  if (status === 'rejected') return 'falhou';
  if (status === 'authorized') return 'autorizado';
  if (status === 'pending' || status === 'in_process' || status === 'in_mediation') return 'pendente';
  return null;
}

function buildWebhookManifest({ dataId, requestId, timestamp }) {
  const fields = [];
  if (dataId) fields.push(`id:${String(dataId).toLowerCase()}`);
  if (requestId) fields.push(`request-id:${requestId}`);
  if (timestamp) fields.push(`ts:${timestamp}`);
  return `${fields.join(';')};`;
}

function verifyWebhookSignature({ signature, requestId, dataId, secret, now = Date.now() }) {
  if (!signature || !secret || !dataId) return false;
  const parts = Object.fromEntries(String(signature).split(',').map((part) => {
    const separator = part.indexOf('=');
    return separator > 0 ? [part.slice(0, separator).trim(), part.slice(separator + 1).trim()] : ['', ''];
  }).filter(([key, value]) => key && value));
  const timestamp = parts.ts;
  const supplied = parts.v1;
  if (!/^\d{10,13}$/.test(timestamp || '') || !/^[a-f0-9]{64}$/i.test(supplied || '')) return false;
  const tsMs = timestamp.length === 10 ? Number(timestamp) * 1000 : Number(timestamp);
  if (!Number.isFinite(tsMs) || Math.abs(now - tsMs) > MAX_WEBHOOK_AGE_MS) return false;
  const manifest = buildWebhookManifest({ dataId, requestId, timestamp });
  const expected = crypto.createHmac('sha256', secret).update(manifest).digest();
  const received = Buffer.from(supplied, 'hex');
  return received.length === expected.length && crypto.timingSafeEqual(received, expected);
}

async function providerRequest(url, { method = 'GET', accessToken, body, idempotencyKey } = {}) {
  const headers = { Accept: 'application/json' };
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
  if (body) headers['Content-Type'] = 'application/json';
  if (idempotencyKey) headers['X-Idempotency-Key'] = idempotencyKey;
  const response = await fetch(url, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(10_000),
  });
  let result;
  try { result = await response.json(); } catch (_) { result = null; }
  if (!response.ok) {
    throw new AppError('O Mercado Pago não aceitou a solicitação. Verifique a configuração e tente novamente.', 502, 'MP_PROVIDER_REQUEST_FAILED', {
      provider_status: response.status,
      provider_cause: Array.isArray(result?.cause) ? result.cause.map((item) => String(item.code || 'unknown')).slice(0, 5) : undefined,
    });
  }
  return result;
}

async function iniciarOAuth(motoristaId) {
  assertSandboxOnly();
  assertOAuthConfig();
  getEncryptionKey();
  const nonce = crypto.randomBytes(32).toString('base64url');
  const state = crypto.randomBytes(32).toString('base64url');
  const challenge = crypto.createHash('sha256').update(nonce).digest('base64url');
  const stateHash = crypto.createHash('sha256').update(state).digest('hex');
  await pool.query(`
    DELETE FROM movi_mp_oauth_states
    WHERE expires_at < NOW() OR consumido_em IS NOT NULL OR motorista_id = $1
  `, [motoristaId]);
  await pool.query(`
    INSERT INTO movi_mp_oauth_states (state_hash, motorista_id, code_verifier_encrypted, expires_at)
    VALUES ($1,$2,$3,NOW() + INTERVAL '10 minutes')
  `, [stateHash, motoristaId, encryptSecret(nonce)]);
  const url = new URL(AUTH_BASE);
  url.searchParams.set('client_id', env.MP_APP_ID);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('platform_id', 'mp');
  url.searchParams.set('state', state);
  url.searchParams.set('redirect_uri', env.MP_REDIRECT_URI);
  url.searchParams.set('code_challenge', challenge);
  url.searchParams.set('code_challenge_method', 'S256');
  return { authorization_url: url.toString(), expires_in_seconds: 600 };
}

async function concluirOAuth({ code, state }) {
  assertSandboxOnly();
  assertOAuthConfig();
  if (typeof code !== 'string' || code.length < 8 || code.length > 2048 || typeof state !== 'string' || state.length < 32 || state.length > 256) {
    throw new AppError('Retorno OAuth inválido ou expirado.', 400, 'MP_OAUTH_CALLBACK_INVALID');
  }
  const stateHash = crypto.createHash('sha256').update(state).digest('hex');
  const client = await pool.connect();
  let driverId;
  let verifier;
  try {
    await client.query('BEGIN');
    const result = await client.query(`
      SELECT motorista_id, code_verifier_encrypted
      FROM movi_mp_oauth_states
      WHERE state_hash = $1 AND consumido_em IS NULL AND expires_at > NOW()
      FOR UPDATE
    `, [stateHash]);
    if (!result.rows[0]) throw new AppError('Retorno OAuth inválido ou expirado.', 400, 'MP_OAUTH_STATE_INVALID');
    driverId = Number(result.rows[0].motorista_id);
    verifier = decryptSecret(result.rows[0].code_verifier_encrypted);
    await client.query('UPDATE movi_mp_oauth_states SET consumido_em = NOW() WHERE state_hash = $1', [stateHash]);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }

  const driver = await pool.query(`
    SELECT id FROM motoristas
    WHERE id = $1 AND status_cadastro = 'aprovado' AND status_conta = 'ativa'
    LIMIT 1
  `, [driverId]);
  if (!driver.rows[0]) throw new AppError('A conta de motorista não está habilitada para vinculação financeira.', 403, 'MP_DRIVER_NOT_ELIGIBLE');

  const credentials = await providerRequest(TOKEN_URL, {
    method: 'POST',
    body: {
      client_id: env.MP_APP_ID,
      client_secret: env.MP_CLIENT_SECRET,
      code,
      grant_type: 'authorization_code',
      redirect_uri: env.MP_REDIRECT_URI,
      code_verifier: verifier,
      test_token: 'true',
    },
  });
  if (!credentials?.access_token || !credentials?.refresh_token || !Number.isSafeInteger(Number(credentials.user_id)) || !Number.isFinite(Number(credentials.expires_in))) {
    throw new AppError('O Mercado Pago retornou credenciais OAuth incompletas.', 502, 'MP_OAUTH_RESPONSE_INVALID');
  }

  await pool.query(`
    INSERT INTO movi_mp_motorista_tokens (
      motorista_id, mp_user_id, access_token_encrypted, refresh_token_encrypted,
      public_key, ambiente, expires_at, revogado_em, atualizado_em
    ) VALUES ($1,$2,$3,$4,$5,'sandbox',NOW() + ($6 * INTERVAL '1 second'),NULL,NOW())
    ON CONFLICT (motorista_id) DO UPDATE SET
      mp_user_id = EXCLUDED.mp_user_id,
      access_token_encrypted = EXCLUDED.access_token_encrypted,
      refresh_token_encrypted = EXCLUDED.refresh_token_encrypted,
      public_key = EXCLUDED.public_key,
      ambiente = 'sandbox', expires_at = EXCLUDED.expires_at,
      conectado_em = NOW(), atualizado_em = NOW(), revogado_em = NULL
  `, [driverId, Number(credentials.user_id), encryptSecret(credentials.access_token), encryptSecret(credentials.refresh_token), credentials.public_key || null, Math.min(Number(credentials.expires_in), 180 * 24 * 60 * 60)]);
  return { motorista_id: driverId, conta_vinculada: true, ambiente: 'sandbox' };
}

async function obterTokenVendedor(motoristaId) {
  const result = await pool.query(`
    SELECT access_token_encrypted FROM movi_mp_motorista_tokens
    WHERE motorista_id = $1 AND ambiente = 'sandbox' AND revogado_em IS NULL AND expires_at > NOW()
    LIMIT 1
  `, [motoristaId]);
  if (!result.rows[0]) throw new AppError('O motorista ainda não vinculou uma conta Mercado Pago de teste válida.', 409, 'MP_SELLER_OAUTH_REQUIRED');
  return decryptSecret(result.rows[0].access_token_encrypted);
}

async function criarPagamentoMarketplace({ motoristaId, tarifaBase, taxaProcessamento, versaoCalculo, payload, idempotencyKey }) {
  assertSandboxOnly();
  if (!Number.isSafeInteger(Number(motoristaId)) || Number(motoristaId) <= 0) throw new AppError('Motorista inválido para pagamento.', 400, 'MP_SELLER_INVALID');
  const snapshot = calcularSnapshotPagamento({ tarifaBase, taxaProcessamento, versaoCalculo });
  if (!env.MP_WEBHOOK_URL) throw new AppError('URL HTTPS de webhook do Mercado Pago ainda não configurada.', 503, 'MP_WEBHOOK_URL_REQUIRED');
  let webhookUrl;
  try { webhookUrl = new URL(env.MP_WEBHOOK_URL); } catch (_) {}
  if (!webhookUrl || webhookUrl.protocol !== 'https:') throw new AppError('O webhook de pagamentos precisa usar HTTPS.', 503, 'MP_WEBHOOK_URL_INVALID');
  if (!/^[A-Za-z0-9._:-]{16,128}$/.test(String(idempotencyKey || ''))) throw new AppError('Chave de idempotência do pagamento inválida.', 400, 'MP_IDEMPOTENCY_KEY_INVALID');
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw new AppError('Dados de pagamento inválidos.', 400, 'MP_PAYMENT_PAYLOAD_INVALID');
  const externalReference = String(payload.external_reference || '');
  const method = String(payload.payment_method_id || '');
  if (!/^\d{1,12}$/.test(externalReference) || !/^[a-z0-9_-]{2,40}$/i.test(method)) throw new AppError('Referência da corrida ou meio de pagamento inválido.', 400, 'MP_PAYMENT_PAYLOAD_INVALID');
  if (method !== 'pix' && !payload.token) throw new AppError('Tokenização do meio de pagamento não informada.', 400, 'MP_PAYMENT_TOKEN_REQUIRED');
  if (Object.keys(payload).some((key) => /card(number|holder|expiration|cvv|security)/i.test(key))) {
    throw new AppError('Dados brutos de cartão não podem ser enviados ao backend MOVI.', 400, 'MP_RAW_CARD_DATA_FORBIDDEN');
  }
  const accessToken = await obterTokenVendedor(Number(motoristaId));
  const { external_reference: _externalRef, notification_url: _notificationUrl, transaction_amount: _amount, application_fee: _appFee, ...providerFields } = payload;
  const payment = await providerRequest(`${API_BASE}/v1/payments`, {
    method: 'POST', accessToken, idempotencyKey,
    body: {
      ...providerFields,
      transaction_amount: snapshot.valor_total,
      application_fee: snapshot.comissao_marketplace,
      external_reference: externalReference,
      notification_url: webhookUrl.toString(),
    },
  });
  return {
    id: String(payment.id || ''),
    status: mapProviderStatus(payment.status, payment.status_detail) || 'pendente',
    status_detail: String(payment.status_detail || ''),
    transaction_amount: Number(payment.transaction_amount),
    currency_id: String(payment.currency_id || ''),
    external_reference: String(payment.external_reference || ''),
    date_created: payment.date_created || null,
    point_of_interaction: payment.point_of_interaction || null,
    snapshot,
  };
}

async function buscarPagamentoVendedor(motoristaId, paymentId) {
  assertSandboxOnly();
  if (!/^\d{1,30}$/.test(String(paymentId || ''))) throw new AppError('Identificador de pagamento inválido.', 400, 'MP_PAYMENT_ID_INVALID');
  const accessToken = await obterTokenVendedor(Number(motoristaId));
  const payment = await providerRequest(`${API_BASE}/v1/payments/${encodeURIComponent(paymentId)}`, { accessToken });
  return payment;
}

function calcularSnapshotPagamento({ tarifaBase, taxaProcessamento, versaoCalculo }) {
  const base = Number(tarifaBase);
  const fee = Number(taxaProcessamento);
  if (!Number.isFinite(base) || base <= 0 || !Number.isFinite(fee) || fee < 0 || !versaoCalculo) {
    throw new AppError('Snapshot de pagamento inválido.', 400, 'MP_PAYMENT_SNAPSHOT_INVALID');
  }
  const baseCents = Math.round(base * 100);
  const feeCents = Math.round(fee * 100);
  const commissionCents = Math.round(baseCents * 0.15);
  return {
    tarifa_base: baseCents / 100,
    taxa_processamento: feeCents / 100,
    valor_total: (baseCents + feeCents) / 100,
    comissao_marketplace: commissionCents / 100,
    repasse_economico_motorista: (baseCents - commissionCents) / 100,
    percentual_comissao: 15,
    percentual_motorista: 85,
    versao_calculo_financeiro: String(versaoCalculo).slice(0, 80),
  };
}

module.exports = {
  encryptSecret,
  decryptSecret,
  mapProviderStatus,
  buildWebhookManifest,
  verifyWebhookSignature,
  iniciarOAuth,
  concluirOAuth,
  obterTokenVendedor,
  criarPagamentoMarketplace,
  buscarPagamentoVendedor,
  calcularSnapshotPagamento,
};
