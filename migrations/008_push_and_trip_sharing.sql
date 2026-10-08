CREATE TABLE IF NOT EXISTS movi_push_dispositivos (
  id BIGSERIAL PRIMARY KEY,
  usuario_tipo VARCHAR(20) NOT NULL CHECK (usuario_tipo IN ('passageiro', 'motorista')),
  usuario_id INTEGER NOT NULL,
  app_id VARCHAR(40) NOT NULL CHECK (app_id IN ('movi-passageiro', 'movi-motorista')),
  plataforma VARCHAR(10) NOT NULL CHECK (plataforma IN ('ios', 'android')),
  expo_push_token VARCHAR(255) NOT NULL UNIQUE,
  ativo BOOLEAN NOT NULL DEFAULT TRUE,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_movi_push_dispositivos_usuario
  ON movi_push_dispositivos (usuario_tipo, usuario_id, ativo);

CREATE TABLE IF NOT EXISTS movi_push_recibos (
  id BIGSERIAL PRIMARY KEY,
  dispositivo_id BIGINT NOT NULL REFERENCES movi_push_dispositivos(id) ON DELETE CASCADE,
  recibo_expo_id UUID NOT NULL UNIQUE,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  verificado_em TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_movi_push_recibos_pendentes
  ON movi_push_recibos (criado_em) WHERE verificado_em IS NULL;

CREATE TABLE IF NOT EXISTS movi_compartilhamentos_corrida (
  id BIGSERIAL PRIMARY KEY,
  corrida_id INTEGER NOT NULL REFERENCES corridas(id) ON DELETE CASCADE,
  passageiro_id INTEGER NOT NULL,
  token_hash CHAR(64) NOT NULL UNIQUE,
  expira_em TIMESTAMPTZ NOT NULL,
  revogado_em TIMESTAMPTZ,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_movi_compartilhamento_ativo
  ON movi_compartilhamentos_corrida (corrida_id, expira_em)
  WHERE revogado_em IS NULL;
