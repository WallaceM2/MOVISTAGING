-- Controlled passenger compliments for driver ratings and efficient recent-rating reads.
ALTER TABLE avaliacoes
  ADD COLUMN IF NOT EXISTS tags TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_avaliacoes_driver_tags') THEN
    ALTER TABLE avaliacoes
      ADD CONSTRAINT ck_avaliacoes_driver_tags
      CHECK (tags <@ ARRAY[
        'atencioso',
        'veiculo_limpo',
        'boa_rota',
        'atendimento_excelente',
        'viagem_confortavel',
        'direcao_segura'
      ]::TEXT[]) NOT VALID;
  END IF;
END $$;

ALTER TABLE avaliacoes VALIDATE CONSTRAINT ck_avaliacoes_driver_tags;

CREATE INDEX IF NOT EXISTS ix_avaliacoes_avaliado_recent
  ON avaliacoes (avaliado_tipo, avaliado_id, criado_em DESC, id DESC);

CREATE INDEX IF NOT EXISTS ix_corrida_ofertas_driver_response_recent
  ON corrida_ofertas (motorista_id, (COALESCE(respondida_em, expira_em)) DESC, id DESC)
  WHERE status IN ('aceita', 'recusada', 'expirada');

CREATE INDEX IF NOT EXISTS ix_corridas_driver_acceptance_recent
  ON corridas (motorista_id, aceita_em DESC, id DESC)
  WHERE status = 'concluida' OR (status = 'cancelada' AND cancelada_por_tipo = 'motorista');
