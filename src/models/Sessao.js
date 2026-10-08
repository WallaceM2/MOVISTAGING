const pool = require('../config/database');

async function criar({ tipo, usuarioId, tokenHash, expiraEm, ip, userAgent, familiaId = null, rotacaoNumero = 0, db = pool }) {
  const { rows } = await db.query(`
    INSERT INTO movi_refresh_tokens (
      tipo_usuario, usuario_id, token_hash, expira_em, ip, user_agent, familia_id, rotacao_numero
    )
    VALUES ($1,$2,$3,$4,$5,$6,COALESCE($7::uuid, gen_random_uuid()),$8)
    RETURNING id, familia_id, rotacao_numero, expira_em;
  `, [tipo, usuarioId, tokenHash, expiraEm, ip, userAgent, familiaId, rotacaoNumero]);
  return rows[0];
}

async function buscarAtiva(tokenHash, db = pool) {
  const { rows } = await db.query(`
    SELECT id, tipo_usuario, usuario_id, token_hash, expira_em, revogado_em, familia_id, rotacao_numero
    FROM movi_refresh_tokens
    WHERE token_hash = $1 AND revogado_em IS NULL AND expira_em > NOW()
    LIMIT 1;
  `, [tokenHash]);
  return rows[0];
}

async function buscarPorHash(tokenHash, db = pool) {
  const { rows } = await db.query(`
    SELECT id, tipo_usuario, usuario_id, token_hash, expira_em, revogado_em, familia_id, rotacao_numero
    FROM movi_refresh_tokens
    WHERE token_hash = $1
    LIMIT 1;
  `, [tokenHash]);
  return rows[0];
}

async function revogar(tokenHash, db = pool) {
  await db.query(`
    UPDATE movi_refresh_tokens
    SET revogado_em = NOW(), revogado_motivo = COALESCE(revogado_motivo, 'logout')
    WHERE token_hash = $1 AND revogado_em IS NULL;
  `, [tokenHash]);
}

async function revogarDoUsuario(tokenHash, tipo, usuarioId, db = pool) {
  await db.query(`
    UPDATE movi_refresh_tokens
    SET revogado_em = NOW(), revogado_motivo = COALESCE(revogado_motivo, 'logout')
    WHERE token_hash = $1 AND tipo_usuario = $2 AND usuario_id = $3 AND revogado_em IS NULL;
  `, [tokenHash, tipo, usuarioId]);
}

async function revogarFamilia(familiaId, db = pool, motivo = 'refresh_token_reuse') {
  await db.query(`
    UPDATE movi_refresh_tokens
    SET revogado_em = NOW(), revogado_motivo = COALESCE(revogado_motivo, $2)
    WHERE familia_id = $1 AND revogado_em IS NULL;
  `, [familiaId, motivo]);
}

async function revogarTodas(tipo, usuarioId, db = pool, motivo = 'password_change') {
  await db.query(`
    UPDATE movi_refresh_tokens
    SET revogado_em = NOW(), revogado_motivo = COALESCE(revogado_motivo, $3)
    WHERE tipo_usuario = $1 AND usuario_id = $2 AND revogado_em IS NULL;
  `, [tipo, usuarioId, motivo]);
}

module.exports = { criar, buscarAtiva, buscarPorHash, revogar, revogarDoUsuario, revogarFamilia, revogarTodas };
