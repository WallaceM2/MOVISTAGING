const { Pool } = require('pg');
const env = require('./env');
const { getPgSslConfig } = require('./pgSsl');

const pool = new Pool({
  connectionString: env.DATABASE_URL,

  // Usa exatamente a mesma política SSL do migration runner.
  ssl: getPgSslConfig(env.DATABASE_URL),

  max: env.DB_POOL_MAX,
  min: env.DB_POOL_MIN,

  idleTimeoutMillis: env.DB_IDLE_TIMEOUT_MS,
  connectionTimeoutMillis: env.DB_CONNECTION_TIMEOUT_MS,

  statement_timeout: env.DB_STATEMENT_TIMEOUT_MS,
  query_timeout: env.DB_QUERY_TIMEOUT_MS,

  application_name: env.DB_APPLICATION_NAME,
});

pool.on('error', (error) => {
  console.error(
    JSON.stringify({
      level: 'error',
      event: 'postgres_pool_error',
      message: error.message,
    }),
  );
});

async function checkDatabase() {
  await pool.query('SELECT 1');
  return true;
}

async function closeDatabase() {
  await pool.end();
}

module.exports = pool;
module.exports.checkDatabase = checkDatabase;
module.exports.closeDatabase = closeDatabase;