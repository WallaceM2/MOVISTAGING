const crypto = require('crypto');
const bcrypt = require('bcrypt');
const pool = require('../config/database');
const env = require('../config/env');
const AppError = require('../errors/AppError');
const Sessao = require('../models/Sessao');
const { normalizeEmail, normalizePhone } = require('../utils/validators');
const delivery = require('./passwordRecoveryDeliveryService');

const USER_TABLES = Object.freeze({ passageiro: 'passageiros', motorista: 'motoristas' });
const INVALID_CODE = () => new AppError('Código inválido ou expirado. Solicite outro código e tente novamente.', 400, 'RECOVERY_CODE_INVALID');
const INVALID_TOKEN = () => new AppError('A solicitação de recuperação expirou. Comece novamente.', 400, 'RECOVERY_TOKEN_INVALID');

function digest(value, purpose) {
  return crypto.createHmac('sha256', env.JWT_SECRET).update(`${purpose}:${value}`).digest('hex');
}

function safeEqual(left, right) {
  const a = Buffer.from(String(left || ''), 'hex');
  const b = Buffer.from(String(right || ''), 'hex');
  return a.length === b.length && a.length > 0 && crypto.timingSafeEqual(a, b);
}

function normalizeDestination(method, destination) {
  if (method === 'email') return normalizeEmail(destination);
  const digits = normalizePhone(destination);
  return digits.length >= 10 && digits.length <= 15 ? digits : '';
}

async function requestCode({ tipoUsuario, metodo, destino }) {
  const table = USER_TABLES[tipoUsuario];
  if (!table || !['email', 'sms'].includes(metodo)) throw new AppError('Canal de recuperação inválido.', 400, 'INVALID_RECOVERY_CHANNEL');
  if (!delivery.isConfigured(metodo)) throw new AppError('A recuperação de senha por este canal ainda não está configurada.', 503, 'RECOVERY_CHANNEL_UNAVAILABLE');
  const normalized = normalizeDestination(metodo, destino);
  if (!normalized) throw new AppError('Informe um endereço de e-mail ou telefone válido.', 400, 'INVALID_RECOVERY_DESTINATION');
  await pool.query("DELETE FROM movi_recuperacoes_senha WHERE criado_em < NOW() - INTERVAL '30 days'");

  const lookup = metodo === 'email'
    ? `SELECT id, email AS destino FROM ${table} WHERE LOWER(email) = $1 LIMIT 1`
    : `SELECT id, telefone AS destino FROM ${table} WHERE regexp_replace(COALESCE(telefone, ''), '[^0-9]', '', 'g') = $1 LIMIT 1`;
  const result = await pool.query(lookup, [normalized]);
  const account = result.rows[0] || null;
  const id = crypto.randomUUID();
  const code = String(crypto.randomInt(100000, 1000000));
  await pool.query(`
    UPDATE movi_recuperacoes_senha SET consumido_em = NOW()
    WHERE tipo_usuario = $1 AND destino_hash = $2 AND consumido_em IS NULL;
  `, [tipoUsuario, digest(normalized, 'destination')]);
  await pool.query(`
    INSERT INTO movi_recuperacoes_senha
      (id, tipo_usuario, usuario_id, metodo, destino_hash, codigo_hash, codigo_expira_em)
    VALUES ($1,$2,$3,$4,$5,$6,NOW() + INTERVAL '10 minutes');
  `, [id, tipoUsuario, account?.id ?? null, metodo, digest(normalized, 'destination'), digest(`${id}:${code}`, 'code')]);

  if (account) {
    const deliveryDestination = metodo === 'email' ? account.destino : `+${normalizePhone(account.destino)}`;
    try { await delivery.sendRecoveryCode(metodo, deliveryDestination, code); }
    catch (error) {
      await pool.query('UPDATE movi_recuperacoes_senha SET consumido_em = NOW() WHERE id = $1', [id]);
      throw error;
    }
  }
  return { challengeId: id, mensagem: 'Se os dados corresponderem a uma conta, enviaremos um código de recuperação.' };
}

async function verifyCode({ challengeId, code }) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await client.query('SELECT * FROM movi_recuperacoes_senha WHERE id = $1 FOR UPDATE', [challengeId]);
    const row = result.rows[0];
    if (!row || row.consumido_em || row.verificado_em || Number(row.tentativas) >= 5 || new Date(row.codigo_expira_em).getTime() <= Date.now()) {
      await client.query('COMMIT');
      throw INVALID_CODE();
    }
    const expected = digest(`${challengeId}:${code}`, 'code');
    if (!safeEqual(row.codigo_hash, expected) || !row.usuario_id) {
      await client.query('UPDATE movi_recuperacoes_senha SET tentativas = tentativas + 1 WHERE id = $1', [challengeId]);
      await client.query('COMMIT');
      throw INVALID_CODE();
    }
    const recoveryToken = crypto.randomBytes(32).toString('base64url');
    await client.query(`
      UPDATE movi_recuperacoes_senha
      SET verificado_em = NOW(), token_recuperacao_hash = $1, token_expira_em = NOW() + INTERVAL '15 minutes'
      WHERE id = $2;
    `, [digest(recoveryToken, 'recovery'), challengeId]);
    await client.query('COMMIT');
    return { token_recuperacao: recoveryToken };
  } catch (error) {
    try { await client.query('ROLLBACK'); } catch (_) {}
    throw error;
  } finally { client.release(); }
}

async function resetPassword({ challengeId, token, newPassword }) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await client.query('SELECT * FROM movi_recuperacoes_senha WHERE id = $1 FOR UPDATE', [challengeId]);
    const row = result.rows[0];
    if (!row || !row.usuario_id || row.consumido_em || !row.verificado_em || !row.token_expira_em || new Date(row.token_expira_em).getTime() <= Date.now() || !safeEqual(row.token_recuperacao_hash, digest(token, 'recovery'))) {
      await client.query('COMMIT');
      throw INVALID_TOKEN();
    }
    const table = USER_TABLES[row.tipo_usuario];
    if (!table) throw INVALID_TOKEN();
    const passwordHash = await bcrypt.hash(newPassword, 12);
    await client.query(`UPDATE ${table} SET senha_hash = $1, atualizado_em = NOW() WHERE id = $2`, [passwordHash, row.usuario_id]);
    await Sessao.revogarTodas(row.tipo_usuario, row.usuario_id, client, 'password_recovery');
    await client.query('UPDATE movi_recuperacoes_senha SET consumido_em = NOW() WHERE id = $1', [challengeId]);
    await client.query('COMMIT');
    return { sucesso: true };
  } catch (error) {
    try { await client.query('ROLLBACK'); } catch (_) {}
    throw error;
  } finally { client.release(); }
}

module.exports = { requestCode, verifyCode, resetPassword };
