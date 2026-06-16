-- ============================================================
-- 023. Data de nascimento (cliente PF) + IE no fornecedor
-- ============================================================
ALTER TABLE "CLIENTES"     ADD COLUMN IF NOT EXISTS birth_date DATE;
ALTER TABLE "FORNECEDORES" ADD COLUMN IF NOT EXISTS ie TEXT;

INSERT INTO "_MIGRATIONS" (version, name) VALUES ('023', 'nascimento_ie_fornecedor')
ON CONFLICT (version) DO NOTHING;
