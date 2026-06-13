-- ============================================================
-- 009. ESTÚDIO 3D — guarda a configuração do design no produto
--      personalizado (modelo, cores por parte, acabamento, logo).
-- ============================================================
ALTER TABLE "PERSONALIZACOES"
  ADD COLUMN IF NOT EXISTS design_3d   JSONB,
  ADD COLUMN IF NOT EXISTS preview_url TEXT;

INSERT INTO "_MIGRATIONS" (version, name) VALUES ('009', 'design_3d')
ON CONFLICT (version) DO NOTHING;
