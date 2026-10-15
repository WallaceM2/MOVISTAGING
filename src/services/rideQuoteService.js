const crypto = require('crypto');
const env = require('../config/env');
const AppError = require('../errors/AppError');

const QUOTE_TTL_MS = 5 * 60 * 1000;

function assinatura(conteudo) {
  if (!env.JWT_SECRET || env.JWT_SECRET.length < 32) {
    throw new AppError('Assinatura de cotação indisponível.', 503, 'QUOTE_SIGNING_UNAVAILABLE');
  }
  return crypto.createHmac('sha256', env.JWT_SECRET).update(conteudo).digest('base64url');
}

function normalizarEntrada(entrada) {
  return {
    passageiro_id: Number(entrada.passageiro_id),
    origem: String(entrada.origem),
    destino: String(entrada.destino),
    origem_lat: Number(entrada.origem_lat),
    origem_lng: Number(entrada.origem_lng),
    destino_lat: Number(entrada.destino_lat),
    destino_lng: Number(entrada.destino_lng),
    categoria: String(entrada.categoria),
    forma_pagamento: String(entrada.forma_pagamento || 'dinheiro'),
  };
}

function emitirCotacao({ passageiroId, entrada, estimativa, debitoTaxaCancelamento }) {
  const agora = Date.now();
  // A geometria completa é enviada separadamente na resposta de estimativa.
  // Excluí-la do token mantém a cotação compacta mesmo em rotas longas.
  const { geometria: _geometria, ...estimativaContratada } = estimativa;
  const payload = {
    v: 1,
    sub: Number(passageiroId),
    iat: agora,
    exp: agora + QUOTE_TTL_MS,
    entrada: normalizarEntrada({ ...entrada, passageiro_id: passageiroId }),
    estimativa: estimativaContratada,
    debito_taxa_cancelamento: Number(debitoTaxaCancelamento || 0),
  };
  const conteudo = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `${conteudo}.${assinatura(conteudo)}`;
}

function validarCotacao({ token, passageiroId, entrada }) {
  if (typeof token !== 'string' || token.length > 20000) {
    throw new AppError('Faça uma nova estimativa antes de solicitar a corrida.', 409, 'RIDE_QUOTE_REQUIRED');
  }
  const [conteudo, assinaturaRecebida, extra] = token.split('.');
  if (!conteudo || !assinaturaRecebida || extra) {
    throw new AppError('A cotação da corrida é inválida. Faça uma nova estimativa.', 409, 'RIDE_QUOTE_INVALID');
  }
  const assinaturaEsperada = assinatura(conteudo);
  const recebida = Buffer.from(assinaturaRecebida);
  const esperada = Buffer.from(assinaturaEsperada);
  if (recebida.length !== esperada.length || !crypto.timingSafeEqual(recebida, esperada)) {
    throw new AppError('A cotação da corrida é inválida. Faça uma nova estimativa.', 409, 'RIDE_QUOTE_INVALID');
  }

  let payload;
  try {
    payload = JSON.parse(Buffer.from(conteudo, 'base64url').toString('utf8'));
  } catch (_) {
    throw new AppError('A cotação da corrida é inválida. Faça uma nova estimativa.', 409, 'RIDE_QUOTE_INVALID');
  }

  const esperado = normalizarEntrada({ ...entrada, passageiro_id: passageiroId });
  if (payload.v !== 1 || payload.sub !== Number(passageiroId) || payload.exp <= Date.now()) {
    throw new AppError('A cotação expirou. Faça uma nova estimativa antes de solicitar.', 409, 'RIDE_QUOTE_EXPIRED');
  }
  if (JSON.stringify(payload.entrada) !== JSON.stringify(esperado)) {
    throw new AppError('Os dados da corrida mudaram. Faça uma nova estimativa.', 409, 'RIDE_QUOTE_MISMATCH');
  }
  if (!payload.estimativa || !Number.isFinite(Number(payload.estimativa.valorPassageiro))) {
    throw new AppError('A cotação da corrida é inválida. Faça uma nova estimativa.', 409, 'RIDE_QUOTE_INVALID');
  }
  return payload;
}

module.exports = { QUOTE_TTL_MS, emitirCotacao, validarCotacao };
