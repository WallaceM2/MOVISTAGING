-- Secure seller OAuth links and idempotent Mercado Pago webhook receipt.
-- Payment processing remains disabled unless the application is explicitly
-- configured after sandbox validation.

ALTER TABLE movi_pagamentos
  ADD COLUMN IF NOT EXISTS tarifa_base NUMERIC(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS taxa_processamento NUMERIC(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS comissao_marketplace NUMERIC(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS versao_calculo_financeiro VARCHAR(80);

UPDATE movi_pagamentos p
SET tarifa_base = p.valor,
    taxa_processamento = 0,
    comissao_marketplace = LEAST(p.valor, c.ganho_app),
    versao_calculo_financeiro = COALESCE(p.metadata->>'versao_calculo_financeiro', 'legacy')
FROM corridas c
WHERE c.id = p.corrida_id AND p.versao_calculo_financeiro IS NULL;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_movi_payment_snapshot_values') THEN
    ALTER TABLE movi_pagamentos ADD CONSTRAINT ck_movi_payment_snapshot_values
      CHECK (
        tarifa_base >= 0 AND taxa_processamento >= 0 AND comissao_marketplace >= 0
        AND ABS(valor - tarifa_base - taxa_processamento) <= 0.01
        AND comissao_marketplace <= tarifa_base + 0.01
      ) NOT VALID;
  END IF;
END $$;

ALTER TABLE movi_pagamentos VALIDATE CONSTRAINT ck_movi_payment_snapshot_values;

CREATE TABLE IF NOT EXISTS movi_mp_oauth_states (
  state_hash CHAR(64) PRIMARY KEY,
  motorista_id INTEGER NOT NULL REFERENCES motoristas(id) ON DELETE CASCADE,
  code_verifier_encrypted TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  consumido_em TIMESTAMPTZ,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_movi_mp_oauth_states_expiry
  ON movi_mp_oauth_states (expires_at);

CREATE TABLE IF NOT EXISTS movi_mp_motorista_tokens (
  motorista_id INTEGER PRIMARY KEY REFERENCES motoristas(id) ON DELETE CASCADE,
  mp_user_id BIGINT NOT NULL,
  access_token_encrypted TEXT NOT NULL,
  refresh_token_encrypted TEXT NOT NULL,
  public_key VARCHAR(200),
  ambiente VARCHAR(20) NOT NULL CHECK (ambiente IN ('sandbox','production')),
  expires_at TIMESTAMPTZ NOT NULL,
  conectado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  revogado_em TIMESTAMPTZ,
  UNIQUE (ambiente, mp_user_id)
);

CREATE TABLE IF NOT EXISTS movi_mp_webhook_events (
  id BIGSERIAL PRIMARY KEY,
  ambiente VARCHAR(20) NOT NULL CHECK (ambiente IN ('sandbox','production')),
  payment_external_id VARCHAR(200) NOT NULL,
  action VARCHAR(100) NOT NULL,
  request_id VARCHAR(200),
  payload_hash CHAR(64) NOT NULL,
  recebido_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  processado_em TIMESTAMPTZ,
  resultado VARCHAR(30) NOT NULL DEFAULT 'recebido'
    CHECK (resultado IN ('recebido','processado','ignorado','falhou','requer_revisao')),
  UNIQUE (ambiente, payload_hash)
);

CREATE INDEX IF NOT EXISTS idx_movi_mp_webhook_pending
  ON movi_mp_webhook_events (recebido_em)
  WHERE processado_em IS NULL;

CREATE INDEX IF NOT EXISTS idx_movi_mp_webhook_payment
  ON movi_mp_webhook_events (ambiente, payment_external_id, recebido_em DESC);
