-- ============================================================
-- 053. INSUMOS — fechamento do módulo
--      · vínculo com PRODUTOS (compras/estoque já rodam nessa
--        tabela; assim o insumo herda saldo e última compra sem
--        criar uma segunda fonte de verdade)
--      · estoque mínimo e origem do custo
--      · múltiplos fornecedores por insumo
--      · histórico de preço (auditoria da variação de custo)
-- ============================================================

ALTER TABLE "INSUMOS"
  ADD COLUMN IF NOT EXISTS product_id  UUID REFERENCES "PRODUTOS"(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS min_stock   NUMERIC(15,4) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cost_source VARCHAR(20)   NOT NULL DEFAULT 'manual'; -- manual | compra | nfe

CREATE INDEX IF NOT EXISTS idx_insumos_product ON "INSUMOS"(product_id);

-- ── Fornecedores do insumo (o marcado como padrão define o custo) ──
CREATE TABLE IF NOT EXISTS "INSUMO_FORNECEDORES" (
  id             UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id      UUID NOT NULL REFERENCES "EMPRESAS"(id) ON DELETE CASCADE,
  insumo_id      UUID NOT NULL REFERENCES "INSUMOS"(id) ON DELETE CASCADE,
  supplier_id    UUID REFERENCES "FORNECEDORES"(id) ON DELETE SET NULL,
  supplier_name  VARCHAR(160),
  package_qty    NUMERIC(15,4) NOT NULL CHECK (package_qty > 0),
  package_price  NUMERIC(15,2) NOT NULL CHECK (package_price >= 0),
  lead_time_days SMALLINT,
  is_default     BOOLEAN NOT NULL DEFAULT false,
  notes          TEXT,
  created_at     TIMESTAMPTZ DEFAULT NOW(),
  updated_at     TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_insumo_forn ON "INSUMO_FORNECEDORES"(tenant_id, insumo_id);

-- ── Histórico de preço ────────────────────────────────────
CREATE TABLE IF NOT EXISTS "INSUMO_PRECOS" (
  id            UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id     UUID NOT NULL REFERENCES "EMPRESAS"(id) ON DELETE CASCADE,
  insumo_id     UUID NOT NULL REFERENCES "INSUMOS"(id) ON DELETE CASCADE,
  supplier_id   UUID REFERENCES "FORNECEDORES"(id) ON DELETE SET NULL,
  supplier_name VARCHAR(160),
  package_qty   NUMERIC(15,4) NOT NULL,
  package_price NUMERIC(15,2) NOT NULL,
  unit_cost     NUMERIC(15,6) NOT NULL,
  source        VARCHAR(20) NOT NULL DEFAULT 'manual', -- manual | compra | nfe
  reference     VARCHAR(80),                           -- nº da compra/NF
  user_name     VARCHAR(160),
  created_at    TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_insumo_precos ON "INSUMO_PRECOS"(tenant_id, insumo_id, created_at DESC);

ALTER TABLE "INSUMO_FORNECEDORES" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "INSUMO_PRECOS"       ENABLE ROW LEVEL SECURITY;

-- Preço atual de cada insumo vira o primeiro ponto do histórico
INSERT INTO "INSUMO_PRECOS" (tenant_id, insumo_id, package_qty, package_price, unit_cost, source, user_name)
SELECT i.tenant_id, i.id, i.package_qty, i.package_price,
       CASE WHEN i.package_qty > 0 THEN i.package_price / i.package_qty ELSE 0 END,
       'manual', 'carga inicial'
  FROM "INSUMOS" i
 WHERE NOT EXISTS (SELECT 1 FROM "INSUMO_PRECOS" p WHERE p.insumo_id = i.id);

-- PostgREST só enxerga o que é novo depois de recarregar o cache
NOTIFY pgrst, 'reload schema';

INSERT INTO "_MIGRATIONS" (version, name) VALUES ('053', 'insumos_completo')
ON CONFLICT (version) DO NOTHING;
