-- ============================================================
-- 021. Loja: agrupar copos por modelo + pedido mínimo 10
-- store_group = modelo (card na loja) · store_color = cor (opção dentro do card)
-- Auto-deriva do nome "MODELO - COR ...": antes/depois do primeiro " - ".
-- ============================================================
ALTER TABLE "PRODUTOS"
  ADD COLUMN IF NOT EXISTS store_group TEXT,
  ADD COLUMN IF NOT EXISTS store_color TEXT;

UPDATE "PRODUTOS"
   SET store_group = NULLIF(TRIM(split_part(name, ' - ', 1)), ''),
       store_color = NULLIF(TRIM(SUBSTRING(name FROM POSITION(' - ' IN name) + 3)), '')
 WHERE (store_group IS NULL OR store_group = '')
   AND name LIKE '% - %';

-- Pedido mínimo passa a ser 10 (era 1)
ALTER TABLE "PRODUTOS" ALTER COLUMN min_order_qty SET DEFAULT 10;
UPDATE "PRODUTOS" SET min_order_qty = 10 WHERE min_order_qty IS NULL OR min_order_qty <= 1;

INSERT INTO "_MIGRATIONS" (version, name) VALUES ('021', 'loja_grupo_min')
ON CONFLICT (version) DO NOTHING;
