const crypto = require('crypto');

function requestContext(req, res, next) {
  const supplied = String(req.get('x-request-id') || '').trim();
  const requestId = /^[a-f0-9-]{16,128}$/i.test(supplied) ? supplied : crypto.randomUUID();
  req.requestId = requestId;
  res.set('X-Request-Id', requestId);
  next();
}

module.exports = requestContext;
