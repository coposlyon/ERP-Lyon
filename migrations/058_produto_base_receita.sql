-- ============================================================
-- 058. Produto-base × produto acabado + receita (BOM de produção)
--
--      Separa o COPO CRU comprado do fornecedor (tem estoque físico)
--      do PRODUTO ACABADO produzido internamente (degradê, borda
--      metalizada, jateado, serigrafia, laser, DTF), que aparece no
--      site mas NÃO tem estoque próprio: ele consome um copo-base +
--      insumos.
--
--      Decisões (definidas com o cliente):
--       · Reserva no pedido, baixa física na produção
--         (VENDAS.insumos_baixados marca se a baixa já ocorreu).
--       · Reposição = alerta/sugestão ao atingir o ponto de pedido.
-- ============================================================

-- Tipo do produto no fluxo de estoque/produção:
--   simple       — produto comum com estoque próprio (comportamento atual)
--   base         — copo cru/liso comprado do fornecedor (estoque físico)
--   manufactured — acabado produzido internamente (SEM estoque próprio;
--                  consome base_product_id + a receita de insumos)
ALTER TABLE "PRODUTOS"
  ADD COLUMN IF NOT EXISTS product_kind    TEXT NOT NULL DEFAULT 'simple',
  ADD COLUMN IF NOT EXISTS base_product_id UUID REFERENCES "PRODUTOS"(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS reorder_qty     NUMERIC(15,4);  -- sugestão de compra ao repor (opcional)

CREATE INDEX IF NOT EXISTS idx_produtos_base ON "PRODUTOS"(base_product_id) WHERE base_product_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_produtos_kind ON "PRODUTOS"(tenant_id, product_kind);

-- ── Receita do produto acabado ────────────────────────────
-- Quais processos e insumos o acabado consome, por peça.
-- qty_per_piece NULL = usa o consumo padrão do próprio insumo
-- (INSUMOS.consumption). O copo-base NÃO entra aqui — fica em
-- PRODUTOS.base_product_id (1 base por acabado).
CREATE TABLE IF NOT EXISTS "PRODUTO_RECEITA" (
  id            UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id     UUID NOT NULL REFERENCES "EMPRESAS"(id) ON DELETE CASCADE,
  product_id    UUID NOT NULL REFERENCES "PRODUTOS"(id) ON DELETE CASCADE,   -- o acabado
  process       TEXT,               -- degrade | borda_metalizada | jateado | serigrafia | laser | dtf | ...
  insumo_id     UUID REFERENCES "INSUMOS"(id) ON DELETE CASCADE,
  qty_per_piece NUMERIC(15,6),      -- consumo por peça (override; NULL = usa INSUMOS.consumption)
  notes         TEXT,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_receita_product ON "PRODUTO_RECEITA"(tenant_id, product_id);
CREATE INDEX IF NOT EXISTS idx_receita_insumo  ON "PRODUTO_RECEITA"(tenant_id, insumo_id);

ALTER TABLE "PRODUTO_RECEITA" ENABLE ROW LEVEL SECURITY;

-- ── Reserva × baixa física ────────────────────────────────
-- Enquanto insumos_baixados = false, a venda apenas RESERVA o copo-base
-- e os insumos (somem da disponibilidade do site). A baixa FÍSICA do
-- estoque acontece na confirmação da produção, quando este vira true.
-- Reservado(item) = pedidos com insumos_baixados = false.
ALTER TABLE "VENDAS"
  ADD COLUMN IF NOT EXISTS insumos_baixados BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_vendas_insumos_baixados
  ON "VENDAS"(tenant_id, insumos_baixados) WHERE insumos_baixados = false;

-- PostgREST só enxerga as colunas/tabela novas após recarregar o cache
NOTIFY pgrst, 'reload schema';

INSERT INTO "_MIGRATIONS" (version, name) VALUES ('058', 'produto_base_receita')
ON CONFLICT (version) DO NOTHING;
