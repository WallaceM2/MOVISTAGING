const axios = require('axios');
const env = require('../config/env');
const AppError = require('../errors/AppError');
const { buscarTarifa } = require('./fareService');

function assertCoordinates(lat, lng, name) {
  const nLat = Number(lat);
  const nLng = Number(lng);
  if (!Number.isFinite(nLat) || !Number.isFinite(nLng) || nLat < -90 || nLat > 90 || nLng < -180 || nLng > 180) {
    throw new AppError(`Coordenadas inválidas para ${name}.`, 400, 'INVALID_COORDINATES');
  }
}

function money(value) {
  return Number(Number(value).toFixed(2));
}

function splitFare(grossValue, commissionPct, driverFloorPerKm, distanceKm) {
  let grossCents = Math.max(0, Math.round(Number(grossValue) * 100));
  const commission = Number(commissionPct);
  const driverFloorCents = Math.max(0, Math.ceil((Number(distanceKm || 0) * Number(driverFloorPerKm || 0)) * 100 - 1e-9));
  const theoreticalGross = Math.ceil(driverFloorCents / Math.max(1 - commission / 100, 0.0001) - 1e-9);
  grossCents = Math.max(grossCents, theoreticalGross);

  let appCents = Math.round(grossCents * commission / 100);
  let driverCents = grossCents - appCents;
  while (driverCents < driverFloorCents) {
    grossCents += 1;
    appCents = Math.round(grossCents * commission / 100);
    driverCents = grossCents - appCents;
  }
  return { gross: grossCents / 100, app: appCents / 100, driver: driverCents / 100 };
}

async function calcularRota(origem_lat, origem_lng, destino_lat, destino_lng, categoria = 'carro', multiplicadorDinamica = 1, areaOperacaoId = null) {
  assertCoordinates(origem_lat, origem_lng, 'origem');
  assertCoordinates(destino_lat, destino_lng, 'destino');
  if (!['moto', 'carro'].includes(categoria)) throw new AppError('Categoria de veículo inválida.', 400, 'INVALID_CATEGORY');

  const regra = await buscarTarifa(categoria, areaOperacaoId);
  const multiplicador = Number(multiplicadorDinamica);
  if (!Number.isFinite(multiplicador) || multiplicador < regra.multiplicadorMin || multiplicador > regra.multiplicadorMax) {
    throw new AppError('Multiplicador de dinâmica inválido.', 500, 'INVALID_DYNAMIC_MULTIPLIER');
  }

  if (!env.MAPBOX_API_KEY) throw new AppError('Serviço de mapas não configurado.', 503, 'MAP_PROVIDER_NOT_CONFIGURED');
  const url = `https://api.mapbox.com/directions/v5/mapbox/driving/${origem_lng},${origem_lat};${destino_lng},${destino_lat}`;
  try {
    const resposta = await axios.get(url, {
      params: { geometries: 'geojson', overview: 'full', access_token: env.MAPBOX_API_KEY },
      timeout: 8000,
      maxContentLength: 2 * 1024 * 1024,
      maxBodyLength: 2 * 1024 * 1024,
    });
    const dados = resposta.data;
    if (!dados.routes?.length) throw new AppError('Não foi possível traçar uma rota por ruas entre estes pontos.', 422, 'ROUTE_NOT_FOUND');

    const rota = dados.routes[0];
    const distanciaKm = rota.distance / 1000;
    const tempoMin = rota.duration / 60;
    let valorBase = regra.taxaBase + (distanciaKm * regra.valorPorKmCliente) + (tempoMin * regra.valorPorMinutoCliente);
    const tarifaMinimaAplicada = valorBase < regra.tarifaMinimaCliente;
    if (tarifaMinimaAplicada) valorBase = regra.tarifaMinimaCliente;

    const valorAntesDinamica = valorBase;
    const valorComDinamica = valorBase * multiplicador;
    const divisao = splitFare(valorComDinamica, regra.comissaoAppPct, regra.pisoLiquidoMotoristaKm, distanciaKm);
    const pisoAplicadoPorKm = divisao.driver + 0.00001 >= (distanciaKm * regra.pisoLiquidoMotoristaKm);

    return {
      tarifaId: regra.id,
      tarifaVersao: regra.versao,
      tarifaSnapshot: {
        categoria: regra.categoria || categoria,
        taxaBase: regra.taxaBase,
        valorPorKmCliente: regra.valorPorKmCliente,
        valorPorMinutoCliente: regra.valorPorMinutoCliente,
        tarifaMinimaCliente: regra.tarifaMinimaCliente,
        pisoLiquidoMotoristaKm: regra.pisoLiquidoMotoristaKm,
        pisoLiquidoMotoristaMetaKm: regra.pisoLiquidoMotoristaMetaKm,
        comissaoAppPct: regra.comissaoAppPct,
        repasseMotoristaPct: regra.repasseMotoristaPct,
        multiplicador: multiplicador,
      },
      distanciaKm: money(distanciaKm),
      tempoMin: Math.max(1, Math.ceil(tempoMin)),
      dinamicaAplicada: `${multiplicador}x`,
      multiplicadorDinamica: multiplicador,
      tarifaMinimaAplicada,
      pisoLiquidoAplicado: pisoAplicadoPorKm,
      valorBaseCliente: money(valorAntesDinamica),
      valorDinamicaCliente: money(divisao.gross),
      valorPassageiro: money(divisao.gross),
      ganhoMotorista: money(divisao.driver),
      ganhoApp: money(divisao.app),
      percentualComissaoApp: regra.comissaoAppPct,
      percentualRepasseMotorista: regra.repasseMotoristaPct,
      pisoLiquidoMotoristaKm: regra.pisoLiquidoMotoristaKm,
      pisoLiquidoMotoristaMetaKm: regra.pisoLiquidoMotoristaMetaKm,
      geometria: rota.geometry,
      enderecoOrigem: 'Endereço informado pelo passageiro',
      enderecoDestino: 'Endereço informado pelo passageiro',
    };
  } catch (error) {
    if (error instanceof AppError) throw error;
    console.error(JSON.stringify({ level: 'error', event: 'mapbox_error', message: error.message }));
    throw new AppError('Falha ao calcular a rota no provedor de mapas.', 502, 'MAP_PROVIDER_ERROR');
  }
}

const regrasPreco = {
  moto: { taxaBase: env.FARE_MOTO_BASE, valorPorKm: env.FARE_MOTO_KM, comissaoApp: env.FARE_MOTO_COMMISSION },
  carro: { taxaBase: env.FARE_CAR_BASE, valorPorKm: env.FARE_CAR_KM, comissaoApp: env.FARE_CAR_COMMISSION },
};

module.exports = { calcularRota, regrasPreco, splitFare };
