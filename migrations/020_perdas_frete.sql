-- ============================================================
-- 020. Perda na produção + frete no pedido
-- ============================================================
CREATE TABLE IF NOT EXISTS "PRODUCAO_PERDAS" (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    UUID NOT NULL,
  sale_id      UUID,
  product_id   UUID,
  product_name TEXT,
  quantity     NUMERIC(12,2) NOT NULL DEFAULT 0,
  user_id      UUID,
  user_name    TEXT,
  notes        TEXT,
  created_at   TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS producao_perdas_idx ON "PRODUCAO_PERDAS" (tenant_id, sale_id);

ALTER TABLE "VENDAS"
  ADD COLUMN IF NOT EXISTS freight NUMERIC(12,2) DEFAULT 0;

INSERT INTO "_MIGRATIONS" (version, name) VALUES ('020', 'perdas_frete')
ON CONFLICT (version) DO NOTHING;
