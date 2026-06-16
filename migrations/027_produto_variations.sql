-- ============================================================
-- 027. Variações selecionáveis do produto (cor / borda / volume)
--      Ex.: TAÇA GIN JATEADO = 1 produto com 41 cores e 18 bordas.
-- ============================================================
ALTER TABLE "PRODUTOS" ADD COLUMN IF NOT EXISTS variations JSONB DEFAULT '{}'::jsonb;

INSERT INTO "_MIGRATIONS" (version, name) VALUES ('027', 'produto_variations')
ON CONFLICT (version) DO NOTHING;
