const crypto = require('crypto');
const bcrypt = require('bcrypt');
const pool = require('../config/database');
const env = require('../config/env');
const AppError = require('../errors/AppError');

function encryptionKey() {
  const encoded = String(env.FINANCIAL_DATA_ENCRYPTION_KEY || '').trim();
  const key = /^[a-f0-9]{64}$/i.test(encoded) ? Buffer.from(encoded, 'hex') : Buffer.from(encoded, 'base64');
  if (key.length !== 32) throw new AppError('A chave de criptografia dos dados financeiros precisa ter 32 bytes.', 503, 'FINANCIAL_ENCRYPTION_KEY_MISSING');
  return key;
}

function encryptDestination(value) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', encryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(value), 'utf8'), cipher.final()]);
  return `v1:${iv.toString('base64url')}:${cipher.getAuthTag().toString('base64url')}:${ciphertext.toString('base64url')}`;
}

function decryptDestination(value) {
  const [version, encodedIv, encodedTag, encodedCiphertext, extra] = String(value || '').split(':');
  if (version !== 'v1' || !encodedIv || !encodedTag || !encodedCiphertext || extra !== undefined) {
    throw new AppError('Dados de recebimento cifrados em formato inválido.', 500, 'PAYOUT_DESTINATION_INVALID');
  }
  try {
    const decipher = crypto.createDecipheriv('aes-256-gcm', encryptionKey(), Buffer.from(encodedIv, 'base64url'));
    decipher.setAuthTag(Buffer.from(encodedTag, 'base64url'));
    const plaintext = Buffer.concat([
      decipher.update(Buffer.from(encodedCiphertext, 'base64url')),
      decipher.final(),
    ]).toString('utf8');
    return JSON.parse(plaintext);
  } catch (_) {
    throw new AppError('Não foi possível validar os dados de recebimento cifrados.', 500, 'PAYOUT_DESTINATION_DECRYPT_FAILED');
  }
}

function maskPixKey(type, value) {
  const clean = String(value).trim();
  if (type === 'email') {
    const [name, domain] = clean.split('@');
    return `${name.slice(0, 1)}***@${domain}`;
  }
  return `••••${clean.replace(/\D/g, '').slice(-4) || clean.slice(-4)}`;
}

function maskAccount(value) {
  const clean = String(value || '').trim();
  return clean ? `••••${clean.replace(/\D/g, '').slice(-4) || clean.slice(-4)}` : null;
}

async function getAccount(driverId) {
  const { rows } = await pool.query(`
    SELECT tipo_chave_pix, chave_pix_mascarada, conta_mascarada,
           senha_saque_hash IS NOT NULL AS pin_configurado, atualizado_em
    FROM movi_contas_recebimento_motoristas
    WHERE motorista_id = $1
    LIMIT 1;
  `, [driverId]);
  return { conta: rows[0] || null, saques_habilitados: false, provedor: env.PAYOUT_PROVIDER };
}

async function saveAccount(driverId, details) {
  const encrypted = encryptDestination(details);
  const pixMask = maskPixKey(details.tipo_chave_pix, details.chave_pix);
  const accountMask = maskAccount(details.conta);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(`
      INSERT INTO movi_contas_recebimento_motoristas
        (motorista_id, tipo_chave_pix, destino_cifrado, chave_pix_mascarada, conta_mascarada)
      VALUES ($1,$2,$3,$4,$5)
      ON CONFLICT (motorista_id) DO UPDATE SET
        tipo_chave_pix = EXCLUDED.tipo_chave_pix,
        destino_cifrado = EXCLUDED.destino_cifrado,
        chave_pix_mascarada = EXCLUDED.chave_pix_mascarada,
        conta_mascarada = EXCLUDED.conta_mascarada,
        atualizado_em = NOW()
      RETURNING tipo_chave_pix, chave_pix_mascarada, conta_mascarada,
                senha_saque_hash IS NOT NULL AS pin_configurado, atualizado_em;
    `, [driverId, details.tipo_chave_pix, encrypted, pixMask, accountMask]);
    await client.query(`
      INSERT INTO movi_audit_logs (actor_type, actor_id, action, target_type, target_id, metadata)
      VALUES ('motorista', $1, 'saque.conta_recebimento_atualizada', 'motorista', $1,
        jsonb_build_object('tipo_chave_pix', $2, 'dados_sensiveis', 'redacted'));
    `, [driverId, details.tipo_chave_pix]);
    await client.query('COMMIT');
    return { conta: rows[0], saques_habilitados: false, provedor: env.PAYOUT_PROVIDER };
  } catch (error) {
    try { await client.query('ROLLBACK'); } catch (_) {}
    throw error;
  } finally {
    client.release();
  }
}

async function setWithdrawalPin(driverId, currentPin, nextPin) {
  const client = await pool.connect();
  let failure = null;
  try {
    await client.query('BEGIN');
    const result = await client.query(`
      SELECT senha_saque_hash, falhas_pin, pin_bloqueado_ate
      FROM movi_contas_recebimento_motoristas
      WHERE motorista_id = $1
      FOR UPDATE;
    `, [driverId]);
    const row = result.rows[0];
    if (!row) throw new AppError('Cadastre primeiro seus dados de recebimento Pix.', 409, 'PAYOUT_ACCOUNT_REQUIRED');
    if (row.pin_bloqueado_ate && new Date(row.pin_bloqueado_ate).getTime() > Date.now()) {
      throw new AppError('Muitas tentativas. Aguarde o desbloqueio para alterar seu PIN.', 429, 'WITHDRAWAL_PIN_LOCKED');
    }
    if (row.senha_saque_hash) {
      const correct = currentPin && await bcrypt.compare(currentPin, row.senha_saque_hash);
      if (!correct) {
        const failures = Math.min(Number(row.falhas_pin || 0) + 1, 5);
        await client.query(`
          UPDATE movi_contas_recebimento_motoristas
          SET falhas_pin = $2,
              pin_bloqueado_ate = CASE WHEN $2 >= 5 THEN NOW() + INTERVAL '30 minutes' ELSE NULL END,
              atualizado_em = NOW()
          WHERE motorista_id = $1;
        `, [driverId, failures]);
        await client.query('COMMIT');
        failure = new AppError(failures >= 5 ? 'PIN bloqueado por 30 minutos após tentativas inválidas.' : 'PIN atual incorreto.', failures >= 5 ? 429 : 400, failures >= 5 ? 'WITHDRAWAL_PIN_LOCKED' : 'WITHDRAWAL_PIN_INVALID');
      }
    }
    if (!failure) {
      const hash = await bcrypt.hash(nextPin, 12);
      await client.query(`
        UPDATE movi_contas_recebimento_motoristas
        SET senha_saque_hash = $2, falhas_pin = 0, pin_bloqueado_ate = NULL, atualizado_em = NOW()
        WHERE motorista_id = $1;
      `, [driverId, hash]);
      await client.query(`
        INSERT INTO movi_audit_logs (actor_type, actor_id, action, target_type, target_id, metadata)
        VALUES ('motorista', $1, 'saque.pin_configurado', 'motorista', $1, '{"pin":"redacted"}'::jsonb);
      `, [driverId]);
      await client.query('COMMIT');
    }
  } catch (error) {
    try { await client.query('ROLLBACK'); } catch (_) {}
    throw error;
  } finally {
    client.release();
  }
  if (failure) throw failure;
  return { pin_configurado: true, saques_habilitados: false };
}

module.exports = { getAccount, saveAccount, setWithdrawalPin, encryptDestination, decryptDestination, maskPixKey, maskAccount };
