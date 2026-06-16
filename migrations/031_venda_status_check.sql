-- ============================================================
-- 031. Atualiza o CHECK de status da VENDA para os 9 status novos
--      (mantém os antigos por compatibilidade com vendas existentes)
-- ============================================================
ALTER TABLE "VENDAS" DROP CONSTRAINT IF EXISTS "VENDAS_status_check";

ALTER TABLE "VENDAS" ADD CONSTRAINT "VENDAS_status_check" CHECK (status IN (
  -- novos (pedido de venda)
  'iniciando_pedido', 'aguardando_financeiro', 'aguardando_estoque', 'aguardando_arte',
  'aguardando_vegetal', 'aguardando_revelacao', 'aguardando_coleta', 'em_transito', 'entregue',
  -- antigos (compatibilidade)
  'open', 'confirmed', 'in_production', 'ready', 'delivered', 'cancelled', 'completed'
));

INSERT INTO "_MIGRATIONS" (version, name) VALUES ('031', 'venda_status_check')
ON CONFLICT (version) DO NOTHING;
