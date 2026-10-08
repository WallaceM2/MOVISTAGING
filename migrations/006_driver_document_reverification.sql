-- MOVI — Invalidate prior driver verification whenever identity/vehicle evidence changes.
-- Additive: prevents a newly uploaded document from inheriting an old review timestamp.

CREATE OR REPLACE FUNCTION movi_validate_driver_approval()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE cnh_ok BOOLEAN;
BEGIN
  -- A changed CNH photo or CNH category invalidates the previous CNH review,
  -- unless this same statement explicitly records a new verification timestamp.
  IF (NEW.cnh_foto_url IS DISTINCT FROM OLD.cnh_foto_url
      OR NEW.categoria_cnh IS DISTINCT FROM OLD.categoria_cnh)
     AND NEW.cnh_verificada_em IS NOT DISTINCT FROM OLD.cnh_verificada_em THEN
    NEW.cnh_verificada_em := NULL;
    IF NEW.status_cadastro = 'aprovado' THEN
      NEW.status_cadastro := 'em_analise';
    END IF;
  END IF;

  -- A changed vehicle document invalidates the previous vehicle review,
  -- unless the same operation explicitly records a fresh verification timestamp.
  IF NEW.documento_veiculo_url IS DISTINCT FROM OLD.documento_veiculo_url
     AND NEW.veiculo_verificado_em IS NOT DISTINCT FROM OLD.veiculo_verificado_em THEN
    NEW.veiculo_verificado_em := NULL;
    IF NEW.status_cadastro = 'aprovado' THEN
      NEW.status_cadastro := 'em_analise';
    END IF;
  END IF;

  IF NEW.status_cadastro = 'aprovado' THEN
    cnh_ok := CASE
      WHEN NEW.categoria = 'moto' THEN UPPER(COALESCE(NEW.categoria_cnh, '')) LIKE '%A%'
      WHEN NEW.categoria = 'carro' THEN UPPER(COALESCE(NEW.categoria_cnh, '')) LIKE '%B%'
      ELSE FALSE
    END;
    IF NOT cnh_ok
       OR NEW.cnh_foto_url IS NULL
       OR NEW.documento_veiculo_url IS NULL
       OR NEW.ear_confirmada IS NOT TRUE
       OR NEW.antecedentes_verificados IS NOT TRUE
       OR NEW.cnh_verificada_em IS NULL
       OR NEW.veiculo_verificado_em IS NULL
       OR NEW.antecedentes_verificados_em IS NULL THEN
      RAISE EXCEPTION 'DRIVER_APPROVAL_REQUIREMENTS_NOT_MET';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_movi_driver_approval ON motoristas;
CREATE TRIGGER trg_movi_driver_approval
BEFORE INSERT OR UPDATE OF status_cadastro, categoria, categoria_cnh, cnh_foto_url,
  documento_veiculo_url, ear_confirmada, antecedentes_verificados,
  cnh_verificada_em, veiculo_verificado_em, antecedentes_verificados_em
ON motoristas
FOR EACH ROW EXECUTE FUNCTION movi_validate_driver_approval();
