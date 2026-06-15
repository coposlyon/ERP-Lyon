-- ============================================================
-- 017. Preço por tipo de impressão (Serigrafia / Transfer / DTF)
-- Cada tipo tem sua própria tabela de preço por quantidade.
-- Formato do JSON:
--   {
--     "serigrafia": { "price": 2.89, "tiers": [{"min_qty":10,"max_qty":20,"price":6}] },
--     "transfer":   { "price": 3.50, "tiers": [...] },
--     "dtf":        { "price": 4.20, "tiers": [...] }
--   }
-- ============================================================
ALTER TABLE "PRODUTOS"
  ADD COLUMN IF NOT EXISTS print_pricing JSONB DEFAULT '{}'::jsonb;

INSERT INTO "_MIGRATIONS" (version, name) VALUES ('017', 'preco_por_impressao')
ON CONFLICT (version) DO NOTHING;
