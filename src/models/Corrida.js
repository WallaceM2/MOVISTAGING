const pool = require('../config/database');
const AppError = require('../errors/AppError');
const { assertRideTransition } = require('../utils/stateMachine');
const crypto = require('crypto');
const env = require('../config/env');

const ACTIVE_STATUSES = ['solicitada', 'aceita', 'em_andamento'];

const PAYMENT_STATUS = new Set(['pendente', 'pago', 'parcial', 'nao_pago', 'cancelado', 'estornado', 'reembolsado']);

function assertFinancialSnapshot({ valor, ganho_motorista, ganho_app, percentual_comissao_app, percentual_repasse_motorista }) {
  const gross = Number(valor);
  const driver = Number(ganho_motorista);
  const app = Number(ganho_app);
  const commission = Number(percentual_comissao_app);
  const repasse = Number(percentual_repasse_motorista);
  if (![gross, driver, app, commission, repasse].every(Number.isFinite)) {
    throw new AppError('Snapshot financeiro inválido.', 500, 'INVALID_FINANCIAL_SNAPSHOT');
  }
  if (gross < 0 || driver < 0 || app < 0 || commission !== 15 || repasse !== 85 || Math.abs(driver + app - gross) > 0.011 || Math.abs(app - (gross * 0.15)) > 0.011 || Math.abs(driver - (gross * 0.85)) > 0.011) {
    throw new AppError('Snapshot financeiro inconsistente.', 500, 'INVALID_FINANCIAL_SNAPSHOT');
  }
}

async function registrarLedgerCorrida(client, corrida, pagamentoId = null) {
  const entries = [
    { tipo: 'corrida_bruta', valor: Number(corrida.valor), ref: `corrida:${corrida.id}:bruta`, metadata: { papel: 'valor_bruto', status_pagamento: corrida.status_pagamento } },
    { tipo: 'repasse_motorista', valor: -Number(corrida.ganho_motorista), ref: `corrida:${corrida.id}:repasse`, metadata: { papel: 'repasse_motorista' } },
    { tipo: 'comissao_app', valor: -Number(corrida.ganho_app), ref: `corrida:${corrida.id}:comissao`, metadata: { papel: 'comissao_movi' } },
  ];

  for (const entry of entries) {
    await client.query(`
      INSERT INTO movi_lancamentos_financeiros (
        corrida_id, pagamento_id, motorista_id, passageiro_id, tipo, valor, moeda, referencia_unica, metadata
      )
      VALUES ($1,$2,$3,$4,$5,'BRL',$6,$7,$8::jsonb)
      ON CONFLICT (referencia_unica) DO NOTHING;
    `, [corrida.id, pagamentoId, corrida.motorista_id, corrida.passageiro_id, entry.tipo, entry.valor, entry.ref, JSON.stringify(entry.metadata)]);
  }
}

async function criar(dados) {
  const { idempotency_key = null, passageiro_id, origem, destino, origem_lat, origem_lng, destino_lat, destino_lng, categoria, distancia_km, tempo_minutos, dinamica_multiplicador, valor, ganho_motorista, ganho_app, percentual_comissao_app = 15, percentual_repasse_motorista = 85, forma_pagamento = 'dinheiro', area_operacao_id = null, tarifa_id = null, tarifa_versao = null, tarifa_snapshot = {}, valor_base_cliente = null, valor_dinamica_cliente = null } = dados;
  assertFinancialSnapshot({ valor, ganho_motorista, ganho_app, percentual_comissao_app, percentual_repasse_motorista });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const passenger = await client.query(`
      SELECT id, debito_pendente, status_conta
      FROM passageiros WHERE id = $1 FOR UPDATE;
    `, [passageiro_id]);
    const p = passenger.rows[0];
    if (!p) throw new AppError('Passageiro não encontrado.', 404, 'PASSENGER_NOT_FOUND');
    if (['suspensa', 'banida', 'bloqueada'].includes(p.status_conta)) throw new AppError('Conta do passageiro indisponível.', 403, 'ACCOUNT_UNAVAILABLE');
    const debito = Number(p.debito_pendente || 0);
    if (debito >= 10 && forma_pagamento === 'dinheiro') {
      throw new AppError('Há um débito pendente. Para solicitar uma nova corrida, quite o débito ou utilize uma forma de pagamento digital habilitada.', 403, 'OUTSTANDING_DEBT');
    }

    const active = await client.query(`
      SELECT id FROM corridas
      WHERE passageiro_id = $1 AND status = ANY($2::text[])
      LIMIT 1;
    `, [passageiro_id, ACTIVE_STATUSES]);
    if (active.rows.length) throw new AppError('Você já possui uma corrida em andamento.', 409, 'ACTIVE_RIDE_EXISTS');

    const { rows } = await client.query(`
      INSERT INTO corridas (
        passageiro_id, origem, destino, origem_lat, origem_lng, destino_lat, destino_lng,
        categoria, distancia_km, tempo_minutos, dinamica_multiplicador,
        valor, status, ganho_motorista, ganho_app, percentual_comissao_app, percentual_repasse_motorista,
        forma_pagamento, status_pagamento, codigo_embarque, solicitada_em, atualizado_em,
        area_operacao_id, tarifa_id, tarifa_versao, tarifa_snapshot, valor_base_cliente, valor_dinamica_cliente, valor_taxa_app, valor_repasse_motorista
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'solicitada',$13,$14,$15,$16,$17,'pendente',$18,NOW(),NOW(),$19,$20,$21,$22::jsonb,$23,$24,$14,$13)
      RETURNING *;
    `, [
      passageiro_id, origem, destino, origem_lat, origem_lng, destino_lat, destino_lng,
      categoria, distancia_km, tempo_minutos, dinamica_multiplicador, valor, ganho_motorista, ganho_app,
      percentual_comissao_app, percentual_repasse_motorista, forma_pagamento, crypto.randomBytes(3).toString('hex').toUpperCase(),
      area_operacao_id, tarifa_id, tarifa_versao, JSON.stringify(tarifa_snapshot || {}), valor_base_cliente, valor_dinamica_cliente,
    ]);

    const corrida = rows[0];
    await client.query(`
      INSERT INTO movi_pagamentos (corrida_id, passageiro_id, motorista_id, metodo, status, valor, valor_pago, moeda, idempotency_key, metadata)
      VALUES ($1,$2,NULL,$3,'pendente',$4,0,'BRL',$5,$6::jsonb)
      ON CONFLICT (corrida_id) DO NOTHING;
    `, [corrida.id, passageiro_id, forma_pagamento, Number(valor), idempotency_key, JSON.stringify({ origem: 'corrida.criar' })]);

    await client.query('COMMIT');
    return corrida;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function buscarPorId(id) {
  const { rows } = await pool.query('SELECT * FROM corridas WHERE id = $1 LIMIT 1', [id]);
  return rows[0];
}

async function aceitar(corridaId, motoristaId) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const rideResult = await client.query('SELECT * FROM corridas WHERE id = $1 FOR UPDATE', [corridaId]);
    const corrida = rideResult.rows[0];
    if (!corrida) throw new AppError('Corrida não encontrada.', 404, 'RIDE_NOT_FOUND');
    assertRideTransition(corrida.status, 'aceita');

    const driver = await client.query(`
      SELECT id, categoria, status_cadastro, status_conta, bloqueado_dinheiro, online, disponivel, ultima_atividade_em
      FROM motoristas WHERE id = $1 FOR UPDATE;
    `, [motoristaId]);
    const motorista = driver.rows[0];
    if (!motorista) throw new AppError('Motorista não encontrado.', 404, 'DRIVER_NOT_FOUND');
    const atividadeRecente = motorista.ultima_atividade_em && (Date.now() - new Date(motorista.ultima_atividade_em).getTime()) <= (env.DRIVER_PRESENCE_TTL_SEC * 1000);
    if (motorista.status_cadastro !== 'aprovado' || motorista.status_conta !== 'ativa' || !motorista.online || !motorista.disponivel || !atividadeRecente) throw new AppError('Motorista não está habilitado para aceitar corridas.', 403, 'DRIVER_UNAVAILABLE');
    if (corrida.forma_pagamento === 'dinheiro' && motorista.bloqueado_dinheiro) throw new AppError('Motorista indisponível para corridas em dinheiro.', 403, 'CASH_RIDES_BLOCKED');
    if (corrida.categoria !== motorista.categoria) throw new AppError('Esta corrida exige uma categoria de veículo diferente.', 409, 'DRIVER_CATEGORY_MISMATCH');

    const activeRide = await client.query(`
      SELECT id FROM corridas
      WHERE motorista_id = $1 AND status = ANY($2::text[]) AND id <> $3
      LIMIT 1
      FOR UPDATE;
    `, [motoristaId, ACTIVE_STATUSES, corridaId]);
    if (activeRide.rows.length) throw new AppError('Motorista já possui outra corrida ativa.', 409, 'DRIVER_ACTIVE_RIDE_EXISTS');

    const oferta = await client.query(`
      SELECT id FROM corrida_ofertas
      WHERE corrida_id = $1 AND motorista_id = $2 AND status = 'ofertada' AND expira_em > NOW()
      FOR UPDATE;
    `, [corridaId, motoristaId]);
    if (!oferta.rows[0]) throw new AppError('Esta oferta não está mais disponível para este motorista.', 409, 'RIDE_OFFER_NOT_AVAILABLE');

    const current = await client.query(`
      SELECT motorista_id FROM corridas WHERE id = $1;
    `, [corridaId]);
    if (current.rows[0].motorista_id) throw new AppError('Esta corrida já foi atribuída a outro motorista.', 409, 'RIDE_ALREADY_ASSIGNED');

    const { rows } = await client.query(`
      UPDATE corridas
      SET motorista_id = $1, status = 'aceita', aceita_em = NOW(), atualizado_em = NOW()
      WHERE id = $2 AND status = 'solicitada' AND motorista_id IS NULL
      RETURNING *;
    `, [motoristaId, corridaId]);
    if (!rows[0]) throw new AppError('Esta corrida já foi aceita por outro motorista.', 409, 'RIDE_ALREADY_TAKEN');

    await client.query(`
      UPDATE corrida_ofertas SET status = CASE WHEN motorista_id = $1 THEN 'aceita' ELSE 'encerrada' END,
          respondida_em = NOW()
      WHERE corrida_id = $2 AND status = 'ofertada';
    `, [motoristaId, corridaId]);

    await client.query('COMMIT');
    return rows[0];
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function criarOferta(corridaId, motoristaId, distanciaKm, timeoutSec) {
  try {
    const { rows } = await pool.query(`
      INSERT INTO corrida_ofertas (corrida_id, motorista_id, distancia_km, expira_em)
      SELECT $1,$2,$3,NOW() + ($4 * INTERVAL '1 second')
      WHERE EXISTS (
        SELECT 1
        FROM corridas c
        JOIN motoristas m ON m.id = $2
        WHERE c.id = $1
          AND c.status = 'solicitada'
          AND c.motorista_id IS NULL
          AND c.categoria = m.categoria
          AND m.status_cadastro = 'aprovado'
          AND m.status_conta = 'ativa'
          AND m.online = TRUE
          AND m.disponivel = TRUE
          AND NOT (c.forma_pagamento = 'dinheiro' AND m.bloqueado_dinheiro = TRUE)
      )
      ON CONFLICT (corrida_id, motorista_id) DO NOTHING
      RETURNING *;
    `, [corridaId, motoristaId, distanciaKm, timeoutSec]);
    return rows[0];
  } catch (error) {
    if (error.code === '23505') return null;
    throw error;
  }
}

async function listarOfertasPendentes(motoristaId) {
  const { rows } = await pool.query(`
    SELECT o.id AS oferta_id, o.corrida_id, o.distancia_km AS distancia_ate_origem_km,
           o.oferecida_em, o.expira_em,
           c.origem, c.destino, c.origem_lat, c.origem_lng, c.destino_lat, c.destino_lng,
           c.valor, c.ganho_motorista, c.forma_pagamento, c.categoria,
           c.distancia_km, c.tempo_minutos, c.dinamica_multiplicador
    FROM corrida_ofertas o
    JOIN corridas c ON c.id = o.corrida_id
    WHERE o.motorista_id = $1
      AND o.status = 'ofertada'
      AND o.expira_em > NOW()
      AND c.status = 'solicitada'
      AND c.motorista_id IS NULL
    ORDER BY o.expira_em ASC
    LIMIT 20;
  `, [motoristaId]);
  return rows;
}

async function buscarOfertaPendente(corridaId, motoristaId) {
  const { rows } = await pool.query(`
    SELECT * FROM corrida_ofertas WHERE corrida_id = $1 AND motorista_id = $2 AND status = 'ofertada' AND expira_em > NOW() LIMIT 1;
  `, [corridaId, motoristaId]);
  return rows[0];
}

async function recusarOferta(corridaId, motoristaId) {
  const { rows } = await pool.query(`
    UPDATE corrida_ofertas SET status = 'recusada', respondida_em = NOW()
    WHERE corrida_id = $1 AND motorista_id = $2 AND status = 'ofertada'
    RETURNING *;
  `, [corridaId, motoristaId]);
  return rows[0];
}

async function atualizarStatusControlado(id, nextStatus, actor) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows: currentRows } = await client.query(
      'SELECT * FROM corridas WHERE id = $1::integer FOR UPDATE',
      [id],
    );
    const current = currentRows[0];
    if (!current) throw new AppError('Corrida não encontrada.', 404, 'RIDE_NOT_FOUND');

    if (actor.tipo === 'motorista' && Number(current.motorista_id) !== Number(actor.id)) {
      throw new AppError('Você não pode alterar esta corrida.', 403, 'RIDE_NOT_OWNER');
    }
    if (actor.tipo === 'passageiro' && Number(current.passageiro_id) !== Number(actor.id)) {
      throw new AppError('Você não pode alterar esta corrida.', 403, 'RIDE_NOT_OWNER');
    }
    if (nextStatus === 'em_andamento' || nextStatus === 'concluida') {
      if (!current.motorista_id) throw new AppError('A corrida precisa estar vinculada a um motorista.', 409, 'RIDE_DRIVER_REQUIRED');
    }

    assertRideTransition(current.status, nextStatus);

    const timestampColumn = nextStatus === 'em_andamento'
      ? 'iniciada_em'
      : nextStatus === 'cancelada'
        ? 'cancelada_em'
        : null;
    const extra = timestampColumn
      ? `, ${timestampColumn} = NOW()`
      : nextStatus === 'concluida' ? ', finalizada_em = NOW()' : '';

    const { rows } = await client.query(`
      UPDATE corridas
      SET
        status = $1::varchar ${extra},
        cancelada_por_tipo = CASE
          WHEN $1::varchar = 'cancelada' THEN $2::varchar
          ELSE cancelada_por_tipo
        END,
        cancelada_por_id = CASE
          WHEN $1::varchar = 'cancelada' THEN $3::integer
          ELSE cancelada_por_id
        END,
        atualizado_em = NOW()
      WHERE id = $4::integer
      RETURNING *;
    `, [nextStatus, actor.tipo, actor.id, id]);

    if (nextStatus === 'cancelada') {
      await client.query(`
        UPDATE corrida_ofertas
        SET status = 'cancelada', respondida_em = NOW()
        WHERE corrida_id = $1 AND status = 'ofertada';
      `, [id]);
    }

    await client.query('COMMIT');
    return rows[0];
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function iniciarComCodigoEmbarque(id, motoristaId, codigoEmbarque) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await client.query('SELECT * FROM corridas WHERE id = $1::integer FOR UPDATE', [id]);
    const corrida = result.rows[0];
    if (!corrida) throw new AppError('Corrida não encontrada.', 404, 'RIDE_NOT_FOUND');
    if (Number(corrida.motorista_id) !== Number(motoristaId)) throw new AppError('Você não pode iniciar esta corrida.', 403, 'RIDE_NOT_OWNER');
    if (corrida.status !== 'aceita') throw new AppError('A corrida só pode começar depois de ser aceita.', 409, 'INVALID_RIDE_STATE');
    if (corrida.codigo_embarque_bloqueado_ate && new Date(corrida.codigo_embarque_bloqueado_ate).getTime() > Date.now()) {
      throw new AppError('Muitas tentativas. Aguarde alguns minutos e confirme o código com o passageiro.', 429, 'BOARDING_CODE_LOCKED');
    }

    const expected = Buffer.from(String(corrida.codigo_embarque || '').toUpperCase());
    const received = Buffer.from(String(codigoEmbarque || '').trim().toUpperCase());
    const matches = expected.length === 6 && received.length === expected.length && crypto.timingSafeEqual(expected, received);
    if (!matches) {
      const attempts = Math.min(5, Number(corrida.codigo_embarque_tentativas || 0) + 1);
      const blocked = attempts >= 5;
      await client.query(`
        UPDATE corridas
        SET codigo_embarque_tentativas = $1,
            codigo_embarque_bloqueado_ate = CASE WHEN $2 THEN NOW() + INTERVAL '10 minutes' ELSE NULL END,
            atualizado_em = NOW()
        WHERE id = $3
      `, [attempts, blocked, id]);
      await client.query('COMMIT');
      if (blocked) throw new AppError('Limite de tentativas atingido. Aguarde 10 minutos e confirme o código com o passageiro.', 429, 'BOARDING_CODE_LOCKED');
      throw new AppError('Código de embarque incorreto. Confirme os 6 caracteres com o passageiro.', 400, 'INVALID_BOARDING_CODE');
    }

    const updated = await client.query(`
      UPDATE corridas
      SET status = 'em_andamento', iniciada_em = NOW(), codigo_embarque_tentativas = 0,
          codigo_embarque_bloqueado_ate = NULL, atualizado_em = NOW()
      WHERE id = $1
      RETURNING *
    `, [id]);
    await client.query('COMMIT');
    return updated.rows[0];
  } catch (error) {
    try { await client.query('ROLLBACK'); } catch (_) {}
    throw error;
  } finally {
    client.release();
  }
}

async function finalizarComPagamento(corridaId, motoristaId, dadosPagamento = {}) {
  const { status_pagamento, valor_recebido_motorista, observacao_pagamento } = dadosPagamento;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const rideResult = await client.query('SELECT * FROM corridas WHERE id = $1 FOR UPDATE', [corridaId]);
    const corrida = rideResult.rows[0];
    if (!corrida) throw new AppError('Corrida não encontrada.', 404, 'RIDE_NOT_FOUND');
    if (Number(corrida.motorista_id) !== Number(motoristaId)) throw new AppError('Você não é o motorista desta corrida.', 403, 'RIDE_NOT_OWNER');
    if (corrida.status !== 'em_andamento') throw new AppError('A corrida só pode ser finalizada quando estiver em andamento.', 409, 'INVALID_RIDE_STATE');

    let statusFinal = status_pagamento;
    let recebido = valor_recebido_motorista == null ? null : Number(valor_recebido_motorista);
    const valorTotal = Number(corrida.valor);
    if (!PAYMENT_STATUS.has(statusFinal)) throw new AppError('Status de pagamento inválido.', 400, 'INVALID_PAYMENT_STATUS');

    if (corrida.forma_pagamento !== 'dinheiro') {
      if (corrida.status_pagamento !== 'pago') {
        throw new AppError('Pagamento digital ainda não foi confirmado pelo provedor.', 409, 'DIGITAL_PAYMENT_NOT_CONFIRMED');
      }
      statusFinal = 'pago';
      recebido = valorTotal;
    } else {
      if (recebido == null && statusFinal !== 'nao_pago') throw new AppError('Informe o valor efetivamente recebido em uma corrida em dinheiro.', 400, 'PAYMENT_VALUE_REQUIRED');
      if (recebido != null && (recebido < 0 || recebido > valorTotal + 0.01)) throw new AppError('Valor recebido inválido.', 400, 'INVALID_PAYMENT_VALUE');
      if (statusFinal === 'pago' && Math.abs(recebido - valorTotal) > 0.01) throw new AppError('Para marcar uma corrida em dinheiro como paga, o valor recebido deve corresponder ao total da corrida.', 400, 'PAYMENT_VALUE_MISMATCH');
      if (statusFinal === 'parcial' && (recebido == null || recebido >= valorTotal)) throw new AppError('Pagamento parcial exige valor recebido menor que o valor total.', 400, 'INVALID_PARTIAL_PAYMENT');
      if (statusFinal === 'nao_pago' && Number(recebido || 0) > 0) throw new AppError('Pagamento não pago não pode possuir valor recebido.', 400, 'INVALID_UNPAID_PAYMENT');
    }

    await client.query(`
      UPDATE corridas
      SET status = 'concluida', status_pagamento = $1, valor_recebido_motorista = $2,
          observacao_pagamento = $3, finalizada_em = NOW(), atualizado_em = NOW()
      WHERE id = $4;
    `, [statusFinal, recebido, observacao_pagamento || null, corridaId]);

    if (corrida.forma_pagamento === 'dinheiro') {
      const driverResult = await client.query('SELECT saldo_carteira, bloqueado_dinheiro FROM motoristas WHERE id = $1 FOR UPDATE', [motoristaId]);
      const driver = driverResult.rows[0];
      if (!driver) throw new AppError('Motorista não encontrado.', 404, 'DRIVER_NOT_FOUND');
      const saldoAnterior = Number(driver.saldo_carteira || 0);
      const ganhoApp = Number(corrida.ganho_app || 0);
      const saldoAtual = Number((saldoAnterior - ganhoApp).toFixed(2));
      const bloqueado = saldoAtual <= -5;

      await client.query(`
        UPDATE motoristas SET saldo_carteira = $1, bloqueado_dinheiro = $2, atualizado_em = NOW()
        WHERE id = $3;
      `, [saldoAtual, bloqueado, motoristaId]);

      const existingTx = await client.query(`
        SELECT id FROM transacoes_motoristas WHERE corrida_id = $1 AND tipo = 'debito_taxa_app' LIMIT 1;
      `, [corridaId]);
      if (!existingTx.rows.length) {
        await client.query(`
          INSERT INTO transacoes_motoristas (motorista_id, corrida_id, tipo, valor, saldo_anterior, saldo_atual)
          VALUES ($1,$2,'debito_taxa_app',$3,$4,$5)
        `, [motoristaId, corridaId, -ganhoApp, saldoAnterior, saldoAtual]);
      }
    }

    if (statusFinal === 'parcial' || statusFinal === 'nao_pago') {
      const valorRecebido = Number(recebido || 0);
      const diferenca = Number((valorTotal - valorRecebido).toFixed(2));
      if (diferenca > 0) {
        const passenger = await client.query('SELECT debito_pendente FROM passageiros WHERE id = $1 FOR UPDATE', [corrida.passageiro_id]);
        const debitoAnterior = Number(passenger.rows[0]?.debito_pendente || 0);
        const novoDebito = Number((debitoAnterior + diferenca).toFixed(2));
        await client.query('UPDATE passageiros SET debito_pendente = $1, atualizado_em = NOW() WHERE id = $2', [novoDebito, corrida.passageiro_id]);

        const existingOccurrence = await client.query('SELECT id FROM ocorrencias_pagamento WHERE corrida_id = $1 LIMIT 1', [corridaId]);
        if (!existingOccurrence.rows.length) {
          await client.query(`
            INSERT INTO ocorrencias_pagamento (corrida_id, motorista_id, passageiro_id, valor_devido, valor_recebido, diferenca_debito)
            VALUES ($1,$2,$3,$4,$5,$6)
          `, [corridaId, motoristaId, corrida.passageiro_id, valorTotal, valorRecebido, diferenca]);
        }
      }
    }

    const paymentStatus = statusFinal;

    const paymentResult = await client.query(`
      INSERT INTO movi_pagamentos (corrida_id, passageiro_id, motorista_id, metodo, status, valor, valor_pago, moeda, atualizado_em, pago_em, metadata)
      VALUES ($1,$2,$3,$4,$5,$6,$7,'BRL',NOW(),CASE WHEN $5 = 'pago' THEN NOW() ELSE NULL END,$8::jsonb)
      ON CONFLICT (corrida_id) DO UPDATE SET
        motorista_id = EXCLUDED.motorista_id,
        metodo = EXCLUDED.metodo,
        status = EXCLUDED.status,
        valor = EXCLUDED.valor,
        valor_pago = EXCLUDED.valor_pago,
        atualizado_em = NOW(),
        pago_em = EXCLUDED.pago_em,
        metadata = EXCLUDED.metadata
      RETURNING id;
    `, [
      corrida.id,
      corrida.passageiro_id,
      motoristaId,
      corrida.forma_pagamento,
      paymentStatus,
      valorTotal,
      Number(recebido || 0),
      JSON.stringify({ origem: 'corrida.finalizar', observacao: observacao_pagamento || null }),
    ]);

    const finalizedRide = { ...corrida, motorista_id: motoristaId, status_pagamento: paymentStatus };
    await registrarLedgerCorrida(client, finalizedRide, paymentResult.rows[0]?.id || null);

    await client.query('COMMIT');
    return { sucesso: true, mensagem: 'Corrida finalizada e acertos financeiros computados.' };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}


async function resumoParaUsuario({ tipo, id }) {
  const coluna = tipo === 'motorista' ? 'motorista_id' : 'passageiro_id';
  const { rows } = await pool.query(`
    SELECT
      COUNT(*)::int AS total_corridas,
      COUNT(*) FILTER (WHERE status = 'concluida')::int AS corridas_concluidas,
      COALESCE(SUM(ganho_motorista) FILTER (WHERE status = 'concluida'), 0)::numeric(12,2) AS ganhos_motorista,
      COALESCE(SUM(valor) FILTER (WHERE status = 'concluida'), 0)::numeric(12,2) AS valor_total_corridas,
      CASE WHEN $2 = 'motorista' THEN (SELECT saldo_carteira FROM motoristas WHERE id = $1) ELSE NULL END AS saldo_carteira
    FROM corridas WHERE ${coluna} = $1;
  `, [id, tipo]);
  return rows[0];
}

async function listarParaUsuario({ tipo, id, limit = 20, offset = 0 }) {
  const coluna = tipo === 'motorista' ? 'motorista_id' : 'passageiro_id';
  const { rows } = await pool.query(`
    SELECT id, origem, destino, valor, ganho_motorista, ganho_app, forma_pagamento, status, status_pagamento,
           valor_recebido_motorista, criado_em, aceita_em, iniciada_em, finalizada_em, cancelada_em
    FROM corridas WHERE ${coluna} = $1 ORDER BY criado_em DESC LIMIT $2 OFFSET $3;
  `, [id, limit, offset]);
  return rows;
}

module.exports = {
  criar, buscarPorId, aceitar, criarOferta, listarOfertasPendentes, buscarOfertaPendente, recusarOferta,
  atualizarStatusControlado, iniciarComCodigoEmbarque, finalizarComPagamento, listarParaUsuario, resumoParaUsuario, assertFinancialSnapshot, registrarLedgerCorrida,
};
