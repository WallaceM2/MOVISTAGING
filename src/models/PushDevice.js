const pool = require('../config/database');

async function upsert({ usuarioTipo, usuarioId, appId, plataforma, token }) {
  const { rows } = await pool.query(`
    INSERT INTO movi_push_dispositivos
      (usuario_tipo, usuario_id, app_id, plataforma, expo_push_token, ativo, atualizado_em)
    VALUES ($1,$2,$3,$4,$5,TRUE,NOW())
    ON CONFLICT (expo_push_token) DO UPDATE SET
      usuario_tipo = EXCLUDED.usuario_tipo,
      usuario_id = EXCLUDED.usuario_id,
      app_id = EXCLUDED.app_id,
      plataforma = EXCLUDED.plataforma,
      ativo = TRUE,
      atualizado_em = NOW()
    WHERE (movi_push_dispositivos.usuario_tipo = EXCLUDED.usuario_tipo
       AND movi_push_dispositivos.usuario_id = EXCLUDED.usuario_id)
       OR movi_push_dispositivos.ativo = FALSE
    RETURNING id
  `, [usuarioTipo, usuarioId, appId, plataforma, token]);
  return rows[0] || null;
}

async function deactivate({ usuarioTipo, usuarioId, token }) {
  await pool.query(`
    UPDATE movi_push_dispositivos
    SET ativo = FALSE, atualizado_em = NOW()
    WHERE usuario_tipo = $1 AND usuario_id = $2 AND expo_push_token = $3
  `, [usuarioTipo, usuarioId, token]);
}

async function activeForUser(usuarioTipo, usuarioId) {
  const { rows } = await pool.query(`
    SELECT id, expo_push_token
    FROM movi_push_dispositivos
    WHERE usuario_tipo = $1 AND usuario_id = $2 AND ativo = TRUE
    ORDER BY atualizado_em DESC
  `, [usuarioTipo, usuarioId]);
  return rows;
}

module.exports = { upsert, deactivate, activeForUser };
