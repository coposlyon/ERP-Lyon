-- ============================================================
-- 019. Produção (PCP) — etapas Revelação / Produção / Embalagem
-- Campos na própria venda (pedido). production_stage:
--   aguardando_arte | aguardando_producao | revelacao | producao | embalagem | finalizado
-- ============================================================
ALTER TABLE "VENDAS"
  ADD COLUMN IF NOT EXISTS production_stage  TEXT DEFAULT 'aguardando_producao',
  ADD COLUMN IF NOT EXISTS event_date        DATE,
  ADD COLUMN IF NOT EXISTS ship_date         DATE,
  ADD COLUMN IF NOT EXISTS ship_time         TEXT,
  ADD COLUMN IF NOT EXISTS carrier           TEXT,
  ADD COLUMN IF NOT EXISTS art_file          TEXT,
  ADD COLUMN IF NOT EXISTS production_obs     TEXT,
  ADD COLUMN IF NOT EXISTS production_log    JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS revelacao_inicio  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS revelacao_fim     TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS producao_inicio   TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS producao_fim      TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS embalagem_inicio  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS embalagem_fim     TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS vendas_production_stage_idx ON "VENDAS" (tenant_id, production_stage);

INSERT INTO "_MIGRATIONS" (version, name) VALUES ('019', 'producao')
ON CONFLICT (version) DO NOTHING;
