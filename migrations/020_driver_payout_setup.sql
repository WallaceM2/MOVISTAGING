-- Encrypted payout destination and hashed withdrawal PIN for driver self-service.
CREATE TABLE IF NOT EXISTS movi_contas_recebimento_motoristas (
  id BIGSERIAL PRIMARY KEY,
  motorista_id INTEGER NOT NULL UNIQUE REFERENCES motoristas(id) ON DELETE CASCADE,
  tipo_chave_pix VARCHAR(20) NOT NULL CHECK (tipo_chave_pix IN ('cpf','email','telefone','aleatoria')),
  destino_cifrado TEXT NOT NULL,
  chave_pix_mascarada VARCHAR(120) NOT NULL,
  conta_mascarada VARCHAR(80),
  senha_saque_hash TEXT,
  falhas_pin SMALLINT NOT NULL DEFAULT 0 CHECK (falhas_pin BETWEEN 0 AND 5),
  pin_bloqueado_ate TIMESTAMPTZ,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE movi_saques_motoristas
  ADD COLUMN IF NOT EXISTS conta_recebimento_id BIGINT REFERENCES movi_contas_recebimento_motoristas(id),
  ADD COLUMN IF NOT EXISTS idempotency_key VARCHAR(128);

CREATE UNIQUE INDEX IF NOT EXISTS ux_movi_saques_idempotency
  ON movi_saques_motoristas (motorista_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS ix_movi_recebimento_pin_lock
  ON movi_contas_recebimento_motoristas (pin_bloqueado_ate)
  WHERE pin_bloqueado_ate IS NOT NULL;
