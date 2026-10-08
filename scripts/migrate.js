const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { Client } = require('pg');
const env = require('../src/config/env');
const { getPgSslConfig } = require('../src/config/pgSsl');

function buildClientConfig(databaseUrl) {
  if (!databaseUrl) {
    throw new Error('MIGRATIONS_DATABASE_URL não configurada.');
  }

  const parsed = new URL(databaseUrl);

  return {
    host: parsed.hostname,
    port: parsed.port ? Number(parsed.port) : 5432,
    database: decodeURIComponent(parsed.pathname.replace(/^\//, '')),
    user: decodeURIComponent(parsed.username),
    password: decodeURIComponent(parsed.password),
    ssl: getPgSslConfig(databaseUrl),
    connectionTimeoutMillis: env.DB_CONNECTION_TIMEOUT_MS,
    statement_timeout: env.DB_STATEMENT_TIMEOUT_MS,
    query_timeout: env.DB_QUERY_TIMEOUT_MS,
    application_name: `${env.DB_APPLICATION_NAME}-migrate`,
  };
}

async function main() {
  const client = new Client(
    buildClientConfig(env.MIGRATIONS_DATABASE_URL)
  );

  await client.connect();

  try {
    await client.query('SELECT pg_advisory_lock(73849201)');

    await client.query(`
      CREATE TABLE IF NOT EXISTS movi_schema_migrations (
        filename TEXT PRIMARY KEY,
        checksum CHAR(64),
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await client.query(`
      ALTER TABLE movi_schema_migrations
      ADD COLUMN IF NOT EXISTS checksum CHAR(64)
    `);

    const migrationsDir = path.join(__dirname, '..', 'migrations');

    const files = fs
      .readdirSync(migrationsDir)
      .filter((file) => file.endsWith('.sql'))
      .sort();

    for (const filename of files) {
      const filePath = path.join(migrationsDir, filename);
      const sql = fs.readFileSync(filePath, 'utf8');

      const checksum = crypto
        .createHash('sha256')
        .update(sql)
        .digest('hex');

      const exists = await client.query(
        `
          SELECT checksum
          FROM movi_schema_migrations
          WHERE filename = $1
        `,
        [filename],
      );

      if (exists.rows.length) {
        const appliedChecksum = exists.rows[0].checksum;

        if (appliedChecksum && appliedChecksum !== checksum) {
          throw new Error(
            `Migration alterada após aplicação: ${filename}`
          );
        }

        if (!appliedChecksum) {
          await client.query(
            `
              UPDATE movi_schema_migrations
              SET checksum = $1
              WHERE filename = $2
            `,
            [checksum, filename],
          );
        }

        continue;
      }

      await client.query('BEGIN');

      try {
        await client.query(sql);

        await client.query(
          `
            INSERT INTO movi_schema_migrations
              (filename, checksum)
            VALUES
              ($1, $2)
          `,
          [filename, checksum],
        );

        await client.query('COMMIT');

        console.log(`Migration aplicada: ${filename}`);
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      }
    }
  } finally {
    await client
      .query('SELECT pg_advisory_unlock(73849201)')
      .catch(() => {});

    await client.end();
  }
}

main().catch((error) => {
  console.error(
    JSON.stringify({
      level: 'error',
      event: 'migration_failed',
      message: error.message,
    }),
  );

  process.exit(1);
});