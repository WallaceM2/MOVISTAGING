function sanitizeIp(req) {
  return String(req.ip || '').slice(0, 64);
}

function safeUserAgent(req) {
  return String(req.get('user-agent') || '').slice(0, 500);
}

module.exports = { sanitizeIp, safeUserAgent };
