-- ============================================================
-- 026. Perfil do cliente na loja: foto (avatar) + histórico de
--      alterações feitas pelo próprio cliente
-- ============================================================
ALTER TABLE "CLIENTES" ADD COLUMN IF NOT EXISTS avatar_url      TEXT;
ALTER TABLE "CLIENTES" ADD COLUMN IF NOT EXISTS profile_history JSONB DEFAULT '[]'::jsonb;

INSERT INTO "_MIGRATIONS" (version, name) VALUES ('026', 'cliente_perfil')
ON CONFLICT (version) DO NOTHING;
