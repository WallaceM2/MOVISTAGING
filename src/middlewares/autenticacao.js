const AppError = require('../errors/AppError');
const { verifyAccessToken, buscarUsuarioPorTipo } = require('../services/authService');
const { possuiTodosAceitesAtuais } = require('../services/legalConsentService');
const env = require('../config/env');

async function verificarToken(req, res, next) {
  try {
    const authHeader = req.headers.authorization;
    let token;
    if (authHeader) {
      const [scheme, bearer, extra] = authHeader.split(' ');
      if (scheme !== 'Bearer' || !bearer || extra) {
        throw new AppError('Formato de token inválido.', 401, 'AUTH_FORMAT');
      }
      token = bearer;
    } else if (req.path.startsWith('/admin/')) {
      const cookieHeader = String(req.headers.cookie || '');
      if (cookieHeader.length > 8192) throw new AppError('Cookie inválido.', 401, 'AUTH_INVALID');
      const cookie = cookieHeader.split(';').map((part) => part.trim()).find((part) => part.startsWith('movi_admin_session='));
      token = cookie?.slice('movi_admin_session='.length);
      if (token && !['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
        const origin = req.get('origin');
        if (!origin || !env.CORS_ORIGINS.includes(origin)) throw new AppError('Origem não autorizada para esta operação.', 403, 'CSRF_ORIGIN_DENIED');
      }
    }
    if (!token || token.length > 5000) throw new AppError('Token não fornecido.', 401, 'AUTH_REQUIRED');

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
