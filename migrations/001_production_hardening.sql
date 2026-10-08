-- Movi production hardening: compatible with the current schema.
-- All new columns/tables are additive; existing application data is preserved.

ALTER TABLE motoristas
  ADD COLUMN IF NOT EXISTS status_conta VARCHAR(30) NOT NULL DEFAULT 'ativa',
  ADD COLUMN IF NOT EXISTS ultimo_login_em TIMESTAMPTZ;

ALTER TABLE passageiros
  ADD COLUMN IF NOT EXISTS ultimo_login_em TIMESTAMPTZ;

ALTER TABLE admins
  ADD COLUMN IF NOT EXISTS status VARCHAR(30) NOT NULL DEFAULT 'ativo',
  ADD COLUMN IF NOT EXISTS ultimo_login_em TIMESTAMPTZ;

ALTER TABLE corridas
  ADD COLUMN IF NOT EXISTS categoria VARCHAR(20),
  ADD COLUMN IF NOT EXISTS distancia_km NUMERIC(10,3),
  ADD COLUMN IF NOT EXISTS tempo_minutos INTEGER,
  ADD COLUMN IF NOT EXISTS dinamica_multiplicador NUMERIC(5,2),
  ADD COLUMN IF NOT EXISTS aceita_em TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS iniciada_em TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS finalizada_em TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS cancelada_em TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS cancelada_por_tipo VARCHAR(30),
  ADD COLUMN IF NOT EXISTS cancelada_por_id INTEGER;

ALTER TABLE avaliacoes
  ADD COLUMN IF NOT EXISTS corrida_id INTEGER;

ALTER TABLE denuncias
  ADD COLUMN IF NOT EXISTS status VARCHAR(30) NOT NULL DEFAULT 'em_analise',
  ADD COLUMN IF NOT EXISTS analisada_em TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS analisada_por INTEGER;

CREATE TABLE IF NOT EXISTS movi_refresh_tokens (
  id BIGSERIAL PRIMARY KEY,
  tipo_usuario VARCHAR(30) NOT NULL,
  usuario_id INTEGER NOT NULL,
  token_hash CHAR(64) NOT NULL UNIQUE,
  expira_em TIMESTAMPTZ NOT NULL,
  revogado_em TIMESTAMPTZ,
  ip VARCHAR(64),
  user_agent VARCHAR(500),
  criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


CREATE UNIQUE INDEX IF NOT EXISTS ux_motoristas_email_lower ON motoristas (LOWER(email));
CREATE UNIQUE INDEX IF NOT EXISTS ux_passageiros_email_lower ON passageiros (LOWER(email));
CREATE UNIQUE INDEX IF NOT EXISTS ux_admins_email_lower ON admins (LOWER(email));

CREATE INDEX IF NOT EXISTS idx_movi_refresh_active
  ON movi_refresh_tokens (tipo_usuario, usuario_id, expira_em)
  WHERE revogado_em IS NULL;

CREATE TABLE IF NOT EXISTS movi_idempotency_keys (
  id BIGSERIAL PRIMARY KEY,
  actor_type VARCHAR(30) NOT NULL,
  actor_id INTEGER NOT NULL,
  idempotency_key VARCHAR(200) NOT NULL,
  request_hash CHAR(64) NOT NULL,
  response_status INTEGER,
  response_body JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (actor_type, actor_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS idx_movi_idempotency_created
  ON movi_idempotency_keys (created_at);

CREATE TABLE IF NOT EXISTS movi_audit_logs (
  id BIGSERIAL PRIMARY KEY,
  actor_type VARCHAR(30),
  actor_id INTEGER,
  action VARCHAR(100) NOT NULL,
  target_type VARCHAR(50),
  target_id INTEGER,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_movi_audit_target
  ON movi_audit_logs (target_type, target_id, created_at DESC);

CREATE TABLE IF NOT EXISTS corrida_ofertas (
  id BIGSERIAL PRIMARY KEY,
  corrida_id INTEGER NOT NULL,
  motorista_id INTEGER NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'ofertada',
  distancia_km NUMERIC(10,3),
  oferecida_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expira_em TIMESTAMPTZ NOT NULL,
  respondida_em TIMESTAMPTZ,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (corrida_id, motorista_id)
);

CREATE INDEX IF NOT EXISTS idx_corrida_ofertas_pending
  ON corrida_ofertas (status, expira_em);

CREATE INDEX IF NOT EXISTS idx_corrida_ofertas_corrida
  ON corrida_ofertas (corrida_id, status);

CREATE UNIQUE INDEX IF NOT EXISTS ux_corrida_oferta_ativa_por_corrida
  ON corrida_ofertas (corrida_id)
  WHERE status = 'ofertada';

CREATE UNIQUE INDEX IF NOT EXISTS ux_avaliacao_corrida_avaliador
  ON avaliacoes (corrida_id, avaliador_id)
  WHERE corrida_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_corridas_passageiro_status
  ON corridas (passageiro_id, status, criado_em DESC);

CREATE INDEX IF NOT EXISTS idx_corridas_motorista_status
  ON corridas (motorista_id, status, criado_em DESC);

CREATE INDEX IF NOT EXISTS idx_corridas_status_criado
  ON corridas (status, criado_em DESC);

CREATE INDEX IF NOT EXISTS idx_denuncias_status
  ON denuncias (status, criado_em DESC);
