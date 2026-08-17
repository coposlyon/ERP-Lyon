-- ============================================================
-- 070. LINHA DO TEMPO DO PEDIDO
--
--      A tela de detalhes mostra o caminho inteiro do pedido, e o
--      caminho tem etapas de confirmação que o CHECK ainda não aceitava:
--      pagamento confirmado, estoque confirmado, arte aprovada, foto do
--      produto pronto e a espera pela entrega. Sem elas, a produção não
--      conseguia registrar "já passei por aqui" — só "estou esperando".
--
--      Cada par "Aguardando X" → "X Finalizada" existe de propósito: um
--      diz que a bola está com alguém, o outro que ela saiu de lá. É o
--      que faz a linha do tempo mostrar progresso em vez de um pedido
--      parado no mesmo balão por três dias.
--
--      Continua valendo que nem todo pedido percorre todas as etapas: o
--      caminho depende do produto e dos processos contratados.
-- ============================================================
ALTER TABLE "VENDAS" DROP CONSTRAINT IF EXISTS "VENDAS_status_check";

ALTER TABLE "VENDAS" ADD CONSTRAINT "VENDAS_status_check" CHECK (status IN (
  -- abertura e financeiro
  'iniciando_pedido', 'aguardando_financeiro', 'pagamento_confirmado',
  -- estoque
  'aguardando_estoque', 'estoque_confirmado',
  -- arte
  'aguardando_arte', 'arte_aprovada',
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
  -- foto do produto pronto (o cliente confere antes da coleta)
  'aguardando_foto', 'foto_enviada',
  -- logística
  'aguardando_logistica', 'aguardando_coleta', 'coleta_processo',
  'mercadoria_coletada', 'produto_retirado', 'em_transito', 'aguardando_entrega',
  -- fim
  'entregue', 'pedido_finalizado',
  -- antigos (compatibilidade com pedidos já gravados)
  'open', 'confirmed', 'in_production', 'ready', 'delivered', 'cancelled', 'completed'
));

-- ── Cotação do frete ─────────────────────────────────────────
-- Hoje o número da cotação é colado dentro de `notes` como texto livre
-- ("Cotação do frete: BRSP158732"). Isso serve para ler, não para
-- procurar: quando a transportadora liga perguntando pela cotação,
-- ninguém acha o pedido por ela. Vira campo.
ALTER TABLE "VENDAS" ADD COLUMN IF NOT EXISTS freight_quote TEXT;
CREATE INDEX IF NOT EXISTS vendas_freight_quote_idx
  ON "VENDAS" (tenant_id, freight_quote);

-- ── Avisos do pedido ─────────────────────────────────────────
-- As "Informações Importantes" da tela (custo de alteração de arte,
-- política de devolução, pagamento integral). Ficam por tenant em
-- EMPRESAS.settings.pedido_avisos; a coluna abaixo é o que um pedido
-- específico acrescenta ao padrão.
ALTER TABLE "VENDAS" ADD COLUMN IF NOT EXISTS avisos JSONB DEFAULT '[]'::jsonb;

NOTIFY pgrst, 'reload schema';

INSERT INTO "_MIGRATIONS" (version, name) VALUES ('070', 'linha_do_tempo_pedido')
ON CONFLICT (version) DO NOTHING;
