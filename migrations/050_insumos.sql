-- ============================================================
-- 050. ENGENHARIA DE CUSTOS — INSUMOS
--      Catálogo central de materiais (tintas, solventes, emulsão,
--      telas, vegetal, embalagem...). Cada insumo tem custo por
--      unidade base (valor ÷ volume da embalagem) e o método de
--      rateio no produto: por CONSUMO (ml/g por peça) ou por
--      VIDA ÚTIL (nº de impressões/usos que o item aguenta).
-- ============================================================

CREATE TABLE IF NOT EXISTS "INSUMOS" (
  id            UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id     UUID NOT NULL REFERENCES "EMPRESAS"(id) ON DELETE CASCADE,

  category      VARCHAR(80)  NOT NULL,           -- Tintas, Solventes, Emulsão, Telas...
  name          VARCHAR(160) NOT NULL,           -- Acrisolv Azul
  supplier_id   UUID REFERENCES "FORNECEDORES"(id) ON DELETE SET NULL,
  supplier_name VARCHAR(160),                    -- fallback quando não é fornecedor cadastrado

  base_unit     VARCHAR(12)  NOT NULL DEFAULT 'ml', -- ml, l, g, kg, m, m2, un, folha
  package_qty   NUMERIC(15,4) NOT NULL CHECK (package_qty > 0), -- volume da embalagem (ex: 900)
  package_price NUMERIC(15,2) NOT NULL CHECK (package_price >= 0), -- valor pago (ex: 180)

  -- Como o custo entra no produto
  cost_method   VARCHAR(12)  NOT NULL DEFAULT 'consumo', -- 'consumo' | 'vida_util'
  consumption   NUMERIC(15,6) DEFAULT 0,          -- consumo médio por peça (na base_unit)
  lifespan      NUMERIC(15,2) DEFAULT 0,          -- nº de impressões/usos (método vida_util)

  notes         TEXT,
  is_active     BOOLEAN NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_insumos_tenant   ON "INSUMOS"(tenant_id) WHERE is_active;
CREATE INDEX IF NOT EXISTS idx_insumos_category ON "INSUMOS"(tenant_id, category);

ALTER TABLE "INSUMOS" ENABLE ROW LEVEL SECURITY;

-- PostgREST só enxerga a tabela nova depois de recarregar o cache
NOTIFY pgrst, 'reload schema';

INSERT INTO "_MIGRATIONS" (version, name) VALUES ('050', 'insumos')
ON CONFLICT (version) DO NOTHING;
