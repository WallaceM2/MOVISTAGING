-- Reserve and recover the R$ 3 cancellation credit as a separate MOVI debt.
-- Recovery is recorded independently from the 85/15 ride fare split.
ALTER TABLE corridas
  ADD COLUMN IF NOT EXISTS debito_taxa_cancelamento NUMERIC(12,2) NOT NULL DEFAULT 0;

ALTER TABLE corridas
  ADD CONSTRAINT ck_corrida_debito_taxa_cancelamento CHECK (debito_taxa_cancelamento >= 0);

ALTER TABLE movi_taxas_cancelamento
  ADD COLUMN IF NOT EXISTS corrida_reserva_id INTEGER REFERENCES corridas(id),
  ADD COLUMN IF NOT EXISTS valor_recuperado NUMERIC(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS recuperado_em TIMESTAMPTZ;

ALTER TABLE movi_taxas_cancelamento
  ADD CONSTRAINT ck_taxa_cancelamento_recuperada CHECK (valor_recuperado >= 0 AND valor_recuperado <= valor);

CREATE INDEX IF NOT EXISTS idx_taxa_cancelamento_disponivel
  ON movi_taxas_cancelamento (passageiro_id, criado_em, id)
  WHERE status = 'pendente' AND corrida_reserva_id IS NULL;

CREATE TABLE IF NOT EXISTS movi_taxas_cancelamento_recuperacoes (
  id BIGSERIAL PRIMARY KEY,
  taxa_cancelamento_id BIGINT NOT NULL REFERENCES movi_taxas_cancelamento(id),
  corrida_recuperacao_id INTEGER NOT NULL REFERENCES corridas(id),
  passageiro_id INTEGER NOT NULL REFERENCES passageiros(id),
  motorista_id INTEGER NOT NULL REFERENCES motoristas(id),
  metodo VARCHAR(20) NOT NULL CHECK (metodo IN ('dinheiro','pix','cartao')),
  valor NUMERIC(12,2) NOT NULL CHECK (valor > 0),
  criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (taxa_cancelamento_id, corrida_recuperacao_id)
);

CREATE INDEX IF NOT EXISTS idx_taxa_cancelamento_recuperacao_corrida
  ON movi_taxas_cancelamento_recuperacoes (corrida_recuperacao_id);

CREATE UNIQUE INDEX IF NOT EXISTS ux_transacao_recuperacao_taxa_cancelamento_referencia
  ON transacoes_motoristas (referencia_externa)
  WHERE referencia_externa IS NOT NULL AND tipo = 'debito_recuperacao_taxa_cancelamento';
