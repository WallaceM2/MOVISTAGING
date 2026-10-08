const pool = require('../config/database');
const env = require('../config/env');
const AppError = require('../errors/AppError');

const FALLBACK = Object.freeze({
  moto: {
    id: null,
    versao: 'env-fallback',
    categoria: 'moto',
    taxaBase: env.FARE_MOTO_BASE,
    valorPorKmCliente: env.FARE_MOTO_KM,
    valorPorMinutoCliente: env.FARE_MOTO_MIN,
    tarifaMinimaCliente: env.FARE_MOTO_MINIMUM,
    pisoLiquidoMotoristaKm: env.FARE_MOTO_DRIVER_FLOOR_KM,
    comissaoAppPct: 15,
    repasseMotoristaPct: 85,
    multiplicadorMin: 1,
    multiplicadorMax: 3,
  },
  carro: {
    id: null,
    versao: 'env-fallback',
    categoria: 'carro',
    taxaBase: env.FARE_CAR_BASE,
    valorPorKmCliente: env.FARE_CAR_KM,
    valorPorMinutoCliente: env.FARE_CAR_MIN,
    tarifaMinimaCliente: env.FARE_CAR_MINIMUM,
    pisoLiquidoMotoristaKm: env.FARE_CAR_DRIVER_FLOOR_KM,
    pisoLiquidoMotoristaMetaKm: env.FARE_CAR_DRIVER_TARGET_KM,
    comissaoAppPct: 15,
    repasseMotoristaPct: 85,
    multiplicadorMin: 1,
    multiplicadorMax: 3,
  },
});

async function buscarTarifa(categoria, areaOperacaoId = null) {
  const { rows } = await pool.query(`
    SELECT id, categoria, versao, taxa_base, valor_por_km_cliente, valor_por_minuto_cliente,
           tarifa_minima_cliente, piso_liquido_motorista_km, piso_liquido_motorista_meta_km,
           comissao_app_pct, repasse_motorista_pct, multiplicador_min, multiplicador_max
    FROM movi_tarifas
    WHERE categoria = $1
      AND (area_operacao_id = $2 OR area_operacao_id IS NULL)
      AND ativa = TRUE
      AND vigencia_inicio <= NOW()
      AND (vigencia_fim IS NULL OR vigencia_fim > NOW())
    ORDER BY CASE WHEN area_operacao_id = $2 THEN 0 ELSE 1 END, vigencia_inicio DESC
    LIMIT 1;
  `, [categoria, areaOperacaoId]);
  if (rows[0]) {
    const row = rows[0];
    return {
      id: Number(row.id),
      versao: row.versao || 'v1',
      categoria: row.categoria,
      taxaBase: Number(row.taxa_base),
      valorPorKmCliente: Number(row.valor_por_km_cliente),
      valorPorMinutoCliente: Number(row.valor_por_minuto_cliente),
      tarifaMinimaCliente: Number(row.tarifa_minima_cliente),
      pisoLiquidoMotoristaKm: Number(row.piso_liquido_motorista_km),
      pisoLiquidoMotoristaMetaKm: row.piso_liquido_motorista_meta_km == null ? null : Number(row.piso_liquido_motorista_meta_km),
      comissaoAppPct: Number(row.comissao_app_pct),
      repasseMotoristaPct: Number(row.repasse_motorista_pct),
      multiplicadorMin: Number(row.multiplicador_min),
      multiplicadorMax: Number(row.multiplicador_max),
    };
  }
  if (env.isProduction) {
    throw new AppError(`Tarifa de produção não configurada para ${categoria}.`, 503, 'FARE_NOT_CONFIGURED');
  }
  return FALLBACK[categoria];
}

module.exports = { buscarTarifa };
