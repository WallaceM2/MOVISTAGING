const env = require('./config/env');
const pool = require('./config/database');
const { connectRedis, closeRedis } = require('./config/redis');
const { startOfferWorker } = require('./jobs/offerWorker');

let stopWorker;
let shuttingDown = false;

async function start() {
  await pool.query('SELECT 1');
  await connectRedis();
  await require('./jobs/offerWorker').maintenance();
  stopWorker = startOfferWorker();
  console.log(JSON.stringify({ level: 'info', event: 'worker_started', env: env.NODE_ENV }));
}

async function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(JSON.stringify({ level: 'info', event: 'worker_shutdown_started', signal }));
  stopWorker?.();
  try {
    await closeRedis();
    await pool.closeDatabase();
    process.exit(0);
  } catch (error) {
    console.error(JSON.stringify({ level: 'error', event: 'worker_shutdown_failed', message: error.message }));
    process.exit(1);
  }
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('uncaughtException', (error) => { console.error(JSON.stringify({ level: 'fatal', event: 'worker_uncaught_exception', message: error.message })); process.exit(1); });
process.on('unhandledRejection', (error) => { console.error(JSON.stringify({ level: 'fatal', event: 'worker_unhandled_rejection', message: error?.message || String(error) })); process.exit(1); });

start().catch((error) => {
  console.error(JSON.stringify({ level: 'fatal', event: 'worker_startup_failed', message: error.message }));
  process.exit(1);
});
