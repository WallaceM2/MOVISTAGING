const crypto = require('crypto');
const pool = require('../config/database');
const AppError = require('../errors/AppError');

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object') {
    return Object.keys(value).sort().reduce((acc, key) => {
      acc[key] = canonicalize(value[key]);
      return acc;
    }, Object.create(null));
  }
  return value;
}

function fingerprint(req) {
  return crypto.createHash('sha256').update(JSON.stringify({
    method: req.method,
    path: req.originalUrl.split('?')[0],
    query: canonicalize(req.query),
    body: canonicalize(req.body),
  })).digest('hex');
}

function factory({ required = true } = {}) {
  return async (req, res, next) => {
    try {
      const key = String(req.get('Idempotency-Key') || '').trim();
      if (!key) {
        if (required) throw new AppError('O cabeçalho Idempotency-Key é obrigatório nesta operação.', 400, 'IDEMPOTENCY_KEY_REQUIRED');
        return next();
      }
      if (!/^[A-Za-z0-9._:-]{16,128}$/.test(key)) {
        throw new AppError('Idempotency-Key inválido.', 400, 'INVALID_IDEMPOTENCY_KEY');
      }

      const actorId = req.usuario?.id || 0;
      const actorType = req.usuario?.tipo || 'anonymous';
      const bodyHash = fingerprint(req);
      const inserted = await pool.query(`
        INSERT INTO movi_idempotency_keys (actor_type, actor_id, idempotency_key, request_hash)
        VALUES ($1,$2,$3,$4)
        ON CONFLICT (actor_type, actor_id, idempotency_key) DO NOTHING
        RETURNING id;
      `, [actorType, actorId, key, bodyHash]);

      const recordId = inserted.rows[0]?.id;
      if (!recordId) {
        const existing = await pool.query(`
          SELECT id, request_hash, response_status, response_body, updated_at
          FROM movi_idempotency_keys
          WHERE actor_type = $1 AND actor_id = $2 AND idempotency_key = $3
          LIMIT 1;
        `, [actorType, actorId, key]);
        const row = existing.rows[0];
        if (!row) throw new AppError('Não foi possível verificar a idempotência.', 409, 'IDEMPOTENCY_CONFLICT');
        if (row.request_hash !== bodyHash) throw new AppError('A mesma Idempotency-Key não pode ser reutilizada para outra operação.', 409, 'IDEMPOTENCY_PAYLOAD_MISMATCH');
        if (row.response_status != null) return res.status(row.response_status).json(row.response_body);

        const stale = new Date(row.updated_at || 0).getTime() < Date.now() - 2 * 60 * 1000;
        if (stale) {
          const reset = await pool.query(`
            DELETE FROM movi_idempotency_keys
            WHERE id = $1 AND response_status IS NULL AND updated_at < NOW() - INTERVAL '2 minutes'
            RETURNING id;
          `, [row.id]);
          if (reset.rows[0]) return factory({ required })(req, res, next);
        }
        throw new AppError('Essa operação já está sendo processada. Aguarde e tente novamente.', 409, 'IDEMPOTENCY_IN_PROGRESS');
      }

      req.idempotencyRecordId = Number(recordId);
      let captured = false;
      const originalJson = res.json.bind(res);
      const originalSend = res.send.bind(res);

      const persist = (status, body) => {
        if (captured) return;
        captured = true;
        void pool.query(`
          UPDATE movi_idempotency_keys
          SET response_status = $1, response_body = $2, updated_at = NOW()
          WHERE id = $3 AND response_status IS NULL
        `, [status, JSON.stringify(body), recordId]).catch((error) => {
          console.error(JSON.stringify({
            level: 'error',
            event: 'idempotency_persist_failed',
            request_id: req.requestId,
            message: error.message,
          }));
        });
      };

      res.json = (body) => {
        persist(res.statusCode, body);
        return originalJson(body);
      };
      res.send = (body) => {
        if (typeof body === 'string' || Buffer.isBuffer(body)) {
          try { persist(res.statusCode, typeof body === 'string' ? JSON.parse(body) : { raw: body.toString('base64') }); } catch (_) {}
        } else {
          persist(res.statusCode, body);
        }
        return originalSend(body);
      };

      next();
    } catch (error) {
      next(error);
    }
  };
}

module.exports = factory;
module.exports.fingerprint = fingerprint;
