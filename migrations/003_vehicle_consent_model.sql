-- Movi operational model for vehicle identity and legal-consent evidence.

ALTER TABLE motoristas
  ADD COLUMN IF NOT EXISTS veiculo_ativo_id BIGINT;

CREATE TABLE IF NOT EXISTS movi_veiculos (
  id BIGSERIAL PRIMARY KEY,
  motorista_id INTEGER NOT NULL,
  categoria VARCHAR(20) NOT NULL,
  placa VARCHAR(10) NOT NULL,
  marca VARCHAR(80),
  modelo VARCHAR(100),
  cor VARCHAR(50),
  ano_modelo SMALLINT,
  crlv_storage_path TEXT,
  seguro_storage_path TEXT,
  status VARCHAR(30) NOT NULL DEFAULT 'em_analise',
  ativo BOOLEAN NOT NULL DEFAULT TRUE,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_movi_veiculos_placa
  ON movi_veiculos (UPPER(REPLACE(placa, '-', '')));
CREATE UNIQUE INDEX IF NOT EXISTS ux_movi_veiculo_ativo_motorista
  ON movi_veiculos (motorista_id)
  WHERE ativo = TRUE;
CREATE INDEX IF NOT EXISTS idx_movi_veiculos_motorista
  ON movi_veiculos (motorista_id, status, ativo);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_motoristas_veiculo_ativo') THEN
    ALTER TABLE motoristas ADD CONSTRAINT fk_motoristas_veiculo_ativo FOREIGN KEY (veiculo_ativo_id) REFERENCES movi_veiculos(id) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_movi_veiculos_categoria') THEN
    ALTER TABLE movi_veiculos ADD CONSTRAINT ck_movi_veiculos_categoria CHECK (categoria IN ('carro','moto'));
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS movi_aceites_termos (
  id BIGSERIAL PRIMARY KEY,
  usuario_tipo VARCHAR(30) NOT NULL,
  usuario_id INTEGER NOT NULL,
  documento_tipo VARCHAR(60) NOT NULL,
  versao VARCHAR(30) NOT NULL,
  conteudo_hash CHAR(64),
  ip VARCHAR(64),
  user_agent VARCHAR(500),
  aceito_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (usuario_tipo, usuario_id, documento_tipo, versao)
);

CREATE INDEX IF NOT EXISTS idx_movi_aceites_usuario
  ON movi_aceites_termos (usuario_tipo, usuario_id, aceito_em DESC);

CREATE TABLE IF NOT EXISTS movi_solicitacoes_titular (
  id BIGSERIAL PRIMARY KEY,
  usuario_tipo VARCHAR(30) NOT NULL,
  usuario_id INTEGER NOT NULL,
  tipo_solicitacao VARCHAR(50) NOT NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'recebida',
  descricao VARCHAR(2000),
  criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  concluido_em TIMESTAMPTZ,
  observacao_interna VARCHAR(2000)
);

CREATE INDEX IF NOT EXISTS idx_movi_solicitacoes_titular
  ON movi_solicitacoes_titular (usuario_tipo, usuario_id, status, criado_em DESC);

CREATE TABLE IF NOT EXISTS movi_incidentes_seguranca (
  id BIGSERIAL PRIMARY KEY,
  tipo VARCHAR(80) NOT NULL,
  severidade VARCHAR(20) NOT NULL DEFAULT 'alta',
  status VARCHAR(30) NOT NULL DEFAULT 'aberto',
  detectado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  comunicado_em TIMESTAMPTZ,
  encerrado_em TIMESTAMPTZ,
  descricao VARCHAR(3000),
  dados_afetados JSONB NOT NULL DEFAULT '{}'::jsonb,
  plano_acao JSONB NOT NULL DEFAULT '{}'::jsonb,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_movi_incidentes_status
  ON movi_incidentes_seguranca (status, detectado_em DESC);

CREATE TABLE IF NOT EXISTS movi_lancamentos_financeiros (
  id BIGSERIAL PRIMARY KEY,
  corrida_id INTEGER,
  pagamento_id BIGINT,
  motorista_id INTEGER,
  passageiro_id INTEGER,
  tipo VARCHAR(50) NOT NULL,
  valor NUMERIC(12,2) NOT NULL,
  moeda CHAR(3) NOT NULL DEFAULT 'BRL',
  referencia_unica VARCHAR(200),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_movi_lancamento_referencia
  ON movi_lancamentos_financeiros (referencia_unica)
  WHERE referencia_unica IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_movi_lancamentos_corrida
  ON movi_lancamentos_financeiros (corrida_id, criado_em DESC);
CREATE INDEX IF NOT EXISTS idx_movi_lancamentos_motorista
  ON movi_lancamentos_financeiros (motorista_id, criado_em DESC);

CREATE TABLE IF NOT EXISTS movi_saques_motoristas (
  id BIGSERIAL PRIMARY KEY,
  motorista_id INTEGER NOT NULL,
  valor_solicitado NUMERIC(12,2) NOT NULL,
  valor_aprovado NUMERIC(12,2),
  status VARCHAR(30) NOT NULL DEFAULT 'solicitado',
  provider VARCHAR(50),
  external_id VARCHAR(200),
  motivo_recusa VARCHAR(500),
  solicitado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  processado_em TIMESTAMPTZ
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_movi_saques_external
  ON movi_saques_motoristas (provider, external_id)
  WHERE provider IS NOT NULL AND external_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_movi_saques_motorista_status
  ON movi_saques_motoristas (motorista_id, status, solicitado_em DESC);
