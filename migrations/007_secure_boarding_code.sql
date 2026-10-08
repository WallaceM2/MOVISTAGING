ALTER TABLE corridas
  ADD COLUMN IF NOT EXISTS codigo_embarque_tentativas SMALLINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS codigo_embarque_bloqueado_ate TIMESTAMPTZ;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'corridas_codigo_embarque_tentativas_range'
  ) THEN
    ALTER TABLE corridas
      ADD CONSTRAINT corridas_codigo_embarque_tentativas_range
      CHECK (codigo_embarque_tentativas BETWEEN 0 AND 5);
  END IF;
END $$;
