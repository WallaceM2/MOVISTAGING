function positiveInt(value, fallback, max) {
  const n = Number.parseInt(String(value ?? ''), 10);
  if (!Number.isFinite(n) || n < 0) return fallback;
  return Math.min(n, max);
}

function parsePagination(query = {}, { defaultLimit = 20, maxLimit = 100 } = {}) {
  return {
    limit: positiveInt(query.limit, defaultLimit, maxLimit) || defaultLimit,
    offset: positiveInt(query.offset, 0, 1_000_000),
  };
}

function parseExpiresIn(value, { defaultSeconds = 900, maxSeconds = 3600 } = {}) {
  const n = Number.parseInt(String(value ?? ''), 10);
  if (!Number.isFinite(n) || n <= 0) return defaultSeconds;
  return Math.min(n, maxSeconds);
}

module.exports = { parsePagination, parseExpiresIn, positiveInt };
