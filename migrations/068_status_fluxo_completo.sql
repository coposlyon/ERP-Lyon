-- ============================================================
-- 068. FLUXO COMPLETO DE STATUS DO PEDIDO
--
--      A migração 031 abriu 9 status; o fluxo real da fábrica tem
--      etapa de vegetal, revelação, pintura, borda, gravação,
--      embalagem e conferência, cada uma com "aguardando", "em
--      processo" e "finalizada". Sem esses valores no CHECK, a
--      Produção não consegue registrar onde o pedido está, e a coluna
--      Atenção do vendedor não tem como saber quem está segurando.
--
--      Nem todo pedido percorre todas as etapas: o caminho depende do
--      produto e dos processos contratados. O CHECK só diz o que é
--      valor válido, não a ordem obrigatória.
--
--      Os status antigos continuam aceitos — pedido que já existe não
--      pode virar inválido por causa de um deploy.
-- ============================================================
ALTER TABLE "VENDAS" DROP CONSTRAINT IF EXISTS "VENDAS_status_check";

ALTER TABLE "VENDAS" ADD CONSTRAINT "VENDAS_status_check" CHECK (status IN (
  -- abertura
  'iniciando_pedido', 'aguardando_financeiro', 'aguardando_estoque',
  -- arte
  'aguardando_arte',
  -- vegetal
  'aguardando_vegetal', 'vegetal_impresso',
  -- revelação
  'aguardando_revelacao', 'revelacao_processo', 'revelacao_finalizada',
  -- pintura
  'aguardando_pintura', 'pintura_processo', 'pintura_finalizada',
  -- borda
  'aguardando_borda', 'borda_processo', 'borda_finalizada',
  -- gravação
  'aguardando_gravacao', 'gravacao_processo', 'gravacao_finalizada',
  -- produção
  'aguardando_producao', 'producao_processo', 'producao_finalizada',
  -- embalagem
  'aguardando_embalagem', 'embalando_pedido', 'embalagem_finalizada',
  -- qualidade
  'aguardando_qualidade', 'conferencia_processo', 'qualidade_finalizada',
  -- logística
  'aguardando_logistica', 'aguardando_coleta', 'coleta_processo',
  'mercadoria_coletada', 'produto_retirado', 'em_transito',
  -- fim
  'entregue', 'pedido_finalizado',
  -- antigos (compatibilidade com pedidos já gravados)
  'open', 'confirmed', 'in_production', 'ready', 'delivered', 'cancelled', 'completed'
));

-- A carteira do vendedor é sempre "meus pedidos, do mais novo para o
-- mais velho": é esse o índice que ela usa.
CREATE INDEX IF NOT EXISTS vendas_vendedor_idx
  ON "VENDAS" (tenant_id, user_id, created_at DESC);

-- E a busca por código do cliente cai neste
CREATE INDEX IF NOT EXISTS vendas_cliente_idx
  ON "VENDAS" (tenant_id, customer_id);

NOTIFY pgrst, 'reload schema';

INSERT INTO "_MIGRATIONS" (version, name) VALUES ('068', 'status_fluxo_completo')
ON CONFLICT (version) DO NOTHING;
