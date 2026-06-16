-- ============================================================
-- 030. Data da operação (data escolhida ao registrar a venda)
-- ============================================================
ALTER TABLE "VENDAS" ADD COLUMN IF NOT EXISTS operation_date DATE;

INSERT INTO "_MIGRATIONS" (version, name) VALUES ('030', 'venda_operation_date')
ON CONFLICT (version) DO NOTHING;
