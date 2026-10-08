const env = require('./config/env');
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const helmet = require('helmet');
const morgan = require('morgan');
const pool = require('./config/database');
const redisClient = require('./config/redis');
const { connectRedis, closeRedis, createSubscriber } = require('./config/redis');
const { limiteGeral, limiteAuth } = require('./middlewares/rateLimiter');
const requestContext = require('./middlewares/requestContext');
const { verifyAccessToken, buscarUsuarioPorTipo } = require('./services/authService');
const {
  atualizarLocalizacaoMotorista,
  marcarMotoristaDisponivel,
  renovarPresencaMotorista,
  limparPresencaUsuario,
} = require('./services/dinamicaService');
const { emitToUser, setIO, initRealtimeBus, closeRealtimeBus } = require('./services/realtimeService');
const { possuiTodosAceitesAtuais } = require('./services/legalConsentService');
const { startOfferWorker } = require('./jobs/offerWorker');
const motoristaRoutes = require('./routes/motoristaRoutes');
const passageiroRoutes = require('./routes/passageiroRoutes');
const adminRoutes = require('./routes/adminRoutes');
const avaliacaoRoutes = require('./routes/avaliacaoRoutes');
const corridaRoutes = require('./routes/corridaRoutes');
const historicoRoutes = require('./routes/historicoRoutes');
const documentoRoutes = require('./routes/documentoRoutes');
const denunciaRoutes = require('./routes/denunciaRoutes');
const healthRoutes = require('./routes/healthRoutes');
const authRoutes = require('./routes/authRoutes');
const legalRoutes = require('./routes/legalRoutes');
const pushRoutes = require('./routes/pushRoutes');
const tripShareRoutes = require('./routes/tripShareRoutes');
const { AppError } = require('./errors');

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', env.TRUST_PROXY);
app.set('json escape', true);
app.set('strict routing', true);

function applyCors(req, res, next) {
  const origin = req.headers.origin;
  if (origin && !env.CORS_ORIGINS.includes(origin)) {
    return res.status(403).json({ erro: 'Origem não autorizada pelo CORS.', codigo: 'CORS_ORIGIN_DENIED', request_id: req.requestId });
  }

  if (origin) res.set('Access-Control-Allow-Origin', origin);
  res.set('Vary', 'Origin');
  res.set('Access-Control-Allow-Credentials', 'true');
  res.set('Access-Control-Allow-Methods', 'GET,POST,PATCH,PUT,DELETE,OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, Idempotency-Key, X-Request-Id');
  res.set('Access-Control-Max-Age', '600');

  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
}

const httpServer = http.createServer(app);
httpServer.requestTimeout = 20_000;
httpServer.headersTimeout = 10_000;
httpServer.keepAliveTimeout = 5_000;
httpServer.maxRequestsPerSocket = 1_000;

const io = new Server(httpServer, {
  cors: {
    origin: (origin, callback) => {
      if (!origin || env.CORS_ORIGINS.includes(origin)) return callback(null, true);
      return callback(new Error('Origem não autorizada pelo CORS.'));
    },
    credentials: true,
  },
  transports: ['websocket', 'polling'],
  maxHttpBufferSize: 100 * 1024,
  pingInterval: 25_000,
  pingTimeout: 20_000,
  connectionStateRecovery: {
    maxDisconnectionDuration: 120_000,
    skipMiddlewares: false,
  },
});

app.set('io', io);
setIO(io);

app.use(requestContext);
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      ...helmet.contentSecurityPolicy.getDefaultDirectives(),
      'connect-src': ["'self'"],
    },
  },
  crossOriginEmbedderPolicy: false,
}));
app.use(applyCors);
app.use(express.json({ limit: env.REQUEST_BODY_LIMIT, strict: true }));
app.use('/api', limiteGeral);
app.use(morgan((tokens, req, res) => JSON.stringify({
  timestamp: new Date().toISOString(),
  request_id: req.requestId,
  method: req.method,
  path: req.originalUrl.split('?')[0].replace(/^(\/compartilhar\/)[A-Za-z0-9_-]+$/, '$1:token'),
  status: Number(tokens.status(req, res)),
  response_time_ms: Number(tokens['response-time'](req, res)),
  ip: req.ip,
})));


app.use('/api', authRoutes);
app.use('/api', legalRoutes);
app.use('/api', pushRoutes);
app.use('/api', tripShareRoutes);
app.use('/', tripShareRoutes);
app.use('/api', motoristaRoutes);
app.use('/api', passageiroRoutes);
app.use('/api', adminRoutes);
app.use('/api', avaliacaoRoutes);
app.use('/api/corridas', corridaRoutes);
app.use('/api', historicoRoutes);
app.use('/api', documentoRoutes);
app.use('/api', denunciaRoutes);
app.use('/health', healthRoutes);

app.get('/', (req, res) => res.json({ nome: 'Movi API', status: 'online', versao: 'v1' }));

function socketAuthError(code) {
  const error = new Error(code);
  error.data = { codigo: code };
  return error;
}

function allowSocketEvent(socket, key, limit, windowMs) {
  const now = Date.now();
  const current = socket.data.rateLimits?.[key] || { startedAt: now, count: 0 };
  if (now - current.startedAt >= windowMs) {
    current.startedAt = now;
    current.count = 0;
  }
  current.count += 1;
  socket.data.rateLimits = socket.data.rateLimits || {};
  socket.data.rateLimits[key] = current;
  return current.count <= limit;
}

io.use(async (socket, next) => {
  try {
    const authorization = socket.handshake.headers?.authorization;
    const token = socket.handshake.auth?.token
      || (authorization && /^Bearer\s+\S+$/i.test(authorization) ? authorization.replace(/^Bearer\s+/i, '') : null);

    if (!token || typeof token !== 'string' || token.length > 5000) return next(socketAuthError('AUTH_REQUIRED'));

    const decoded = verifyAccessToken(token);
    const id = Number(decoded.sub ?? decoded.id);
    const tipo = decoded.tipo;
    if (!Number.isInteger(id) || id <= 0 || !['motorista', 'passageiro', 'admin'].includes(tipo)) {
      return next(socketAuthError('AUTH_INVALID'));
    }

    const usuario = await buscarUsuarioPorTipo(tipo, id);
    if (!usuario) return next(socketAuthError('USER_NOT_FOUND'));

    const status = usuario.status_conta || usuario.status;
    if (['suspensa', 'banida', 'bloqueada'].includes(status)) return next(socketAuthError('ACCOUNT_UNAVAILABLE'));
    if (tipo === 'motorista' && usuario.status_cadastro !== 'aprovado') return next(socketAuthError('DRIVER_NOT_APPROVED'));
    if (env.isProduction && tipo !== 'admin' && !(await possuiTodosAceitesAtuais(tipo, id))) {
      return next(socketAuthError('LEGAL_CONSENT_REQUIRED'));
    }

    socket.usuario = { id, tipo, categoria: usuario.categoria || null };
    next();
  } catch (error) {
    next(socketAuthError('AUTH_INVALID'));
  }
});

io.on('connection', (socket) => {
  void (async () => {
    const { id, tipo } = socket.usuario;
    socket.join(`user:${tipo}:${id}`);
    socket.data.disponivel = false;
    socket.data.lastLocationAt = 0;
    socket.data.rateLimits = Object.create(null);

    const socketKey = `socket:${tipo}:${id}`;
    const ttl = tipo === 'motorista' ? env.DRIVER_PRESENCE_TTL_SEC : env.PASSENGER_PRESENCE_TTL_SEC;

    await redisClient.set(socketKey, socket.id, { EX: ttl }).catch(() => {});
    if (tipo === 'passageiro') {
      await redisClient.set(`presence:passageiro:${id}`, '1', { EX: env.PASSENGER_PRESENCE_TTL_SEC }).catch(() => {});
    } else if (tipo === 'motorista') {
      await redisClient.set(`presence:motorista:${id}`, '1', { EX: env.DRIVER_PRESENCE_TTL_SEC }).catch(() => {});
    }

    socket.on('definir_disponibilidade', async (dados = {}, ack) => {
      try {
        if (tipo !== 'motorista') throw new AppError('Somente motoristas podem alterar disponibilidade.', 403, 'ONLY_DRIVER');
        if (!allowSocketEvent(socket, 'definir_disponibilidade', 20, 60_000)) throw new AppError('Muitas alterações de disponibilidade. Aguarde um instante.', 429, 'SOCKET_RATE_LIMITED');
        if (!dados || typeof dados !== 'object' || Array.isArray(dados) || typeof dados.disponivel !== 'boolean') {
          throw new AppError('O campo disponivel deve ser booleano.', 400, 'INVALID_AVAILABILITY_PAYLOAD');
        }

        await marcarMotoristaDisponivel(id, dados.disponivel, { exigirLocalizacao: dados.disponivel });
        socket.data.disponivel = dados.disponivel;
        if (typeof ack === 'function') ack({ ok: true, disponivel: dados.disponivel });
      } catch (error) {
        if (typeof ack === 'function') ack({ ok: false, erro: error.code || 'Não foi possível atualizar a disponibilidade.' });
      }
    });

    socket.on('heartbeat', async (ack) => {
      try {
        if (!allowSocketEvent(socket, 'heartbeat', 40, 60_000)) {
          if (typeof ack === 'function') ack({ ok: false, codigo: 'SOCKET_RATE_LIMITED' });
          return;
        }
        const currentTtl = tipo === 'motorista' ? env.DRIVER_PRESENCE_TTL_SEC : env.PASSENGER_PRESENCE_TTL_SEC;
        await redisClient.set(socketKey, socket.id, { EX: currentTtl });

        if (tipo === 'motorista') {
          const available = await renovarPresencaMotorista(id,socket.data.disponivel === true,);
        } else {
          await redisClient.set(`presence:passageiro:${id}`, '1', { EX: env.PASSENGER_PRESENCE_TTL_SEC });
        }

        if (typeof ack === 'function') ack({ ok: true });
      } catch (_) {
        if (typeof ack === 'function') ack({ ok: false, codigo: 'HEARTBEAT_FAILED' });
      }
    });

    socket.on('atualizar_localizacao', async (dados = {}, ack) => {
      try {
        if (!dados || typeof dados !== 'object' || Array.isArray(dados)) throw new AppError('Payload de localização inválido.', 400, 'INVALID_LOCATION_PAYLOAD');

        const lat = Number(dados.lat);
        const lng = Number(dados.lng);
        if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
          throw new AppError('Coordenadas inválidas.', 400, 'INVALID_COORDINATES');
        }

        const last = socket.data.lastLocationAt || 0;
        if (Date.now() - last < env.LOCATION_UPDATE_INTERVAL_MS) {
          if (typeof ack === 'function') ack({ ok: false, codigo: 'LOCATION_RATE_LIMITED' });
          return;
        }
        socket.data.lastLocationAt = Date.now();

        if (tipo === 'motorista') {
          if (dados.corrida_id !== undefined && dados.corrida_id !== null) {
            const corridaId = Number(dados.corrida_id);
            if (!Number.isInteger(corridaId) || corridaId <= 0) throw new AppError('Corrida inválida.', 400, 'INVALID_RIDE');
            const corrida = await pool.query(`
              SELECT id, motorista_id, passageiro_id, status
              FROM corridas
              WHERE id = $1
              LIMIT 1
            `, [corridaId]);
            const ride = corrida.rows[0];
            if (!ride || Number(ride.motorista_id) !== id || !['aceita', 'em_andamento'].includes(ride.status)) {
              throw new AppError('Corrida inválida para este motorista.', 403, 'INVALID_RIDE');
            }

            const direcao = dados.direcao == null ? 0 : Number(dados.direcao);
            if (!Number.isFinite(direcao) || direcao < 0 || direcao >= 360) throw new AppError('Direção inválida.', 400, 'INVALID_HEADING');

            await atualizarLocalizacaoMotorista(lat,lng,id,socket.usuario.categoria,socket.data.disponivel === true,);
            await pool.query(`
              UPDATE motoristas
              SET online = TRUE,
                  ultima_lat = $1,
                  ultima_lng = $2,
                  ultima_localizacao_em = NOW(),
                  ultima_atividade_em = NOW(),
                  atualizado_em = NOW()
              WHERE id = $3
            `, [lat, lng, id]);
            await redisClient.set(socketKey, socket.id, { EX: env.DRIVER_PRESENCE_TTL_SEC }).catch(() => {});
            await emitToUser('passageiro', ride.passageiro_id, 'motorista_em_movimento', {
              corrida_id: ride.id,
              lat,
              lng,
              direcao,
            });
          } else {
            await atualizarLocalizacaoMotorista(lat,lng,id,socket.usuario.categoria,socket.data.disponivel === true,);
            await pool.query(`
              UPDATE motoristas
              SET online = TRUE,
                  ultima_lat = $1,
                  ultima_lng = $2,
                  ultima_localizacao_em = NOW(),
                  ultima_atividade_em = NOW(),
                  atualizado_em = NOW()
              WHERE id = $3
            `, [lat, lng, id]);
            await redisClient.set(socketKey, socket.id, { EX: env.DRIVER_PRESENCE_TTL_SEC }).catch(() => {});
          }
        }

        if (tipo === 'passageiro') {
          await redisClient.set(`presence:passageiro:${id}`, '1', { EX: env.PASSENGER_PRESENCE_TTL_SEC }).catch(() => {});
          await redisClient.set(socketKey, socket.id, { EX: env.PASSENGER_PRESENCE_TTL_SEC }).catch(() => {});
        }

        if (typeof ack === 'function') ack({ ok: true });
      } catch (error) {
        if (typeof ack === 'function') ack({ ok: false, codigo: error.code || 'LOCATION_UPDATE_FAILED' });
      }
    });

    socket.on('registrar_passageiro', async (dados = {}, ack) => {
      try {
        if (tipo !== 'passageiro' || Number(dados.passageiro_id) !== id) throw new AppError('Identidade inválida.', 403, 'IDENTITY_MISMATCH');
        await redisClient.set(`presence:passageiro:${id}`, '1', { EX: env.PASSENGER_PRESENCE_TTL_SEC });
        if (typeof ack === 'function') ack({ ok: true });
      } catch (error) {
        if (typeof ack === 'function') ack({ ok: false, codigo: error.code || 'IDENTITY_MISMATCH' });
      }
    });

    socket.on('disconnect', async () => {
      try {
        const current = await redisClient.get(socketKey);
        if (current !== socket.id) return;
        await limparPresencaUsuario(tipo, id);
      } catch (_) {}
    });
  })().catch((error) => {
    console.error(JSON.stringify({ level: 'error', event: 'socket_connection_init_failed', message: error.message }));
    socket.disconnect(true);
  });
});

app.use((req, res, next) => next(new AppError('Rota não encontrada.', 404, 'NOT_FOUND')));

app.use((err, req, res, next) => {
  const status = Number(err.statusCode || (err.name === 'ZodError' ? 400 : 500));
  const safeStatus = status >= 400 && status <= 599 ? status : (err instanceof SyntaxError && 'body' in err ? 400 : 500);
  const payload = {
    erro: safeStatus >= 500 ? 'Erro interno no servidor.' : (err instanceof SyntaxError ? 'JSON inválido.' : err.message),
    request_id: req.requestId,
  };
  if (err.code) payload.codigo = err.code;
  if (err.details && safeStatus < 500) payload.detalhes = err.details;
  if (err.name === 'MulterError') payload.codigo = 'UPLOAD_ERROR';

  if (safeStatus >= 500) {
    console.error(JSON.stringify({
      level: 'error',
      event: 'http_error',
      request_id: req.requestId,
      status: safeStatus,
      message: err.message,
      stack: env.isProduction ? undefined : err.stack,
    }));
  }

  if (req.idempotencyRecordId) {
    pool.query(`
      UPDATE movi_idempotency_keys
      SET response_status = $1, response_body = $2, updated_at = NOW()
      WHERE id = $3 AND response_status IS NULL
    `, [safeStatus, JSON.stringify(payload), req.idempotencyRecordId]).catch(() => {});
  }

  if (res.headersSent) return next(err);
  return res.status(safeStatus).json(payload);
});

let stopOfferWorker;
let shuttingDown = false;

async function start() {
  await pool.query('SELECT 1');
  await connectRedis();
  await initRealtimeBus(createSubscriber);
  stopOfferWorker = env.RUN_OFFER_WORKER ? startOfferWorker() : () => {};

  await new Promise((resolve, reject) => {
    httpServer.once('error', reject);
    httpServer.listen(env.PORT, '0.0.0.0', () => resolve());
  });

  console.log(JSON.stringify({
    level: 'info',
    event: 'server_started',
    port: env.PORT,
    env: env.NODE_ENV,
  }));
}

async function shutdown(signal = 'shutdown', exitProcess = true) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(JSON.stringify({ level: 'info', event: 'shutdown_started', signal }));
  stopOfferWorker?.();
  io.close();

  await new Promise((resolve) => {
    if (!httpServer.listening) return resolve();
    httpServer.close(() => resolve());
  });

  try {
    await closeRealtimeBus();
    await closeRedis();
    await pool.closeDatabase();
  } finally {
    if (exitProcess) process.exit(0);
  }
}

if (require.main === module) {
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('uncaughtException', (error) => {
    console.error(JSON.stringify({ level: 'fatal', event: 'uncaught_exception', message: error.message, stack: error.stack }));
    process.exit(1);
  });
  process.on('unhandledRejection', (error) => {
    console.error(JSON.stringify({ level: 'fatal', event: 'unhandled_rejection', message: error?.message || String(error) }));
    process.exit(1);
  });

  start().catch((error) => {
    console.error(JSON.stringify({ level: 'fatal', event: 'startup_failed', message: error.message, stack: error.stack }));
    process.exit(1);
  });
}

module.exports = { app, httpServer, io, start, shutdown };
