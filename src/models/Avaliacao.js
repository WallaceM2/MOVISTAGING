const pool = require('../config/database');
const AppError = require('../errors/AppError');

async function criar(dados) {
  const { corrida_id, avaliado_tipo, avaliado_id, avaliador_tipo, avaliador_id, nota, tag, tags = [], comentario } = dados;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const rideResult = await client.query(`
      SELECT id, passageiro_id, motorista_id, status
      FROM corridas WHERE id = $1 FOR UPDATE;
    `, [corrida_id]);
    const corrida = rideResult.rows[0];
    if (!corrida) throw new AppError('Corrida não encontrada.', 404, 'RIDE_NOT_FOUND');
    if (corrida.status !== 'concluida') throw new AppError('Só é possível avaliar uma corrida concluída.', 409, 'RIDE_NOT_COMPLETED');

    const expectedEvaluator = avaliador_tipo === 'passageiro' ? corrida.passageiro_id : corrida.motorista_id;
    if (Number(avaliador_id) !== Number(expectedEvaluator)) {
      throw new AppError('Você não participou desta corrida.', 403, 'REVIEW_ACTOR_NOT_PARTICIPANT');
    }

    const expectedTarget = avaliador_tipo === 'passageiro' ? corrida.motorista_id : corrida.passageiro_id;
    const expectedTargetType = avaliador_tipo === 'passageiro' ? 'motorista' : 'passageiro';
    if (avaliado_tipo !== expectedTargetType || Number(avaliado_id) !== Number(expectedTarget)) {
      throw new AppError('Usuário avaliado não participa desta corrida.', 403, 'INVALID_REVIEW_TARGET');
    }

    const tabela = avaliado_tipo === 'motorista' ? 'motoristas' : 'passageiros';
    const target = await client.query(`SELECT id FROM ${tabela} WHERE id = $1 FOR UPDATE`, [avaliado_id]);
    if (!target.rows.length) throw new AppError('Usuário avaliado não foi encontrado.', 404, 'REVIEW_TARGET_NOT_FOUND');

    const duplicate = await client.query(`
      SELECT id FROM avaliacoes WHERE corrida_id = $1 AND avaliador_id = $2 LIMIT 1;
    `, [corrida_id, avaliador_id]);
    if (duplicate.rows.length) throw new AppError('Você já avaliou esta corrida.', 409, 'REVIEW_ALREADY_EXISTS');

    const insert = await client.query(`
      INSERT INTO avaliacoes
        (corrida_id, avaliado_tipo, avaliado_id, avaliador_tipo, avaliador_id, nota, tag, tags, comentario)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8::TEXT[],$9)
      RETURNING id, corrida_id, avaliado_tipo, avaliado_id, nota, tags, criado_em;
    `, [corrida_id, avaliado_tipo, avaliado_id, avaliador_tipo, avaliador_id, nota, tag || tags[0] || null, tags, comentario || null]);

    const media = await client.query(`
      UPDATE ${tabela}
      SET nota_media = COALESCE((
            SELECT ROUND(AVG(recent.nota), 1)
            FROM (
              SELECT nota
              FROM avaliacoes
              WHERE avaliado_tipo = $3 AND avaliado_id = $2
              ORDER BY criado_em DESC, id DESC
              LIMIT 100
            ) recent
          ), 0),
          total_avaliacoes = COALESCE(total_avaliacoes, 0) + 1,
          atualizado_em = NOW()
      WHERE id = $2
      RETURNING id, nome, nota_media, total_avaliacoes;
    `, [avaliado_id, avaliado_tipo]);

    await client.query('COMMIT');
    return { avaliacao: insert.rows[0], avaliado: media.rows[0] };
  } catch (error) {
    await client.query('ROLLBACK');
    if (error.code === '23505') throw new AppError('Você já avaliou esta corrida.', 409, 'REVIEW_ALREADY_EXISTS');
    throw error;
  } finally {
    client.release();
  }
}

async function listarPorAvaliado(avaliado_tipo, avaliado_id, { limit = 50, offset = 0 } = {}) {
  const { rows } = await pool.query(`
    SELECT id, corrida_id, nota, tags, criado_em
    FROM avaliacoes
    WHERE avaliado_tipo = $1 AND avaliado_id = $2
    ORDER BY criado_em DESC LIMIT $3 OFFSET $4;
  `, [avaliado_tipo, avaliado_id, limit, offset]);
  return rows;
}

module.exports = { criar, listarPorAvaliado };
