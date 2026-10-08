-- Runtime hardening for the production V3 foundation.
-- Additive only: keeps existing data and strengthens future writes.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

ALTER TABLE movi_refresh_tokens
  ADD COLUMN IF NOT EXISTS familia_id UUID,
  ADD COLUMN IF NOT EXISTS rotacao_numero INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS revogado_motivo VARCHAR(80);

UPDATE movi_refresh_tokens
SET familia_id = gen_random_uuid()
WHERE familia_id IS NULL;

ALTER TABLE movi_refresh_tokens
  ALTER COLUMN familia_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_movi_refresh_family
  ON movi_refresh_tokens (familia_id, rotacao_numero DESC);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_movi_refresh_type') THEN
    ALTER TABLE movi_refresh_tokens ADD CONSTRAINT ck_movi_refresh_type
      CHECK (tipo_usuario IN ('motorista','passageiro','admin')) NOT VALID;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_movi_refresh_rotation') THEN
    ALTER TABLE movi_refresh_tokens ADD CONSTRAINT ck_movi_refresh_rotation
      CHECK (rotacao_numero >= 0) NOT VALID;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_movi_idempotency_actor') THEN
    ALTER TABLE movi_idempotency_keys ADD CONSTRAINT ck_movi_idempotency_actor
      CHECK (actor_type IN ('motorista','passageiro','admin','anonymous') AND actor_id >= 0) NOT VALID;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_corridas_status') THEN
    ALTER TABLE corridas ADD CONSTRAINT ck_corridas_status
      CHECK (status IN ('solicitada','aceita','em_andamento','concluida','cancelada','expirada')) NOT VALID;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_corridas_payment_status') THEN
    ALTER TABLE corridas ADD CONSTRAINT ck_corridas_payment_status
      CHECK (status_pagamento IN ('pendente','pago','parcial','nao_pago','cancelado','estornado','reembolsado')) NOT VALID;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_motoristas_category') THEN
    ALTER TABLE motoristas ADD CONSTRAINT ck_motoristas_category
      CHECK (categoria IN ('moto','carro')) NOT VALID;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_motoristas_account_status') THEN
    ALTER TABLE motoristas ADD CONSTRAINT ck_motoristas_account_status
      CHECK (status_conta IN ('ativa','suspensa','banida','bloqueada')) NOT VALID;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_passageiros_account_status') THEN
    ALTER TABLE passageiros ADD CONSTRAINT ck_passageiros_account_status
      CHECK (status_conta IN ('ativa','suspensa','banida','bloqueada')) NOT VALID;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_motoristas_last_location
  ON motoristas (categoria, status_cadastro, status_conta, ultima_localizacao_em DESC)
  WHERE ultima_lat IS NOT NULL AND ultima_lng IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_movi_idempotency_active
  ON movi_idempotency_keys (actor_type, actor_id, updated_at DESC)
  WHERE response_status IS NULL;

CREATE INDEX IF NOT EXISTS idx_corrida_ofertas_driver_pending
  ON corrida_ofertas (motorista_id, status, expira_em)
  WHERE status = 'ofertada';

-- Financial ledger rows are immutable references once created.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_movi_ledger_amount') THEN
    ALTER TABLE movi_lancamentos_financeiros ADD CONSTRAINT ck_movi_ledger_amount
      CHECK (valor <> 0) NOT VALID;
  END IF;
END $$;
