-- ============================================================
-- 060. Google Contatos — vínculo do cliente com o contato do Google
--
--      Guarda o resourceName do contato criado no Google Contacts do
--      dono (via People API). Assim, ao editar o cliente, o sistema
--      ATUALIZA o contato existente em vez de duplicar.
-- ============================================================
ALTER TABLE "CLIENTES"
  ADD COLUMN IF NOT EXISTS google_resource_name TEXT;

NOTIFY pgrst, 'reload schema';

INSERT INTO "_MIGRATIONS" (version, name) VALUES ('060', 'cliente_google_contato')
ON CONFLICT (version) DO NOTHING;
