const pool = require('../config/database');
const redisClient = require('../config/redis');
const AppError = require('../errors/AppError');
const { atualizarLocalizacaoMotorista } = require('../services/dinamicaService');
const { emitToUser } = require('../services/realtimeService');

async function atualizar(req, res) {
  const motoristaId = req.usuario.id;
  const { lat, lng, direcao, corrida_id: corridaId } = req.body;
  if (!redisClient.isReady) throw new AppError('Localização temporariamente indisponível.', 503, 'LOCATION_SERVICE_UNAVAILABLE');
  const accepted = await redisClient.set(`movi:location-http:${motoristaId}`, '1', { NX: true, EX: 5 });
  if (!accepted) throw new AppError('Aguarde antes de enviar outra localização.', 429, 'LOCATION_RATE_LIMITED');

  const result = await pool.query(`
    SELECT id, categoria, status_cadastro, status_conta, disponivel
    FROM motoristas WHERE id = $1 LIMIT 1
  `, [motoristaId]);
  const driver = result.rows[0];
  if (!driver || driver.status_cadastro !== 'aprovado' || driver.status_conta !== 'ativa') {
    throw new AppError('Motorista não está habilitado para compartilhar localização.', 403, 'DRIVER_NOT_APPROVED');
  }

  let ride = null;
  if (corridaId != null) {
    const active = await pool.query(`
      SELECT id, passageiro_id, motorista_id, status
      FROM corridas WHERE id = $1 LIMIT 1
    `, [corridaId]);
    ride = active.rows[0];
    if (!ride || Number(ride.motorista_id) !== Number(motoristaId) || !['aceita', 'em_andamento'].includes(ride.status)) {
      throw new AppError('A corrida não permite este envio de localização.', 403, 'INVALID_ACTIVE_RIDE');
    }
  } else if (!driver.disponivel) {
    throw new AppError('Fique online para compartilhar sua localização.', 409, 'DRIVER_OFFLINE');
  }

  await atualizarLocalizacaoMotorista(lat, lng, motoristaId, driver.categoria, driver.disponivel === true);
  await pool.query(`
    UPDATE motoristas
    SET ultima_lat = $1, ultima_lng = $2, ultima_localizacao_em = NOW(),
        ultima_atividade_em = NOW(), atualizado_em = NOW()
    WHERE id = $3
  `, [lat, lng, motoristaId]);

  if (ride) await emitToUser('passageiro', ride.passageiro_id, 'motorista_em_movimento', { corrida_id: ride.id, lat, lng, direcao });
  res.json({ sucesso: true });
}

module.exports = { atualizar };
