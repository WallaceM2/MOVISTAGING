const Avaliacao = require('../models/Avaliacao');
const AppError = require('../errors/AppError');
const { parsePagination } = require('../utils/pagination');

async function criar(req, res) {
  const { corrida_id, avaliado_tipo, avaliado_id, nota, tag, comentario } = req.body;
  const avaliador_tipo = req.usuario.tipo;
  const avaliador_id = req.usuario.id;
  if (avaliador_tipo === avaliado_tipo) throw new AppError('Só é possível avaliar a outra parte da corrida.', 400, 'INVALID_REVIEW_TYPE');

  const result = await Avaliacao.criar({ corrida_id, avaliado_tipo, avaliado_id, avaliador_tipo, avaliador_id, nota, tag, comentario });
  res.status(201).json({ mensagem: 'Avaliação registrada com sucesso!', avaliacao: result.avaliacao, avaliado: result.avaliado });
}

async function listarPorAvaliado(req, res) {
  const { tipo, id } = req.params;
  if (!['motorista', 'passageiro'].includes(tipo)) throw new AppError('Tipo inválido.', 400, 'INVALID_USER_TYPE');
  const avaliacoes = await Avaliacao.listarPorAvaliado(tipo, id, {
    ...parsePagination(req.query, { defaultLimit: 50 }),
  });
  res.json(avaliacoes);
}

module.exports = { criar, listarPorAvaliado };
