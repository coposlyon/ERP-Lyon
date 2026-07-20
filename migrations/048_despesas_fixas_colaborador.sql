-- ============================================================
-- 048. DESPESAS_FIXAS ganha vínculo com o colaborador.
--      Ao cadastrar/editar um colaborador (RH), o salário vira
--      automaticamente uma despesa fixa na categoria
--      "Funcionários" do Rateio — sem digitar duas vezes.
--      Excluir o colaborador remove a despesa (CASCADE).
-- ============================================================

ALTER TABLE "DESPESAS_FIXAS" ADD COLUMN IF NOT EXISTS employee_id UUID REFERENCES "CLIENTES"(id) ON DELETE CASCADE;

-- 1 despesa de salário por colaborador
CREATE UNIQUE INDEX IF NOT EXISTS uq_despesas_fixas_employee
  ON "DESPESAS_FIXAS"(tenant_id, employee_id)
  WHERE employee_id IS NOT NULL;

-- PostgREST só enxerga colunas novas depois de recarregar o cache
NOTIFY pgrst, 'reload schema';

INSERT INTO "_MIGRATIONS" (version, name) VALUES ('048', 'despesas_fixas_colaborador')
ON CONFLICT (version) DO NOTHING;
