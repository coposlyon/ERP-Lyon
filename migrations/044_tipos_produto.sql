-- ============================================================
-- 044. Tipos de produto (menu do site): COPOS, CANECAS, TAÇAS...
--      Cada produto pode ter um tipo; no site o tipo vira o menu
--      superior e as categorias (LONG DRINK TRADICIONAL etc.)
--      aparecem como subcategorias dentro dele.
-- ============================================================
CREATE TABLE IF NOT EXISTS "TIPOS_PRODUTO" (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  UUID NOT NULL,
  name       TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tipos_produto_tenant ON "TIPOS_PRODUTO"(tenant_id);

ALTER TABLE "PRODUTOS" ADD COLUMN IF NOT EXISTS tipo_id UUID REFERENCES "TIPOS_PRODUTO"(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_produtos_tipo ON "PRODUTOS"(tipo_id);

INSERT INTO "_MIGRATIONS" (version, name) VALUES ('044', 'tipos_produto')
ON CONFLICT (version) DO NOTHING;
