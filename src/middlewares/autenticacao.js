const AppError = require('../errors/AppError');
const { verifyAccessToken, buscarUsuarioPorTipo } = require('../services/authService');
const { possuiTodosAceitesAtuais } = require('../services/legalConsentService');
const env = require('../config/env');

async function verificarToken(req, res, next) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader) throw new AppError('Token não fornecido.', 401, 'AUTH_REQUIRED');

    const [scheme, token, extra] = authHeader.split(' ');
    if (scheme !== 'Bearer' || !token || extra) {
      throw new AppError('Formato de token inválido.', 401, 'AUTH_FORMAT');
    }

    const decoded = verifyAccessToken(token);
    const id = Number(decoded.sub ?? decoded.id);
    const tipo = decoded.tipo;
    if (!Number.isInteger(id) || id <= 0 || !['motorista', 'passageiro', 'admin'].includes(tipo)) {
      throw new AppError('Token inválido.', 401, 'AUTH_INVALID');
    }

    req.usuario = { id, tipo };
    next();
  } catch (error) {
    next(error instanceof AppError ? error : new AppError('Token inválido ou expirado.', 401, 'AUTH_INVALID'));
  }
}

function permitirTipo(...tiposPermitidos) {
  return (req, res, next) => {
    if (!req.usuario || !tiposPermitidos.includes(req.usuario.tipo)) {
      return next(new AppError(`Acesso negado. Rota exclusiva para: ${tiposPermitidos.join(', ')}.`, 403, 'FORBIDDEN'));
    }
    next();
  };
}

async function exigirContaAtiva(req, res, next) {
  try {
    const usuario = await buscarUsuarioPorTipo(req.usuario.tipo, req.usuario.id);
    if (!usuario) throw new AppError('Usuário não encontrado.', 401, 'USER_NOT_FOUND');

    const statusConta = usuario.status_conta || usuario.status;
    if (['suspensa', 'banida', 'bloqueada'].includes(statusConta)) {
      throw new AppError('Sua conta está indisponível para esta operação. Procure o suporte.', 403, 'ACCOUNT_UNAVAILABLE');
    }

    if (req.usuario.tipo === 'motorista' && usuario.status_cadastro !== 'aprovado') {
      throw new AppError('O cadastro do motorista ainda não está aprovado para realizar corridas.', 403, 'DRIVER_NOT_APPROVED');
    }

    if (env.isProduction && req.usuario.tipo !== 'admin') {
      const aceitesValidos = await possuiTodosAceitesAtuais(req.usuario.tipo, req.usuario.id);
      if (!aceitesValidos) throw new AppError('É necessário aceitar os Termos e políticas atuais antes de continuar.', 409, 'LEGAL_CONSENT_REQUIRED');
    }

    req.usuario.conta = usuario;
    next();
  } catch (error) {
    next(error);
  }
}


async function exigirContaAtivaSemAprovacao(req, res, next) {
  try {
    const usuario = await buscarUsuarioPorTipo(req.usuario.tipo, req.usuario.id);
    if (!usuario) throw new AppError('Usuário não encontrado.', 401, 'USER_NOT_FOUND');
    const statusConta = usuario.status_conta || usuario.status;
    if (['suspensa', 'banida', 'bloqueada'].includes(statusConta)) {
      throw new AppError('Sua conta está indisponível para esta operação. Procure o suporte.', 403, 'ACCOUNT_UNAVAILABLE');
    }
    if (env.isProduction && req.usuario.tipo !== 'admin' && !(await possuiTodosAceitesAtuais(req.usuario.tipo, req.usuario.id))) {
      throw new AppError('É necessário aceitar os Termos e políticas atuais antes de continuar.', 409, 'LEGAL_CONSENT_REQUIRED');
    }
    req.usuario.conta = usuario;
    next();
  } catch (error) {
    next(error);
  }
}

module.exports = verificarToken;
module.exports.verificarToken = verificarToken;
module.exports.permitirTipo = permitirTipo;
module.exports.exigirContaAtiva = exigirContaAtiva;
module.exports.exigirContaAtivaSemAprovacao = exigirContaAtivaSemAprovacao;
