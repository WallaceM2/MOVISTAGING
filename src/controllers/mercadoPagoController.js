const crypto = require('crypto');
const pool = require('../config/database');
const env = require('../config/env');
const AppError = require('../errors/AppError');
const mercadoPago = require('../services/mercadoPagoMarketplace');

async function iniciarVinculacao(req, res) {
  const result = await pool.query(`
    SELECT status_cadastro, status_conta FROM motoristas WHERE id = $1 LIMIT 1
  `, [req.usuario.id]);
  const driver = result.rows[0];
  if (!driver || driver.status_cadastro !== 'aprovado' || driver.status_conta !== 'ativa') {
    throw new AppError('Somente motorista aprovado e com conta ativa pode vincular Mercado Pago.', 403, 'MP_DRIVER_NOT_ELIGIBLE');
  }
  res.json(await mercadoPago.iniciarOAuth(req.usuario.id));
}

async function estadoVinculacao(req, res) {
  const result = await pool.query(`
    SELECT ambiente, expires_at, conectado_em, revogado_em
    FROM movi_mp_motorista_tokens WHERE motorista_id = $1 LIMIT 1
  `, [req.usuario.id]);
  const row = result.rows[0];
  res.json({
    vinculado: Boolean(row && !row.revogado_em && new Date(row.expires_at).getTime() > Date.now()),
    ambiente: row?.ambiente || null,
    conectado_em: row?.conectado_em || null,
    expirado: Boolean(row && new Date(row.expires_at).getTime() <= Date.now()),
  });
}

async function callbackOAuth(req, res) {
  if (req.query.error) return res.status(400).type('text/plain').send('Vinculação Mercado Pago não autorizada. Você pode tentar novamente no aplicativo.');
  const resultado = await mercadoPago.concluirOAuth({ code: req.query.code, state: req.query.state });
  res.status(200).type('text/plain').send('Conta de teste Mercado Pago vinculada. Você pode voltar ao aplicativo MOVI.');
}

function webhookPayloadHash({ dataId, action, requestId, timestamp }) {
  return crypto.createHash('sha256').update(`${dataId}\n${action}\n${requestId || ''}\n${timestamp}`).digest('hex');
}

async function receberWebhook(req, res) {
  const dataId = String(req.query['data.id'] || req.query.id || req.body?.data?.id || '');
  const eventType = String(req.query.type || req.query.topic || req.body?.type || '');
  const action = String(req.body?.action || eventType || 'payment.updated').slice(0, 100);
  const requestId = String(req.get('x-request-id') || '').slice(0, 200);
  const signature = req.get('x-signature');
  const secret = env.MP_WEBHOOK_SECRET;

  if (eventType !== 'payment' && req.body?.type !== 'payment') return res.sendStatus(200);
  if (!secret || !mercadoPago.verifyWebhookSignature({
    signature, requestId, dataId, secret,
  })) {
    return res.status(401).json({ erro: 'Assinatura do webhook inválida.', codigo: 'MP_WEBHOOK_SIGNATURE_INVALID' });
  }
  if (env.MP_ENVIRONMENT !== 'sandbox') return res.status(503).json({ erro: 'Webhook de produção ainda não habilitado.', codigo: 'MP_PRODUCTION_DISABLED' });
  if (!/^\d{1,30}$/.test(dataId)) return res.status(400).json({ erro: 'Identificador do pagamento inválido.', codigo: 'MP_PAYMENT_ID_INVALID' });

  const payloadHash = webhookPayloadHash({
    dataId,
    action,
    requestId,
    timestamp: String(signature).match(/(?:^|,)\s*ts=([^,]+)/)?.[1] || '',
  });
  const event = await pool.query(`
    INSERT INTO movi_mp_webhook_events (ambiente, payment_external_id, action, request_id, payload_hash)
    VALUES ('sandbox',$1,$2,$3,$4)
    ON CONFLICT (ambiente, payload_hash) DO UPDATE SET
      resultado = 'recebido', processado_em = NULL
    WHERE movi_mp_webhook_events.resultado = 'falhou'
    RETURNING id
  `, [dataId, action, requestId || null, payloadHash]);
  if (!event.rows[0]) return res.sendStatus(200);

  try {
    const local = await pool.query(`
      SELECT p.id AS pagamento_id, p.corrida_id, p.motorista_id, p.valor, p.moeda,
             p.tarifa_base, p.taxa_processamento, p.comissao_marketplace,
             p.external_id, p.status AS pagamento_status, c.status AS corrida_status,
             c.valor AS valor_corrida, c.ganho_app, c.percentual_comissao_app, t.mp_user_id
      FROM movi_pagamentos p
      JOIN corridas c ON c.id = p.corrida_id
      JOIN movi_mp_motorista_tokens t ON t.motorista_id = p.motorista_id
      WHERE p.provider = 'mercadopago' AND p.external_id = $1
        AND t.ambiente = 'sandbox' AND t.revogado_em IS NULL
      LIMIT 1
    `, [dataId]);
    const current = local.rows[0];
    if (!current) {
      await pool.query("UPDATE movi_mp_webhook_events SET resultado = 'requer_revisao', processado_em = NOW() WHERE id = $1", [event.rows[0].id]);
      console.error(JSON.stringify({ level: 'error', event: 'mp_webhook_orphan_payment', payment_external_id: dataId }));
      return res.sendStatus(200);
    }

    const payment = await mercadoPago.buscarPagamentoVendedor(current.motorista_id, dataId);
    const amountMatches = Number(payment.transaction_amount) === Number(Number(current.valor).toFixed(2));
    const financialSnapshotMatches = Math.abs(Number(current.valor) - (Number(current.tarifa_base) + Number(current.taxa_processamento))) <= 0.01
      && Math.abs(Number(current.comissao_marketplace) - Number(current.ganho_app)) <= 0.01
      && Number(current.percentual_comissao_app) === 15;
    const providerFeeMatches = payment.application_fee == null
      || Math.abs(Number(payment.application_fee) - Number(current.comissao_marketplace)) <= 0.01;
    const referencesMatch = String(payment.external_reference || '') === String(current.corrida_id);
    const currencyMatches = payment.currency_id === current.moeda;
    const notificationUserId = req.body?.user_id == null ? null : Number(req.body.user_id);
    const providerSellerId = payment.collector_id == null && payment.user_id == null
      ? null : Number(payment.collector_id || payment.user_id);
    const sellerMatches = providerSellerId === Number(current.mp_user_id)
      && (notificationUserId == null || notificationUserId === Number(current.mp_user_id));
    const mapped = mercadoPago.mapProviderStatus(payment.status, payment.status_detail);

    if (!amountMatches || !financialSnapshotMatches || !providerFeeMatches || !referencesMatch || !currencyMatches || !sellerMatches || !mapped) {
      await pool.query("UPDATE movi_mp_webhook_events SET resultado = 'falhou', processado_em = NOW() WHERE id = $1", [event.rows[0].id]);
      console.error(JSON.stringify({
        level: 'error', event: 'mp_webhook_reconciliation_mismatch',
        pagamento_id: Number(current.pagamento_id), corrida_id: Number(current.corrida_id),
        amount_matches: amountMatches, snapshot_matches: financialSnapshotMatches,
        provider_fee_matches: providerFeeMatches, reference_matches: referencesMatch,
        currency_matches: currencyMatches, seller_matches: sellerMatches,
      }));
      return res.status(409).json({ erro: 'Pagamento recebido não corresponde ao snapshot financeiro da MOVI.', codigo: 'MP_PAYMENT_RECONCILIATION_MISMATCH' });
    }

    if (mapped === 'reembolsado' || mapped === 'parcial' || payment.status === 'charged_back') {
      await pool.query("UPDATE movi_mp_webhook_events SET resultado = 'requer_revisao', processado_em = NOW() WHERE id = $1", [event.rows[0].id]);
      console.error(JSON.stringify({
        level: 'error', event: 'mp_payment_refund_or_chargeback_requires_review',
        pagamento_id: Number(current.pagamento_id), corrida_id: Number(current.corrida_id),
        provider_status: String(payment.status || ''),
      }));
      return res.sendStatus(200);
    }

    const tx = await pool.connect();
    try {
      await tx.query('BEGIN');
      const locked = await tx.query('SELECT id, corrida_id, status FROM movi_pagamentos WHERE id = $1 FOR UPDATE', [current.pagamento_id]);
      if (!locked.rows[0]) throw new AppError('Pagamento MOVI não encontrado.', 404, 'PAYMENT_NOT_FOUND');
      const currentStatus = locked.rows[0].status;
      const terminal = new Set(['cancelado', 'reembolsado']);
      const stale = terminal.has(currentStatus)
        || (currentStatus === 'pago' && mapped !== 'reembolsado')
        || (currentStatus === 'falhou' && !['reembolsado'].includes(mapped));
      if (stale) {
        await tx.query("UPDATE movi_mp_webhook_events SET resultado = 'ignorado', processado_em = NOW() WHERE id = $1", [event.rows[0].id]);
        await tx.query('COMMIT');
        return res.sendStatus(200);
      }
      await tx.query(`
        UPDATE movi_pagamentos SET status = $1, valor_pago = $2, atualizado_em = NOW(),
          pago_em = CASE WHEN $1 = 'pago' THEN COALESCE(pago_em, NOW()) ELSE pago_em END,
          autorizado_em = CASE WHEN $1 = 'autorizado' THEN COALESCE(autorizado_em, NOW()) ELSE autorizado_em END,
          falhou_em = CASE WHEN $1 = 'falhou' THEN COALESCE(falhou_em, NOW()) ELSE falhou_em END,
          estornado_em = CASE WHEN $1 IN ('reembolsado','cancelado') THEN COALESCE(estornado_em, NOW()) ELSE estornado_em END
        WHERE id = $3
      `, [mapped, mapped === 'pago' ? Number(current.valor) : 0, current.pagamento_id]);
      if (mapped === 'pago') {
        await tx.query(`UPDATE corridas SET status_pagamento = 'pago', atualizado_em = NOW() WHERE id = $1`, [current.corrida_id]);
      } else if (['falhou', 'cancelado', 'reembolsado'].includes(mapped)) {
        const ridePaymentState = mapped === 'reembolsado' ? 'estornado' : mapped;
        await tx.query('UPDATE corridas SET status_pagamento = $1, atualizado_em = NOW() WHERE id = $2', [ridePaymentState, current.corrida_id]);
      }
      await tx.query("UPDATE movi_mp_webhook_events SET resultado = 'processado', processado_em = NOW() WHERE id = $1", [event.rows[0].id]);
      await tx.query('COMMIT');
    } catch (error) {
      await tx.query('ROLLBACK').catch(() => {});
      throw error;
    } finally {
      tx.release();
    }
    return res.sendStatus(200);
  } catch (error) {
    await pool.query("UPDATE movi_mp_webhook_events SET resultado = 'falhou' WHERE id = $1", [event.rows[0].id]).catch(() => {});
    throw error;
  }
}

module.exports = { iniciarVinculacao, estadoVinculacao, callbackOAuth, receberWebhook };
