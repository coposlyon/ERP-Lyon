-- ============================================================
-- 057. Tabela de Precificação (produto → ficha compartilhada)
--
--      O preço de venda sai do cadastro do produto e passa a ser
--      CALCULADO pela ficha de Formação de Preço (PRECIFICACOES), que
--      vira uma "tabela mestre" compartilhada por vários produtos.
--
--      Fluxo na loja:
--        produto → pricing_sheet_id → ficha
--               → avalia o custo na quantidade pedida
--               → + custo da impressão escolhida (blocks.print_costs)
--               → ÷ (1 − margem)  = preço
--
--      As faixas de quantidade (blocks.tiers) e os custos de impressão
--      (blocks.print_costs) ficam no JSONB `blocks` da ficha — sem
--      tabela nova. Mudar a serigrafia 1 vez recalcula todos os
--      produtos ligados.
-- ============================================================

-- Vínculo do produto com a ficha/tabela. ON DELETE SET NULL: apagar a
-- ficha não apaga o produto — ele só volta ao preço antigo (fallback).
ALTER TABLE "PRODUTOS"
  ADD COLUMN IF NOT EXISTS pricing_sheet_id UUID
    REFERENCES "PRECIFICACOES"(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_produtos_pricing_sheet
  ON "PRODUTOS"(pricing_sheet_id) WHERE pricing_sheet_id IS NOT NULL;

-- Marca uma ficha como "tabela mestre" (compartilhável e listável no
-- seletor do produto). Fichas antigas (1 por produto) seguem existindo;
-- só as marcadas aparecem como tabela de precificação.
ALTER TABLE "PRECIFICACOES"
  ADD COLUMN IF NOT EXISTS is_master BOOLEAN DEFAULT false;

INSERT INTO "_MIGRATIONS" (version, name) VALUES ('057', 'precificacao_tabela')
ON CONFLICT (version) DO NOTHING;
