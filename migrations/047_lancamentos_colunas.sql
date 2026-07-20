-- ============================================================
-- 047. LANCAMENTOS: garantir colunas usadas pela Central de
--      Contas ("Gerar contas do mês"). A tabela base não tinha
--      user_id, e chart_account_id / cost_center_id dependiam
--      do APLICAR_MELHORIAS.sql ter rodado. Sem elas o insert
--      falha com "Could not find the column ... in the schema
--      cache" e o botão devolve erro 500.
--      Tudo IF NOT EXISTS: seguro rodar mesmo se já existirem.
-- ============================================================

-- Sem FK em chart/cost: PLANO_CONTAS e CENTROS_CUSTO podem não
-- existir ainda (mesmo padrão de DESPESAS_FIXAS, que também não usa FK)
ALTER TABLE "LANCAMENTOS" ADD COLUMN IF NOT EXISTS user_id UUID;
ALTER TABLE "LANCAMENTOS" ADD COLUMN IF NOT EXISTS chart_account_id UUID;
ALTER TABLE "LANCAMENTOS" ADD COLUMN IF NOT EXISTS cost_center_id UUID;

-- Reafirma as colunas da 040 (caso ela não tenha sido aplicada)
ALTER TABLE "LANCAMENTOS" ADD COLUMN IF NOT EXISTS fixed_expense_id UUID REFERENCES "DESPESAS_FIXAS"(id) ON DELETE SET NULL;
ALTER TABLE "LANCAMENTOS" ADD COLUMN IF NOT EXISTS competence_month DATE;

-- PostgREST só enxerga colunas novas depois de recarregar o cache
NOTIFY pgrst, 'reload schema';

INSERT INTO "_MIGRATIONS" (version, name) VALUES ('047', 'lancamentos_colunas')
ON CONFLICT (version) DO NOTHING;
