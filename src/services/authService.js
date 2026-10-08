const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const AppError = require('../errors/AppError');
const env = require('../config/env');
const pool = require('../config/database');
const Sessao = require('../models/Sessao');
const { signAccessToken, createRefreshToken, hashToken, refreshExpiresAt } = require('./tokenService');

const USER_TABLES = Object.freeze({
  motorista: 'motoristas',
  passageiro: 'passageiros',
  admin: 'admins',
});

async function buscarUsuarioPorTipo(tipo, id) {
  const table = USER_TABLES[tipo];
  if (!table) return null;

  if (tipo === 'motorista') {
    const { rows } = await pool.query(`
      SELECT id, nome, sobrenome, email, categoria, status_cadastro, status_conta
      FROM ${table} WHERE id = $1 LIMIT 1;
    `, [id]);
    return rows[0];
  }
  if (tipo === 'passageiro') {
    const { rows } = await pool.query(`
      SELECT id, nome, sobrenome, email, status_conta
      FROM ${table} WHERE id = $1 LIMIT 1;
    `, [id]);
    return rows[0];
  }
  const { rows } = await pool.query(`
    SELECT id, nome, email, status
    FROM ${table} WHERE id = $1 LIMIT 1;
  `, [id]);
  return rows[0];
}

function assertAccountCanLogin(tipo, usuario) {
  if (!usuario) throw new AppError('Email ou senha inválidos.', 401, 'INVALID_CREDENTIALS');
  const status = tipo === 'admin' ? usuario.status : usuario.status_conta;
  if (['suspensa', 'banida', 'bloqueada', 'inativo'].includes(status)) {
    throw new AppError('Conta indisponível. Procure o suporte.', 403, 'ACCOUNT_UNAVAILABLE');
  }
}

async function autenticarSenha({ tipo, email, senha, buscarPorEmail, ip, userAgent }) {
  const usuario = await buscarPorEmail(email);
  if (!usuario) throw new AppError('Email ou senha inválidos.', 401, 'INVALID_CREDENTIALS');

  const senhaValida = await bcrypt.compare(senha, usuario.senha_hash);
  if (!senhaValida) throw new AppError('Email ou senha inválidos.', 401, 'INVALID_CREDENTIALS');
  assertAccountCanLogin(tipo, usuario);

  await pool.query(`UPDATE ${USER_TABLES[tipo]} SET ultimo_login_em = NOW() WHERE id = $1`, [usuario.id]);

  const accessToken = signAccessToken({ id: usuario.id, tipo, jti: crypto.randomUUID() });
  const refreshToken = createRefreshToken();
  const sessao = await Sessao.criar({
    tipo,
    usuarioId: usuario.id,
    tokenHash: hashToken(refreshToken),
    expiraEm: refreshExpiresAt(),
    ip,
    userAgent,
  });

  return { usuario, accessToken, refreshToken, sessao };
}

async function refresh(refreshToken, { ip = null, userAgent = null } = {}) {
  if (!refreshToken || typeof refreshToken !== 'string' || refreshToken.length < 20 || refreshToken.length > 500) {
    throw new AppError('Refresh token ausente ou inválido.', 401, 'INVALID_REFRESH_TOKEN');
  }

  const oldHash = hashToken(refreshToken);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const sessionResult = await client.query(`
      SELECT id, tipo_usuario, usuario_id, token_hash, expira_em, revogado_em, familia_id, rotacao_numero
      FROM movi_refresh_tokens
      WHERE token_hash = $1
      LIMIT 1
      FOR UPDATE;
    `, [oldHash]);
    const sessao = sessionResult.rows[0];

    if (!sessao) {
      throw new AppError('Refresh token inválido ou expirado.', 401, 'INVALID_REFRESH_TOKEN');
    }

    if (sessao.revogado_em || new Date(sessao.expira_em).getTime() <= Date.now()) {
      if (sessao.familia_id) await Sessao.revogarFamilia(sessao.familia_id, client, 'refresh_token_reuse');
      await client.query('COMMIT');
      throw new AppError('Refresh token inválido ou expirado.', 401, 'INVALID_REFRESH_TOKEN_REUSE');
    }

    const usuario = await buscarUsuarioPorTipo(sessao.tipo_usuario, sessao.usuario_id);
    try {
      assertAccountCanLogin(sessao.tipo_usuario, usuario);
    } catch (error) {
      await client.query(`UPDATE movi_refresh_tokens SET revogado_em = NOW(), revogado_motivo = 'account_unavailable' WHERE id = $1`, [sessao.id]);
      await client.query('COMMIT');
      throw error;
    }

    await client.query(`
      UPDATE movi_refresh_tokens
      SET revogado_em = NOW(), revogado_motivo = 'rotated'
      WHERE id = $1 AND revogado_em IS NULL;
    `, [sessao.id]);

    const newRefresh = createRefreshToken();
    await client.query(`
      INSERT INTO movi_refresh_tokens (
        tipo_usuario, usuario_id, token_hash, expira_em, ip, user_agent,
        familia_id, rotacao_numero
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8);
    `, [
      sessao.tipo_usuario,
      sessao.usuario_id,
      hashToken(newRefresh),
      refreshExpiresAt(),
      ip,
      userAgent,
      sessao.familia_id,
      Number(sessao.rotacao_numero || 0) + 1,
    ]);

    await client.query('COMMIT');

    return {
      token: signAccessToken({ id: sessao.usuario_id, tipo: sessao.tipo_usuario, jti: crypto.randomUUID() }),
      refresh_token: newRefresh,
    };
  } catch (error) {
    try { await client.query('ROLLBACK'); } catch (_) {}
    throw error;
  } finally {
    client.release();
  }
}

async function alterarSenha({ tipo, usuarioId, senhaAtual, novaSenha }) {
  const table = USER_TABLES[tipo];
  if (!table) throw new AppError('Tipo de usuário inválido.', 400, 'INVALID_USER_TYPE');
  if (senhaAtual === novaSenha) throw new AppError('A nova senha deve ser diferente da senha atual.', 400, 'PASSWORD_REUSE');
  const { rows } = await pool.query(`SELECT senha_hash FROM ${table} WHERE id = $1 LIMIT 1`, [usuarioId]);
  const usuario = rows[0];
  if (!usuario || !(await bcrypt.compare(senhaAtual, usuario.senha_hash))) {
    throw new AppError('Senha atual inválida.', 401, 'INVALID_CURRENT_PASSWORD');
  }
  const senhaHash = await bcrypt.hash(novaSenha, 12);
  await pool.query(`UPDATE ${table} SET senha_hash = $1, atualizado_em = NOW() WHERE id = $2`, [senhaHash, usuarioId]);
  await Sessao.revogarTodas(tipo, usuarioId, pool, 'password_change');
}

function verifyAccessToken(token) {
  return jwt.verify(token, env.JWT_SECRET, {
    algorithms: ['HS256'],
    issuer: 'movi-api',
    audience: 'movi-app',
    clockTolerance: 5,
  });
}

module.exports = { buscarUsuarioPorTipo, assertAccountCanLogin, autenticarSenha, refresh, verifyAccessToken };
