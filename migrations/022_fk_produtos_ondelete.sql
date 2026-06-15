-- ============================================================
-- 022. ON DELETE nas FKs que apontam para PRODUTOS
-- Permite apagar produtos: movimentações/variantes somem junto (CASCADE);
-- itens de venda/orçamento mantêm o histórico, só perdem o vínculo (SET NULL).
-- ============================================================

-- 1) remove TODAS as FKs que referenciam PRODUTOS(id)
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT tc.table_name, tc.constraint_name
      FROM information_schema.table_constraints tc
      JOIN information_schema.constraint_column_usage ccu
        ON tc.constraint_name = ccu.constraint_name AND tc.table_schema = ccu.table_schema
     WHERE tc.constraint_type = 'FOREIGN KEY'
       AND ccu.table_name = 'PRODUTOS' AND ccu.column_name = 'id'
  LOOP
    EXECUTE format('ALTER TABLE %I DROP CONSTRAINT %I', r.table_name, r.constraint_name);
  END LOOP;
END $$;

-- 2) recria com o comportamento certo
ALTER TABLE IF EXISTS "MOVIMENTACOES_ESTOQUE"
  ADD CONSTRAINT "MOVIMENTACOES_ESTOQUE_product_id_fkey"
  FOREIGN KEY (product_id) REFERENCES "PRODUTOS"(id) ON DELETE CASCADE;

ALTER TABLE IF EXISTS "VARIANTES_PRODUTO"
  ADD CONSTRAINT "VARIANTES_PRODUTO_product_id_fkey"
  FOREIGN KEY (product_id) REFERENCES "PRODUTOS"(id) ON DELETE CASCADE;

ALTER TABLE IF EXISTS "VENDA_ITENS"     ALTER COLUMN product_id DROP NOT NULL;
ALTER TABLE IF EXISTS "VENDA_ITENS"
  ADD CONSTRAINT "VENDA_ITENS_product_id_fkey"
  FOREIGN KEY (product_id) REFERENCES "PRODUTOS"(id) ON DELETE SET NULL;

ALTER TABLE IF EXISTS "ORCAMENTO_ITENS" ALTER COLUMN product_id DROP NOT NULL;
ALTER TABLE IF EXISTS "ORCAMENTO_ITENS"
  ADD CONSTRAINT "ORCAMENTO_ITENS_product_id_fkey"
  FOREIGN KEY (product_id) REFERENCES "PRODUTOS"(id) ON DELETE SET NULL;

INSERT INTO "_MIGRATIONS" (version, name) VALUES ('022', 'fk_produtos_ondelete')
ON CONFLICT (version) DO NOTHING;
