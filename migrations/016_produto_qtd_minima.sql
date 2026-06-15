-- ============================================================
-- 016. Quantidade mínima de pedido por produto (usada na loja)
-- ============================================================
ALTER TABLE "PRODUTOS"
  ADD COLUMN IF NOT EXISTS min_order_qty INT DEFAULT 1;

UPDATE "PRODUTOS" SET min_order_qty = 1 WHERE min_order_qty IS NULL;

INSERT INTO "_MIGRATIONS" (version, name) VALUES ('016', 'produto_qtd_minima')
ON CONFLICT (version) DO NOTHING;
