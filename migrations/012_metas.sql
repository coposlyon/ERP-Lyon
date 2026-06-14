-- ============================================================
-- 012. METAS — meta de vendas mensal por tenant
-- ============================================================
CREATE TABLE IF NOT EXISTS "METAS" (
  tenant_id      UUID PRIMARY KEY,
  monthly_sales  NUMERIC(14,2) DEFAULT 0,
  updated_at     TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE "METAS" ENABLE ROW LEVEL SECURITY;

INSERT INTO "_MIGRATIONS" (version, name) VALUES ('012', 'metas')
ON CONFLICT (version) DO NOTHING;
