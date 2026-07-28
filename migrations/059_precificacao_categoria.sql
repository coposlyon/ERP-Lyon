-- ============================================================
-- 059. Tabela de Precificação por CATEGORIA
--
--      A ficha de Formação de Preço (PRECIFICACOES) pode ser ligada a
--      uma CATEGORIA inteira. Assim edita-se o preço da categoria UMA
--      vez e vale para todos os produtos dela (edição em massa natural).
--
--      Resolução do preço de um produto na loja:
--        1) product.pricing_sheet_id  (override explícito do produto)
--        2) a ficha mestre (is_master) cuja category_id = product.category_id
--        3) fallback: preço próprio do produto (transição)
-- ============================================================

ALTER TABLE "PRECIFICACOES"
  ADD COLUMN IF NOT EXISTS category_id UUID REFERENCES "CATEGORIAS"(id) ON DELETE SET NULL;

-- Uma ficha mestre por categoria (a mais recente vence, mas evita duplicar).
CREATE INDEX IF NOT EXISTS idx_precificacoes_categoria
  ON "PRECIFICACOES"(tenant_id, category_id) WHERE category_id IS NOT NULL AND is_master;

NOTIFY pgrst, 'reload schema';

INSERT INTO "_MIGRATIONS" (version, name) VALUES ('059', 'precificacao_categoria')
ON CONFLICT (version) DO NOTHING;
