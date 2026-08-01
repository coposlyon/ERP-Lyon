-- ============================================================
-- 061. Tinta do copo (PP / PS)
--
--      Tipo de tinta usado na personalização do copo. Preenchido
--      pela Edição em massa (Produtos) e sugerido no Lançamento de
--      Produto do pedido de venda.
-- ============================================================
ALTER TABLE "PRODUTOS"
  ADD COLUMN IF NOT EXISTS ink_type TEXT;

NOTIFY pgrst, 'reload schema';

INSERT INTO "_MIGRATIONS" (version, name) VALUES ('061', 'produto_tinta')
ON CONFLICT (version) DO NOTHING;
