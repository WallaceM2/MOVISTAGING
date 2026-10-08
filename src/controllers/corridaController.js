const Corrida = require('../models/Corrida');
const redisClient = require('../config/redis');
const { calcularRota } = require('../services/mapsService');
const {
  registrarDemanda,
  calcularMultiplicador,
  buscarMotoristasProximos,
  motoristaDisponivel,
  marcarMotoristaDisponivel,
  limparDemandaPassageiro,
} = require('../services/dinamicaService');
const { emitToUser } = require('../services/realtimeService');
const env = require('../config/env');
const AppError = require('../errors/AppError');
const envConfig = require('../config/env');
const { despacharProximaOferta } = require('../jobs/offerWorker');
const pool = require('../config/database');

async function corridaParaPassageiro(corrida) {
  if (!corrida?.motorista_id) return corridaParaPassageiroComCodigo(corrida);
  const result = await pool.query(`
    SELECT m.id, m.nome, m.sobrenome, m.categoria, m.nota_media, m.total_avaliacoes,
           v.marca, v.modelo, v.cor, v.placa
    FROM motoristas m
    LEFT JOIN movi_veiculos v ON v.id = m.veiculo_ativo_id AND v.ativo = TRUE AND v.status = 'aprovado'
    WHERE m.id = $1 AND m.status_cadastro = 'aprovado' AND m.status_conta = 'ativa'
    LIMIT 1
  `, [corrida.motorista_id]);
  return { ...corridaParaPassageiroComCodigo(corrida), motorista: result.rows[0] || null };
}

async function corridaParaMotorista(corrida) {
  const segura = removerCodigoEmbarque(corrida);
  if (!corrida?.passageiro_id || !['aceita', 'em_andamento'].includes(corrida.status)) return segura;
  const result = await pool.query(`
    SELECT id, nome, nota_media, total_avaliacoes, conta_verificada
    FROM passageiros WHERE id = $1 AND status_conta = 'ativa' LIMIT 1
  `, [corrida.passageiro_id]);
  return { ...segura, passageiro: result.rows[0] || null };
}

function removerCodigoEmbarque(corrida) {
  if (!corrida) return corrida;
  const { codigo_embarque: _codigoEmbarque, codigo_embarque_tentativas: _tentativas, codigo_embarque_bloqueado_ate: _bloqueio, ...corridaSegura } = corrida;
  return corridaSegura;
}

function corridaParaPassageiroComCodigo(corrida) {
  const segura = removerCodigoEmbarque(corrida);
  return corrida?.status === 'aceita' ? { ...segura, codigo_embarque: corrida.codigo_embarque } : segura;
}

async function estimar(req, res) {
  const { origem_lat, origem_lng, destino_lat, destino_lng, categoria, forma_pagamento } = req.body;
  if (forma_pagamento && forma_pagamento !== 'dinheiro' && envConfig.PAYMENT_PROVIDER === 'none') {
    throw new AppError('Esta forma de pagamento ainda não está habilitada neste ambiente.', 409, 'PAYMENT_PROVIDER_REQUIRED');
  }
  const multiplicador = await calcularMultiplicador(origem_lat, origem_lng, categoria);
  const estimativa = await calcularRota(origem_lat, origem_lng, destino_lat, destino_lng, categoria, multiplicador);
  res.json({ mensagem: 'Estimativa calculada com sucesso', estimativa });
}

async function emitirOferta(corrida, motorista) {
  const oferta = await Corrida.criarOferta(corrida.id, motorista.motoristaId, motorista.distanciaKm, env.OFFER_TIMEOUT_SEC);
  if (!oferta) return false;
  const distancia = Number(corrida.distancia_ate_motorista_km || motorista.distanciaKm || 0);
  await emitToUser('motorista', motorista.motoristaId, 'nova_oferta_corrida', {
    corrida_id: corrida.id,
    local_embarque: corrida.origem,
    local_desembarque: corrida.destino,
    valor_motorista: Number(corrida.ganho_motorista),
    ganho_por_km: Number(corrida.ganho_motorista) / Math.max(Number(corrida.distancia_km || 0), 0.01),
    distancia_km: Number(corrida.distancia_km || 0),
    tempo_minutos: Number(corrida.tempo_minutos || 0),
    conta_verificada: true,
    forma_pagamento: corrida.forma_pagamento,
    coordenadas: {
      origem: { lat: Number(corrida.origem_lat), lng: Number(corrida.origem_lng) },
      destino: { lat: Number(corrida.destino_lat), lng: Number(corrida.destino_lng) },
    },
    tempo_para_aceitar: env.OFFER_TIMEOUT_SEC,
  });
  return true;
}

async function solicitarCorrida(req, res) {
  const { origem, destino, origem_lat, origem_lng, destino_lat, destino_lng, categoria, forma_pagamento } = req.body;
  const passageiro_id = req.usuario.id;
  if (forma_pagamento !== 'dinheiro' && envConfig.PAYMENT_PROVIDER === 'none') {
    throw new AppError('Esta forma de pagamento ainda não está habilitada neste ambiente.', 409, 'PAYMENT_PROVIDER_REQUIRED');
  }
  await registrarDemanda(origem_lat, origem_lng, passageiro_id, categoria);
  const multiplicador = await calcularMultiplicador(origem_lat, origem_lng, categoria);
  const estimativa = await calcularRota(origem_lat, origem_lng, destino_lat, destino_lng, categoria, multiplicador);

  const novaCorrida = await Corrida.criar({
    passageiro_id,
    idempotency_key: req.get('Idempotency-Key') || null,
    origem, destino, origem_lat, origem_lng, destino_lat, destino_lng,
    categoria,
    distancia_km: estimativa.distanciaKm,
    tempo_minutos: estimativa.tempoMin,
    dinamica_multiplicador: estimativa.multiplicadorDinamica,
    valor: estimativa.valorPassageiro, ganho_motorista: estimativa.ganhoMotorista, ganho_app: estimativa.ganhoApp,
    percentual_comissao_app: estimativa.percentualComissaoApp, percentual_repasse_motorista: estimativa.percentualRepasseMotorista,
    forma_pagamento: forma_pagamento || 'dinheiro',
    tarifa_id: estimativa.tarifaId, tarifa_versao: estimativa.tarifaVersao, tarifa_snapshot: estimativa.tarifaSnapshot,
    valor_base_cliente: estimativa.valorBaseCliente, valor_dinamica_cliente: estimativa.valorDinamicaCliente,
  });

  const corridaComDados = {
    ...novaCorrida,
    distancia_km: estimativa.distanciaKm,
    tempo_minutos: estimativa.tempoMin,
  };

  const motoristas = await buscarMotoristasProximos(origem_lat, origem_lng, env.DRIVER_SEARCH_RADIUS_KM, categoria);
  const primeiraOferta = motoristas[0] ? await emitirOferta(corridaComDados, motoristas[0]) : false;

  await emitToUser('passageiro', passageiro_id, 'corrida_solicitada', {
    corrida_id: novaCorrida.id,
    status: novaCorrida.status,
    oferta_enviada: primeiraOferta,
  });

  res.status(201).json({
    mensagem: 'Corrida solicitada com sucesso!',
    corrida: removerCodigoEmbarque(novaCorrida),
    detalhes_valores: estimativa,
    motoristas_encontrados: motoristas.length,
    oferta_enviada: primeiraOferta,
  });
}

async function listarOfertas(req, res) {
  const ofertas = await Corrida.listarOfertasPendentes(req.usuario.id);
  res.json({ ofertas });
}

async function recusarCorrida(req, res) {
  const oferta = await Corrida.recusarOferta(req.params.id, req.usuario.id);
  if (!oferta) throw new AppError('Esta oferta não está mais disponível.', 409, 'RIDE_OFFER_NOT_AVAILABLE');
  await despacharProximaOferta(req.params.id);
  res.json({ mensagem: 'Oferta recusada.', corrida_id: Number(req.params.id) });
}

async function aceitarCorrida(req, res) {
  if (!(await motoristaDisponivel(req.usuario.id))) throw new AppError('Motorista está offline ou indisponível.', 409, 'DRIVER_NOT_AVAILABLE');
  const corrida = await Corrida.aceitar(req.params.id, req.usuario.id);
  await marcarMotoristaDisponivel(req.usuario.id, false);
  await limparDemandaPassageiro(corrida.passageiro_id);
  await emitToUser('passageiro', corrida.passageiro_id, 'corrida_aceita', await corridaParaPassageiro(corrida));
  const corridaSegura = await corridaParaMotorista(corrida);
  res.json({ mensagem: 'Corrida aceita com sucesso!', corrida: corridaSegura });
}

async function iniciarEmbarque(req, res) {
  const corrida = await Corrida.iniciarComCodigoEmbarque(req.params.id, req.usuario.id, req.body.codigo_embarque);
  await emitToUser('passageiro', corrida.passageiro_id, 'corrida_iniciada', await corridaParaPassageiro(removerCodigoEmbarque(corrida)));
  const corridaSegura = await corridaParaMotorista(corrida);
  res.json({ mensagem: 'Código confirmado. Corrida iniciada.', corrida: corridaSegura });
}

async function finalizarCorrida(req, res) {
  const resultado = await Corrida.finalizarComPagamento(req.params.id, req.usuario.id, req.body);
  await reativarMotoristaAposCorrida(req.usuario.id);
  const corrida = await Corrida.buscarPorId(req.params.id);
  const corridaSegura = await corridaParaMotorista(corrida);
  await emitToUser('passageiro', corrida.passageiro_id, 'corrida_finalizada', { mensagem: 'Você chegou ao seu destino.', corrida: await corridaParaPassageiro(corridaSegura) });
  res.json({ mensagem: 'Corrida finalizada com sucesso.', corrida: corridaSegura, financeiro: resultado });
}

async function reativarMotoristaAposCorrida(motoristaId) {
  if (!motoristaId) return;
  try {
    await marcarMotoristaDisponivel(motoristaId, true);
  } catch (error) {
    // A corrida já foi confirmada como concluída/cancelada. Falha transitória
    // no Redis não deve transformar uma operação financeira/estadual já
    // persistida em erro HTTP para o cliente. O próximo heartbeat/localização
    // reconstruirá a presença e o índice GEO quando o serviço estiver disponível.
    console.error(JSON.stringify({
      level: 'error',
      event: 'driver_reactivation_after_ride_failed',
      motorista_id: Number(motoristaId),
      codigo: error.code || 'UNKNOWN',
      message: error.message,
    }));
  }
}

async function cancelarCorrida(req, res) {
  const corrida = await Corrida.atualizarStatusControlado(req.params.id, 'cancelada', req.usuario);
  if (corrida.motorista_id) await reativarMotoristaAposCorrida(corrida.motorista_id);
  await limparDemandaPassageiro(corrida.passageiro_id);
  const outroTipo = req.usuario.tipo === 'passageiro' ? 'motorista' : 'passageiro';
  const outroId = req.usuario.tipo === 'passageiro' ? corrida.motorista_id : corrida.passageiro_id;
  const corridaSegura = removerCodigoEmbarque(corrida);
  if (outroId) await emitToUser(outroTipo, outroId, 'corrida_cancelada', { corrida_id: corrida.id, corrida: corridaSegura });
  res.json({ mensagem: 'Corrida cancelada com sucesso.', corrida: corridaSegura });
}

async function verCorrida(req, res) {
  const corrida = await Corrida.buscarPorId(req.params.id);
  if (!corrida) throw new AppError('Corrida não encontrada.', 404, 'RIDE_NOT_FOUND');
  const owns = Number(corrida.passageiro_id) === Number(req.usuario.id) || Number(corrida.motorista_id) === Number(req.usuario.id);
  if (!owns && req.usuario.tipo !== 'admin') throw new AppError('Acesso negado.', 403, 'FORBIDDEN');
  if (req.usuario.tipo === 'passageiro') return res.json(await corridaParaPassageiro(corrida));
  if (req.usuario.tipo === 'motorista') return res.json(await corridaParaMotorista(corrida));
  res.json(removerCodigoEmbarque(corrida));
}

module.exports = { estimar, solicitarCorrida, listarOfertas, recusarCorrida, aceitarCorrida, iniciarEmbarque, finalizarCorrida, cancelarCorrida, verCorrida };
