-- ============================================================
-- ZERAR OS TESTES — 07/09/2026
--
-- NÃO É MIGRAÇÃO. O nome não começa com três dígitos de propósito: o
-- migrador automático só roda `^\d{3}_.+\.sql$`. Isto aqui é um
-- registro do que foi apagado à mão, para que daqui a seis meses exista
-- resposta para "onde foram parar os pedidos de setembro".
--
-- O QUE ISTO É. O sistema entrou em produção com o catálogo, os
-- clientes e os produtos cadastrados, mas nenhuma venda real: o que
-- havia em VENDAS, no estoque, no financeiro e no histórico era ensaio
-- — pedidos de teste, baixas de teste, reposições de teste.
--
-- O CORTE É ENTRE CADASTRO E MOVIMENTO.
--
--   fica  o que descreve a empresa: clientes, produtos, categorias,
--         itens, catálogo, fornecedores, transportadoras, usuários,
--         setores, tabelas de preço, insumos, plano de contas, centros
--         de custo, feriados, escalas e o cadastro inteiro do RH.
--
--   sai   o que descreve o que aconteceu: vendas, itens de venda,
--         movimentações de estoque, reposições, auditoria, curtidas,
--         histórico do Prime, projetos de arte e os lançamentos de RH.
--
-- AS DESPESAS FIXAS FICAM. São as 17 contas da Central de Contas —
-- aluguel, energia, o que a empresa paga todo mês — reagendadas para
-- janeiro de 2027 a pedido do cliente. Elas são compromisso real, e
-- não ensaio: só os lançamentos de VENDA saem daqui.
--
-- O NÚMERO DO PEDIDO VOLTA AO 1 SOZINHO. `criar_venda` calcula
-- `MAX(number) + 1`; sem venda nenhuma, o próximo é PV-000001. Não há
-- sequence para reiniciar.
-- ============================================================

BEGIN;

-- ── O que aconteceu ──────────────────────────────────────────
-- VENDAS leva junto VENDA_ITENS e ALERTAS_PEDIDO (ON DELETE CASCADE) e
-- solta MENSAGENS_INTERNAS.sale_id (SET NULL). NOTAS_FISCAIS,
-- ORCAMENTOS e PERSONALIZACOES apontam com NO ACTION — estão vazias, e
-- os DELETEs abaixo garantem que continuem.
DELETE FROM "NOTAS_FISCAIS"       WHERE tenant_id = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
DELETE FROM "PERSONALIZACOES"     WHERE tenant_id = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
DELETE FROM "VENDAS"              WHERE tenant_id = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';

DELETE FROM "MOVIMENTACOES_ESTOQUE" WHERE tenant_id = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
DELETE FROM "PEDIDOS_REPOSICAO"     WHERE tenant_id = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';

-- SÓ O QUE VEIO DE VENDA. A condição é positiva — "não é despesa fixa"
-- — e não uma lista de tipos a apagar: lançamento de origem nova que
-- aparecer amanhã sai junto, em vez de ficar esquecido porque ninguém
-- lembrou de acrescentá-lo aqui.
DELETE FROM "LANCAMENTOS"
 WHERE tenant_id = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890'
   AND NOT (type = 'payable' AND reference_type = 'fixed_expense');

-- ── O rastro dos testes ──────────────────────────────────────
DELETE FROM "AUDITORIA"            WHERE tenant_id = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
DELETE FROM "PROMO_CURTIDAS"       WHERE tenant_id = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
DELETE FROM "LYON_PRIME_HISTORICO" WHERE tenant_id = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
DELETE FROM "CATALOGO_PROJETOS"    WHERE tenant_id = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';

-- ── RH: o movimento sai, o cadastro fica ─────────────────────
-- Ponto, marcações, aceites e admissões são lançamento. Cargos,
-- departamentos, políticas, rubricas e documentos são cadastro.
DELETE FROM "RH_MARCACOES"         WHERE tenant_id = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
DELETE FROM "RH_PONTO"             WHERE tenant_id = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
DELETE FROM "RH_POLITICAS_ACEITES" WHERE tenant_id = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
DELETE FROM "RH_ADMISSOES"         WHERE tenant_id = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';

-- ── O saldo ──────────────────────────────────────────────────
-- Zero, e não "o que sobrou": os dois negativos (−1200 e −600) são a
-- baixa dos pedidos de teste que acabaram de ser apagados. Deixá-los
-- faria a tela de reposição pedir ao fornecedor mil e oitocentos copos
-- por causa de venda que nunca existiu.
UPDATE "PRODUTOS" SET current_stock = 0
 WHERE tenant_id = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890'
   AND current_stock IS DISTINCT FROM 0;

-- ── As tabelas de backup de 03/09 ────────────────────────────
-- Fotografias tiradas à mão antes de uma limpeza anterior. Nenhuma tela
-- lê estas tabelas; elas eram rede de segurança de um dia que já passou.
DROP TABLE IF EXISTS bkp_lancamentos_20260903;
DROP TABLE IF EXISTS bkp_mov_estoque_20260903;
DROP TABLE IF EXISTS bkp_pedidos_loja_20260903;
DROP TABLE IF EXISTS bkp_pedidos_reposicao_20260903;
DROP TABLE IF EXISTS bkp_saldo_produtos_20260903;

COMMIT;
