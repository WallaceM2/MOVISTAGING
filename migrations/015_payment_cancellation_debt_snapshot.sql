-- Preserve cancellation-debt collections as a separate part of the charge.
-- The ride fare (and marketplace commission) must not include a recovered
-- cancellation fee, while the payment total must include it.

ALTER TABLE movi_pagamentos
  ADD COLUMN IF NOT EXISTS debito_taxa_cancelamento NUMERIC(12,2) NOT NULL DEFAULT 0;

UPDATE movi_pagamentos p
SET tarifa_base = c.valor,
    debito_taxa_cancelamento = GREATEST(0, p.valor - c.valor - p.taxa_processamento),
    comissao_marketplace = LEAST(c.valor, c.ganho_app),
    versao_calculo_financeiro = COALESCE(p.versao_calculo_financeiro, 'legacy-v2')
FROM corridas c
WHERE c.id = p.corrida_id;

ALTER TABLE movi_pagamentos
  DROP CONSTRAINT IF EXISTS ck_movi_payment_snapshot_values;

ALTER TABLE movi_pagamentos
  ADD CONSTRAINT ck_movi_payment_snapshot_values
  CHECK (
    tarifa_base >= 0
    AND taxa_processamento >= 0
    AND debito_taxa_cancelamento >= 0
    AND comissao_marketplace >= 0
    AND ABS(valor - tarifa_base - taxa_processamento - debito_taxa_cancelamento) <= 0.01
    AND comissao_marketplace <= tarifa_base + 0.01
  ) NOT VALID;

ALTER TABLE movi_pagamentos
  VALIDATE CONSTRAINT ck_movi_payment_snapshot_values;
