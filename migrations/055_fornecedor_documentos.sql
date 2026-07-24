-- 055_fornecedor_documentos.sql
-- Documento do fornecedor (Contrato Comercial assinado) + identificacao de quem
-- anexou. Mesma estrutura da transportadora (migration 054), com um unico kind.
-- Estrutura do jsonb:
-- {
--   "attachments": [
--     { "id", "kind": "contrato", "name", "url", "path",
--       "type", "size", "uploaded_at",
--       "uploaded_by": { "name", "cpf", "cargo" } }
--   ],
--   "responsible": { "name", "cpf", "cargo", "at" }
-- }
ALTER TABLE "FORNECEDORES"
  ADD COLUMN IF NOT EXISTS documents jsonb NOT NULL DEFAULT '{}'::jsonb;
