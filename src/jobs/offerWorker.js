const pool = require('../config/database');
const { buscarMotoristasProximos, limparDemandaPassageiro } = require('../services/dinamicaService');
const { emitToUser } = require('../services/realtimeService');
const env = require('../config/env');
const Corrida = require('../models/Corrida');
const { checkPushReceipts } = require('../services/pushService');

async function despacharProximaOferta(corridaId) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const rideResult = await client.query(`
      SELECT * FROM corridas WHERE id = $1 FOR UPDATE
    `, [corridaId]);
    const corrida = rideResult.rows[0];
    if (!corrida || corrida.status !== 'solicitada' || corrida.motorista_id) {
      await client.query('ROLLBACK');
      return false;
    }

    const pending = await client.query(`
      SELECT 1 FROM corrida_ofertas
      WHERE corrida_id = $1 AND status = 'ofertada' AND expira_em > NOW()
      LIMIT 1;
    `, [corridaId]);
    if (pending.rows.length) {
      await client.query('ROLLBACK');
      return false;
    }

    const usedResult = await client.query(`
      SELECT motorista_id FROM corrida_ofertas WHERE corrida_id = $1
    `, [corridaId]);
    const used = new Set(usedResult.rows.map((row) => Number(row.motorista_id)));
    await client.query('COMMIT');

    const candidates = await buscarMotoristasProximos(
      corrida.origem_lat,
      corrida.origem_lng,
      env.DRIVER_SEARCH_RADIUS_KM,
      corrida.categoria,
    );
    const next = candidates.find((candidate) => !used.has(Number(candidate.motoristaId)));
    if (!next) {
      const expired = await pool.query(`
        UPDATE corridas
        SET status = 'expirada', atualizado_em = NOW()
        WHERE id = $1
          AND status = 'solicitada'
          AND motorista_id IS NULL
          AND criado_em <= NOW() - ($2 * INTERVAL '1 second')
        RETURNING passageiro_id;
      `, [corridaId, env.RIDE_REQUEST_TIMEOUT_SEC]);
      if (expired.rows[0]) {
        await limparDemandaPassageiro(expired.rows[0].passageiro_id);
        await emitToUser('passageiro', expired.rows[0].passageiro_id, 'corrida_expirada', {
          corrida_id: corridaId,
          mensagem: 'Não encontramos motorista disponível dentro do tempo limite.',
        });
      }
      return false;
    }

    const created = await Corrida.criarOferta(corrida.id, next.motoristaId, next.distanciaKm, env.OFFER_TIMEOUT_SEC);
    if (created) {
      await emitToUser('motorista', next.motoristaId, 'nova_oferta_corrida', {
        corrida_id: corrida.id,
        local_embarque: corrida.origem,
        local_desembarque: corrida.destino,
        valor_motorista: Number(corrida.ganho_motorista),
        distancia_km: Number(corrida.distancia_km || 0),
        tempo_minutos: Number(corrida.tempo_minutos || 0),
        forma_pagamento: corrida.forma_pagamento,
        categoria: corrida.categoria,
        tempo_para_aceitar: env.OFFER_TIMEOUT_SEC,
      });
      return true;
    }
    return false;
  } catch (error) {
    try { await client.query('ROLLBACK'); } catch (_) {}
    throw error;
  } finally {
    client.release();
  }
}

async function processPendingRides() {
  const pendingResult = await pool.query(`
    SELECT c.id
    FROM corridas c
    WHERE c.status = 'solicitada'
      AND c.motorista_id IS NULL
      AND c.criado_em > NOW() - ($1 * INTERVAL '1 second')
      AND NOT EXISTS (
        SELECT 1 FROM corrida_ofertas o
        WHERE o.corrida_id = c.id AND o.status = 'ofertada' AND o.expira_em > NOW()
      )
    ORDER BY c.criado_em ASC
    FOR UPDATE SKIP LOCKED
    LIMIT 50;
  `, [env.RIDE_REQUEST_TIMEOUT_SEC]);

  for (const row of pendingResult.rows) {
    try {
      await despacharProximaOferta(row.id);
    } catch (error) {
      console.error(JSON.stringify({ level: 'error', event: 'pending_ride_dispatch_error', corrida_id: row.id, message: error.message }));
    }
  }
}

async function processExpiredOffers() {
  const expiredResult = await pool.query(`
    UPDATE corrida_ofertas
    SET status = 'expirada', respondida_em = NOW()
    WHERE id IN (
      SELECT id FROM corrida_ofertas
      WHERE status = 'ofertada' AND expira_em <= NOW()
      ORDER BY expira_em
      FOR UPDATE SKIP LOCKED
      LIMIT 50
    )
    RETURNING corrida_id;
  `);

  const rideIds = [...new Set(expiredResult.rows.map((row) => Number(row.corrida_id)))];
  for (const corridaId of rideIds) {
    try {
      await despacharProximaOferta(corridaId);
    } catch (error) {
      console.error(JSON.stringify({ level: 'error', event: 'offer_dispatch_error', corrida_id: corridaId, message: error.message }));
    }
  }
}

async function maintenance() {
  await pool.query(`
    DELETE FROM movi_idempotency_keys
    WHERE created_at < NOW() - INTERVAL '24 hours';
  `);
  await pool.query(`
    DELETE FROM movi_refresh_tokens
    WHERE expira_em < NOW() - INTERVAL '7 days'
       OR (revogado_em IS NOT NULL AND revogado_em < NOW() - INTERVAL '30 days');
  `);
  await pool.query(`DELETE FROM movi_push_recibos WHERE criado_em < NOW() - INTERVAL '30 days'`);
}

function startOfferWorker() {
  const timer = setInterval(() => {
    processExpiredOffers().catch((error) => console.error(JSON.stringify({ level: 'error', event: 'offer_worker_error', message: error.message })));
    processPendingRides().catch((error) => console.error(JSON.stringify({ level: 'error', event: 'pending_ride_worker_error', message: error.message })));
  }, env.DISPATCH_INTERVAL_MS);
  timer.unref?.();
  const cleanupTimer = setInterval(() => { maintenance().catch((error) => console.error(JSON.stringify({ level: 'error', event: 'maintenance_error', message: error.message }))); }, 60 * 60 * 1000);
  cleanupTimer.unref?.();
  const receiptTimer = setInterval(() => { checkPushReceipts().catch((error) => console.error(JSON.stringify({ level: 'warn', event: 'push_receipt_worker_error', message: error.message }))); }, 5 * 60 * 1000);
  receiptTimer.unref?.();
  return () => { clearInterval(timer); clearInterval(cleanupTimer); clearInterval(receiptTimer); };
}

module.exports = { startOfferWorker, processExpiredOffers, processPendingRides, despacharProximaOferta, maintenance };
