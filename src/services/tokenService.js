const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const env = require('../config/env');

function signAccessToken({ id, tipo, jti = crypto.randomUUID() }) {
  return jwt.sign(
    { sub: String(id), id, tipo, jti },
    env.JWT_SECRET,
    {
      algorithm: 'HS256',
      expiresIn: env.JWT_ACCESS_TTL,
      issuer: 'movi-api',
      audience: 'movi-app',
    },
  );
}

function createRefreshToken() {
  return crypto.randomBytes(48).toString('base64url');
}

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function refreshExpiresAt() {
  return new Date(Date.now() + env.JWT_REFRESH_TTL_DAYS * 24 * 60 * 60 * 1000);
}

module.exports = { signAccessToken, createRefreshToken, hashToken, refreshExpiresAt };
