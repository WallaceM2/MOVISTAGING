const pool = require('../config/database');
const AppError = require('../errors/AppError');

const CHAT_STATUSES = ['aceita', 'em_andamento'];

async function assertRideParticipant(client, rideId, tipo, usuarioId, { lock = false } = {}) {
  const { rows } = await client.query(`
    SELECT id, passageiro_id, motorista_id, status
    FROM corridas WHERE id = $1 ${lock ? 'FOR UPDATE' : ''}
  `, [rideId]);
  const ride = rows[0];
  const ownsRide = ride && (
    (tipo === 'passageiro' && Number(ride.passageiro_id) === Number(usuarioId))
    || (tipo === 'motorista' && Number(ride.motorista_id) === Number(usuarioId))
  );
  if (!ownsRide) throw new AppError('Corrida não encontrada.', 404, 'RIDE_NOT_FOUND');
  if (!CHAT_STATUSES.includes(ride.status)) throw new AppError('O chat fica disponível somente após o aceite e durante a corrida ativa.', 409, 'RIDE_CHAT_UNAVAILABLE');
  return ride;
}

async function list({ rideId, tipo, usuarioId, beforeId, limit = 50 }) {
  await assertRideParticipant(pool, rideId, tipo, usuarioId);
  const { rows } = await pool.query(`
    SELECT id, corrida_id, remetente_tipo, remetente_id, client_message_id,
           tipo, mensagem, midia_storage_path, midia_mime_type,
           midia_tamanho_bytes, criado_em
    FROM movi_chat_corrida_mensagens
    WHERE corrida_id = $1 AND ($2::bigint IS NULL OR id < $2)
    ORDER BY id DESC
    LIMIT $3
  `, [rideId, beforeId || null, Math.min(Math.max(Number(limit) || 50, 1), 100)]);
  return rows.reverse();
}

async function assertCanSend({ rideId, tipo, usuarioId }) {
  return assertRideParticipant(pool, rideId, tipo, usuarioId);
}

async function create({ rideId, tipo, usuarioId, clientMessageId, messageType, message, media }) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const ride = await assertRideParticipant(client, rideId, tipo, usuarioId, { lock: true });
    const insert = await client.query(`
      INSERT INTO movi_chat_corrida_mensagens (
        corrida_id, remetente_tipo, remetente_id, client_message_id,
        tipo, mensagem, midia_storage_path, midia_mime_type, midia_tamanho_bytes
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
      ON CONFLICT (corrida_id, remetente_tipo, remetente_id, client_message_id)
      DO NOTHING
      RETURNING id, corrida_id, remetente_tipo, remetente_id, client_message_id,
        tipo, mensagem, midia_storage_path, midia_mime_type, midia_tamanho_bytes, criado_em
    `, [rideId, tipo, usuarioId, clientMessageId, messageType, message || null, media?.storagePath || null, media?.mimetype || null, media?.size || null]);
    let row = insert.rows[0];
    const created = Boolean(row);
    if (!row) {
      const existing = await client.query(`
        SELECT id, corrida_id, remetente_tipo, remetente_id, client_message_id,
          tipo, mensagem, midia_storage_path, midia_mime_type, midia_tamanho_bytes, criado_em
        FROM movi_chat_corrida_mensagens
        WHERE corrida_id = $1 AND remetente_tipo = $2 AND remetente_id = $3 AND client_message_id = $4
      `, [rideId, tipo, usuarioId, clientMessageId]);
      row = existing.rows[0];
    }
    await client.query('COMMIT');
    return {
      message: row,
      created,
      recipient: tipo === 'passageiro'
        ? { tipo: 'motorista', id: Number(ride.motorista_id) }
        : { tipo: 'passageiro', id: Number(ride.passageiro_id) },
    };
  } catch (error) {
    try { await client.query('ROLLBACK'); } catch (_) {}
    throw error;
  } finally {
    client.release();
  }
}

module.exports = { list, assertCanSend, create };
