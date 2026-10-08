-- Movi canonical business model: pricing, money rules, ride integrity and safety metadata.

-- Correct the historical typo without losing existing payment occurrences.
DO $$
BEGIN
  IF to_regclass('public.ocorrecias_pagamento') IS NOT NULL
     AND to_regclass('public.ocorrencias_pagamento') IS NULL THEN
    ALTER TABLE public.ocorrecias_pagamento RENAME TO ocorrencias_pagamento;
  END IF;
END $$;

ALTER TABLE motoristas
  ADD COLUMN IF NOT EXISTS ear_confirmada BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS antecedentes_verificados BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS online BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS disponivel BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS ultima_lat NUMERIC(10,7),
  ADD COLUMN IF NOT EXISTS ultima_lng NUMERIC(10,7),
  ADD COLUMN IF NOT EXISTS ultima_localizacao_em TIMESTAMPTZ;

ALTER TABLE passageiros
  ADD COLUMN IF NOT EXISTS conta_verificada BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS debito_pendente NUMERIC(12,2) NOT NULL DEFAULT 0;

ALTER TABLE corridas
  ADD COLUMN IF NOT EXISTS solicitada_em TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS percentual_comissao_app NUMERIC(5,2) NOT NULL DEFAULT 15.00,
  ADD COLUMN IF NOT EXISTS percentual_repasse_motorista NUMERIC(5,2) NOT NULL DEFAULT 85.00,
  ADD COLUMN IF NOT EXISTS motivo_cancelamento VARCHAR(300),
  ADD COLUMN IF NOT EXISTS payment_provider VARCHAR(50),
  ADD COLUMN IF NOT EXISTS payment_external_id VARCHAR(200),
  ADD COLUMN IF NOT EXISTS codigo_embarque CHAR(6),
  ADD COLUMN IF NOT EXISTS distancia_ate_motorista_km NUMERIC(10,3);

UPDATE corridas
SET solicitada_em = COALESCE(solicitada_em, criado_em),
    percentual_comissao_app = COALESCE(percentual_comissao_app, 15.00),
    percentual_repasse_motorista = COALESCE(percentual_repasse_motorista, 85.00);

ALTER TABLE corridas
  ALTER COLUMN solicitada_em SET DEFAULT NOW();

ALTER TABLE avaliacoes
  ADD COLUMN IF NOT EXISTS corrida_id INTEGER;

ALTER TABLE denuncias
  ADD COLUMN IF NOT EXISTS corrida_id INTEGER,
  ADD COLUMN IF NOT EXISTS status VARCHAR(30) NOT NULL DEFAULT 'em_analise',
  ADD COLUMN IF NOT EXISTS analisada_em TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS analisada_por INTEGER;

ALTER TABLE transacoes_motoristas
  ADD COLUMN IF NOT EXISTS referencia_externa VARCHAR(200),
  ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE ocorrencias_pagamento
  ADD COLUMN IF NOT EXISTS status VARCHAR(30) NOT NULL DEFAULT 'aberta',
  ADD COLUMN IF NOT EXISTS resolvido_em TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS movi_areas_operacao (
  id BIGSERIAL PRIMARY KEY,
  nome VARCHAR(150) NOT NULL,
  uf CHAR(2) NOT NULL,
  codigo_ibge INTEGER,
  municipio VARCHAR(150),
  status VARCHAR(30) NOT NULL DEFAULT 'planejada',
  permite_carro BOOLEAN NOT NULL DEFAULT TRUE,
  permite_moto BOOLEAN NOT NULL DEFAULT FALSE,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (uf, codigo_ibge)
);

CREATE TABLE IF NOT EXISTS movi_tarifas (
  id BIGSERIAL PRIMARY KEY,
  area_operacao_id BIGINT REFERENCES movi_areas_operacao(id),
  categoria VARCHAR(20) NOT NULL,
  moeda CHAR(3) NOT NULL DEFAULT 'BRL',
  taxa_base NUMERIC(12,2) NOT NULL DEFAULT 0,
  valor_por_km_cliente NUMERIC(12,4) NOT NULL,
  valor_por_minuto_cliente NUMERIC(12,4) NOT NULL DEFAULT 0,
  tarifa_minima_cliente NUMERIC(12,2) NOT NULL,
  piso_liquido_motorista_km NUMERIC(12,4) NOT NULL,
  piso_liquido_motorista_meta_km NUMERIC(12,4),
  comissao_app_pct NUMERIC(5,2) NOT NULL DEFAULT 15.00,
  repasse_motorista_pct NUMERIC(5,2) NOT NULL DEFAULT 85.00,
  multiplicador_min NUMERIC(5,2) NOT NULL DEFAULT 1.00,
  multiplicador_max NUMERIC(5,2) NOT NULL DEFAULT 3.00,
  ativa BOOLEAN NOT NULL DEFAULT TRUE,
  vigencia_inicio TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  vigencia_fim TIMESTAMPTZ,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_movi_tarifa_global_ativa
  ON movi_tarifas (categoria)
  WHERE area_operacao_id IS NULL AND ativa = TRUE AND vigencia_fim IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS ux_movi_tarifa_area_ativa
  ON movi_tarifas (area_operacao_id, categoria)
  WHERE area_operacao_id IS NOT NULL AND ativa = TRUE AND vigencia_fim IS NULL;

INSERT INTO movi_tarifas (
  categoria, taxa_base, valor_por_km_cliente, valor_por_minuto_cliente,
  tarifa_minima_cliente, piso_liquido_motorista_km, piso_liquido_motorista_meta_km,
  comissao_app_pct, repasse_motorista_pct, multiplicador_min, multiplicador_max
)
VALUES
  ('moto', 2.00, ROUND((1.00 / 0.85)::numeric, 4), 0.15, 5.50, 1.00, 1.00, 15.00, 85.00, 1.00, 3.00),
  ('carro', 4.00, ROUND((1.50 / 0.85)::numeric, 4), 0.25, 9.00, 1.50, 2.00, 15.00, 85.00, 1.00, 3.00)
ON CONFLICT DO NOTHING;

CREATE TABLE IF NOT EXISTS movi_pagamentos (
  id BIGSERIAL PRIMARY KEY,
  corrida_id INTEGER NOT NULL UNIQUE,
  passageiro_id INTEGER NOT NULL,
  motorista_id INTEGER,
  provider VARCHAR(50),
  external_id VARCHAR(200),
  metodo VARCHAR(30) NOT NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'pendente',
  valor NUMERIC(12,2) NOT NULL,
  valor_pago NUMERIC(12,2) NOT NULL DEFAULT 0,
  moeda CHAR(3) NOT NULL DEFAULT 'BRL',
  idempotency_key VARCHAR(200),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  pago_em TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS movi_contatos_confianca (
  id BIGSERIAL PRIMARY KEY,
  usuario_tipo VARCHAR(30) NOT NULL,
  usuario_id INTEGER NOT NULL,
  nome VARCHAR(120) NOT NULL,
  telefone VARCHAR(30) NOT NULL,
  ativo BOOLEAN NOT NULL DEFAULT TRUE,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS movi_eventos_seguranca (
  id BIGSERIAL PRIMARY KEY,
  corrida_id INTEGER,
  usuario_tipo VARCHAR(30),
  usuario_id INTEGER,
  tipo VARCHAR(60) NOT NULL,
  severidade VARCHAR(20) NOT NULL DEFAULT 'media',
  descricao VARCHAR(2000),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_movi_eventos_seguranca_corrida
  ON movi_eventos_seguranca (corrida_id, criado_em DESC);

CREATE INDEX IF NOT EXISTS idx_movi_eventos_seguranca_usuario
  ON movi_eventos_seguranca (usuario_tipo, usuario_id, criado_em DESC);

CREATE INDEX IF NOT EXISTS idx_movi_pagamentos_status
  ON movi_pagamentos (status, criado_em DESC);

CREATE INDEX IF NOT EXISTS idx_movi_pagamentos_external
  ON movi_pagamentos (provider, external_id)
  WHERE external_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_corridas_categoria_status
  ON corridas (categoria, status, criado_em DESC);

CREATE UNIQUE INDEX IF NOT EXISTS ux_corrida_ativa_passageiro
  ON corridas (passageiro_id)
  WHERE status IN ('solicitada','aceita','em_andamento');

CREATE UNIQUE INDEX IF NOT EXISTS ux_corrida_ativa_motorista
  ON corridas (motorista_id)
  WHERE motorista_id IS NOT NULL AND status IN ('aceita','em_andamento');

CREATE UNIQUE INDEX IF NOT EXISTS ux_avaliacao_corrida_avaliador_canonica
  ON avaliacoes (corrida_id, avaliador_id)
  WHERE corrida_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS ux_transacao_taxa_corrida
  ON transacoes_motoristas (corrida_id, tipo)
  WHERE corrida_id IS NOT NULL AND tipo = 'debito_taxa_app';

CREATE INDEX IF NOT EXISTS idx_motoristas_categoria_status
  ON motoristas (categoria, status_cadastro, status_conta);

CREATE INDEX IF NOT EXISTS idx_motoristas_disponibilidade
  ON motoristas (categoria, online, disponivel)
  WHERE status_cadastro = 'aprovado' AND status_conta = 'ativa';

-- New rows and future updates are constrained even when legacy data is retained.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_corridas_categoria') THEN
    ALTER TABLE corridas ADD CONSTRAINT ck_corridas_categoria CHECK (categoria IN ('carro','moto')) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_corridas_payment') THEN
    ALTER TABLE corridas ADD CONSTRAINT ck_corridas_payment CHECK (forma_pagamento IN ('dinheiro','cartao','pix')) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_corridas_commission_split') THEN
    ALTER TABLE corridas ADD CONSTRAINT ck_corridas_commission_split CHECK (
      percentual_comissao_app >= 0 AND percentual_repasse_motorista >= 0 AND
      ROUND((percentual_comissao_app + percentual_repasse_motorista)::numeric, 2) = 100.00 AND
      ROUND((ganho_app + ganho_motorista)::numeric, 2) = ROUND(valor::numeric, 2) AND
      ABS(ganho_app - ROUND((valor * percentual_comissao_app / 100)::numeric, 2)) <= 0.01
    ) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_movi_tarifa_split') THEN
    ALTER TABLE movi_tarifas ADD CONSTRAINT ck_movi_tarifa_split CHECK (
      comissao_app_pct >= 0 AND repasse_motorista_pct >= 0 AND
      ROUND((comissao_app_pct + repasse_motorista_pct)::numeric, 2) = 100.00
    );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_movi_tarifa_category') THEN
    ALTER TABLE movi_tarifas ADD CONSTRAINT ck_movi_tarifa_category CHECK (categoria IN ('carro','moto'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_movi_tarifa_values') THEN
    ALTER TABLE movi_tarifas ADD CONSTRAINT ck_movi_tarifa_values CHECK (
      taxa_base >= 0 AND valor_por_km_cliente > 0 AND valor_por_minuto_cliente >= 0 AND
      tarifa_minima_cliente > 0 AND piso_liquido_motorista_km > 0 AND
      multiplicador_min >= 1 AND multiplicador_max >= multiplicador_min
    );
  END IF;
END $$;

-- Prevent a ride from being assigned to a driver with the wrong category.
CREATE OR REPLACE FUNCTION movi_validate_ride_driver_category()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE driver_category VARCHAR(20);
BEGIN
  IF NEW.motorista_id IS NOT NULL AND NEW.categoria IS NOT NULL THEN
    SELECT categoria INTO driver_category FROM motoristas WHERE id = NEW.motorista_id;
    IF driver_category IS NULL OR driver_category <> NEW.categoria THEN
      RAISE EXCEPTION 'DRIVER_CATEGORY_MISMATCH';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_movi_ride_driver_category ON corridas;
CREATE TRIGGER trg_movi_ride_driver_category
BEFORE INSERT OR UPDATE OF motorista_id, categoria ON corridas
FOR EACH ROW EXECUTE FUNCTION movi_validate_ride_driver_category();

-- Canonical financial occurrence table name; legacy table is no longer referenced by the application.
CREATE INDEX IF NOT EXISTS idx_ocorrencias_pagamento_status
  ON ocorrencias_pagamento (status, criado_em DESC);

-- Identity uniqueness for compliance and fraud prevention.
CREATE UNIQUE INDEX IF NOT EXISTS ux_motoristas_cpf
  ON motoristas (cpf)
  WHERE cpf IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS ux_motoristas_cnh
  ON motoristas (cnh)
  WHERE cnh IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS ux_passageiros_cpf
  ON passageiros (cpf)
  WHERE cpf IS NOT NULL;

-- Stronger referential integrity for new writes; NOT VALID keeps the migration compatible with legacy data.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_corridas_passageiro') THEN
    ALTER TABLE corridas ADD CONSTRAINT fk_corridas_passageiro FOREIGN KEY (passageiro_id) REFERENCES passageiros(id) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_corridas_motorista') THEN
    ALTER TABLE corridas ADD CONSTRAINT fk_corridas_motorista FOREIGN KEY (motorista_id) REFERENCES motoristas(id) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_avaliacoes_corrida') THEN
    ALTER TABLE avaliacoes ADD CONSTRAINT fk_avaliacoes_corrida FOREIGN KEY (corrida_id) REFERENCES corridas(id) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_ofertas_corrida') THEN
    ALTER TABLE corrida_ofertas ADD CONSTRAINT fk_ofertas_corrida FOREIGN KEY (corrida_id) REFERENCES corridas(id) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_ofertas_motorista') THEN
    ALTER TABLE corrida_ofertas ADD CONSTRAINT fk_ofertas_motorista FOREIGN KEY (motorista_id) REFERENCES motoristas(id) NOT VALID;
  END IF;
END $$;

-- Basic domain checks for financial and operational values.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_motoristas_rating') THEN
    ALTER TABLE motoristas ADD CONSTRAINT ck_motoristas_rating CHECK (nota_media >= 0 AND nota_media <= 5 AND total_avaliacoes >= 0) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_passageiros_rating') THEN
    ALTER TABLE passageiros ADD CONSTRAINT ck_passageiros_rating CHECK (nota_media >= 0 AND nota_media <= 5 AND total_avaliacoes >= 0) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_passageiros_debito') THEN
    ALTER TABLE passageiros ADD CONSTRAINT ck_passageiros_debito CHECK (debito_pendente >= 0) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_motoristas_saldo') THEN
    ALTER TABLE motoristas ADD CONSTRAINT ck_motoristas_saldo CHECK (saldo_carteira >= -1000000) NOT VALID;
  END IF;
END $$;

ALTER TABLE motoristas
  ADD COLUMN IF NOT EXISTS categoria_cnh VARCHAR(10),
  ADD COLUMN IF NOT EXISTS cnh_verificada_em TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS veiculo_verificado_em TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS antecedentes_verificados_em TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_motoristas_cnh_categoria
  ON motoristas (categoria_cnh);

-- The Movi economic split is fixed at 15/85 for the current product policy.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_movi_tarifa_fixed_split') THEN
    ALTER TABLE movi_tarifas ADD CONSTRAINT ck_movi_tarifa_fixed_split CHECK (
      comissao_app_pct = 15.00 AND repasse_motorista_pct = 85.00
    );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_corridas_fixed_split') THEN
    ALTER TABLE corridas ADD CONSTRAINT ck_corridas_fixed_split CHECK (
      percentual_comissao_app = 15.00 AND percentual_repasse_motorista = 85.00
    ) NOT VALID;
  END IF;
END $$;
