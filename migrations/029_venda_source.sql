-- ============================================================
-- 029. Origem da venda (manual x site) para os Pedidos de Venda
-- ============================================================
ALTER TABLE "VENDAS" ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'manual';

INSERT INTO "_MIGRATIONS" (version, name) VALUES ('029', 'venda_source')
ON CONFLICT (version) DO NOTHING;
