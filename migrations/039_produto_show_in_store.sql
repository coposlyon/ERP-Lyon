-- ============================================================
-- 039. Flag de visibilidade na loja (mostrar/ocultar produto no site)
-- ============================================================
ALTER TABLE "PRODUTOS" ADD COLUMN IF NOT EXISTS show_in_store BOOLEAN NOT NULL DEFAULT true;

INSERT INTO "_MIGRATIONS" (version, name) VALUES ('039', 'produto_show_in_store')
ON CONFLICT (version) DO NOTHING;
