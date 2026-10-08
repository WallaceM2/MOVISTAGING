const fs = require('fs');
const path = require('path');
const env = require('./env');

function isSupabaseConnection(connectionString = '') {
  return /(?:^|[.@])(?:[a-z0-9-]+\.)?supabase\.co|pooler\.supabase\.com/i.test(
    connectionString,
  );
}

function resolveCa() {
  if (env.DB_SSL_CA) return env.DB_SSL_CA;

  if (!env.DB_SSL_CA_FILE) return undefined;

  const resolved = path.isAbsolute(env.DB_SSL_CA_FILE)
    ? env.DB_SSL_CA_FILE
    : path.resolve(process.cwd(), env.DB_SSL_CA_FILE);

  if (!fs.existsSync(resolved)) {
    throw new Error(
      `Arquivo de CA do PostgreSQL não encontrado: ${resolved}`,
    );
  }

  return fs.readFileSync(resolved, 'utf8');
}

function shouldUseSsl(connectionString) {
  return Boolean(
    env.DB_SSL ||
    isSupabaseConnection(connectionString) ||
    env.isProduction,
  );
}

function getPgSslConfig(connectionString) {
  if (!shouldUseSsl(connectionString)) {
    return undefined;
  }

  const ca = resolveCa();

  /*
   * DEV/STAGING:
   * mantém TLS, mas permite conexão com Supabase quando a
   * CA não estiver instalada no trust store local.
   *
   * PRODUÇÃO:
   * exige validação do certificado.
   */
  if (env.isProduction) {
    if (!ca && env.DB_SSL_REJECT_UNAUTHORIZED !== true) {
      throw new Error(
        'Produção exige DB_SSL_REJECT_UNAUTHORIZED=true. ' +
        'Configure também DB_SSL_CA ou DB_SSL_CA_FILE.',
      );
    }

    return {
      rejectUnauthorized: true,
      ...(ca ? { ca } : {}),
    };
  }

  return {
    rejectUnauthorized: env.DB_SSL_REJECT_UNAUTHORIZED,
    ...(ca ? { ca } : {}),
  };
}

module.exports = {
  isSupabaseConnection,
  shouldUseSsl,
  getPgSslConfig,
};