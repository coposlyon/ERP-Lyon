-- ============================================================
-- 013. FOLHA — tipo de folha (mensal, 13º, férias)
--      Permite 13º e férias no mesmo mês de referência sem
--      sobrescrever o salário mensal.
-- ============================================================
ALTER TABLE "RH_SALARIOS"
  ADD COLUMN IF NOT EXISTS kind TEXT DEFAULT 'mensal';

UPDATE "RH_SALARIOS" SET kind = 'mensal' WHERE kind IS NULL;

DROP INDEX IF EXISTS rh_salarios_uniq_idx;
CREATE UNIQUE INDEX IF NOT EXISTS rh_salarios_uniq_idx
  ON "RH_SALARIOS" (tenant_id, employee_id, reference_month, kind);

INSERT INTO "_MIGRATIONS" (version, name) VALUES ('013', 'folha_kind')
ON CONFLICT (version) DO NOTHING;
