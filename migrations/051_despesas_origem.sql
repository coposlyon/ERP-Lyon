-- ============================================================
-- 051. DESPESAS_FIXAS: origem do lançamento.
--      De onde a despesa veio: digitada à mão, gerada pelo RH
--      (salário), pelo Financeiro ou por um contrato recorrente.
--      Serve para auditar o que é automático e o que é manual.
-- ============================================================

ALTER TABLE "DESPESAS_FIXAS"
  ADD COLUMN IF NOT EXISTS origin VARCHAR(20) NOT NULL DEFAULT 'manual';

-- Salários já sincronizados do RH passam a ficar marcados como tal
UPDATE "DESPESAS_FIXAS"
   SET origin = 'rh'
 WHERE employee_id IS NOT NULL AND origin = 'manual';

CREATE INDEX IF NOT EXISTS idx_despesas_fixas_origin
  ON "DESPESAS_FIXAS"(tenant_id, origin);

-- PostgREST só enxerga a coluna nova depois de recarregar o cache
NOTIFY pgrst, 'reload schema';

INSERT INTO "_MIGRATIONS" (version, name) VALUES ('051', 'despesas_origem')
ON CONFLICT (version) DO NOTHING;
