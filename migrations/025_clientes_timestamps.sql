-- ============================================================
-- 025. Datas de criação e atualização do cadastro do cliente
-- ============================================================
ALTER TABLE "CLIENTES" ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT now();
ALTER TABLE "CLIENTES" ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();

INSERT INTO "_MIGRATIONS" (version, name) VALUES ('025', 'clientes_timestamps')
ON CONFLICT (version) DO NOTHING;
