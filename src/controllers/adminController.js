const Admin = require('../models/Admin');
const pool = require('../config/database');
const Motorista = require('../models/Motorista');
const Passageiro = require('../models/Passageiro');
const { autenticarSenha } = require('../services/authService');
const { registrar } = require('../services/auditService');
const AppError = require('../errors/AppError');
const { parsePagination } = require('../utils/pagination');
const { sanitizeIp, safeUserAgent } = require('../utils/http');
const { limparPresencaUsuario } = require('../services/dinamicaService');

async function login(req, res) {
  const { usuario, accessToken, refreshToken } = await autenticarSenha({
    tipo: 'admin', email: req.body.email, senha: req.body.senha, buscarPorEmail: Admin.buscarPorEmail,
    ip: sanitizeIp(req), userAgent: safeUserAgent(req),
  });
  res.json({ mensagem: 'Login administrativo realizado com sucesso!', token: accessToken, refresh_token: refreshToken, admin: { id: usuario.id, nome: usuario.nome, email: usuario.email } });
}

async function listarMotoristas(req, res) {
  const { limit, offset } = parsePagination(req.query, { defaultLimit: 50 });
  res.json({ dados: await Motorista.listarTodos({ limit, offset }), pagina: { limit, offset } });
}

async function listarPassageiros(req, res) {
  const { limit, offset } = parsePagination(req.query, { defaultLimit: 50 });
  res.json({ dados: await Passageiro.listarTodos({ limit, offset }), pagina: { limit, offset } });
}

async function verMotorista(req, res) {
  const motorista = await Motorista.buscarPorId(req.params.id);
  if (!motorista) throw new AppError('Motorista não encontrado.', 404, 'DRIVER_NOT_FOUND');
  res.json(motorista);
}

async function atualizarStatusMotorista(req, res) {
  const { id } = req.params;
  const motorista = await Motorista.atualizarStatus(id, req.body.status);
  if (!motorista) throw new AppError('Motorista não encontrado.', 404, 'DRIVER_NOT_FOUND');
  if (!['aprovado', 'ativa'].includes(req.body.status)) await limparPresencaUsuario('motorista', id);
  await registrar({ actorType: 'admin', actorId: req.usuario.id, action: 'motorista.status.update', targetType: 'motorista', targetId: id, metadata: { status: req.body.status } });
  res.json({ mensagem: `Status do motorista atualizado para "${req.body.status}".`, motorista });
}


async function verificarMotorista(req, res) {
  const motorista = await Motorista.atualizarVerificacao(req.params.id, req.body);
  if (!motorista) throw new AppError('Motorista não encontrado.', 404, 'DRIVER_NOT_FOUND');
  await registrar({
    actorType: 'admin', actorId: req.usuario.id,
    action: 'motorista.verificacao.update', targetType: 'motorista', targetId: Number(req.params.id),
    metadata: { validar_cnh: Boolean(req.body.validar_cnh), validar_veiculo: Boolean(req.body.validar_veiculo), validar_antecedentes: Boolean(req.body.validar_antecedentes) },
  });
  res.json({ mensagem: 'Dados de verificação atualizados.', motorista });
}

async function verPassageiro(req, res) {
  const passageiro = await Passageiro.buscarPorId(req.params.id);
  if (!passageiro) throw new AppError('Passageiro não encontrado.', 404, 'PASSENGER_NOT_FOUND');
  res.json(passageiro);
}

async function atualizarStatusPassageiro(req, res) {
  const { id } = req.params;
  const passageiro = await Passageiro.atualizarStatus(id, req.body.status);
  if (!passageiro) throw new AppError('Passageiro não encontrado.', 404, 'PASSENGER_NOT_FOUND');
  if (req.body.status !== 'ativa') await limparPresencaUsuario('passageiro', id);
  await registrar({ actorType: 'admin', actorId: req.usuario.id, action: 'passageiro.status.update', targetType: 'passageiro', targetId: id, metadata: { status: req.body.status } });
  res.json({ mensagem: `Status do passageiro atualizado para "${req.body.status}".`, passageiro });
}

async function dashboard(req, res) {
  const periodo = ['7d', '30d', '90d', 'today', 'month'].includes(req.query.periodo) ? req.query.periodo : '7d';
  const diasPeriodo = { '7d': 7, '30d': 30, '90d': 90, today: 1, month: 30 }[periodo];
  const [totais, serieFinanceira, operacao, corridasRecentes, pagamentosPorMetodo, debitosPassageiros, saquesRecentes, ocorrenciasRecentes, atividadeRecente] = await Promise.all([
    pool.query(`
      WITH janela AS (
        SELECT NOW() AS fim,
          CASE $1::text
            WHEN 'today' THEN date_trunc('day', NOW() AT TIME ZONE 'America/Fortaleza') AT TIME ZONE 'America/Fortaleza'
            WHEN 'month' THEN date_trunc('month', NOW() AT TIME ZONE 'America/Fortaleza') AT TIME ZONE 'America/Fortaleza'
            ELSE (date_trunc('day', NOW() AT TIME ZONE 'America/Fortaleza') - make_interval(days => $2::int - 1)) AT TIME ZONE 'America/Fortaleza'
          END AS inicio
      ), periodos AS (
        SELECT inicio, fim, inicio - (fim - inicio) AS inicio_anterior, inicio AS fim_anterior FROM janela
      )
      SELECT
        (SELECT COUNT(*)::int FROM corridas c, periodos p WHERE c.solicitada_em >= p.inicio AND c.solicitada_em < p.fim) AS corridas,
        (SELECT COALESCE(SUM(c.valor), 0)::numeric(14,2) FROM corridas c, periodos p WHERE c.status = 'concluida' AND c.finalizada_em >= p.inicio AND c.finalizada_em < p.fim) AS tarifas,
        (SELECT COALESCE(SUM(-l.valor), 0)::numeric(14,2) FROM movi_lancamentos_financeiros l, periodos p WHERE l.tipo = 'comissao_app' AND l.valor < 0 AND l.criado_em >= p.inicio AND l.criado_em < p.fim) AS comissao,
        (SELECT COALESCE(SUM(c.ganho_motorista), 0)::numeric(14,2) FROM corridas c, periodos p WHERE c.status = 'concluida' AND c.finalizada_em >= p.inicio AND c.finalizada_em < p.fim) AS repasse,
        (SELECT COUNT(*)::int FROM corridas c, periodos p WHERE c.solicitada_em >= p.inicio_anterior AND c.solicitada_em < p.fim_anterior) AS corridas_anteriores,
        (SELECT COALESCE(SUM(c.valor), 0)::numeric(14,2) FROM corridas c, periodos p WHERE c.status = 'concluida' AND c.finalizada_em >= p.inicio_anterior AND c.finalizada_em < p.fim_anterior) AS tarifas_anteriores,
        (SELECT COALESCE(SUM(-l.valor), 0)::numeric(14,2) FROM movi_lancamentos_financeiros l, periodos p WHERE l.tipo = 'comissao_app' AND l.valor < 0 AND l.criado_em >= p.inicio_anterior AND l.criado_em < p.fim_anterior) AS comissao_anterior,
        (SELECT COALESCE(SUM(c.ganho_motorista), 0)::numeric(14,2) FROM corridas c, periodos p WHERE c.status = 'concluida' AND c.finalizada_em >= p.inicio_anterior AND c.finalizada_em < p.fim_anterior) AS repasse_anterior
    `, [periodo, diasPeriodo]),
    pool.query(`
      WITH janela AS (
        SELECT CASE $1::text
          WHEN 'today' THEN date_trunc('day', NOW() AT TIME ZONE 'America/Fortaleza')
          WHEN 'month' THEN date_trunc('month', NOW() AT TIME ZONE 'America/Fortaleza')
          ELSE date_trunc('day', NOW() AT TIME ZONE 'America/Fortaleza') - make_interval(days => $2::int - 1)
        END AS inicio_local,
        (NOW() AT TIME ZONE 'America/Fortaleza') AS agora_local
      ), dias AS (
        SELECT gs.dia::date AS dia FROM janela j,
          generate_series(j.inicio_local::date, j.agora_local::date, interval '1 day') AS gs(dia)
      ), corridas_por_dia AS (
        SELECT (c.finalizada_em AT TIME ZONE 'America/Fortaleza')::date AS dia,
          SUM(c.valor)::numeric(14,2) AS tarifas, SUM(c.ganho_motorista)::numeric(14,2) AS repasse
        FROM corridas c CROSS JOIN janela j
        WHERE c.status = 'concluida'
          AND c.finalizada_em >= (j.inicio_local AT TIME ZONE 'America/Fortaleza')
          AND c.finalizada_em < (j.agora_local AT TIME ZONE 'America/Fortaleza')
        GROUP BY (c.finalizada_em AT TIME ZONE 'America/Fortaleza')::date
      ), comissoes_por_dia AS (
        SELECT (l.criado_em AT TIME ZONE 'America/Fortaleza')::date AS dia,
          SUM(-l.valor)::numeric(14,2) AS comissao
        FROM movi_lancamentos_financeiros l CROSS JOIN janela j
        WHERE l.tipo = 'comissao_app' AND l.valor < 0
          AND l.criado_em >= (j.inicio_local AT TIME ZONE 'America/Fortaleza')
          AND l.criado_em < (j.agora_local AT TIME ZONE 'America/Fortaleza')
        GROUP BY (l.criado_em AT TIME ZONE 'America/Fortaleza')::date
      )
      SELECT TO_CHAR(d.dia, 'YYYY-MM-DD') AS data,
        COALESCE(cpd.tarifas, 0)::numeric(14,2) AS tarifas,
        COALESCE(cpd_com.comissao, 0)::numeric(14,2) AS comissao,
        COALESCE(cpd.repasse, 0)::numeric(14,2) AS repasse
      FROM dias d
      LEFT JOIN corridas_por_dia cpd ON cpd.dia = d.dia
      LEFT JOIN comissoes_por_dia cpd_com ON cpd_com.dia = d.dia
      ORDER BY d.dia
    `, [periodo, diasPeriodo]),
    pool.query(`
      SELECT
        (SELECT COUNT(*)::int FROM corridas WHERE status = ANY(ARRAY['solicitada','aceita','em_andamento']::text[])) AS corridas_ativas,
        (SELECT COUNT(*)::int FROM motoristas WHERE online = TRUE AND disponivel = TRUE AND status_conta = 'ativa' AND status_cadastro = 'aprovado') AS motoristas_disponiveis,
        (SELECT COUNT(*)::int FROM passageiros WHERE status_conta = 'ativa') AS passageiros_ativos,
        (SELECT COUNT(*)::int FROM ocorrencias_pagamento WHERE status NOT IN ('resolvida','rejeitada')) AS ocorrencias_abertas,
        (SELECT COALESCE(SUM(debito_pendente), 0)::numeric(12,2) FROM passageiros WHERE debito_pendente > 0) AS debitos_pendentes_passageiros
    `),
    pool.query(`
      SELECT c.id, c.categoria, c.status, c.forma_pagamento, c.status_pagamento, c.valor,
             c.solicitada_em, c.aceita_em, c.finalizada_em, c.cancelada_em,
             COALESCE(NULLIF(BTRIM(p.nome || ' ' || COALESCE(p.sobrenome, '')), ''), 'Passageiro') AS passageiro_nome,
             COALESCE(NULLIF(BTRIM(m.nome || ' ' || COALESCE(m.sobrenome, '')), ''), '—') AS motorista_nome
      FROM corridas c
      LEFT JOIN passageiros p ON p.id = c.passageiro_id
      LEFT JOIN motoristas m ON m.id = c.motorista_id
      ORDER BY c.solicitada_em DESC, c.id DESC LIMIT 8;
    `),
    pool.query(`
      WITH janela AS (
        SELECT CASE $1::text
          WHEN 'today' THEN date_trunc('day', NOW() AT TIME ZONE 'America/Fortaleza') AT TIME ZONE 'America/Fortaleza'
          WHEN 'month' THEN date_trunc('month', NOW() AT TIME ZONE 'America/Fortaleza') AT TIME ZONE 'America/Fortaleza'
          ELSE NOW() - make_interval(days => $2::int)
        END AS inicio, NOW() AS fim
      )
      SELECT COALESCE(NULLIF(c.forma_pagamento, ''), 'dinheiro') AS metodo,
        COALESCE(SUM(c.valor), 0)::numeric(14,2) AS valor,
        COUNT(*)::int AS quantidade
      FROM corridas c, janela j
      WHERE c.status = 'concluida' AND c.finalizada_em >= j.inicio AND c.finalizada_em < j.fim
      GROUP BY COALESCE(NULLIF(c.forma_pagamento, ''), 'dinheiro')
      ORDER BY valor DESC
    `, [periodo, diasPeriodo]),
    pool.query(`
      SELECT p.id, COALESCE(NULLIF(BTRIM(p.nome || ' ' || COALESCE(p.sobrenome, '')), ''), 'Passageiro') AS passageiro_nome,
        p.debito_pendente::numeric(14,2) AS valor,
        COUNT(DISTINCT o.corrida_id)::int AS quantidade_corridas,
        MAX(o.criado_em) AS ultima_ocorrencia_em
      FROM passageiros p
      LEFT JOIN ocorrencias_pagamento o ON o.passageiro_id = p.id
      WHERE p.debito_pendente > 0
      GROUP BY p.id, p.nome, p.sobrenome, p.debito_pendente
      ORDER BY p.debito_pendente DESC, MAX(o.criado_em) DESC NULLS LAST LIMIT 8
    `),
    pool.query(`
      SELECT s.id, COALESCE(NULLIF(BTRIM(m.nome || ' ' || COALESCE(m.sobrenome, '')), ''), 'Motorista') AS motorista_nome,
        s.valor_solicitado::numeric(14,2) AS valor_solicitado, s.valor_aprovado::numeric(14,2) AS valor_aprovado,
        s.status, s.solicitado_em
      FROM movi_saques_motoristas s LEFT JOIN motoristas m ON m.id = s.motorista_id
      ORDER BY s.solicitado_em DESC, s.id DESC LIMIT 5
    `),
    pool.query(`
      SELECT o.id, o.corrida_id, o.diferenca_debito::numeric(14,2) AS valor, o.status, o.criado_em,
        CASE WHEN o.valor_recebido = 0 THEN 'Não pagamento' WHEN o.diferenca_debito > 0 THEN 'Pagamento parcial' ELSE 'Pagamento contestado' END AS tipo
      FROM ocorrencias_pagamento o
      ORDER BY o.criado_em DESC, o.id DESC LIMIT 6
    `),
    pool.query(`
      SELECT eventos.tipo, eventos.titulo, eventos.detalhe, eventos.valor, eventos.data
      FROM (
        SELECT 'corrida'::text AS tipo, ('Corrida #' || c.id || ' finalizada') AS titulo,
          COALESCE(NULLIF(BTRIM(m.nome || ' ' || COALESCE(m.sobrenome, '')), ''), 'Motorista não atribuído') AS detalhe,
          c.valor::numeric(14,2) AS valor, c.finalizada_em AS data
        FROM corridas c LEFT JOIN motoristas m ON m.id = c.motorista_id WHERE c.status = 'concluida'
        UNION ALL
        SELECT 'pagamento',
          CASE WHEN p.status = 'parcial' THEN 'Pagamento parcial identificado' ELSE 'Pagamento confirmado (' || COALESCE(p.metodo, 'método não informado') || ')' END,
          'Corrida #' || p.corrida_id, p.valor_pago::numeric(14,2), COALESCE(p.pago_em, p.atualizado_em)
        FROM movi_pagamentos p WHERE p.status IN ('pago','parcial')
        UNION ALL
        SELECT 'saque', 'Solicitação de saque',
          COALESCE(NULLIF(BTRIM(m.nome || ' ' || COALESCE(m.sobrenome, '')), ''), 'Motorista'),
          s.valor_solicitado::numeric(14,2), s.solicitado_em
        FROM movi_saques_motoristas s LEFT JOIN motoristas m ON m.id = s.motorista_id
        UNION ALL
        SELECT 'ocorrencia', 'Ocorrência de pagamento', 'Corrida #' || o.corrida_id,
          o.diferenca_debito::numeric(14,2), o.criado_em FROM ocorrencias_pagamento o
        UNION ALL
        SELECT 'cancelamento', 'Cancelamento de corrida', 'Corrida #' || c.id,
          NULL::numeric(14,2), c.cancelada_em FROM corridas c WHERE c.status = 'cancelada'
      ) eventos
      WHERE eventos.data IS NOT NULL
      ORDER BY eventos.data DESC LIMIT 10
    `),
  ]);

  const total = totais.rows[0];
  const variation = (current, previous) => Number(previous) === 0
    ? (Number(current) === 0 ? 0 : null)
    : Number((((Number(current) - Number(previous)) / Math.abs(Number(previous))) * 100).toFixed(1));

  res.set('Cache-Control', 'no-store');
  res.json({
    fuso_horario: 'America/Fortaleza',
    atualizado_em: new Date().toISOString(),
    periodo,
    totais: {
      corridas: total.corridas,
      tarifas: total.tarifas,
      comissao: total.comissao,
      repasse: total.repasse,
      variacao_corridas: variation(total.corridas, total.corridas_anteriores),
      variacao_tarifas: variation(total.tarifas, total.tarifas_anteriores),
      variacao_comissao: variation(total.comissao, total.comissao_anterior),
      variacao_repasse: variation(total.repasse, total.repasse_anterior),
    },
    serie_financeira: serieFinanceira.rows,
    operacao: operacao.rows[0],
    corridas_recentes: corridasRecentes.rows,
    pagamentos_por_metodo: pagamentosPorMetodo.rows,
    debitos_passageiros: debitosPassageiros.rows,
    saques_recentes: saquesRecentes.rows,
    ocorrencias_recentes: ocorrenciasRecentes.rows,
    atividade_recente: atividadeRecente.rows,
    observacao_financeira: 'Valores são registros operacionais do V3. Sem provedor de pagamento e liquidação habilitados, tarifas, comissões e repasses não significam dinheiro recebido ou disponível para saque.'
  });
}

module.exports = { login, listarMotoristas, listarPassageiros, verMotorista, atualizarStatusMotorista, verificarMotorista, verPassageiro, atualizarStatusPassageiro, dashboard };
