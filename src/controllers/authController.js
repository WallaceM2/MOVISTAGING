const Sessao = require('../models/Sessao');
const { refresh } = require('../services/authService');
const { hashToken } = require('../services/tokenService');
const AppError = require('../errors/AppError');
const { sanitizeIp, safeUserAgent } = require('../utils/http');
const { alterarSenha } = require('../services/authService');

async function renovar(req, res) {
  const result = await refresh(req.body?.refresh_token, { ip: sanitizeIp(req), userAgent: safeUserAgent(req) });
  res.json(result);
}

async function logout(req, res) {
  const token = req.body?.refresh_token;
  if (!token) throw new AppError('Refresh token é obrigatório.', 400, 'REFRESH_TOKEN_REQUIRED');
  await Sessao.revogarDoUsuario(hashToken(token), req.usuario.tipo, req.usuario.id);
  res.json({ sucesso: true });
}

async function trocarSenha(req, res) {
  await alterarSenha({
    tipo: req.usuario.tipo,
    usuarioId: req.usuario.id,
    senhaAtual: req.body.senha_atual,
    novaSenha: req.body.nova_senha,
  });
  res.json({ sucesso: true, mensagem: 'Senha alterada com sucesso. Faça login novamente nos seus dispositivos.' });
}

module.exports = { renovar, logout, trocarSenha };
