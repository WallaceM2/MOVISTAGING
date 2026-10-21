const crypto = require('crypto');
const redisClient = require('../config/redis');
const env = require('../config/env');

function hash(value) {
  return crypto.createHash('sha256').update(String(value)).digest('hex').slice(0, 32);
}

function createRateLimiter({ windowMs, max, keyPrefix, keyBuilder, message, failClosed = false }) {
  return async (req, res, next) => {
    try {
      if (!redisClient.isReady) {
        if (failClosed) return res.status(503).json({ erro: 'Serviço temporariamente indisponível.', codigo: 'RATE_LIMIT_UNAVAILABLE' });
        return next();
      }
      const rawKey = keyBuilder(req);
      const key = `movi:rate:${keyPrefix}:${hash(rawKey)}`;
      const count = await redisClient.incr(key);
      if (count === 1) await redisClient.pExpire(key, windowMs);
      const pttl = Math.max(await redisClient.pTTL(key), 0);
      const remaining = Math.max(max - count, 0);
      res.set('RateLimit-Limit', String(max));
      res.set('RateLimit-Remaining', String(remaining));
      res.set('RateLimit-Reset', String(Math.ceil(pttl / 1000)));
      if (count > max) {
        res.set('Retry-After', String(Math.ceil(pttl / 1000)));
        return res.status(429).json({ erro: message });
      }
      next();
    } catch (error) {
      if (failClosed) {
        return res.status(503).json({ erro: 'Serviço de autenticação temporariamente indisponível.', codigo: 'RATE_LIMIT_UNAVAILABLE' });
      }
      next();
    }
  };
}

const limiteGeral = createRateLimiter({
  windowMs: env.RATE_LIMIT_WINDOW_MS,
  max: env.RATE_LIMIT_MAX,
  keyPrefix: 'global',
  keyBuilder: (req) => req.ip,
  message: 'Muitas requisições deste endereço. Tente novamente mais tarde.',
  failClosed: env.isProduction,
});

const limiteAuth = createRateLimiter({
  windowMs: env.RATE_LIMIT_WINDOW_MS,
  max: env.AUTH_RATE_LIMIT_MAX,
  keyPrefix: 'auth',
  keyBuilder: (req) => `${req.ip}:${String(req.body?.email || '').trim().toLowerCase()}`,
  message: 'Muitas tentativas de autenticação. Tente novamente mais tarde.',
  failClosed: true,
});

const limiteRecuperacaoSenha = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 5,
  keyPrefix: 'password-recovery',
  keyBuilder: (req) => `${req.ip}:${String(req.body?.tipo_usuario || '')}:${String(req.body?.metodo || '')}:${String(req.body?.destino || req.body?.challenge_id || '')}`,
  message: 'Muitas solicitações de recuperação. Tente novamente mais tarde.',
  failClosed: true,
});

const limiteChat = createRateLimiter({
  windowMs: 60_000,
  max: 60,
  keyPrefix: 'ride-chat',
  keyBuilder: (req) => `${req.usuario?.tipo || 'anonymous'}:${req.usuario?.id || req.ip}`,
  message: 'Muitas mensagens em pouco tempo. Aguarde um instante para enviar outra.',
  failClosed: env.isProduction,
});

module.exports = { limiteGeral, limiteAuth, limiteRecuperacaoSenha, limiteChat };
