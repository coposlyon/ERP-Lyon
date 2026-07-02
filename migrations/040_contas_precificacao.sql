-- ============================================================
-- 040. CENTRAL DE CONTAS + PRECIFICAÇÃO
--      1) DESPESAS_FIXAS: despesas recorrentes (aluguel, luz,
--         internet...) que geram contas a pagar todo mês.
--      2) LANCAMENTOS ganha vínculo com a despesa fixa e o mês
--         de competência (geração idempotente: nunca duplica).
--      3) Índices para a visão mensal da Central de Contas.
-- ============================================================

CREATE TABLE IF NOT EXISTS "DESPESAS_FIXAS" (
  id               UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id        UUID NOT NULL REFERENCES "EMPRESAS"(id) ON DELETE CASCADE,
  name             VARCHAR(160) NOT NULL,
  amount           DECIMAL(15,2) NOT NULL CHECK (amount >= 0),
  due_day          SMALLINT NOT NULL DEFAULT 5 CHECK (due_day BETWEEN 1 AND 31),
  supplier_id      UUID REFERENCES "FORNECEDORES"(id),
  chart_account_id UUID,
  cost_center_id   UUID,
  notes            TEXT,
  auto_generate    BOOLEAN NOT NULL DEFAULT true,  -- gera conta do mês automaticamente
  start_month      DATE NOT NULL DEFAULT date_trunc('month', CURRENT_DATE)::date,
  end_month        DATE,                            -- NULL = sem fim
  is_active        BOOLEAN NOT NULL DEFAULT true,
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  updated_at       TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_despesas_fixas_tenant
  ON "DESPESAS_FIXAS"(tenant_id) WHERE is_active;

-- Vínculo do lançamento com a despesa fixa + mês de competência
ALTER TABLE "LANCAMENTOS" ADD COLUMN IF NOT EXISTS fixed_expense_id UUID REFERENCES "DESPESAS_FIXAS"(id) ON DELETE SET NULL;
ALTER TABLE "LANCAMENTOS" ADD COLUMN IF NOT EXISTS competence_month DATE;

-- Idempotência: 1 conta por despesa fixa por mês
CREATE UNIQUE INDEX IF NOT EXISTS uq_lancamentos_fixa_mes
  ON "LANCAMENTOS"(tenant_id, fixed_expense_id, competence_month)
  WHERE fixed_expense_id IS NOT NULL;

-- Visão mensal (Central de Contas)
CREATE INDEX IF NOT EXISTS idx_lancamentos_tenant_tipo_venc
  ON "LANCAMENTOS"(tenant_id, type, due_date);

-- RLS igual às demais tabelas (backend usa service key; anon fica bloqueado)
ALTER TABLE "DESPESAS_FIXAS" ENABLE ROW LEVEL SECURITY;

INSERT INTO "_MIGRATIONS" (version, name) VALUES ('040', 'contas_precificacao')
ON CONFLICT (version) DO NOTHING;
