-- ============================================================
-- RODE ISTO NO SUPABASE > SQL EDITOR (banco do Lyon)
-- Aplica as migrações 023 a 028 de uma vez. Tudo idempotente.
-- NÃO re-rode o RODAR_TUDO.sql (ele re-insere categorias e duplica).
-- ============================================================

-- 023: nascimento do cliente + IE do fornecedor
ALTER TABLE "CLIENTES"     ADD COLUMN IF NOT EXISTS birth_date DATE;
ALTER TABLE "FORNECEDORES" ADD COLUMN IF NOT EXISTS ie TEXT;

-- 024: produção (prazo + fotos) e data do evento no orçamento
ALTER TABLE "VENDAS"     ADD COLUMN IF NOT EXISTS max_delivery_date DATE;
ALTER TABLE "VENDAS"     ADD COLUMN IF NOT EXISTS production_photos JSONB DEFAULT '[]'::jsonb;
ALTER TABLE "ORCAMENTOS" ADD COLUMN IF NOT EXISTS event_date        DATE;
ALTER TABLE "ORCAMENTOS" ADD COLUMN IF NOT EXISTS max_delivery_date DATE;

-- 025: datas de criação/atualização do cadastro do cliente
ALTER TABLE "CLIENTES" ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT now();
ALTER TABLE "CLIENTES" ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();

-- 026: perfil do cliente na loja (foto + histórico)
ALTER TABLE "CLIENTES" ADD COLUMN IF NOT EXISTS avatar_url      TEXT;
ALTER TABLE "CLIENTES" ADD COLUMN IF NOT EXISTS profile_history JSONB DEFAULT '[]'::jsonb;

-- 027: variações do produto (cores / bordas / volumes)  ← cores e bordas
ALTER TABLE "PRODUTOS" ADD COLUMN IF NOT EXISTS variations JSONB DEFAULT '{}'::jsonb;

-- 028: remove categorias duplicadas + índice único (não duplica mais)
WITH dup AS (
  SELECT id, first_value(id) OVER (PARTITION BY tenant_id, upper(trim(name)) ORDER BY id) AS keep_id
  FROM "CATEGORIAS"
)
UPDATE "PRODUTOS" p SET category_id = d.keep_id
FROM dup d WHERE p.category_id = d.id AND d.id <> d.keep_id;

WITH dup AS (
  SELECT id, first_value(id) OVER (PARTITION BY tenant_id, upper(trim(name)) ORDER BY id) AS keep_id
  FROM "CATEGORIAS"
)
DELETE FROM "CATEGORIAS" c USING dup d WHERE c.id = d.id AND d.id <> d.keep_id;

CREATE UNIQUE INDEX IF NOT EXISTS categorias_tenant_name_uq
  ON "CATEGORIAS" (tenant_id, upper(trim(name)));

-- registra as migrações
INSERT INTO "_MIGRATIONS" (version, name) VALUES
  ('023','nascimento_ie_fornecedor'),
  ('024','producao_datas_fotos'),
  ('025','clientes_timestamps'),
  ('026','cliente_perfil'),
  ('027','produto_variations'),
  ('028','categorias_dedupe')
ON CONFLICT (version) DO NOTHING;
