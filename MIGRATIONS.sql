-- ============================================================
-- COLE ESTE SQL NO SUPABASE > SQL EDITOR E EXECUTE TUDO
-- ============================================================

-- 1. Novos campos em CLIENTES
CREATE SEQUENCE IF NOT EXISTS clientes_display_id_seq START 1;

ALTER TABLE "CLIENTES"
  ADD COLUMN IF NOT EXISTS display_id    BIGINT  DEFAULT nextval('clientes_display_id_seq'),
  ADD COLUMN IF NOT EXISTS instagram     TEXT,
  ADD COLUMN IF NOT EXISTS nome_fantasia TEXT,
  ADD COLUMN IF NOT EXISTS rating        SMALLINT CHECK (rating BETWEEN 1 AND 5),
  ADD COLUMN IF NOT EXISTS admission_data JSONB DEFAULT '{}';

-- Preenche display_id nos clientes já existentes
UPDATE "CLIENTES"
SET display_id = nextval('clientes_display_id_seq')
WHERE display_id IS NULL;

-- 2. Novos campos em PRODUTOS (dimensional + fornecedor)
ALTER TABLE "PRODUTOS"
  ADD COLUMN IF NOT EXISTS supplier_id         UUID REFERENCES "FORNECEDORES"(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS height              NUMERIC(10,3),
  ADD COLUMN IF NOT EXISTS weight              NUMERIC(10,3),
  ADD COLUMN IF NOT EXISTS thickness           NUMERIC(10,3),
  ADD COLUMN IF NOT EXISTS base_circumference  NUMERIC(10,3),
  ADD COLUMN IF NOT EXISTS mouth_circumference NUMERIC(10,3),
  ADD COLUMN IF NOT EXISTS length              NUMERIC(10,3),
  ADD COLUMN IF NOT EXISTS width               NUMERIC(10,3);

-- ============================================================
-- STORAGE BUCKET para anexos de colaboradores
-- Faça isso no Supabase Dashboard > Storage > New Bucket:
--   Nome: colaboradores-anexos
--   Public: SIM (para gerar URLs públicas)
-- OU rode o SQL abaixo (requer extensão pg_storage):
-- SELECT storage.create_bucket('colaboradores-anexos', '{"public": true}');
-- ============================================================

-- 3. Faixas de preço por quantidade nos produtos
ALTER TABLE "PRODUTOS"
  ADD COLUMN IF NOT EXISTS price_tiers JSONB DEFAULT '[]'::jsonb;

-- 4. Categorias padrão para Lyon Copos
INSERT INTO "CATEGORIAS" (tenant_id, name)
VALUES
  ('a1b2c3d4-e5f6-7890-abcd-ef1234567890', 'PRODUTO ACABADO'),
  ('a1b2c3d4-e5f6-7890-abcd-ef1234567890', 'IMPRESSOS'),
  ('a1b2c3d4-e5f6-7890-abcd-ef1234567890', 'LONG DRINK')
ON CONFLICT DO NOTHING;
