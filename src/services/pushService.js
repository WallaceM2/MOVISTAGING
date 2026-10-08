const pool = require('../config/database');
const PushDevice = require('../models/PushDevice');

const EXPO_SEND_URL = 'https://exp.host/--/api/v2/push/send';
const EXPO_RECEIPTS_URL = 'https://exp.host/--/api/v2/push/getReceipts';
const notices = {
  nova_oferta_corrida: { title: 'Nova oportunidade no MOVI', body: 'Abra o app para conferir a oferta.' },
  corrida_aceita: { title: 'Motorista a caminho', body: 'Seu motorista aceitou a corrida.' },
  corrida_iniciada: { title: 'Corrida iniciada', body: 'Sua viagem está em andamento.' },
  corrida_finalizada: { title: 'Corrida concluída', body: 'Sua viagem foi finalizada.' },
  corrida_cancelada: { title: 'Corrida cancelada', body: 'Abra o MOVI para consultar o status.' },
};

function getRideId(payload) {
  const raw = payload?.corrida_id ?? payload?.corrida?.id ?? payload?.id;
  const id = Number(raw);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

async function sendPush(usuarioTipo, usuarioId, event, payload) {
  const notice = notices[event];
  const corridaId = getRideId(payload);
  if (!notice || !corridaId) return;
  const devices = await PushDevice.activeForUser(usuarioTipo, usuarioId);
  for (let offset = 0; offset < devices.length; offset += 100) {
    const batch = devices.slice(offset, offset + 100);
    try {
      const response = await fetch(EXPO_SEND_URL, {
        method: 'POST',
        headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
        body: JSON.stringify(batch.map((device) => ({
          to: device.expo_push_token,
          title: notice.title,
          body: notice.body,
          data: { type: 'ride', event, rideId: corridaId },
          priority: event === 'nova_oferta_corrida' ? 'high' : 'default',
          channelId: 'rides',
          ttl: event === 'nova_oferta_corrida' ? 45 : 1800,
        }))),
        signal: AbortSignal.timeout(8000),
      });
      if (!response.ok) {
        console.error(JSON.stringify({ level: 'warn', event: 'expo_push_request_failed', status: response.status }));
        continue;
      }
      const result = await response.json();
      const tickets = Array.isArray(result?.data) ? result.data : [];
      for (let index = 0; index < tickets.length; index += 1) {
        const ticket = tickets[index];
        const device = batch[index];
        if (!ticket || !device) continue;
        if (ticket.status === 'ok' && typeof ticket.id === 'string') {
          await pool.query(`
            INSERT INTO movi_push_recibos (dispositivo_id, recibo_expo_id)
            VALUES ($1,$2) ON CONFLICT (recibo_expo_id) DO NOTHING
          `, [device.id, ticket.id]);
        } else if (ticket.details?.error === 'DeviceNotRegistered') {
          await pool.query(`UPDATE movi_push_dispositivos SET ativo = FALSE, atualizado_em = NOW() WHERE id = $1`, [device.id]);
        } else if (ticket.status === 'error') {
          console.error(JSON.stringify({ level: 'warn', event: 'expo_push_ticket_failed', error: String(ticket.details?.error || 'UNKNOWN') }));
        }
      }
    } catch (error) {
      console.error(JSON.stringify({ level: 'warn', event: 'expo_push_delivery_failed', message: error.message }));
    }
  }
}

async function checkPushReceipts() {
  const { rows } = await pool.query(`
    SELECT id, dispositivo_id, recibo_expo_id
    FROM movi_push_recibos
    WHERE verificado_em IS NULL
      AND criado_em <= NOW() - INTERVAL '15 minutes'
      AND criado_em > NOW() - INTERVAL '24 hours'
    ORDER BY criado_em ASC
    LIMIT 1000
  `);
  if (!rows.length) return 0;
  let response;
  try {
    response = await fetch(EXPO_RECEIPTS_URL, {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids: rows.map((row) => row.recibo_expo_id) }),
      signal: AbortSignal.timeout(8000),
    });
  } catch (error) {
    console.error(JSON.stringify({ level: 'warn', event: 'expo_push_receipt_request_failed', message: error.message }));
    return 0;
  }
  if (!response.ok) return 0;
  const result = await response.json();
  const receipts = result?.data || {};
  let processed = 0;
  for (const row of rows) {
    const receipt = receipts[row.recibo_expo_id];
    if (!receipt) continue;
    if (receipt.status === 'error' && receipt.details?.error === 'DeviceNotRegistered') {
      await pool.query(`UPDATE movi_push_dispositivos SET ativo = FALSE, atualizado_em = NOW() WHERE id = $1`, [row.dispositivo_id]);
    }
    await pool.query('UPDATE movi_push_recibos SET verificado_em = NOW() WHERE id = $1', [row.id]);
    processed += 1;
  }
  return processed;
}

module.exports = { sendPush, checkPushReceipts };
