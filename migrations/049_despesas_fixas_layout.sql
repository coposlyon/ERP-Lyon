-- ============================================================
-- 049. DESPESAS_FIXAS: novo layout do Rateio de Custos.
--      Colunas para categoria (grupo), centro de custo,
--      periodicidade (mensal/anual) e valor original.
--      Despesa anual: amount = original/12 (rateio automático).
-- ============================================================

ALTER TABLE "DESPESAS_FIXAS" ADD COLUMN IF NOT EXISTS category VARCHAR(60);
ALTER TABLE "DESPESAS_FIXAS" ADD COLUMN IF NOT EXISTS cost_center VARCHAR(60);
ALTER TABLE "DESPESAS_FIXAS" ADD COLUMN IF NOT EXISTS periodicity VARCHAR(10) NOT NULL DEFAULT 'mensal';
ALTER TABLE "DESPESAS_FIXAS" ADD COLUMN IF NOT EXISTS original_amount DECIMAL(15,2);
ALTER TABLE "DESPESAS_FIXAS" ADD COLUMN IF NOT EXISTS due_month SMALLINT CHECK (due_month BETWEEN 1 AND 12);

-- Valor original = valor atual para as despesas já cadastradas (mensais)
UPDATE "DESPESAS_FIXAS" SET original_amount = amount WHERE original_amount IS NULL;

-- Categoriza o que já existe pelos nomes mais comuns
UPDATE "DESPESAS_FIXAS" SET category = CASE
  WHEN employee_id IS NOT NULL THEN 'RH'
  WHEN name ILIKE '%marketing%' OR name ILIKE '%instagram%' OR name ILIKE '%anúncio%' THEN 'Marketing'
  WHEN name ILIKE '%sistema%' OR name ILIKE '%erp%' OR name ILIKE '%host%' OR name ILIKE '%google%' OR name ILIKE '%software%' OR name ILIKE '%internet%' THEN 'Tecnologia'
  WHEN name ILIKE '%frete%' OR name ILIKE '%transporte%' OR name ILIKE '%combust%' THEN 'Logística'
  WHEN name ILIKE '%banco%' OR name ILIKE '%tarifa%' OR name ILIKE '%juros%' THEN 'Financeiro'
  WHEN name ILIKE '%colaborador%' OR name ILIKE '%funcionário%' OR name ILIKE '%pró-labore%' OR name ILIKE '%salário%' THEN 'RH'
  ELSE 'Administrativa'
END
WHERE category IS NULL;

-- PostgREST só enxerga colunas novas depois de recarregar o cache
NOTIFY pgrst, 'reload schema';

INSERT INTO "_MIGRATIONS" (version, name) VALUES ('049', 'despesas_fixas_layout')
ON CONFLICT (version) DO NOTHING;
