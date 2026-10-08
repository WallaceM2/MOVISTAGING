const crypto = require('crypto');
const pool = require('../config/database');
const AppError = require('../errors/AppError');

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

async function create(passengerId, rideId) {
  const client = await pool.connect();
  const token = crypto.randomBytes(32).toString('base64url');
  try {
    await client.query('BEGIN');
    const ride = await client.query('SELECT id, passageiro_id, status FROM corridas WHERE id = $1 FOR UPDATE', [rideId]);
    const row = ride.rows[0];
    if (!row || Number(row.passageiro_id) !== Number(passengerId)) throw new AppError('Corrida não encontrada.', 404, 'RIDE_NOT_FOUND');
    if (!['aceita', 'em_andamento'].includes(row.status)) throw new AppError('O compartilhamento só pode ser criado para uma corrida ativa.', 409, 'RIDE_NOT_ACTIVE');
    await client.query(`
      UPDATE movi_compartilhamentos_corrida
      SET revogado_em = NOW()
      WHERE corrida_id = $1 AND passageiro_id = $2 AND revogado_em IS NULL
    `, [rideId, passengerId]);
    const inserted = await client.query(`
      INSERT INTO movi_compartilhamentos_corrida (corrida_id, passageiro_id, token_hash, expira_em)
      VALUES ($1,$2,$3,NOW() + INTERVAL '24 hours')
      RETURNING expira_em
    `, [rideId, passengerId, hashToken(token)]);
    await client.query('COMMIT');
    return { token, expira_em: inserted.rows[0].expira_em };
  } catch (error) {
    try { await client.query('ROLLBACK'); } catch (_) {}
    throw error;
  } finally {
    client.release();
  }
}

async function revoke(passengerId, rideId) {
  const result = await pool.query(`
    UPDATE movi_compartilhamentos_corrida s
    SET revogado_em = NOW()
    FROM corridas c
    WHERE s.corrida_id = c.id AND s.corrida_id = $1 AND s.passageiro_id = $2
      AND c.passageiro_id = $2 AND s.revogado_em IS NULL
    RETURNING s.id
  `, [rideId, passengerId]);
  return result.rowCount > 0;
}

async function lookup(token) {
  const { rows } = await pool.query(`
    SELECT c.id, c.status, c.origem, c.destino, c.motorista_id,
           m.nome AS motorista_nome, m.nota_media, m.total_avaliacoes,
           m.ultima_lat, m.ultima_lng, m.ultima_localizacao_em,
           v.marca, v.modelo, v.cor, v.placa
    FROM movi_compartilhamentos_corrida s
    JOIN corridas c ON c.id = s.corrida_id
    LEFT JOIN motoristas m ON m.id = c.motorista_id
    LEFT JOIN movi_veiculos v ON v.id = m.veiculo_ativo_id AND v.ativo = TRUE AND v.status = 'aprovado'
    WHERE s.token_hash = $1 AND s.revogado_em IS NULL AND s.expira_em > NOW()
    LIMIT 1
  `, [hashToken(token)]);
  return rows[0] || null;
}

module.exports = { create, revoke, lookup };
