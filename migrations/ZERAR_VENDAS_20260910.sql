-- ============================================================
-- ZERAR TODO O HISTÓRICO DE VENDA — 10/09/2026
--
-- NÃO É MIGRAÇÃO. O nome não começa com três dígitos de propósito: o
-- migrador só roda `^\d{3}_.+\.sql$`. Isto é o registro de uma limpeza
-- já executada à mão no projeto `abtbkajjtuetactzsaou` (Lyon Copos
-- Personalizados, tenant a1b2c3d4-e5f6-7890-abcd-ef1234567890), para
-- que exista resposta no dia em que alguém perguntar onde foram parar
-- os pedidos de setembro.
--
-- O CORTE É ENTRE CADASTRO E MOVIMENTO — e desta vez o movimento sai
-- inteiro, de todos os módulos, não só o de vendas.
--
--   fica  clientes, produtos, categorias, itens, catálogo de artes,
--         fornecedores, transportadoras, usuários, setores, tabelas de
--         preço, insumos, plano de contas, centros de custo, feriados,
--         escalas, cupons, promoções, quadros, o cadastro inteiro do RH
--         e as 17 despesas fixas da Central de Contas (R$ 8.937,29).
--
--   sai   pedidos, itens, orçamentos, pedidos da loja, notas fiscais,
--         personalizações, comissões, perdas, alertas, cupons usados,
--         os recebíveis de venda, a baixa de estoque que a venda fez,
--         o histórico Prime, ofertas, campanhas, curtidas, auditoria,
--         projetos do catálogo, consultas de crédito e a agenda.
--
-- O NÚMERO DO PEDIDO VOLTA AO 1 SOZINHO. `criar_venda` calcula
-- MAX(number)+1; sem venda nenhuma, o próximo nasce PV-000001. Não há
-- sequence para reiniciar.
--
-- O QUE FOI APAGADO (contagem antes):
--   7 pedidos · 11 itens · 3 recebíveis (R$ 750,00) · 1 movimentação de
--   estoque · 162 linhas de auditoria · 1 evento Prime. Todo o resto
--   das tabelas de movimento já estava vazio.
--
-- O ESTOQUE FOI ZERADO A PEDIDO. Não devolvido: zerado. `current_stock
--   = 0` nos 4 produtos que tinham saldo. As 12 movimentações que não
--   vieram de venda (entradas, inventário, ajustes) continuam lá — elas
--   não são histórico de venda. Isso deixa o extrato do produto
--   contando uma entrada que o saldo zero não reflete; é consequência
--   esperada de zerar em vez de devolver, e se resolve no primeiro
--   inventário.
--
-- BACKUP. Oito tabelas com a data no nome, tiradas segundos antes:
--   bkp_vendas_20260910           bkp_venda_itens_20260910
--   bkp_lancamentos_sale_20260910 bkp_mov_estoque_20260910
--   bkp_auditoria_20260910        bkp_prime_hist_20260910
--   bkp_saldo_produtos_20260910   bkp_clientes_rating_20260910
--
-- Para restaurar:  INSERT INTO "VENDAS" SELECT * FROM bkp_vendas_20260910;
-- Quando não precisar mais:  DROP TABLE bkp_..._20260910;
-- ============================================================

BEGIN;

-- ── o pedido de venda e tudo que pendura nele ────────────────
-- VENDAS levaria VENDA_ITENS e ALERTAS_PEDIDO por cascade; os DELETEs
-- estão escritos assim mesmo, porque depender de cascade invisível é o
-- tipo de coisa que se descobre errado tarde demais.
DELETE FROM "VENDA_ITENS" WHERE sale_id IN (SELECT id FROM "VENDAS");
DELETE FROM "ALERTAS_PEDIDO";
DELETE FROM "CUPONS_USOS";
DELETE FROM "PERSONALIZACAO_HISTORICO";
DELETE FROM "PERSONALIZACOES";
DELETE FROM "NOTAS_FISCAIS";
DELETE FROM "VENDEDOR_COMISSOES";
DELETE FROM "PRODUCAO_PERDAS";
DELETE FROM "PERDAS_MATRIZ";
UPDATE "MENSAGENS_INTERNAS" SET sale_id = NULL WHERE sale_id IS NOT NULL;
DELETE FROM "VENDAS";

-- ── venda em estágio anterior ────────────────────────────────
DELETE FROM "ORCAMENTO_ITENS";
DELETE FROM "ORCAMENTOS";
DELETE FROM "PEDIDOS_LOJA";

-- ── o dinheiro que veio de venda ─────────────────────────────
-- Só `reference_type = 'sale'`. Despesa fixa, folha, compra e
-- lançamento avulso não têm nada a ver com pedido e ficam onde estão.
DELETE FROM "LANCAMENTOS" WHERE reference_type = 'sale';

-- ── a baixa de estoque que a venda fez ───────────────────────
DELETE FROM "MOVIMENTACOES_ESTOQUE" WHERE reference_type = 'sale';

-- ── histórico comercial derivado das vendas ──────────────────
-- `total_12m` e `used_count` são número somado de venda, não cadastro:
-- deixá-los faria a estrela do cliente e o limite do cupom contarem
-- pedido que não existe mais. A estrela manual (`rating`) fica —
-- recomputeRating também nunca a abaixa.
DELETE FROM "LYON_PRIME_HISTORICO";
UPDATE "CLIENTES" SET total_12m = 0 WHERE total_12m IS DISTINCT FROM 0;
UPDATE "CUPONS"   SET used_count = 0 WHERE used_count IS DISTINCT FROM 0;
DELETE FROM "OFERTAS_ENVIOS";
DELETE FROM "OFERTAS_VENDEDOR";
DELETE FROM "CAMPANHAS_MKT";
DELETE FROM "PROMO_CURTIDAS";

-- ── rastro e atividade ───────────────────────────────────────
DELETE FROM "AUDITORIA";
DELETE FROM "CATALOGO_PROJETOS";
DELETE FROM "CONSULTAS_CREDITO";
DELETE FROM "AGENDA_VENDEDOR";

-- ── o saldo, zerado a pedido ─────────────────────────────────
UPDATE "PRODUTOS" SET current_stock = 0 WHERE current_stock IS DISTINCT FROM 0;

COMMIT;

-- ── conferência (rodada depois; tudo zero) ───────────────────
-- VENDAS 0 · VENDA_ITENS 0 · ORCAMENTOS 0 · PEDIDOS_LOJA 0 ·
-- LANCAMENTOS sale 0 (fixos 17) · MOV_ESTOQUE sale 0 (resto 12) ·
-- AUDITORIA 0 · PRIME 0 · clientes com total_12m>0 → 0 ·
-- produtos com saldo → 0.
-- Cadastro intacto: 64 clientes · 97 produtos · 7 fornecedores ·
-- 3 usuários · 9 artes · 17 despesas fixas · 2 insumos.
