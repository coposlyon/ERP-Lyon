-- ============================================================
-- 117. O CHECK DE STATUS DA VENDA SEGUE O CATÁLOGO.
--
--      VENDAS.status tem um CHECK com a lista dos valores permitidos.
--      Ele foi escrito uma vez e ficou para trás: dois status do
--      catálogo (lib/atencao.js) não estavam nele —
--
--        vegetal_processo       "Imprimindo vegetal", o meio da etapa do
--                               Designer. Sem ele o designer não tinha
--                               como dizer "estou com a mão nisto".
--        metalizacao_processo   "Em metalização". JÁ EXISTIA no catálogo
--                               e no botão da fábrica — e o clique
--                               voltava erro de banco, sem ninguém
--                               entender por quê.
--
--      A lista abaixo é o catálogo inteiro, gerado dele. Um status novo
--      entra no catálogo E aqui; um CHECK que a aplicação não conhece é
--      um erro que só aparece no clique.
-- ============================================================

ALTER TABLE "VENDAS" DROP CONSTRAINT IF EXISTS "VENDAS_status_check";

ALTER TABLE "VENDAS" ADD CONSTRAINT "VENDAS_status_check"
  CHECK (status IS NULL OR status IN (
    'iniciando_pedido',
    'aguardando_financeiro',
    'pagamento_confirmado',
    'aguardando_estoque',
    'estoque_confirmado',
    'aguardando_arte',
    'arte_aprovada',
    'aguardando_vegetal',
    'vegetal_processo',
    'vegetal_impresso',
    'aguardando_revelacao',
    'revelacao_processo',
    'revelacao_finalizada',
    'aguardando_pintura',
    'pintura_processo',
    'pintura_finalizada',
    'aguardando_borda',
    'borda_processo',
    'borda_finalizada',
    'aguardando_gravacao',
    'gravacao_processo',
    'gravacao_finalizada',
    'metalizacao_processo',
    'aguardando_producao',
    'producao_processo',
    'producao_finalizada',
    'aguardando_embalagem',
    'embalando_pedido',
    'embalagem_finalizada',
    'aguardando_qualidade',
    'conferencia_processo',
    'qualidade_finalizada',
    'aguardando_foto',
    'foto_enviada',
    'aguardando_logistica',
    'aguardando_coleta',
    'coleta_processo',
    'mercadoria_coletada',
    'produto_retirado',
    'em_transito',
    'aguardando_entrega',
    'entregue',
    'pedido_finalizado',
    'open',
    'confirmed',
    'in_production',
    'ready',
    'delivered',
    'completed',
    'cancelled'
  ));

NOTIFY pgrst, 'reload schema';

INSERT INTO "_MIGRATIONS" (version, name) VALUES ('117', 'status_check_segue_o_catalogo')
ON CONFLICT (version) DO NOTHING;
