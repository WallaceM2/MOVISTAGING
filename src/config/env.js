require('dotenv').config();

const NODE_ENV = process.env.NODE_ENV || 'development';
const isProduction = NODE_ENV === 'production';
const SERVICE_KIND = process.env.SERVICE_KIND || 'web';

function required(name) {
  const value = process.env[name];

  if (!value && isProduction) {
    throw new Error(`Variável de ambiente obrigatória ausente: ${name}`);
  }

  return value;
}

function nonNegativeNumber(
  name,
  fallback,
  { max = Number.MAX_SAFE_INTEGER } = {},
) {
  const raw = process.env[name];
  const parsed = Number(raw ?? fallback);

  if (!Number.isFinite(parsed) || parsed < 0 || parsed > max) {
    if (isProduction && raw != null) {
      throw new Error(`Variável ${name} inválida.`);
    }

    return fallback;
  }

  return parsed;
}

function csv(value) {
  return String(value || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function positiveNumber(
  name,
  fallback,
  {
    integer = false,
    min = 0,
    max = Number.MAX_SAFE_INTEGER,
  } = {},
) {
  const raw = process.env[name];

  const parsed = integer
    ? Number.parseInt(String(raw ?? fallback), 10)
    : Number(raw ?? fallback);

  if (!Number.isFinite(parsed) || parsed < min || parsed > max) {
    if (isProduction && raw != null) {
      throw new Error(`Variável ${name} inválida.`);
    }

    return fallback;
  }

  return integer ? Math.trunc(parsed) : parsed;
}

const env = Object.freeze({
  NODE_ENV,
  isProduction,
  SERVICE_KIND,

  PORT: positiveNumber('PORT', 3000, {
    integer: true,
    min: 1,
    max: 65535,
  }),

  TRUST_PROXY: process.env.TRUST_PROXY || '1',

  // PostgreSQL
  DATABASE_URL: required('DATABASE_URL'),

  MIGRATIONS_DATABASE_URL:
    process.env.MIGRATIONS_DATABASE_URL ||
    process.env.DATABASE_URL,

  DB_POOL_MAX: positiveNumber('DB_POOL_MAX', 10, {
    integer: true,
    min: 1,
    max: 100,
  }),

  DB_POOL_MIN: positiveNumber('DB_POOL_MIN', 0, {
    integer: true,
    min: 0,
    max: 100,
  }),

  DB_IDLE_TIMEOUT_MS: positiveNumber(
    'DB_IDLE_TIMEOUT_MS',
    30_000,
    {
      integer: true,
      min: 1_000,
      max: 300_000,
    },
  ),

  DB_CONNECTION_TIMEOUT_MS: positiveNumber(
    'DB_CONNECTION_TIMEOUT_MS',
    10_000,
    {
      integer: true,
      min: 1_000,
      max: 60_000,
    },
  ),

  DB_STATEMENT_TIMEOUT_MS: positiveNumber(
    'DB_STATEMENT_TIMEOUT_MS',
    15_000,
    {
      integer: true,
      min: 1_000,
      max: 120_000,
    },
  ),

  DB_QUERY_TIMEOUT_MS: positiveNumber(
    'DB_QUERY_TIMEOUT_MS',
    15_000,
    {
      integer: true,
      min: 1_000,
      max: 120_000,
    },
  ),

  /*
   * SSL do PostgreSQL
   *
   * DEV/STAGING:
   * DB_SSL=true
   * DB_SSL_REJECT_UNAUTHORIZED=false
   *
   * PRODUÇÃO:
   * DB_SSL=true
   * DB_SSL_REJECT_UNAUTHORIZED=true
   * + DB_SSL_CA ou DB_SSL_CA_FILE
   */
  DB_SSL:
    String(process.env.DB_SSL || '')
      .toLowerCase() === 'true',

  DB_SSL_REJECT_UNAUTHORIZED:
    String(
      process.env.DB_SSL_REJECT_UNAUTHORIZED ??
        (isProduction ? 'true' : 'false'),
    ).toLowerCase() === 'true',

  DB_SSL_CA:
    process.env.DB_SSL_CA || '',

  DB_SSL_CA_FILE:
    process.env.DB_SSL_CA_FILE || '',

  DB_APPLICATION_NAME:
    process.env.DB_APPLICATION_NAME || 'movi-api',

  // Redis / realtime
  REDIS_URL:
    process.env.REDIS_URL ||
    (isProduction
      ? required('REDIS_URL')
      : 'redis://localhost:6379'),

  DRIVER_PRESENCE_TTL_SEC: positiveNumber(
    'DRIVER_PRESENCE_TTL_SEC',
    60,
    {
      integer: true,
      min: 10,
      max: 600,
    },
  ),

  PASSENGER_PRESENCE_TTL_SEC: positiveNumber(
    'PASSENGER_PRESENCE_TTL_SEC',
    60,
    {
      integer: true,
      min: 10,
      max: 600,
    },
  ),

  DEMAND_TTL_SEC: positiveNumber(
    'DEMAND_TTL_SEC',
    90,
    {
      integer: true,
      min: 10,
      max: 900,
    },
  ),

  LOCATION_UPDATE_INTERVAL_MS: positiveNumber(
    'LOCATION_UPDATE_INTERVAL_MS',
    1000,
    {
      integer: true,
      min: 250,
      max: 60_000,
    },
  ),

  DRIVER_SEARCH_RADIUS_KM: positiveNumber(
    'DRIVER_SEARCH_RADIUS_KM',
    5,
    {
      min: 0.1,
      max: 50,
    },
  ),

  OFFER_TIMEOUT_SEC: positiveNumber(
    'OFFER_TIMEOUT_SEC',
    15,
    {
      integer: true,
      min: 5,
      max: 120,
    },
  ),

  RIDE_REQUEST_TIMEOUT_SEC: positiveNumber(
    'RIDE_REQUEST_TIMEOUT_SEC',
    60,
    {
      integer: true,
      min: 15,
      max: 600,
    },
  ),

  DISPATCH_INTERVAL_MS: positiveNumber(
    'DISPATCH_INTERVAL_MS',
    2500,
    {
      integer: true,
      min: 500,
      max: 60_000,
    },
  ),

  RUN_OFFER_WORKER:
    String(
      process.env.RUN_OFFER_WORKER ?? 'true',
    ).toLowerCase() === 'true',

  // Auth
  JWT_SECRET: process.env.JWT_SECRET || '',
  JWT_ACCESS_TTL:
    process.env.JWT_ACCESS_TTL || '15m',

  JWT_REFRESH_TTL_DAYS: positiveNumber(
    'JWT_REFRESH_TTL_DAYS',
    30,
    {
      integer: true,
      min: 1,
      max: 180,
    },
  ),

  // Maps / API
  MAPBOX_API_KEY:
    process.env.MAPBOX_API_KEY || '',

  CORS_ORIGINS: csv(
    process.env.CORS_ORIGINS,
  ),

  // Supabase
  SUPABASE_URL:
    process.env.SUPABASE_URL || '',

  SUPABASE_SERVICE_ROLE_KEY:
    process.env.SUPABASE_SERVICE_ROLE_KEY || '',

  SUPABASE_STORAGE_BUCKET:
    process.env.SUPABASE_STORAGE_BUCKET ||
    'movi-private',

  // Produto
  MINIMUM_AGE: positiveNumber(
    'MINIMUM_AGE',
    18,
    {
      integer: true,
      min: 18,
      max: 100,
    },
  ),

  REQUEST_BODY_LIMIT:
    process.env.REQUEST_BODY_LIMIT || '32kb',

  PAYMENT_PROVIDER:
    process.env.PAYMENT_PROVIDER || 'none',

  SHARE_PUBLIC_BASE_URL:
    process.env.SHARE_PUBLIC_BASE_URL || '',

  // Tarifas Moto
  FARE_MOTO_BASE:
    nonNegativeNumber('FARE_MOTO_BASE', 2),

  FARE_MOTO_KM:
    nonNegativeNumber(
      'FARE_MOTO_KM',
      1 / 0.85,
    ),

  FARE_MOTO_DRIVER_FLOOR_KM:
    nonNegativeNumber(
      'FARE_MOTO_DRIVER_FLOOR_KM',
      1,
    ),

  FARE_MOTO_MIN:
    nonNegativeNumber(
      'FARE_MOTO_MIN',
      0.15,
    ),

  FARE_MOTO_MINIMUM:
    nonNegativeNumber(
      'FARE_MOTO_MINIMUM',
      5.5,
    ),

  FARE_MOTO_COMMISSION:
    nonNegativeNumber(
      'FARE_MOTO_COMMISSION',
      0.15,
      {
        max: 1,
      },
    ),

  // Tarifas Carro
  FARE_CAR_BASE:
    nonNegativeNumber(
      'FARE_CAR_BASE',
      4,
    ),

  FARE_CAR_KM:
    nonNegativeNumber(
      'FARE_CAR_KM',
      1.5 / 0.85,
    ),

  FARE_CAR_DRIVER_FLOOR_KM:
    nonNegativeNumber(
      'FARE_CAR_DRIVER_FLOOR_KM',
      1.5,
    ),

  FARE_CAR_DRIVER_TARGET_KM:
    nonNegativeNumber(
      'FARE_CAR_DRIVER_TARGET_KM',
      2.0,
    ),

  FARE_CAR_MIN:
    nonNegativeNumber(
      'FARE_CAR_MIN',
      0.25,
    ),

  FARE_CAR_MINIMUM:
    nonNegativeNumber(
      'FARE_CAR_MINIMUM',
      9,
    ),

  FARE_CAR_COMMISSION:
    nonNegativeNumber(
      'FARE_CAR_COMMISSION',
      0.15,
      {
        max: 1,
      },
    ),

  // Documentos legais
  TERMS_PASSENGER_VERSION:
    process.env.TERMS_PASSENGER_VERSION ||
    '1.0',

  TERMS_DRIVER_VERSION:
    process.env.TERMS_DRIVER_VERSION ||
    '1.0',

  PRIVACY_VERSION:
    process.env.PRIVACY_VERSION ||
    '1.0',

  SAFETY_POLICY_VERSION:
    process.env.SAFETY_POLICY_VERSION ||
    '1.0',

  // Segurança / operação
  AUTO_SUSPEND_ON_SERIOUS_REPORT:
    String(
      process.env.AUTO_SUSPEND_ON_SERIOUS_REPORT ||
        'false',
    ).toLowerCase() === 'true',

  RATE_LIMIT_WINDOW_MS:
    positiveNumber(
      'RATE_LIMIT_WINDOW_MS',
      15 * 60 * 1000,
      {
        integer: true,
        min: 1_000,
        max: 24 * 60 * 60 * 1000,
      },
    ),

  RATE_LIMIT_MAX:
    positiveNumber(
      'RATE_LIMIT_MAX',
      300,
      {
        integer: true,
        min: 10,
        max: 10_000,
      },
    ),

  AUTH_RATE_LIMIT_MAX:
    positiveNumber(
      'AUTH_RATE_LIMIT_MAX',
      10,
      {
        integer: true,
        min: 3,
        max: 100,
      },
    ),
});

if (env.DB_POOL_MIN > env.DB_POOL_MAX) {
  throw new Error(
    'DB_POOL_MIN não pode ser maior que DB_POOL_MAX.',
  );
}

if (isProduction && env.SERVICE_KIND === 'web') {
  if (env.JWT_SECRET.length < 64) {
    throw new Error(
      'JWT_SECRET deve ter pelo menos 64 caracteres em produção.',
    );
  }

  if (!env.SUPABASE_URL) {
    throw new Error(
      'SUPABASE_URL deve ser configurada em produção.',
    );
  }

  if (!env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error(
      'SUPABASE_SERVICE_ROLE_KEY deve ser configurada em produção.',
    );
  }

  if (!env.MAPBOX_API_KEY) {
    throw new Error(
      'MAPBOX_API_KEY deve ser configurada em produção.',
    );
  }

  if (
    !env.CORS_ORIGINS.length ||
    env.CORS_ORIGINS.some(
      (origin) =>
        origin.includes('seudominio.com'),
    )
  ) {
    throw new Error(
      'CORS_ORIGINS deve conter origens reais e explícitas em produção.',
    );
  }

  if (!env.DB_SSL) {
    throw new Error(
      'DB_SSL deve estar habilitado em produção.',
    );
  }

  if (!env.DB_SSL_REJECT_UNAUTHORIZED) {
    throw new Error(
      'DB_SSL_REJECT_UNAUTHORIZED deve ser true em produção.',
    );
  }

  if (!env.DB_SSL_CA && !env.DB_SSL_CA_FILE) {
    throw new Error(
      'Produção exige DB_SSL_CA ou DB_SSL_CA_FILE para validação do PostgreSQL.',
    );
  }
}

module.exports = env;
