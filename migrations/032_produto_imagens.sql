-- ============================================================
-- 032. Foto do produto + foto por cor (loja troca ao selecionar)
-- ============================================================
ALTER TABLE "PRODUTOS" ADD COLUMN IF NOT EXISTS image_url        TEXT;
ALTER TABLE "PRODUTOS" ADD COLUMN IF NOT EXISTS variation_images JSONB DEFAULT '{}'::jsonb;

INSERT INTO "_MIGRATIONS" (version, name) VALUES ('032', 'produto_imagens')
ON CONFLICT (version) DO NOTHING;
