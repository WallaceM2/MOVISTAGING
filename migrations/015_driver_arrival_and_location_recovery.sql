ALTER TABLE corridas
  ADD COLUMN IF NOT EXISTS motorista_chegou_em TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_corridas_motorista_chegada_ativa
  ON corridas (motorista_id, motorista_chegou_em)
  WHERE status = 'aceita';
