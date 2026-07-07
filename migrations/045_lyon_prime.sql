-- ============================================================
-- 045. Programa Lyon Prime
--      - CLIENTES: vendedor responsável, prazo de boleto e
--        selo de confiança
--      - LYON_PRIME_HISTORICO: evolução de estrelas e selo
--        (quem subiu/desceu, quando e com qual faturamento)
-- ============================================================
ALTER TABLE "CLIENTES" ADD COLUMN IF NOT EXISTS vendedor TEXT;
ALTER TABLE "CLIENTES" ADD COLUMN IF NOT EXISTS boleto_days INTEGER;
ALTER TABLE "CLIENTES" ADD COLUMN IF NOT EXISTS selo_confianca BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS "LYON_PRIME_HISTORICO" (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL,
  customer_id UUID NOT NULL,
  event       TEXT NOT NULL,            -- 'stars' | 'selo'
  stars_from  INTEGER,
  stars_to    INTEGER,
  selo        BOOLEAN,
  total_12m   NUMERIC,
  note        TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_prime_hist_tenant_cliente
  ON "LYON_PRIME_HISTORICO"(tenant_id, customer_id, created_at DESC);

INSERT INTO "_MIGRATIONS" (version, name) VALUES ('045', 'lyon_prime')
ON CONFLICT (version) DO NOTHING;
