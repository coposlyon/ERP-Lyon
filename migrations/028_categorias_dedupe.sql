-- ============================================================
-- 028. Remove categorias duplicadas e impede novas duplicatas
-- ============================================================

-- 1) Repõe os produtos para a categoria mais antiga (menor id) de cada nome
WITH dup AS (
  SELECT id, first_value(id) OVER (PARTITION BY tenant_id, upper(trim(name)) ORDER BY id) AS keep_id
  FROM "CATEGORIAS"
)
UPDATE "PRODUTOS" p
SET category_id = d.keep_id
FROM dup d
WHERE p.category_id = d.id AND d.id <> d.keep_id;

-- 2) Apaga as categorias duplicadas
WITH dup AS (
  SELECT id, first_value(id) OVER (PARTITION BY tenant_id, upper(trim(name)) ORDER BY id) AS keep_id
  FROM "CATEGORIAS"
)
DELETE FROM "CATEGORIAS" c
USING dup d
WHERE c.id = d.id AND d.id <> d.keep_id;

-- 3) Impede duplicar categorias com o mesmo nome (por empresa)
CREATE UNIQUE INDEX IF NOT EXISTS categorias_tenant_name_uq
  ON "CATEGORIAS" (tenant_id, upper(trim(name)));

INSERT INTO "_MIGRATIONS" (version, name) VALUES ('028', 'categorias_dedupe')
ON CONFLICT (version) DO NOTHING;
