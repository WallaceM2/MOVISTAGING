const pool = require('../config/database');
const { registrar } = require('../services/auditService');
const { limparPresencaUsuario } = require('../services/dinamicaService');
const env = require('../config/env');
const AppError = require('../errors/AppError');

async function criarDenuncia(req, res) {
  const denunciante_id = req.usuario.id;
  const denunciante_tipo = req.usuario.tipo;
  const { corrida_id, denunciado_id, motivo, descricao } = req.body;

  const ride = await pool.query(`SELECT id, passageiro_id, motorista_id, status FROM corridas WHERE id = $1 LIMIT 1`, [corrida_id]);
  const corrida = ride.rows[0];
  if (!corrida) throw new AppError('Corrida não encontrada.', 404, 'RIDE_NOT_FOUND');
  const expectedReporter = denunciante_tipo === 'passageiro' ? corrida.passageiro_id : corrida.motorista_id;
  if (Number(expectedReporter) !== Number(denunciante_id)) throw new AppError('Você não participou desta corrida.', 403, 'REPORTER_NOT_PARTICIPANT');
  const expectedTarget = denunciante_tipo === 'passageiro' ? corrida.motorista_id : corrida.passageiro_id;
  const expectedTargetType = denunciante_tipo === 'passageiro' ? 'motorista' : 'passageiro';
  if (Number(expectedTarget) !== Number(denunciado_id)) throw new AppError('Usuário denunciado não participa desta corrida.', 403, 'INVALID_REPORT_TARGET');
  if (corrida.status !== 'concluida' && corrida.status !== 'em_andamento' && corrida.status !== 'cancelada') throw new AppError('A denúncia só pode estar vinculada a uma corrida válida.', 409, 'INVALID_REPORT_RIDE');

  const result = await pool.query(`
    INSERT INTO denuncias (corrida_id, denunciante_tipo, denunciante_id, denunciado_id, motivo, descricao, status)
    VALUES ($1,$2,$3,$4,$5,$6,'em_analise') RETURNING *;
  `, [corrida_id, denunciante_tipo, denunciante_id, denunciado_id, motivo, descricao || null]);

  // Ocorrências graves são marcadas para suspensão preventiva, mas ficam auditadas para análise administrativa.
  let bloqueioAutomatico = false;
  if (env.AUTO_SUSPEND_ON_SERIOUS_REPORT && ['direcao_perigosa', 'assedio', 'agressao', 'roubo'].includes(motivo)) {
    const tabela = expectedTargetType === 'motorista' ? 'motoristas' : 'passageiros';
    await pool.query(`UPDATE ${tabela} SET status_conta = 'suspensa', atualizado_em = NOW() WHERE id = $1`, [denunciado_id]);
    await limparPresencaUsuario(expectedTargetType, denunciado_id);
    bloqueioAutomatico = true;
    await registrar({ actorType: denunciante_tipo, actorId: denunciante_id, action: 'denuncia.suspensao_preventiva', targetType: expectedTargetType, targetId: denunciado_id, metadata: { corrida_id, motivo } });
  }

  res.status(201).json({
    mensagem: bloqueioAutomatico ? 'Denúncia grave registrada. A conta foi suspensa preventivamente enquanto o caso é analisado.' : 'Denúncia registrada com sucesso. A equipe fará a análise.',
    denuncia: result.rows[0], bloqueio_automatico: bloqueioAutomatico,
  });
}

module.exports = { criarDenuncia };
