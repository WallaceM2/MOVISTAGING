const pool = require('../config/database');
const AppError = require('../errors/AppError');
const { assertRideTransition } = require('../utils/stateMachine');
const crypto = require('crypto');
const env = require('../config/env');
const { calculateCashSettlement } = require('../services/cashSettlement');
const { calculatePassengerCancellationFee } = require('../services/cancellationFee');

const ACTIVE_STATUSES = ['solicitada', 'aceita', 'em_andamento'];

const FINALIZABLE_PAYMENT_STATUSES = new Set(['pago', 'parcial', 'nao_pago']);
const PASSENGER_DEBT_LIMIT = 10;
const DRIVER_CASH_DEBT_LIMIT = -10;

function deveBloquearNovaCorrida(debitoPendente) {
  return Number(debitoPendente || 0) >= PASSENGER_DEBT_LIMIT;
}

function deveBloquearCorridasEmDinheiro(saldoCarteira) {
  return Number(saldoCarteira || 0) <= DRIVER_CASH_DEBT_LIMIT;
}

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
  const valorRecebido = Number(corrida.valor_recebido_motorista ?? corrida.valor);
  const acertoParcial = corrida.forma_pagamento === 'dinheiro' && valorRecebido < Number(corrida.valor)
    ? calculateCashSettlement({ fare: corrida.valor, received: valorRecebido })
    : null;
  const valorBase = acertoParcial ? acertoParcial.fare : valorRecebido;
  const proporcaoRecebida = Number(corrida.valor) > 0 ? Math.min(1, Math.max(0, valorRecebido / Number(corrida.valor))) : 0;
  const brutoRecebido = Number(valorBase.toFixed(2));
  const repasseRecebido = acertoParcial ? Number((Number(corrida.ganho_motorista) || (valorBase * 0.85)).toFixed(2)) : Number((brutoRecebido * 0.85).toFixed(2));
  const comissaoRecebida = acertoParcial
    ? acertoParcial.commissionAlreadyCoveredByCash
    : Number((brutoRecebido - repasseRecebido).toFixed(2));
  if (brutoRecebido <= 0) return;
  const entries = [
    { tipo: 'corrida_bruta', valor: brutoRecebido, ref: `corrida:${corrida.id}:bruta`, metadata: { papel: acertoParcial ? 'valor_bruto_contratado_com_debito' : 'valor_bruto_recebido', status_pagamento: corrida.status_pagamento, valor_total_corrida: Number(corrida.valor), valor_recebido: valorRecebido, debito_pendente: acertoParcial?.passengerDebt || 0 } },
    { tipo: 'repasse_motorista', valor: -repasseRecebido, ref: `corrida:${corrida.id}:repasse`, metadata: { papel: 'ganho_economico_motorista', percentual: 85, proporcao_recebida: acertoParcial ? 1 : proporcaoRecebida, adiantamento_previsto: acertoParcial?.driverAdvance || 0, liquidacao: acertoParcial ? 'pendente' : 'registrada' } },
  ];
  if (!acertoParcial || comissaoRecebida > 0) {
    entries.push({
      tipo: 'comissao_app',
      valor: -comissaoRecebida,
      ref: `corrida:${corrida.id}:comissao`,
      metadata: {
        papel: 'comissao_movi',
        percentual: 15,
        proporcao_recebida: acertoParcial ? comissaoRecebida / Math.max(0.01, acertoParcial.commissionTotal) : proporcaoRecebida,
        liquidacao: acertoParcial ? 'parcial_coberta_no_dinheiro' : 'registrada',
        comissao_total_corrida: acertoParcial?.commissionTotal ?? comissaoRecebida,
        comissao_pendente_recuperacao: acertoParcial?.commissionAllocatedToDebt ?? 0,
      },
    });
  }

  for (const entry of entries) {
    await client.query(`
      INSERT INTO movi_lancamentos_financeiros (
        corrida_id, pagamento_id, motorista_id, passageiro_id, tipo, valor, moeda, referencia_unica, metadata
      )
      VALUES ($1,$2,$3,$4,$5,$6,'BRL',$7,$8::jsonb)
      ON CONFLICT (referencia_unica) WHERE referencia_unica IS NOT NULL DO NOTHING;
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
    if (deveBloquearNovaCorrida(debito)) {
      throw new AppError('Seu débito pendente atingiu R$ 10,00. Quite o valor antes de solicitar outra corrida.', 403, 'OUTSTANDING_DEBT');
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
  const { rows } = await pool.query(`
    SELECT c.*, t.valor AS taxa_cancelamento_valor, t.status AS taxa_cancelamento_status,
           t.repasse_status AS taxa_cancelamento_repasse_status,
           t.creditado_carteira_em AS taxa_cancelamento_creditado_carteira_em,
           t.criado_em AS taxa_cancelamento_criada_em
    FROM corridas c
    LEFT JOIN movi_taxas_cancelamento t ON t.corrida_id = c.id
    WHERE c.id = $1 LIMIT 1;
  `, [id]);
  if (rows[0] && rows[0].taxa_cancelamento_valor != null) {
    rows[0].taxa_cancelamento = {
      valor: Number(rows[0].taxa_cancelamento_valor),
      status: rows[0].taxa_cancelamento_status,
      repasse_status: rows[0].taxa_cancelamento_repasse_status,
      creditado_carteira_em: rows[0].taxa_cancelamento_creditado_carteira_em,
      criada_em: rows[0].taxa_cancelamento_criada_em,
      destinatario: 'motorista',
    };
  }
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

    let taxaCancelamento = null;
    if (nextStatus === 'cancelada' && actor.tipo === 'passageiro' && current.status === 'aceita' && current.motorista_id && current.aceita_em) {
      const clock = await client.query('SELECT NOW() AS agora');
      const fee = calculatePassengerCancellationFee({
        actorType: actor.tipo,
        priorStatus: current.status,
        driverId: current.motorista_id,
        acceptedAt: current.aceita_em,
        cancelledAt: clock.rows[0]?.agora,
      });
      if (fee > 0) {
        const passengerResult = await client.query('SELECT debito_pendente FROM passageiros WHERE id = $1 FOR UPDATE', [current.passageiro_id]);
        if (!passengerResult.rows[0]) throw new AppError('Passageiro não encontrado.', 404, 'PASSENGER_NOT_FOUND');
        const inserted = await client.query(`
          INSERT INTO movi_taxas_cancelamento (
            corrida_id, passageiro_id, motorista_id, valor, aceita_em, cancelada_em, segundos_apos_aceite,
            repasse_status, creditado_carteira_em
          ) VALUES ($1,$2,$3,$4,$5,$6,$7,'creditado_carteira',NOW())
          ON CONFLICT (corrida_id) DO NOTHING
          RETURNING id, corrida_id, passageiro_id, motorista_id, valor, status, repasse_status, creditado_carteira_em, criado_em;
        `, [id, current.passageiro_id, current.motorista_id, fee, current.aceita_em, clock.rows[0].agora, Math.floor((new Date(clock.rows[0].agora).getTime() - new Date(current.aceita_em).getTime()) / 1000)]);
        taxaCancelamento = inserted.rows[0] || null;
        if (taxaCancelamento) {
          const novoDebito = Number((Number(passengerResult.rows[0].debito_pendente || 0) + fee).toFixed(2));
          await client.query('UPDATE passageiros SET debito_pendente = $1, atualizado_em = NOW() WHERE id = $2', [novoDebito, current.passageiro_id]);
          const driverResult = await client.query('SELECT saldo_carteira FROM motoristas WHERE id = $1 FOR UPDATE', [current.motorista_id]);
          const driver = driverResult.rows[0];
          if (!driver) throw new AppError('Motorista não encontrado.', 404, 'DRIVER_NOT_FOUND');
          const saldoAnterior = Number(driver.saldo_carteira || 0);
          const saldoAtual = Number((saldoAnterior + fee).toFixed(2));
          await client.query(`
            UPDATE motoristas
            SET saldo_carteira = $1, bloqueado_dinheiro = $2, atualizado_em = NOW()
            WHERE id = $3;
          `, [saldoAtual, deveBloquearCorridasEmDinheiro(saldoAtual), current.motorista_id]);
          await client.query(`
            INSERT INTO transacoes_motoristas (
              motorista_id, corrida_id, tipo, valor, saldo_anterior, saldo_atual, referencia_externa, metadata
            ) VALUES ($1,$2,'credito_taxa_cancelamento',$3,$4,$5,$6,$7::jsonb)
            ON CONFLICT (referencia_externa) WHERE referencia_externa IS NOT NULL AND tipo = 'credito_taxa_cancelamento' DO NOTHING;
          `, [current.motorista_id, id, fee, saldoAnterior, saldoAtual, `corrida:${id}:taxa_cancelamento:carteira`, JSON.stringify({ origem: 'cancelamento_passageiro', fonte: 'adiantamento_movi', status: 'creditado_carteira' })]);
          const ledger = [
            { tipo: 'taxa_cancelamento', valor: fee, referencia: `corrida:${id}:taxa_cancelamento:devida`, papel: 'debito_passageiro' },
            { tipo: 'repasse_cancelamento', valor: -fee, referencia: `corrida:${id}:taxa_cancelamento:motorista`, papel: 'credito_motorista_carteira', status: 'creditado_carteira' },
          ];
          for (const entry of ledger) {
            await client.query(`
              INSERT INTO movi_lancamentos_financeiros (
                corrida_id, motorista_id, passageiro_id, tipo, valor, moeda, referencia_unica, metadata
              ) VALUES ($1,$2,$3,$4,$5,'BRL',$6,$7::jsonb)
              ON CONFLICT (referencia_unica) WHERE referencia_unica IS NOT NULL DO NOTHING;
            `, [id, current.motorista_id, current.passageiro_id, entry.tipo, entry.valor, entry.referencia, JSON.stringify({ papel: entry.papel, status: entry.status || 'pendente', destinatario: 'motorista' })]);
          }
        }
      }
    }

    const timestampColumn = nextStatus === 'em_andamento'
      ? 'iniciada_em'
      : nextStatus === 'cancelada'
        ? 'cancelada_em'
        : null;
    const extra = timestampColumn
      ? `, ${timestampColumn} = NOW()`
      : nextStatus === 'concluida' ? ', finalizada_em = NOW()' : '';

    if (nextStatus === 'cancelada') {
      // This project has no active payment provider yet. Close only local,
      // unprocessed pending payment records; provider-backed payments need a
      // real cancellation/refund round trip before their status can change.
      await client.query(`
        UPDATE movi_pagamentos
        SET status = 'cancelado', atualizado_em = NOW()
        WHERE corrida_id = $1 AND status = 'pendente' AND provider IS NULL;
      `, [id]);
    }

    const { rows } = await client.query(`
      UPDATE corridas
      SET
        status = $1::varchar ${extra},
        status_pagamento = CASE
          WHEN $1::varchar = 'cancelada' AND status_pagamento = 'pendente'
            AND EXISTS (SELECT 1 FROM movi_pagamentos p WHERE p.corrida_id = $4::integer AND p.status = 'cancelado' AND p.provider IS NULL)
          THEN 'cancelado'
          ELSE status_pagamento
        END,
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
    return taxaCancelamento
      ? { ...rows[0], taxa_cancelamento: { valor: Number(taxaCancelamento.valor), status: taxaCancelamento.status, repasse_status: taxaCancelamento.repasse_status, creditado_carteira_em: taxaCancelamento.creditado_carteira_em, criada_em: taxaCancelamento.criado_em, destinatario: 'motorista' } }
      : rows[0];
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
    if (!FINALIZABLE_PAYMENT_STATUSES.has(statusFinal)) throw new AppError('Status de pagamento inválido.', 400, 'INVALID_PAYMENT_STATUS');

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
      if (statusFinal === 'parcial' && (recebido == null || recebido <= 0 || recebido >= valorTotal)) throw new AppError('Pagamento parcial exige um valor recebido positivo e menor que o total da corrida.', 400, 'INVALID_PARTIAL_PAYMENT');
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
      const valorRecebido = Number(recebido || 0);
      const acertoParcial = statusFinal === 'parcial' || statusFinal === 'nao_pago'
        ? calculateCashSettlement({ fare: valorTotal, received: valorRecebido })
        : null;
      const ganhoApp = acertoParcial ? acertoParcial.commissionAlreadyCoveredByCash : Number((valorRecebido * 0.15).toFixed(2));
      const saldoAtual = Number((saldoAnterior - ganhoApp).toFixed(2));
      const bloqueado = deveBloquearCorridasEmDinheiro(saldoAtual);

      await client.query(`
        UPDATE motoristas SET saldo_carteira = $1, bloqueado_dinheiro = $2, atualizado_em = NOW()
        WHERE id = $3;
      `, [saldoAtual, bloqueado, motoristaId]);

      const existingTx = await client.query(`
        SELECT id FROM transacoes_motoristas WHERE corrida_id = $1 AND tipo = 'debito_taxa_app' LIMIT 1;
      `, [corridaId]);
      if (ganhoApp > 0 && !existingTx.rows.length) {
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

        const acerto = calculateCashSettlement({ fare: valorTotal, received: valorRecebido });
        await client.query(`
          INSERT INTO movi_acertos_dinheiro (
            corrida_id, passageiro_id, motorista_id, valor_total, valor_recebido, debito_passageiro,
            comissao_total, comissao_alocada_ao_debito, comissao_coberta_no_dinheiro,
            adiantamento_motorista, limite_protecao_nao_recuperavel, exposicao_protecao,
            adiantamento_acima_protecao
          ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
          ON CONFLICT (corrida_id) DO NOTHING;
        `, [
          corridaId, corrida.passageiro_id, motoristaId, acerto.fare, acerto.received, acerto.passengerDebt,
          acerto.commissionTotal, acerto.commissionAllocatedToDebt, acerto.commissionAlreadyCoveredByCash,
          acerto.driverAdvance, acerto.nonRecoverableProtectionCap, acerto.protectionExposure,
          acerto.advanceAboveProtectionCap,
        ]);
      }
    }

    const paymentStatus = statusFinal;

    const paymentResult = await client.query(`
      INSERT INTO movi_pagamentos (corrida_id, passageiro_id, motorista_id, metodo, status, valor, valor_pago, moeda, atualizado_em, pago_em, metadata)
      VALUES ($1,$2,$3,$4,$5,$6,$7,'BRL',NOW(),CASE WHEN $5::varchar = 'pago'::varchar THEN NOW() ELSE NULL END,$8::jsonb)
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

    const finalizedRide = { ...corrida, motorista_id: motoristaId, status_pagamento: paymentStatus, valor_recebido_motorista: Number(recebido || 0) };
    await registrarLedgerCorrida(client, finalizedRide, paymentResult.rows[0]?.id || null);

    await client.query('COMMIT');
    const acertoParcial = corrida.forma_pagamento === 'dinheiro' && (statusFinal === 'parcial' || statusFinal === 'nao_pago')
      ? calculateCashSettlement({ fare: valorTotal, received: Number(recebido || 0) })
      : null;
    return {
      sucesso: true,
      mensagem: 'Corrida finalizada e acertos financeiros computados.',
      acerto_dinheiro: acertoParcial ? {
        valor_recebido: acertoParcial.received,
        debito_passageiro: acertoParcial.passengerDebt,
        comissao_total: acertoParcial.commissionTotal,
        comissao_coberta_no_dinheiro: acertoParcial.commissionAlreadyCoveredByCash,
        adiantamento_motorista_previsto: acertoParcial.driverAdvance,
        protecao_nao_recuperavel_maxima: acertoParcial.protectionExposure,
        parcela_acima_do_teto_recuperavel: acertoParcial.advanceAboveProtectionCap,
        liquidacao_ao_motorista: 'nao_integrada',
      } : null,
    };
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
      COALESCE((SELECT SUM(-l.valor) FROM movi_lancamentos_financeiros l
        WHERE l.motorista_id = $1 AND l.tipo = 'repasse_motorista' AND l.valor < 0), 0)::numeric(12,2) AS ganhos_motorista,
      COALESCE((SELECT SUM(-l.valor) FROM movi_lancamentos_financeiros l
        WHERE l.motorista_id = $1 AND l.tipo = 'repasse_motorista' AND l.valor < 0
          AND l.criado_em >= NOW() - INTERVAL '24 hours'), 0)::numeric(12,2) AS ganhos_ultimas_24h,
      COALESCE(SUM(valor) FILTER (WHERE status = 'concluida'), 0)::numeric(12,2) AS valor_total_corridas,
      CASE WHEN $2 = 'motorista' THEN (SELECT saldo_carteira FROM motoristas WHERE id = $1) ELSE NULL END AS saldo_carteira
    FROM corridas WHERE ${coluna} = $1;
  `, [id, tipo]);
  return rows[0];
}

async function listarParaUsuario({ tipo, id, limit = 20, offset = 0 }) {
  const coluna = tipo === 'motorista' ? 'motorista_id' : 'passageiro_id';
  const { rows } = await pool.query(`
    SELECT c.id, c.origem, c.destino, c.valor,
           CASE WHEN a.id IS NOT NULL THEN c.ganho_motorista
             WHEN c.status = 'concluida' AND c.forma_pagamento = 'dinheiro'
             THEN ROUND((c.ganho_motorista * COALESCE(c.valor_recebido_motorista, 0) / NULLIF(c.valor, 0))::numeric, 2)
             ELSE c.ganho_motorista END AS ganho_motorista,
           c.ganho_app, c.forma_pagamento, c.status, c.status_pagamento,
           c.valor_recebido_motorista, c.criado_em, c.aceita_em, c.iniciada_em, c.finalizada_em, c.cancelada_em
    FROM corridas c LEFT JOIN movi_acertos_dinheiro a ON a.corrida_id = c.id
    WHERE c.${coluna} = $1 ORDER BY c.criado_em DESC LIMIT $2 OFFSET $3;
  `, [id, limit, offset]);
  return rows;
}

module.exports = {
  criar, buscarPorId, aceitar, criarOferta, listarOfertasPendentes, buscarOfertaPendente, recusarOferta,
  atualizarStatusControlado, iniciarComCodigoEmbarque, finalizarComPagamento, listarParaUsuario, resumoParaUsuario, assertFinancialSnapshot, registrarLedgerCorrida,
  deveBloquearNovaCorrida, deveBloquearCorridasEmDinheiro,
};
