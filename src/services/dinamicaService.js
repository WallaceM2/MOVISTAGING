const redisClient = require('../config/redis');
const pool = require('../config/database');
const env = require('../config/env');
const { isValidCoordinate } = require('../utils/validators');
const AppError = require('../errors/AppError');

const DRIVER_GEO = 'motoristas_disponiveis';
const DRIVER_GEO_BY_CATEGORY = {
  carro: 'motoristas_disponiveis:carro',
  moto: 'motoristas_disponiveis:moto',
};
const DEMAND_GEO = 'mapa_calor_demanda';
const DEMAND_GEO_BY_CATEGORY = {
  carro: 'mapa_calor_demanda:carro',
  moto: 'mapa_calor_demanda:moto',
};

function haversineKm(lat1, lng1, lat2, lng2) {
  const toRad = (value) => (Number(value) * Math.PI) / 180;
  const dLat = toRad(Number(lat2) - Number(lat1));
  const dLng = toRad(Number(lng2) - Number(lng1));
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(Math.max(0, 1 - a)));
}

async function registrarDemanda(lat, lng, passageiroId, categoria = null) {
  if (!isValidCoordinate(lat, lng) || !redisClient.isReady) return;
  const id = String(passageiroId);
  const geoKey = DEMAND_GEO_BY_CATEGORY[categoria] || DEMAND_GEO;

  await Promise.all([
    ...Object.values(DEMAND_GEO_BY_CATEGORY).map((key) => redisClient.zRem(key, id)),
    redisClient.zRem(DEMAND_GEO, id),
  ]);

  await redisClient.geoAdd(geoKey, {
    longitude: Number(lng),
    latitude: Number(lat),
    member: id,
  });
  await redisClient.set(`presence:passageiro:${id}`, categoria ? String(categoria) : '1', {
    EX: env.DEMAND_TTL_SEC,
  });
}

async function atualizarLocalizacaoMotorista(lat,lng,motoristaId,categoria,manterDisponivel = false,) {
  if (!isValidCoordinate(lat, lng) || !redisClient.isReady) return;

  const id = String(motoristaId);
  const longitude = Number(lng);
  const latitude = Number(lat);

  const presenceKey = `presence:motorista:${id}`;
  const availabilityKey = `availability:motorista:${id}`;
  const ttl = env.DRIVER_PRESENCE_TTL_SEC;

  await redisClient.set(presenceKey, '1', {EX: ttl,});
  let disponivel = manterDisponivel === true;
  if (!disponivel) {
    disponivel = (await redisClient.get(availabilityKey)) === '1';
  }

  if (!disponivel) return;
  // Recria/renova a disponibilidade enquanto a conexão
  // do motorista continua marcada como disponível.
  await redisClient.set(availabilityKey, '1', {EX: ttl,});

  const geoItem = {longitude,latitude,member: id,};
  await redisClient.geoAdd(DRIVER_GEO, geoItem);
  const categoryKey = DRIVER_GEO_BY_CATEGORY[categoria];
    if (categoryKey) {
    await redisClient.geoAdd(categoryKey, geoItem);
  }
}

async function marcarMotoristaDisponivel(motoristaId, disponivel, { exigirLocalizacao = false } = {}) {
  const desired = Boolean(disponivel);
  const currentResult = await pool.query(`
    SELECT id, categoria, status_cadastro, status_conta, ultima_lat, ultima_lng, ultima_localizacao_em
    FROM motoristas
    WHERE id = $1
    LIMIT 1;
  `, [motoristaId]);
  const motorista = currentResult.rows[0];
  if (!motorista) return null;

  if (desired && (motorista.status_cadastro !== 'aprovado' || motorista.status_conta !== 'ativa')) {
    throw new AppError('Motorista não está habilitado para ficar disponível.', 403, 'DRIVER_NOT_APPROVED');
  }

  if (desired && exigirLocalizacao && !isValidCoordinate(motorista.ultima_lat, motorista.ultima_lng)) {
    throw new AppError('Envie a localização do motorista antes de ficar disponível.', 409, 'DRIVER_LOCATION_REQUIRED');
  }

  const id = String(motorista.id);
  const ttl = env.DRIVER_PRESENCE_TTL_SEC;
  const presenceKey = `presence:motorista:${id}`;
  const availabilityKey = `availability:motorista:${id}`;

  if (!desired) {
    await pool.query(`
      UPDATE motoristas
      SET disponivel = FALSE, online = FALSE, ultima_atividade_em = NOW(), atualizado_em = NOW()
      WHERE id = $1;
    `, [motoristaId]);

    if (redisClient.isReady) {
      await redisClient.del(presenceKey, availabilityKey);
      await Promise.all([
        redisClient.zRem(DRIVER_GEO, id),
        ...Object.values(DRIVER_GEO_BY_CATEGORY).map((key) => redisClient.zRem(key, id)),
      ]);
    }
    return { ...motorista, disponivel: false, online: false };
  }

  if (!redisClient.isReady) {
    throw new AppError('Presença do motorista está indisponível temporariamente. Tente novamente.', 503, 'REDIS_UNAVAILABLE');
  }

  const geoItem = isValidCoordinate(motorista.ultima_lat, motorista.ultima_lng)
    ? {
        longitude: Number(motorista.ultima_lng),
        latitude: Number(motorista.ultima_lat),
        member: id,
      }
    : null;

  try {
    await redisClient.set(presenceKey, '1', { EX: ttl });
    await redisClient.set(availabilityKey, '1', { EX: ttl });
    if (geoItem) {
      await redisClient.geoAdd(DRIVER_GEO, geoItem);
      const categoryKey = DRIVER_GEO_BY_CATEGORY[motorista.categoria];
      if (categoryKey) await redisClient.geoAdd(categoryKey, geoItem);
    }

    const result = await pool.query(`
      UPDATE motoristas
      SET disponivel = TRUE, online = TRUE, ultima_atividade_em = NOW(), atualizado_em = NOW()
      WHERE id = $1 AND status_cadastro = 'aprovado' AND status_conta = 'ativa'
      RETURNING id, categoria, status_cadastro, status_conta, ultima_lat, ultima_lng, ultima_localizacao_em;
    `, [motoristaId]);

    if (!result.rows[0]) throw new AppError('Motorista não está mais habilitado para ficar disponível.', 409, 'DRIVER_NOT_APPROVED');
    return result.rows[0];
  } catch (error) {
    await redisClient.del(presenceKey, availabilityKey).catch(() => {});
    await Promise.all([
      redisClient.zRem(DRIVER_GEO, id),
      ...Object.values(DRIVER_GEO_BY_CATEGORY).map((key) => redisClient.zRem(key, id)),
    ]).catch(() => {});
    throw error;
  }
}

async function renovarPresencaMotorista(motoristaId,manterDisponivel = false,) {
  if (!redisClient.isReady) return false;

  const id = String(motoristaId);
  const ttl = env.DRIVER_PRESENCE_TTL_SEC;

  const presenceKey = `presence:motorista:${id}`;
  const availabilityKey = `availability:motorista:${id}`;

  await redisClient.set(presenceKey, '1', {EX: ttl,});

  let disponivel = manterDisponivel === true;

  if (!disponivel) {
    disponivel = (await redisClient.get(availabilityKey)) === '1';
  }

  if (!disponivel) {
    return false;
  }

  await redisClient.set(availabilityKey, '1', {EX: ttl,});

  const { rows } = await pool.query(`
    SELECT
      id,
      categoria,
      ultima_lat,
      ultima_lng,
      status_cadastro,
      status_conta
    FROM motoristas
    WHERE id = $1
      AND status_cadastro = 'aprovado'
      AND status_conta = 'ativa'
    LIMIT 1;
  `, [motoristaId]);

  const motorista = rows[0];

  if (!motorista) {
    await limparPresencaUsuario('motorista', motoristaId);
    return false;
  }

  if (!isValidCoordinate(motorista.ultima_lat,motorista.ultima_lng,)) {
    return true;
  }

  const geoItem = {longitude: Number(motorista.ultima_lng),latitude: Number(motorista.ultima_lat),member: id,};
  await redisClient.geoAdd(DRIVER_GEO,geoItem,);
  const categoryKey =
    DRIVER_GEO_BY_CATEGORY[motorista.categoria];
  if (categoryKey) {
    await redisClient.geoAdd(categoryKey,geoItem,);}
      return true;
}

async function motoristaDisponivel(motoristaId) {
  if (!redisClient.isReady) return false;
  const [presence, availability] = await redisClient.mGet([
    `presence:motorista:${motoristaId}`,
    `availability:motorista:${motoristaId}`,
  ]);
  return Boolean(presence && availability);
}

async function buscarMotoristasProximos(lat, lng, raioKm = env.DRIVER_SEARCH_RADIUS_KM, categoria = null) {
  if (!redisClient.isReady || !isValidCoordinate(lat, lng)) return [];

  const raio = Number(raioKm);
  if (!Number.isFinite(raio) || raio <= 0) return [];

  const geoKey = DRIVER_GEO_BY_CATEGORY[categoria] || DRIVER_GEO;
  let candidates = await redisClient.geoSearchWith(
    geoKey,
    { latitude: Number(lat), longitude: Number(lng) },
    { radius: raio, unit: 'km' },
    ['WITHDIST'],
    { SORT: 'ASC', COUNT: 50 },
  );

  const normalized = candidates.map((candidate) => ({
    motoristaId: Number(candidate.member),
    distanciaKm: Number(candidate.distance),
  })).filter((candidate) => Number.isInteger(candidate.motoristaId) && candidate.motoristaId > 0 && Number.isFinite(candidate.distanciaKm));

  // Se o GEO foi perdido por expiração/queda de conexão, reconstrói o índice
  // a partir dos motoristas aprovados que continuam com presença + disponibilidade.
  if (!normalized.length) {
    const params = [categoria, raio];
    const result = await pool.query(`
      SELECT id, categoria, ultima_lat, ultima_lng
      FROM motoristas
      WHERE status_cadastro = 'aprovado'
        AND status_conta = 'ativa'
        AND online = TRUE
        AND disponivel = TRUE
        AND ($1::varchar IS NULL OR categoria = $1)
        AND ultima_lat IS NOT NULL
        AND ultima_lng IS NOT NULL
        AND ultima_localizacao_em > NOW() - INTERVAL '5 minutes'
      ORDER BY ultima_localizacao_em DESC
      LIMIT 100;
    `, [params[0]]);

    const repaired = [];
    for (const motorista of result.rows) {
      if (!(await motoristaDisponivel(motorista.id))) continue;
      const distanciaKm = haversineKm(lat, lng, motorista.ultima_lat, motorista.ultima_lng);
      if (distanciaKm > raio) continue;

      const geoItem = {
        longitude: Number(motorista.ultima_lng),
        latitude: Number(motorista.ultima_lat),
        member: String(motorista.id),
      };
      await redisClient.geoAdd(geoKey, geoItem);
      repaired.push({ motoristaId: Number(motorista.id), distanciaKm });
    }

    normalized.push(...repaired);
    normalized.sort((a, b) => a.distanciaKm - b.distanciaKm);
  }

  if (!normalized.length) return [];

  const keys = normalized.flatMap(({ motoristaId }) => [
    `presence:motorista:${motoristaId}`,
    `availability:motorista:${motoristaId}`,
  ]);
  const states = await redisClient.mGet(keys);
  const result = [];

  for (let index = 0; index < normalized.length; index += 1) {
    const candidate = normalized[index];
    const presence = states[index * 2];
    const availability = states[index * 2 + 1];

    if (presence && availability) {
      result.push(candidate);
      continue;
    }

    await redisClient.zRem(geoKey, String(candidate.motoristaId));
    if (geoKey !== DRIVER_GEO) await redisClient.zRem(DRIVER_GEO, String(candidate.motoristaId));
  }

  return result;
}

async function contarMotoristasDisponiveis(geoKey, lat, lng, raioKm) {
  if (!redisClient.isReady || !isValidCoordinate(lat, lng)) return 0;
  const candidates = await redisClient.geoSearch(geoKey, {
    latitude: Number(lat),
    longitude: Number(lng),
  }, { radius: Number(raioKm), unit: 'km' });

  if (!candidates.length) return 0;
  const keys = candidates.flatMap((id) => [
    `presence:motorista:${id}`,
    `availability:motorista:${id}`,
  ]);
  const states = await redisClient.mGet(keys);
  let active = 0;
  for (let index = 0; index < candidates.length; index += 1) {
    const id = String(candidates[index]);
    if (states[index * 2] && states[index * 2 + 1]) active += 1;
    else {
      await redisClient.zRem(geoKey, id);
      if (geoKey !== DRIVER_GEO) await redisClient.zRem(DRIVER_GEO, id);
    }
  }
  return active;
}

async function contarPassageirosAtivos(lat, lng, raioKm, categoria = null) {
  if (!redisClient.isReady || !isValidCoordinate(lat, lng)) return 0;
  const geoKey = DEMAND_GEO_BY_CATEGORY[categoria] || DEMAND_GEO;
  const candidates = await redisClient.geoSearch(geoKey, {
    latitude: Number(lat),
    longitude: Number(lng),
  }, { radius: Number(raioKm), unit: 'km' });
  if (!candidates.length) return 0;

  const keys = candidates.map((id) => `presence:passageiro:${id}`);
  const states = await redisClient.mGet(keys);
  let active = 0;
  for (let index = 0; index < candidates.length; index += 1) {
    if (states[index]) active += 1;
    else await redisClient.zRem(geoKey, String(candidates[index]));
  }
  return active;
}

async function calcularMultiplicador(lat, lng, categoria = null, raioKm = 3) {
  try {
    const [motoristas, passageiros] = await Promise.all([
      contarMotoristasDisponiveis(DRIVER_GEO_BY_CATEGORY[categoria] || DRIVER_GEO, lat, lng, raioKm),
      contarPassageirosAtivos(lat, lng, raioKm, categoria),
    ]);

    if (passageiros === 0) return 1;
    if (motoristas === 0) return 1.5;
    const proporcao = passageiros / motoristas;
    if (proporcao >= 3) return 2;
    if (proporcao >= 2) return 1.5;
    if (proporcao >= 1.5) return 1.2;
    return 1;
  } catch (error) {
    console.error(JSON.stringify({ level: 'error', event: 'dynamic_pricing_error', message: error.message }));
    return 1;
  }
}

async function limparDemandaPassageiro(passageiroId) {
  if (!redisClient.isReady) return;
  const id = String(passageiroId);
  await Promise.all([
    redisClient.zRem(DEMAND_GEO, id),
    ...Object.values(DEMAND_GEO_BY_CATEGORY).map((key) => redisClient.zRem(key, id)),
    redisClient.del(`presence:passageiro:${id}`),
  ]);
}

async function limparPresencaUsuario(tipo, id) {
  if (tipo === 'motorista') {
    await pool.query(`
      UPDATE motoristas
      SET online = FALSE, disponivel = FALSE, ultima_atividade_em = NOW(), atualizado_em = NOW()
      WHERE id = $1
    `, [id]).catch(() => {});
  }

  if (!redisClient.isReady) return;
  await redisClient.del(`presence:${tipo}:${id}`, `availability:${tipo}:${id}`, `socket:${tipo}:${id}`);

  if (tipo === 'motorista') {
    await Promise.all([
      redisClient.zRem(DRIVER_GEO, String(id)),
      ...Object.values(DRIVER_GEO_BY_CATEGORY).map((key) => redisClient.zRem(key, String(id))),
    ]);
  }

  if (tipo === 'passageiro') {
    await Promise.all([
      redisClient.zRem(DEMAND_GEO, String(id)),
      ...Object.values(DEMAND_GEO_BY_CATEGORY).map((key) => redisClient.zRem(key, String(id))),
    ]);
  }
}

module.exports = {
  haversineKm,
  registrarDemanda,
  atualizarLocalizacaoMotorista,
  marcarMotoristaDisponivel,
  renovarPresencaMotorista,
  motoristaDisponivel,
  buscarMotoristasProximos,
  calcularMultiplicador,
  limparPresencaUsuario,
  limparDemandaPassageiro,
};
