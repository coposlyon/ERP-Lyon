-- ============================================================
-- 015. Busca de clientes por dígitos (telefone/CPF/CNPJ)
-- Colunas geradas só com dígitos, para buscar "4399523972"
-- mesmo que o telefone esteja salvo como "43 9952-3972".
-- ============================================================
ALTER TABLE "CLIENTES"
  ADD COLUMN IF NOT EXISTS phone_digits  TEXT GENERATED ALWAYS AS (regexp_replace(COALESCE(phone,    ''), '[^0-9]', '', 'g')) STORED,
  ADD COLUMN IF NOT EXISTS mobile_digits TEXT GENERATED ALWAYS AS (regexp_replace(COALESCE(mobile,   ''), '[^0-9]', '', 'g')) STORED,
  ADD COLUMN IF NOT EXISTS doc_digits    TEXT GENERATED ALWAYS AS (regexp_replace(COALESCE(cpf_cnpj, ''), '[^0-9]', '', 'g')) STORED;

CREATE INDEX IF NOT EXISTS clientes_phone_digits_idx  ON "CLIENTES" (phone_digits);
CREATE INDEX IF NOT EXISTS clientes_mobile_digits_idx ON "CLIENTES" (mobile_digits);
CREATE INDEX IF NOT EXISTS clientes_doc_digits_idx    ON "CLIENTES" (doc_digits);

INSERT INTO "_MIGRATIONS" (version, name) VALUES ('015', 'clientes_busca_digitos')
ON CONFLICT (version) DO NOTHING;
