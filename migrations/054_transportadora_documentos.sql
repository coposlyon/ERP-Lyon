-- 054_transportadora_documentos.sql
-- Documentos obrigatorios da transportadora (Contrato Comercial assinado e
-- Tabela de Precos vigente) + identificacao de quem anexou. Estrutura do jsonb:
-- {
--   "attachments": [
--     { "id", "kind": "contrato" | "tabela", "name", "url", "path",
--       "type", "size", "uploaded_at",
--       "uploaded_by": { "name", "cpf", "cargo" } }
--   ],
--   "responsible": { "name", "cpf", "cargo", "at" }
-- }
ALTER TABLE "TRANSPORTADORAS"
  ADD COLUMN IF NOT EXISTS documents jsonb NOT NULL DEFAULT '{}'::jsonb;
