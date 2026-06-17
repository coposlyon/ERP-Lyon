-- 033: garante a coluna settings (JSONB) na tabela EMPRESAS
-- Usada para configurações do site, incluindo o "modo manutenção" dos cadastros.
ALTER TABLE "EMPRESAS" ADD COLUMN IF NOT EXISTS settings jsonb NOT NULL DEFAULT '{}'::jsonb;
