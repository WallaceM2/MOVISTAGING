const Corrida = require('../models/Corrida');
const { parsePagination } = require('../utils/pagination');

async function consultarExtrato(req, res) {
  const { limit, offset } = parsePagination(req.query, { defaultLimit: 20 });
  const [corridas, resumo] = await Promise.all([
    Corrida.listarParaUsuario({ tipo: req.usuario.tipo, id: req.usuario.id, limit, offset }),
    Corrida.resumoParaUsuario({ tipo: req.usuario.tipo, id: req.usuario.id }),
  ]);
  res.json({
    saldo_total: req.usuario.tipo === 'motorista' ? Number(resumo.saldo_carteira || 0).toFixed(2) : null,
    ganhos_acumulados: req.usuario.tipo === 'motorista' ? Number(resumo.ganhos_motorista || 0).toFixed(2) : null,
    total_viagens: Number(resumo.total_corridas || 0),
    corridas_concluidas: Number(resumo.corridas_concluidas || 0),
    valor_total_corridas: Number(resumo.valor_total_corridas || 0).toFixed(2),
    historico: corridas,
    pagina: { limit, offset },
  });
}

module.exports = { consultarExtrato };
