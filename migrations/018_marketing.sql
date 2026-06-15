-- ============================================================
-- 018. Marketing — histórico de campanhas (WhatsApp / Facebook / Instagram)
-- ============================================================
CREATE TABLE IF NOT EXISTS "CAMPANHAS_MKT" (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL,
  user_id     UUID,
  title       TEXT,
  message     TEXT,
  image_url   TEXT,
  channels    JSONB DEFAULT '[]'::jsonb,
  segment     JSONB DEFAULT '{}'::jsonb,
  results     JSONB DEFAULT '{}'::jsonb,
  status      TEXT DEFAULT 'sent',
  created_at  TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS campanhas_mkt_tenant_idx ON "CAMPANHAS_MKT" (tenant_id, created_at DESC);

INSERT INTO "_MIGRATIONS" (version, name) VALUES ('018', 'marketing')
ON CONFLICT (version) DO NOTHING;
