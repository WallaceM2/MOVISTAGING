-- Forward-only cash settlement records. These values distinguish accrued
-- driver earnings, passenger debt, recoverable advances and protection exposure.
CREATE TABLE IF NOT EXISTS movi_acertos_dinheiro (
  id BIGSERIAL PRIMARY KEY,
  corrida_id INTEGER NOT NULL UNIQUE REFERENCES corridas(id),
  passageiro_id INTEGER NOT NULL REFERENCES passageiros(id),
  motorista_id INTEGER NOT NULL REFERENCES motoristas(id),
  valor_total NUMERIC(12,2) NOT NULL,
  valor_recebido NUMERIC(12,2) NOT NULL,
  debito_passageiro NUMERIC(12,2) NOT NULL,
  comissao_total NUMERIC(12,2) NOT NULL,
  comissao_alocada_ao_debito NUMERIC(12,2) NOT NULL,
  comissao_coberta_no_dinheiro NUMERIC(12,2) NOT NULL,
  adiantamento_motorista NUMERIC(12,2) NOT NULL,
  limite_protecao_nao_recuperavel NUMERIC(12,2) NOT NULL DEFAULT 20.00,
  exposicao_protecao NUMERIC(12,2) NOT NULL,
  adiantamento_acima_protecao NUMERIC(12,2) NOT NULL,
  valor_recuperado NUMERIC(12,2) NOT NULL DEFAULT 0,
  status_recuperacao VARCHAR(30) NOT NULL DEFAULT 'aguardando_quitacao',
  criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT ck_movi_acerto_dinheiro_status CHECK (
    status_recuperacao IN ('aguardando_quitacao','parcialmente_recuperado','recuperado','em_revisao')
  ),
  CONSTRAINT ck_movi_acerto_dinheiro_values CHECK (
    valor_total > 0 AND valor_recebido >= 0 AND valor_recebido < valor_total AND
    debito_passageiro = valor_total - valor_recebido AND
    comissao_total >= 0 AND comissao_alocada_ao_debito >= 0 AND
    comissao_coberta_no_dinheiro >= 0 AND adiantamento_motorista >= 0 AND
    limite_protecao_nao_recuperavel >= 0 AND exposicao_protecao >= 0 AND
    adiantamento_acima_protecao >= 0 AND valor_recuperado >= 0 AND valor_recuperado <= debito_passageiro AND
    ABS(comissao_alocada_ao_debito + adiantamento_motorista - debito_passageiro) <= 0.01 AND
    ABS(comissao_coberta_no_dinheiro + comissao_alocada_ao_debito - comissao_total) <= 0.01 AND
    ABS(exposicao_protecao + adiantamento_acima_protecao - adiantamento_motorista) <= 0.01
  )
);

CREATE INDEX IF NOT EXISTS idx_movi_acertos_dinheiro_passageiro
  ON movi_acertos_dinheiro (passageiro_id, status_recuperacao, criado_em DESC);
CREATE INDEX IF NOT EXISTS idx_movi_acertos_dinheiro_motorista
  ON movi_acertos_dinheiro (motorista_id, criado_em DESC);
