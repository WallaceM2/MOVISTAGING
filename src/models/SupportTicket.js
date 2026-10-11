const pool = require('../config/database');
const AppError = require('../errors/AppError');

const USER_TYPES = new Set(['passageiro', 'motorista']);
const TICKET_STATUSES = new Set(['aberto', 'em_atendimento', 'aguardando_usuario', 'resolvido', 'fechado']);
const STATUS_TRANSITIONS = {
  aberto: new Set(['em_atendimento', 'aguardando_usuario', 'resolvido']),
  em_atendimento: new Set(['aguardando_usuario', 'resolvido']),
  aguardando_usuario: new Set(['em_atendimento', 'resolvido']),
  resolvido: new Set(['em_atendimento', 'fechado']),
  fechado: new Set(),
};

function assertUserType(type) {
  if (!USER_TYPES.has(type)) throw new AppError('Tipo de solicitante inválido.', 400, 'INVALID_SUPPORT_REQUESTER');
}

async function create({ requesterType, requesterId, rideId = null, category, subject, message }) {
  assertUserType(requesterType);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    if (rideId != null) {
      const rideResult = await client.query(`
        SELECT passageiro_id, motorista_id FROM corridas WHERE id = $1 FOR SHARE
      `, [rideId]);
      const ride = rideResult.rows[0];
      if (!ride) throw new AppError('Corrida não encontrada.', 404, 'RIDE_NOT_FOUND');
      const participantId = requesterType === 'passageiro' ? ride.passageiro_id : ride.motorista_id;
      if (Number(participantId) !== Number(requesterId)) {
        throw new AppError('Você não participou desta corrida.', 403, 'REPORTER_NOT_PARTICIPANT');
      }
    }

    const ticketResult = await client.query(`
      INSERT INTO movi_suporte_chamados (
        solicitante_tipo, solicitante_id, corrida_id, categoria, assunto, prioridade
      ) VALUES ($1,$2,$3,$4,$5,$6)
      RETURNING *;
    `, [requesterType, requesterId, rideId, category, subject, category === 'seguranca' ? 'alta' : 'normal']);
    const ticket = ticketResult.rows[0];
    await client.query(`
      INSERT INTO movi_suporte_mensagens (chamado_id, autor_tipo, autor_id, mensagem)
      VALUES ($1,$2,$3,$4);
    `, [ticket.id, requesterType, requesterId, message]);
    await client.query('COMMIT');
    return ticket;
  } catch (error) {
    try { await client.query('ROLLBACK'); } catch (_) {}
    throw error;
  } finally {
    client.release();
  }
}

async function listForRequester({ requesterType, requesterId, limit, offset }) {
  assertUserType(requesterType);
  const { rows } = await pool.query(`
    SELECT c.*,
      (SELECT m.mensagem FROM movi_suporte_mensagens m WHERE m.chamado_id = c.id ORDER BY m.criado_em DESC, m.id DESC LIMIT 1) AS ultima_mensagem,
      (SELECT m.criado_em FROM movi_suporte_mensagens m WHERE m.chamado_id = c.id ORDER BY m.criado_em DESC, m.id DESC LIMIT 1) AS ultima_mensagem_em
    FROM movi_suporte_chamados c
    WHERE c.solicitante_tipo = $1 AND c.solicitante_id = $2
    ORDER BY c.criado_em DESC, c.id DESC
    LIMIT $3 OFFSET $4;
  `, [requesterType, requesterId, limit, offset]);
  return rows;
}

async function getForRequester({ ticketId, requesterType, requesterId }) {
  assertUserType(requesterType);
  const ticketResult = await pool.query(`
    SELECT * FROM movi_suporte_chamados
    WHERE id = $1 AND solicitante_tipo = $2 AND solicitante_id = $3
    LIMIT 1;
  `, [ticketId, requesterType, requesterId]);
  if (!ticketResult.rows[0]) return null;
  const messageResult = await pool.query(`
    SELECT id, autor_tipo, mensagem, criado_em
    FROM movi_suporte_mensagens
    WHERE chamado_id = $1
    ORDER BY criado_em ASC, id ASC;
  `, [ticketId]);
  return { ...ticketResult.rows[0], mensagens: messageResult.rows };
}

async function addRequesterMessage({ ticketId, requesterType, requesterId, message }) {
  assertUserType(requesterType);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await client.query(`
      SELECT id, status FROM movi_suporte_chamados
      WHERE id = $1 AND solicitante_tipo = $2 AND solicitante_id = $3
      FOR UPDATE;
    `, [ticketId, requesterType, requesterId]);
    const ticket = result.rows[0];
    if (!ticket) throw new AppError('Chamado não encontrado.', 404, 'SUPPORT_TICKET_NOT_FOUND');
    if (ticket.status === 'fechado') throw new AppError('Este chamado foi fechado. Abra um novo para continuar.', 409, 'SUPPORT_TICKET_CLOSED');
    await client.query(`
      INSERT INTO movi_suporte_mensagens (chamado_id, autor_tipo, autor_id, mensagem)
      VALUES ($1,$2,$3,$4);
    `, [ticketId, requesterType, requesterId, message]);
    await client.query(`
      UPDATE movi_suporte_chamados
      SET status = CASE WHEN status IN ('aguardando_usuario', 'resolvido') THEN 'em_atendimento' ELSE status END,
          resolvido_em = CASE WHEN status = 'resolvido' THEN NULL ELSE resolvido_em END,
          atualizado_em = NOW()
      WHERE id = $1;
    `, [ticketId]);
    await client.query('COMMIT');
    return true;
  } catch (error) {
    try { await client.query('ROLLBACK'); } catch (_) {}
    throw error;
  } finally {
    client.release();
  }
}

async function listForAdmin({ limit, offset, status = null, category = null }) {
  const { rows } = await pool.query(`
    SELECT c.*,
      (SELECT m.mensagem FROM movi_suporte_mensagens m WHERE m.chamado_id = c.id ORDER BY m.criado_em DESC, m.id DESC LIMIT 1) AS ultima_mensagem,
      (SELECT m.criado_em FROM movi_suporte_mensagens m WHERE m.chamado_id = c.id ORDER BY m.criado_em DESC, m.id DESC LIMIT 1) AS ultima_mensagem_em
    FROM movi_suporte_chamados c
    WHERE ($1::varchar IS NULL OR c.status = $1)
      AND ($2::varchar IS NULL OR c.categoria = $2)
    ORDER BY CASE c.prioridade WHEN 'critica' THEN 0 WHEN 'alta' THEN 1 ELSE 2 END,
      CASE WHEN c.primeira_resposta_em IS NULL THEN 0 ELSE 1 END,
      c.criado_em ASC
    LIMIT $3 OFFSET $4;
  `, [status, category, limit, offset]);
  return rows;
}

async function getForAdmin(ticketId) {
  const ticketResult = await pool.query('SELECT * FROM movi_suporte_chamados WHERE id = $1 LIMIT 1', [ticketId]);
  if (!ticketResult.rows[0]) return null;
  const messageResult = await pool.query(`
    SELECT id, autor_tipo, autor_id, mensagem, criado_em
    FROM movi_suporte_mensagens WHERE chamado_id = $1
    ORDER BY criado_em ASC, id ASC;
  `, [ticketId]);
  return { ...ticketResult.rows[0], mensagens: messageResult.rows };
}

async function addAdminMessage({ ticketId, adminId, message }) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await client.query('SELECT id, status FROM movi_suporte_chamados WHERE id = $1 FOR UPDATE', [ticketId]);
    const ticket = result.rows[0];
    if (!ticket) throw new AppError('Chamado não encontrado.', 404, 'SUPPORT_TICKET_NOT_FOUND');
    if (ticket.status === 'fechado') throw new AppError('Este chamado foi fechado.', 409, 'SUPPORT_TICKET_CLOSED');
    await client.query(`
      INSERT INTO movi_suporte_mensagens (chamado_id, autor_tipo, autor_id, mensagem)
      VALUES ($1,'admin',$2,$3);
    `, [ticketId, adminId, message]);
    await client.query(`
      UPDATE movi_suporte_chamados
      SET status = 'em_atendimento',
          primeira_resposta_em = COALESCE(primeira_resposta_em, NOW()),
          resolvido_em = NULL,
          atualizado_em = NOW()
      WHERE id = $1;
    `, [ticketId]);
    await client.query('COMMIT');
    return true;
  } catch (error) {
    try { await client.query('ROLLBACK'); } catch (_) {}
    throw error;
  } finally {
    client.release();
  }
}

async function updateStatus({ ticketId, adminId, status }) {
  if (!TICKET_STATUSES.has(status)) throw new AppError('Status de chamado inválido.', 400, 'INVALID_SUPPORT_STATUS');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const currentResult = await client.query('SELECT id, status FROM movi_suporte_chamados WHERE id = $1 FOR UPDATE', [ticketId]);
    const current = currentResult.rows[0];
    if (!current) {
      await client.query('ROLLBACK');
      return null;
    }
    if (!STATUS_TRANSITIONS[current.status]?.has(status)) {
      throw new AppError('Esta mudança de status não é permitida.', 409, 'INVALID_SUPPORT_TRANSITION');
    }
    const { rows } = await client.query(`
      UPDATE movi_suporte_chamados
      SET status = $1::varchar,
          primeira_resposta_em = CASE WHEN $1::varchar = 'resolvido' THEN COALESCE(primeira_resposta_em, NOW()) ELSE primeira_resposta_em END,
          resolvido_em = CASE WHEN $1::varchar = 'resolvido' THEN NOW() WHEN $1::varchar = 'em_atendimento' THEN NULL ELSE resolvido_em END,
          fechado_em = CASE WHEN $1::varchar = 'fechado' THEN NOW() ELSE fechado_em END,
          atualizado_em = NOW()
      WHERE id = $2
      RETURNING *;
    `, [status, ticketId]);
    await client.query('COMMIT');
    return rows[0];
  } catch (error) {
    try { await client.query('ROLLBACK'); } catch (_) {}
    throw error;
  } finally {
    client.release();
  }
}

module.exports = {
  create, listForRequester, getForRequester, addRequesterMessage,
  listForAdmin, getForAdmin, addAdminMessage, updateStatus,
};
