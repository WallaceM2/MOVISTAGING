const Admin = require('../models/Admin');
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

module.exports = { login, listarMotoristas, listarPassageiros, verMotorista, atualizarStatusMotorista, verificarMotorista, verPassageiro, atualizarStatusPassageiro };
