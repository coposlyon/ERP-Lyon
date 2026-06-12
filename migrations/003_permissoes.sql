-- ============================================================
-- 9. PERMISSÕES — módulos permitidos por usuário
--    NULL  = sem restrição (admins e usuários legados)
--    []    = nenhum módulo (só dashboard)
--    [...] = lista de módulos permitidos
-- ============================================================
ALTER TABLE "USUARIOS"
  ADD COLUMN IF NOT EXISTS allowed_modules JSONB DEFAULT NULL;

INSERT INTO "_MIGRATIONS" (version, name) VALUES ('003', 'permissoes')
ON CONFLICT (version) DO NOTHING;
