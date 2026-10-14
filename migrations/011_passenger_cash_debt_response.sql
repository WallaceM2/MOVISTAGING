-- Passenger acknowledgement and dispute workflow for cash underpayment cases.
-- Expired response windows never turn silence into a payment confirmation.
ALTER TABLE ocorrencias_pagamento
  ADD COLUMN IF NOT EXISTS resposta_passageiro VARCHAR(20) NOT NULL DEFAULT 'pendente',
  ADD COLUMN IF NOT EXISTS prazo_resposta_em TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '30 minutes',
  ADD COLUMN IF NOT EXISTS resposta_em TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS contestacao_descricao TEXT,
  ADD COLUMN IF NOT EXISTS suporte_chamado_id BIGINT REFERENCES movi_suporte_chamados(id);

UPDATE ocorrencias_pagamento
SET prazo_resposta_em = criado_em + INTERVAL '30 minutes'
WHERE resposta_passageiro = 'pendente';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_ocorrencia_resposta_passageiro') THEN
    ALTER TABLE ocorrencias_pagamento ADD CONSTRAINT ck_ocorrencia_resposta_passageiro
      CHECK (resposta_passageiro IN ('pendente','confirmada','contestada','prazo_esgotado')) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_ocorrencia_contestacao_descricao') THEN
    ALTER TABLE ocorrencias_pagamento ADD CONSTRAINT ck_ocorrencia_contestacao_descricao
      CHECK (resposta_passageiro <> 'contestada' OR char_length(trim(contestacao_descricao)) BETWEEN 20 AND 2000) NOT VALID;
  END IF;
END $$;

ALTER TABLE ocorrencias_pagamento VALIDATE CONSTRAINT ck_ocorrencia_resposta_passageiro;
ALTER TABLE ocorrencias_pagamento VALIDATE CONSTRAINT ck_ocorrencia_contestacao_descricao;

CREATE INDEX IF NOT EXISTS idx_ocorrencia_debito_passageiro_resposta
  ON ocorrencias_pagamento (passageiro_id, resposta_passageiro, prazo_resposta_em DESC);
CREATE INDEX IF NOT EXISTS idx_ocorrencia_debito_fila_revisao
  ON ocorrencias_pagamento (status, criado_em ASC)
  WHERE resposta_passageiro = 'contestada';
