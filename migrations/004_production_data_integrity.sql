-- MOVI — Canonical data integrity and pricing audit layer.
-- This migration is additive and keeps compatibility with legacy rows.

ALTER TABLE corridas
  ADD COLUMN IF NOT EXISTS area_operacao_id BIGINT,
  ADD COLUMN IF NOT EXISTS tarifa_id BIGINT,
  ADD COLUMN IF NOT EXISTS tarifa_versao VARCHAR(40),
  ADD COLUMN IF NOT EXISTS tarifa_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS valor_base_cliente NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS valor_dinamica_cliente NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS valor_taxa_app NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS valor_repasse_motorista NUMERIC(12,2);

ALTER TABLE motoristas
  ADD COLUMN IF NOT EXISTS area_operacao_principal_id BIGINT,
  ADD COLUMN IF NOT EXISTS ultima_atividade_em TIMESTAMPTZ;

ALTER TABLE movi_tarifas
  ADD COLUMN IF NOT EXISTS versao VARCHAR(40) NOT NULL DEFAULT 'v1',
  ADD COLUMN IF NOT EXISTS descricao VARCHAR(300),
  ADD COLUMN IF NOT EXISTS observacao_interna VARCHAR(1000);

ALTER TABLE movi_veiculos
  ADD COLUMN IF NOT EXISTS placa_normalizada VARCHAR(10),
  ADD COLUMN IF NOT EXISTS crlv_verificado_em TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS seguro_verificado_em TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS observacao_verificacao VARCHAR(1000);

ALTER TABLE movi_pagamentos
  ADD COLUMN IF NOT EXISTS autorizado_em TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS falhou_em TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS estornado_em TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS erro_provedor VARCHAR(500);

ALTER TABLE movi_lancamentos_financeiros
  ADD COLUMN IF NOT EXISTS saldo_anterior NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS saldo_posterior NUMERIC(12,2);

UPDATE movi_veiculos
SET placa_normalizada = UPPER(REPLACE(REPLACE(placa, '-', ''), ' ', ''))
WHERE placa_normalizada IS NULL;

UPDATE corridas
SET valor_base_cliente = COALESCE(valor_base_cliente, valor),
    valor_taxa_app = COALESCE(valor_taxa_app, ganho_app),
    valor_repasse_motorista = COALESCE(valor_repasse_motorista, ganho_motorista),
    valor_dinamica_cliente = COALESCE(valor_dinamica_cliente, valor),
    tarifa_snapshot = CASE WHEN tarifa_snapshot = '{}'::jsonb THEN jsonb_build_object(
      'fonte', 'legacy',
      'comissao_app_pct', COALESCE(percentual_comissao_app, 15),
      'repasse_motorista_pct', COALESCE(percentual_repasse_motorista, 85)
    ) ELSE tarifa_snapshot END
WHERE valor_base_cliente IS NULL
   OR valor_taxa_app IS NULL
   OR valor_repasse_motorista IS NULL
   OR valor_dinamica_cliente IS NULL
   OR tarifa_snapshot = '{}'::jsonb;

CREATE INDEX IF NOT EXISTS idx_corridas_area_status
  ON corridas (area_operacao_id, status, criado_em DESC);

CREATE INDEX IF NOT EXISTS idx_corridas_tarifa
  ON corridas (tarifa_id, criado_em DESC)
  WHERE tarifa_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_motoristas_area_categoria
  ON motoristas (area_operacao_principal_id, categoria, status_cadastro, status_conta);

CREATE UNIQUE INDEX IF NOT EXISTS ux_movi_veiculos_placa_normalizada
  ON movi_veiculos (placa_normalizada)
  WHERE placa_normalizada IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_movi_veiculos_verificacao
  ON movi_veiculos (status, ativo, crlv_verificado_em, seguro_verificado_em);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_corridas_area_operacao') THEN
    ALTER TABLE corridas
      ADD CONSTRAINT fk_corridas_area_operacao
      FOREIGN KEY (area_operacao_id) REFERENCES movi_areas_operacao(id) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_corridas_tarifa') THEN
    ALTER TABLE corridas
      ADD CONSTRAINT fk_corridas_tarifa
      FOREIGN KEY (tarifa_id) REFERENCES movi_tarifas(id) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_motoristas_area_operacao') THEN
    ALTER TABLE motoristas
      ADD CONSTRAINT fk_motoristas_area_operacao
      FOREIGN KEY (area_operacao_principal_id) REFERENCES movi_areas_operacao(id) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_movi_veiculo_motorista') THEN
    ALTER TABLE movi_veiculos
      ADD CONSTRAINT fk_movi_veiculo_motorista
      FOREIGN KEY (motorista_id) REFERENCES motoristas(id) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_movi_pagamento_corrida') THEN
    ALTER TABLE movi_pagamentos
      ADD CONSTRAINT fk_movi_pagamento_corrida
      FOREIGN KEY (corrida_id) REFERENCES corridas(id) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_movi_lancamento_pagamento') THEN
    ALTER TABLE movi_lancamentos_financeiros
      ADD CONSTRAINT fk_movi_lancamento_pagamento
      FOREIGN KEY (pagamento_id) REFERENCES movi_pagamentos(id) NOT VALID;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_movi_areas_status') THEN
    ALTER TABLE movi_areas_operacao ADD CONSTRAINT ck_movi_areas_status
      CHECK (status IN ('planejada','ativa','pausada','encerrada')) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_movi_tarifa_dates') THEN
    ALTER TABLE movi_tarifas ADD CONSTRAINT ck_movi_tarifa_dates
      CHECK (vigencia_fim IS NULL OR vigencia_fim > vigencia_inicio) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_movi_payment_status') THEN
    ALTER TABLE movi_pagamentos ADD CONSTRAINT ck_movi_payment_status
      CHECK (status IN ('pendente','autorizado','pago','falhou','cancelado','estornado','reembolsado','parcial')) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_movi_payment_values') THEN
    ALTER TABLE movi_pagamentos ADD CONSTRAINT ck_movi_payment_values
      CHECK (valor >= 0 AND valor_pago >= 0 AND valor_pago <= valor + 0.01) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_movi_vehicles_status') THEN
    ALTER TABLE movi_veiculos ADD CONSTRAINT ck_movi_vehicles_status
      CHECK (status IN ('em_analise','aprovado','reprovado','suspenso','inativo')) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_movi_payout_values') THEN
    ALTER TABLE movi_saques_motoristas ADD CONSTRAINT ck_movi_payout_values
      CHECK (valor_solicitado > 0 AND (valor_aprovado IS NULL OR valor_aprovado > 0)) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_corridas_amounts_nonnegative') THEN
    ALTER TABLE corridas ADD CONSTRAINT ck_corridas_amounts_nonnegative CHECK (
      valor >= 0 AND ganho_app >= 0 AND ganho_motorista >= 0 AND
      (valor_recebido_motorista IS NULL OR valor_recebido_motorista >= 0)
    ) NOT VALID;
  END IF;
END $$;

-- Keep application-level split and stored amounts synchronized for future writes.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_corridas_financial_snapshot') THEN
    ALTER TABLE corridas ADD CONSTRAINT ck_corridas_financial_snapshot CHECK (
      (valor_taxa_app IS NULL OR ROUND(valor_taxa_app::numeric, 2) = ROUND(ganho_app::numeric, 2)) AND
      (valor_repasse_motorista IS NULL OR ROUND(valor_repasse_motorista::numeric, 2) = ROUND(ganho_motorista::numeric, 2)) AND
      (valor_base_cliente IS NULL OR valor_base_cliente >= 0) AND
      (valor_dinamica_cliente IS NULL OR valor_dinamica_cliente >= 0)
    ) NOT VALID;
  END IF;
END $$;

-- User-level consent records should never be mutable into another document/version.
CREATE INDEX IF NOT EXISTS idx_movi_aceites_documento
  ON movi_aceites_termos (documento_tipo, versao, aceito_em DESC);

-- Financial references must be globally unique when present.
CREATE UNIQUE INDEX IF NOT EXISTS ux_movi_lancamento_corrida_tipo
  ON movi_lancamentos_financeiros (corrida_id, tipo)
  WHERE corrida_id IS NOT NULL;

-- This trigger keeps placa_normalizada deterministic.
CREATE OR REPLACE FUNCTION movi_normalize_vehicle_plate()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.placa_normalizada := UPPER(REPLACE(REPLACE(NEW.placa, '-', ''), ' ', ''));
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_movi_normalize_vehicle_plate ON movi_veiculos;
CREATE TRIGGER trg_movi_normalize_vehicle_plate
BEFORE INSERT OR UPDATE OF placa ON movi_veiculos
FOR EACH ROW EXECUTE FUNCTION movi_normalize_vehicle_plate();

-- Runtime category isolation: a vehicle and its driver's approved category must match.
CREATE OR REPLACE FUNCTION movi_validate_vehicle_driver_category()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE driver_category VARCHAR(20);
BEGIN
  SELECT categoria INTO driver_category FROM motoristas WHERE id = NEW.motorista_id;
  IF driver_category IS NULL OR driver_category <> NEW.categoria THEN
    RAISE EXCEPTION 'VEHICLE_DRIVER_CATEGORY_MISMATCH';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_movi_vehicle_driver_category ON movi_veiculos;
CREATE TRIGGER trg_movi_vehicle_driver_category
BEFORE INSERT OR UPDATE OF motorista_id, categoria ON movi_veiculos
FOR EACH ROW EXECUTE FUNCTION movi_validate_vehicle_driver_category();

-- Approval must be backed by reviewed identity/vehicle evidence.
CREATE OR REPLACE FUNCTION movi_validate_driver_approval()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE cnh_ok BOOLEAN;
BEGIN
  IF NEW.status_cadastro = 'aprovado' THEN
    cnh_ok := CASE
      WHEN NEW.categoria = 'moto' THEN UPPER(COALESCE(NEW.categoria_cnh, '')) LIKE '%A%'
      WHEN NEW.categoria = 'carro' THEN UPPER(COALESCE(NEW.categoria_cnh, '')) LIKE '%B%'
      ELSE FALSE
    END;
    IF NOT cnh_ok
       OR NEW.cnh_foto_url IS NULL
       OR NEW.documento_veiculo_url IS NULL
       OR NEW.ear_confirmada IS NOT TRUE
       OR NEW.antecedentes_verificados IS NOT TRUE
       OR NEW.cnh_verificada_em IS NULL
       OR NEW.veiculo_verificado_em IS NULL
       OR NEW.antecedentes_verificados_em IS NULL THEN
      RAISE EXCEPTION 'DRIVER_APPROVAL_REQUIREMENTS_NOT_MET';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_movi_driver_approval ON motoristas;
CREATE TRIGGER trg_movi_driver_approval
BEFORE INSERT OR UPDATE OF status_cadastro, categoria, categoria_cnh, cnh_foto_url,
  documento_veiculo_url, ear_confirmada, antecedentes_verificados,
  cnh_verificada_em, veiculo_verificado_em, antecedentes_verificados_em
ON motoristas
FOR EACH ROW EXECUTE FUNCTION movi_validate_driver_approval();

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_motoristas_cnh_category_value') THEN
    ALTER TABLE motoristas ADD CONSTRAINT ck_motoristas_cnh_category_value
      CHECK (categoria_cnh IS NULL OR UPPER(categoria_cnh) IN ('A','B','AB','ACC')) NOT VALID;
  END IF;
END $$;
