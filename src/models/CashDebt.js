const pool = require('../config/database');
const AppError = require('../errors/AppError');

async function listarPorPassageiro(passageiroId) {
  const [debtsResult, totalResult, cancellationFeesResult] = await Promise.all([
    pool.query(`
      SELECT o.corrida_id, c.origem, c.destino, c.forma_pagamento, c.finalizada_em,
        o.valor_devido, o.valor_recebido, o.diferenca_debito,
        GREATEST(0, o.diferenca_debito - COALESCE(a.valor_recuperado, 0))::numeric(12,2) AS saldo_pendente,
        CASE WHEN o.resposta_passageiro = 'pendente' AND o.prazo_resposta_em <= NOW()
          THEN 'prazo_esgotado' ELSE o.resposta_passageiro END AS resposta_passageiro,
        o.prazo_resposta_em, o.resposta_em, o.contestacao_descricao, o.suporte_chamado_id,
        s.resposta_prevista_min_em, s.resposta_prevista_max_em
      FROM ocorrencias_pagamento o
      JOIN corridas c ON c.id = o.corrida_id
      LEFT JOIN movi_acertos_dinheiro a ON a.corrida_id = o.corrida_id
      LEFT JOIN movi_suporte_chamados s ON s.id = o.suporte_chamado_id
      WHERE o.passageiro_id = $1 AND o.status <> 'resolvida'
        AND o.diferenca_debito > COALESCE(a.valor_recuperado, 0)
      ORDER BY o.criado_em DESC, o.id DESC;
    `, [passageiroId]),
    pool.query('SELECT debito_pendente FROM passageiros WHERE id = $1', [passageiroId]),
    pool.query(`
      SELECT t.corrida_id, c.origem, c.destino, t.valor, t.status, t.repasse_status,
        t.aceita_em, t.cancelada_em, t.creditado_carteira_em, t.criado_em, t.contestacao_descricao, t.suporte_chamado_id,
        s.resposta_prevista_min_em, s.resposta_prevista_max_em
      FROM movi_taxas_cancelamento t
      JOIN corridas c ON c.id = t.corrida_id
      LEFT JOIN movi_suporte_chamados s ON s.id = t.suporte_chamado_id
      WHERE t.passageiro_id = $1 AND t.status IN ('pendente','contestada')
      ORDER BY t.criado_em DESC, t.id DESC;
    `, [passageiroId]),
  ]);
  if (!totalResult.rows[0]) throw new AppError('Passageiro não encontrado.', 404, 'PASSENGER_NOT_FOUND');
  return {
    debitos: debtsResult.rows,
    taxas_cancelamento: cancellationFeesResult.rows,
    total_pendente: Number(totalResult.rows[0].debito_pendente || 0),
  };
}

async function responder({ corridaId, passageiroId, decisao, descricao }) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await client.query(`
      SELECT o.*, c.forma_pagamento,
        (o.prazo_resposta_em <= NOW()) AS prazo_expirado
      FROM ocorrencias_pagamento o
      JOIN corridas c ON c.id = o.corrida_id
      WHERE o.corrida_id = $1 AND o.passageiro_id = $2
      ORDER BY o.id DESC LIMIT 1 FOR UPDATE OF o;
    `, [corridaId, passageiroId]);
    const occurrence = result.rows[0];
    if (!occurrence) throw new AppError('Débito desta corrida não encontrado.', 404, 'CASH_DEBT_NOT_FOUND');
    if (occurrence.forma_pagamento !== 'dinheiro') throw new AppError('Esta contestação só está disponível para ocorrências de pagamento em dinheiro.', 409, 'CASH_DEBT_NOT_APPLICABLE');
    if (occurrence.status === 'resolvida' || Number(occurrence.diferenca_debito) <= 0) throw new AppError('Esta ocorrência financeira já foi resolvida.', 409, 'CASH_DEBT_RESOLVED');

    if (occurrence.resposta_passageiro === 'confirmada' && decisao === 'confirmar') {
      await client.query('COMMIT');
      return { corrida_id: corridaId, resposta_passageiro: 'confirmada', repetida: true };
    }
    if (occurrence.resposta_passageiro === 'contestada' && decisao === 'contestar') {
      await client.query('COMMIT');
      return { corrida_id: corridaId, resposta_passageiro: 'contestada', suporte_chamado_id: occurrence.suporte_chamado_id, repetida: true };
    }
    if (occurrence.resposta_passageiro !== 'pendente' && occurrence.resposta_passageiro !== 'prazo_esgotado') {
      throw new AppError('Esta ocorrência já recebeu uma resposta e não pode ser alterada por aqui.', 409, 'CASH_DEBT_ALREADY_ANSWERED');
    }

    const expired = Boolean(occurrence.prazo_expirado);
    if (decisao === 'confirmar' && expired) {
      await client.query(`UPDATE ocorrencias_pagamento SET resposta_passageiro = 'prazo_esgotado' WHERE id = $1`, [occurrence.id]);
      await client.query('COMMIT');
      return { corrida_id: corridaId, resposta_passageiro: 'prazo_esgotado', confirmacao_registrada: false };
    }

    let supportTicketId = null;
    if (decisao === 'contestar') {
      const ticketResult = await client.query(`
        INSERT INTO movi_suporte_chamados (
          solicitante_tipo, solicitante_id, corrida_id, categoria, assunto
        ) VALUES ('passageiro',$1,$2,'pagamento',$3)
        RETURNING id, resposta_prevista_min_em, resposta_prevista_max_em;
      `, [passageiroId, corridaId, `Contestação do débito da corrida #${corridaId}`]);
      const ticket = ticketResult.rows[0];
      supportTicketId = Number(ticket.id);
      await client.query(`
        INSERT INTO movi_suporte_mensagens (chamado_id, autor_tipo, autor_id, mensagem)
        VALUES ($1,'passageiro',$2,$3);
      `, [ticket.id, passageiroId, descricao.trim()]);
    }

    const response = decisao === 'confirmar' ? 'confirmada' : 'contestada';
    await client.query(`
      UPDATE ocorrencias_pagamento
      SET resposta_passageiro = $1, resposta_em = NOW(), contestacao_descricao = $2,
          suporte_chamado_id = $3,
          status = CASE WHEN $1 = 'contestada' THEN 'em_analise' ELSE status END
      WHERE id = $4;
    `, [response, decisao === 'contestar' ? descricao.trim() : null, supportTicketId, occurrence.id]);
    await client.query(`
      INSERT INTO movi_audit_logs (actor_type, actor_id, action, target_type, target_id, metadata)
      VALUES ('passageiro',$1,$2,'ocorrencia_pagamento',$3,$4::jsonb);
    `, [passageiroId, `financeiro.debito_${decisao === 'confirmar' ? 'confirmado' : 'contestado'}`, occurrence.id, JSON.stringify({ corrida_id: corridaId, suporte_chamado_id: supportTicketId })]);
    await client.query('COMMIT');
    return {
      corrida_id: corridaId,
      resposta_passageiro: response,
      suporte_chamado_id: supportTicketId,
      confirmacao_registrada: decisao === 'confirmar',
      saldo_alterado: false,
    };
  } catch (error) {
    try { await client.query('ROLLBACK'); } catch (_) {}
    throw error;
  } finally {
    client.release();
  }
}

async function contestarTaxaCancelamento({ corridaId, passageiroId, descricao }) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await client.query(`
      SELECT t.*, c.id AS ride_id
      FROM movi_taxas_cancelamento t
      JOIN corridas c ON c.id = t.corrida_id
      WHERE t.corrida_id = $1 AND t.passageiro_id = $2
      FOR UPDATE OF t;
    `, [corridaId, passageiroId]);
    const fee = result.rows[0];
    if (!fee) throw new AppError('Taxa de cancelamento não encontrada.', 404, 'CANCELLATION_FEE_NOT_FOUND');
    if (fee.status === 'contestada') {
      await client.query('COMMIT');
      return { corrida_id: corridaId, status: 'contestada', suporte_chamado_id: fee.suporte_chamado_id, repetida: true };
    }
    if (fee.status !== 'pendente') throw new AppError('Esta taxa não pode mais ser contestada.', 409, 'CANCELLATION_FEE_NOT_CONTESTABLE');

    const ticketResult = await client.query(`
      INSERT INTO movi_suporte_chamados (
        solicitante_tipo, solicitante_id, corrida_id, categoria, assunto
      ) VALUES ('passageiro',$1,$2,'pagamento',$3)
      RETURNING id, resposta_prevista_min_em, resposta_prevista_max_em;
    `, [passageiroId, corridaId, `Contestação da taxa de cancelamento da corrida #${corridaId}`]);
    const ticket = ticketResult.rows[0];
    await client.query(`
      INSERT INTO movi_suporte_mensagens (chamado_id, autor_tipo, autor_id, mensagem)
      VALUES ($1,'passageiro',$2,$3);
    `, [ticket.id, passageiroId, descricao.trim()]);
    await client.query(`
      UPDATE movi_taxas_cancelamento
      SET status = 'contestada', contestacao_descricao = $1, suporte_chamado_id = $2, atualizado_em = NOW()
      WHERE id = $3;
    `, [descricao.trim(), ticket.id, fee.id]);
    await client.query(`
      INSERT INTO movi_audit_logs (actor_type, actor_id, action, target_type, target_id, metadata)
      VALUES ('passageiro',$1,'financeiro.taxa_cancelamento_contestada','taxa_cancelamento',$2,$3::jsonb);
    `, [passageiroId, fee.id, JSON.stringify({ corrida_id: corridaId, suporte_chamado_id: ticket.id })]);
    await client.query('COMMIT');
    return {
      corrida_id: corridaId,
      status: 'contestada',
      suporte_chamado_id: Number(ticket.id),
      resposta_prevista_min_em: ticket.resposta_prevista_min_em,
      resposta_prevista_max_em: ticket.resposta_prevista_max_em,
      debito_preservado: true,
    };
  } catch (error) {
    try { await client.query('ROLLBACK'); } catch (_) {}
    throw error;
  } finally {
    client.release();
  }
}

module.exports = { listarPorPassageiro, responder, contestarTaxaCancelamento };
