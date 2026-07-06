-- ============================================================
-- 042. PRECIFICAÇÃO / FORMAÇÃO DE PREÇO
--      1) PRECIFICACOES: fichas de formação de preço por produto
--         (matéria-prima, personalização, tintas, embalagem, frete,
--         rateio de custos fixos, impostos e margens).
--      2) COMPRAS ganha coluna freight (frete da compra) para o
--         rateio automático de frete na precificação.
-- ============================================================

CREATE TABLE IF NOT EXISTS "PRECIFICACOES" (
  id                 UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id          UUID NOT NULL REFERENCES "EMPRESAS"(id) ON DELETE CASCADE,
  product_id         UUID REFERENCES "PRODUTOS"(id) ON DELETE SET NULL,
  user_id            UUID REFERENCES "USUARIOS"(id),

  -- Dados do produto
  name               VARCHAR(255) NOT NULL,
  category           VARCHAR(120),
  capacity           VARCHAR(60),
  color_model        VARCHAR(120),
  print_type         VARCHAR(60)  DEFAULT 'serigrafia',
  print_colors       SMALLINT     DEFAULT 1,
  calc_quantity      INTEGER      NOT NULL DEFAULT 1000,
  calc_reference     VARCHAR(60)  DEFAULT 'producao_propria',
  description        TEXT,

  -- Blocos de custo (matéria-prima, personalização, tintas,
  -- embalagem, frete) — estrutura livre em JSON
  blocks             JSONB NOT NULL DEFAULT '{}',

  -- Impostos e margens
  tax_regime         VARCHAR(40)   DEFAULT 'simples',
  tax_pct            DECIMAL(6,2)  DEFAULT 4,
  tax_notes          TEXT,
  margin_min_pct     DECIMAL(6,2)  DEFAULT 20,
  margin_ideal_pct   DECIMAL(6,2)  DEFAULT 40,
  margin_premium_pct DECIMAL(6,2)  DEFAULT 50,

  -- Valores calculados (snapshot no salvamento, p/ relatórios)
  overhead_unit      DECIMAL(15,4) DEFAULT 0,  -- rateio custos fixos/un
  cost_direct        DECIMAL(15,4) DEFAULT 0,  -- matéria-prima/un
  cost_subtotal      DECIMAL(15,4) DEFAULT 0,  -- custos antes do imposto/un
  cost_unit          DECIMAL(15,4) DEFAULT 0,  -- custo total unitário
  price_min          DECIMAL(15,2) DEFAULT 0,
  price_ideal        DECIMAL(15,2) DEFAULT 0,
  price_premium      DECIMAL(15,2) DEFAULT 0,

  is_active          BOOLEAN NOT NULL DEFAULT true,
  created_at         TIMESTAMPTZ DEFAULT NOW(),
  updated_at         TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_precificacoes_tenant
  ON "PRECIFICACOES"(tenant_id) WHERE is_active;
CREATE INDEX IF NOT EXISTS idx_precificacoes_product
  ON "PRECIFICACOES"(product_id);

-- Frete da compra (integração Compras → Precificação)
ALTER TABLE "COMPRAS" ADD COLUMN IF NOT EXISTS freight NUMERIC(12,2) DEFAULT 0;

-- RLS igual às demais tabelas (backend usa service key; anon fica bloqueado)
ALTER TABLE "PRECIFICACOES" ENABLE ROW LEVEL SECURITY;

INSERT INTO "_MIGRATIONS" (version, name) VALUES ('042', 'precificacao')
ON CONFLICT (version) DO NOTHING;
