-- Passenger cancellation after driver acceptance: R$ 3.00 is owed by the
-- passenger after 180 seconds. The driver receives an immediate internal
-- wallet credit funded by MOVI; this is not a bank transfer.
CREATE TABLE IF NOT EXISTS movi_taxas_cancelamento (
  id BIGSERIAL PRIMARY KEY,
  corrida_id INTEGER NOT NULL UNIQUE REFERENCES corridas(id),
  passageiro_id INTEGER NOT NULL REFERENCES passageiros(id),
  motorista_id INTEGER NOT NULL REFERENCES motoristas(id),
  valor NUMERIC(12,2) NOT NULL DEFAULT 3.00,
  aceita_em TIMESTAMPTZ NOT NULL,
  cancelada_em TIMESTAMPTZ NOT NULL,
  segundos_apos_aceite INTEGER NOT NULL,
  status VARCHAR(24) NOT NULL DEFAULT 'pendente',
  repasse_status VARCHAR(24) NOT NULL DEFAULT 'creditado_carteira',
  contestacao_descricao TEXT,
  suporte_chamado_id BIGINT REFERENCES movi_suporte_chamados(id),
  liquidado_em TIMESTAMPTZ,
  creditado_carteira_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT ck_movi_taxa_cancelamento_valor CHECK (valor = 3.00),
  CONSTRAINT ck_movi_taxa_cancelamento_tempo CHECK (segundos_apos_aceite >= 180 AND cancelada_em >= aceita_em),
  CONSTRAINT ck_movi_taxa_cancelamento_status CHECK (status IN ('pendente','contestada','liquidada','cancelada')),
  CONSTRAINT ck_movi_taxa_cancelamento_repasse CHECK (repasse_status IN ('creditado_carteira','liquidado'))
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_transacao_taxa_cancelamento_referencia
  ON transacoes_motoristas (referencia_externa)
  WHERE referencia_externa IS NOT NULL AND tipo = 'credito_taxa_cancelamento';

CREATE INDEX IF NOT EXISTS idx_movi_taxas_cancelamento_passageiro
  ON movi_taxas_cancelamento (passageiro_id, status, criado_em DESC);
CREATE INDEX IF NOT EXISTS idx_movi_taxas_cancelamento_motorista
  ON movi_taxas_cancelamento (motorista_id, repasse_status, criado_em DESC);
