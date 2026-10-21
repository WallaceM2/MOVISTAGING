CREATE TABLE IF NOT EXISTS movi_recuperacoes_senha (
  id UUID PRIMARY KEY,
  tipo_usuario VARCHAR(20) NOT NULL CHECK (tipo_usuario IN ('passageiro','motorista')),
  usuario_id INTEGER,
  metodo VARCHAR(10) NOT NULL CHECK (metodo IN ('email','sms')),
  destino_hash CHAR(64) NOT NULL,
  codigo_hash CHAR(64) NOT NULL,
  codigo_expira_em TIMESTAMPTZ NOT NULL,
  tentativas INTEGER NOT NULL DEFAULT 0 CHECK (tentativas BETWEEN 0 AND 5),
  verificado_em TIMESTAMPTZ,
  token_recuperacao_hash CHAR(64),
  token_expira_em TIMESTAMPTZ,
  consumido_em TIMESTAMPTZ,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_movi_recuperacoes_senha_expiracao
  ON movi_recuperacoes_senha (criado_em, codigo_expira_em);

CREATE INDEX IF NOT EXISTS idx_movi_recuperacoes_senha_usuario
  ON movi_recuperacoes_senha (tipo_usuario, usuario_id, criado_em DESC)
  WHERE usuario_id IS NOT NULL;
