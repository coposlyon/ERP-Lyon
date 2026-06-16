-- ============================================================
-- RODE TUDO ISTO DE UMA VEZ no SQL Editor do projeto "ERP lyon"
-- (o que tem as tabelas VENDAS, PRODUTOS, CLIENTES).
-- Migrações 023 a 032. Tudo idempotente — pode rodar com segurança.
-- NÃO rode no projeto "HaggBanco".
-- ============================================================

-- 023: nascimento do cliente + IE do fornecedor
ALTER TABLE "CLIENTES"     ADD COLUMN IF NOT EXISTS birth_date DATE;
ALTER TABLE "FORNECEDORES" ADD COLUMN IF NOT EXISTS ie TEXT;

-- 024: produção (prazo + fotos) e data do evento no orçamento
ALTER TABLE "VENDAS"       ADD COLUMN IF NOT EXISTS max_delivery_date DATE;
ALTER TABLE "VENDAS"       ADD COLUMN IF NOT EXISTS production_photos JSONB DEFAULT '[]'::jsonb;
ALTER TABLE "ORCAMENTOS"   ADD COLUMN IF NOT EXISTS event_date        DATE;
ALTER TABLE "ORCAMENTOS"   ADD COLUMN IF NOT EXISTS max_delivery_date DATE;

-- 025: datas de criação/atualização do cadastro do cliente
ALTER TABLE "CLIENTES"     ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT now();
ALTER TABLE "CLIENTES"     ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();

-- 026: perfil do cliente na loja (foto + histórico)
ALTER TABLE "CLIENTES"     ADD COLUMN IF NOT EXISTS avatar_url      TEXT;
ALTER TABLE "CLIENTES"     ADD COLUMN IF NOT EXISTS profile_history JSONB DEFAULT '[]'::jsonb;

-- 027: variações do produto (cores / bordas / volumes)  ← cores e bordas
ALTER TABLE "PRODUTOS"     ADD COLUMN IF NOT EXISTS variations JSONB DEFAULT '{}'::jsonb;

-- 029: origem da venda (manual x site)
ALTER TABLE "VENDAS"       ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'manual';

-- 030: data da operação da venda
ALTER TABLE "VENDAS"       ADD COLUMN IF NOT EXISTS operation_date DATE;

-- 032: foto do produto + foto por cor
ALTER TABLE "PRODUTOS"     ADD COLUMN IF NOT EXISTS image_url        TEXT;
ALTER TABLE "PRODUTOS"     ADD COLUMN IF NOT EXISTS variation_images JSONB DEFAULT '{}'::jsonb;

-- 031: libera os novos status do pedido de venda (corrige a compra no site)
ALTER TABLE "VENDAS" DROP CONSTRAINT IF EXISTS "VENDAS_status_check";
ALTER TABLE "VENDAS" ADD CONSTRAINT "VENDAS_status_check" CHECK (status IN (
  'iniciando_pedido','aguardando_financeiro','aguardando_estoque','aguardando_arte',
  'aguardando_vegetal','aguardando_revelacao','aguardando_coleta','em_transito','entregue',
  'open','confirmed','in_production','ready','delivered','cancelled','completed'));

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
  ('028','categorias_dedupe'),
  ('029','venda_source'),
  ('030','venda_operation_date'),
  ('031','venda_status_check'),
  ('032','produto_imagens')
ON CONFLICT (version) DO NOTHING;
