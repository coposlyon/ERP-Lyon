-- ============================================================
-- ZERAR ESTOQUE E FINANCEIRO — limpeza de base de teste.
--
-- Companheiro do LIMPAR_PEDIDOS_DE_VENDA.sql, e com as mesmas regras:
-- NÃO é migração, não entra em _MIGRATIONS, não roda sozinho nunca.
--
-- O QUE ELE APAGA
--   · movimentações de estoque (entradas, saídas, ajustes)
--   · solicitações de reposição — elas SÃO movimentações com
--     `reference_type = 'replenishment_request'`, mais a linha em
--     PEDIDOS_REPOSICAO
--   · movimentações de insumo (tinta, verniz, lâmina)
--   · contas a receber E a pagar (LANCAMENTOS, a tabela inteira)
--   · e zera o saldo: PRODUTOS.current_stock e INSUMOS.current_stock
--
-- ZERAR O SALDO É O PASSO QUE NÃO PODE FALTAR. O estoque atual não é
-- uma soma das movimentações: é uma coluna gravada em PRODUTOS, mantida
-- a cada entrada e saída. Apagar só o histórico deixaria "400 unidades"
-- na tela sem uma única movimentação explicando de onde vieram — um
-- saldo órfão, que é pior que saldo errado, porque não dá para auditar.
--
-- O QUE ELE NÃO TOCA: produtos, clientes, fornecedores, colaboradores,
-- configurações. O cadastro fica; o movimento sai.
--
-- ⚠️ ATENÇÃO À ORDEM. Se você também vai rodar o
-- LIMPAR_PEDIDOS_DE_VENDA.sql, rode ELE PRIMEIRO. Aquele script apaga
-- os lançamentos de venda (`reference_type = 'sale'`); este apaga a
-- tabela LANCAMENTOS inteira. Na ordem contrária dá no mesmo, mas o
-- passo 1 de lá mostraria contagens já zeradas e você perderia a
-- conferência.
-- ============================================================


-- ─────────────────────────────────────────────────────────────
-- PASSO 0 — QUAL EMPRESA (obrigatório)
--
-- Multiempresa: sem o tenant, isto apagaria o estoque e o financeiro de
-- TODAS. Copie o id da sua empresa.
-- ─────────────────────────────────────────────────────────────
SELECT id, name, cnpj FROM "EMPRESAS" ORDER BY name;


-- ─────────────────────────────────────────────────────────────
-- PASSO 1 — O QUE VAI SUMIR (confira antes)
--
-- Troque o UUID e rode. Se os números não fizerem sentido, PARE.
-- ─────────────────────────────────────────────────────────────
WITH t AS (SELECT 'COLE-AQUI-O-UUID-DA-EMPRESA'::uuid AS id)
SELECT 'movimentações de estoque' AS o_que, count(*) FROM "MOVIMENTACOES_ESTOQUE", t
  WHERE "MOVIMENTACOES_ESTOQUE".tenant_id = t.id
UNION ALL SELECT '  ↳ dessas, solicitações de reposição', count(*) FROM "MOVIMENTACOES_ESTOQUE", t
  WHERE "MOVIMENTACOES_ESTOQUE".tenant_id = t.id AND reference_type = 'replenishment_request'
UNION ALL SELECT 'pedidos de reposição', count(*) FROM "PEDIDOS_REPOSICAO", t
  WHERE "PEDIDOS_REPOSICAO".tenant_id = t.id
UNION ALL SELECT 'movimentações de insumo', count(*) FROM "INSUMO_MOVIMENTOS", t
  WHERE "INSUMO_MOVIMENTOS".tenant_id = t.id
UNION ALL SELECT 'contas a receber', count(*) FROM "LANCAMENTOS", t
  WHERE "LANCAMENTOS".tenant_id = t.id AND type = 'receivable'
UNION ALL SELECT 'contas a pagar', count(*) FROM "LANCAMENTOS", t
  WHERE "LANCAMENTOS".tenant_id = t.id AND type = 'payable'
UNION ALL SELECT 'produtos com saldo > 0', count(*) FROM "PRODUTOS", t
  WHERE "PRODUTOS".tenant_id = t.id AND COALESCE(current_stock, 0) <> 0;


-- ─────────────────────────────────────────────────────────────
-- PASSO 2 — O BACKUP (não pule)
--
-- Inclui o saldo dos produtos ANTES de zerar — é a única forma de
-- devolver o estoque ao que era, já que ele é coluna e não soma.
--
-- Para restaurar:
--   INSERT INTO "MOVIMENTACOES_ESTOQUE" SELECT * FROM backup_mov_estoque_20260831;
--   INSERT INTO "LANCAMENTOS"           SELECT * FROM backup_lancamentos_full_20260831;
--   UPDATE "PRODUTOS" p SET current_stock = b.current_stock
--     FROM backup_saldo_produtos_20260831 b WHERE b.id = p.id;
-- ─────────────────────────────────────────────────────────────
CREATE TABLE backup_mov_estoque_20260831     AS SELECT * FROM "MOVIMENTACOES_ESTOQUE";
CREATE TABLE backup_lancamentos_full_20260831 AS SELECT * FROM "LANCAMENTOS";
CREATE TABLE backup_saldo_produtos_20260831  AS SELECT id, tenant_id, name, current_stock FROM "PRODUTOS";
CREATE TABLE backup_saldo_insumos_20260831   AS SELECT id, tenant_id, current_stock FROM "INSUMOS";
CREATE TABLE backup_pedidos_reposicao_20260831 AS SELECT * FROM "PEDIDOS_REPOSICAO";


-- ─────────────────────────────────────────────────────────────
-- PASSO 3 — APAGAR E ZERAR
--
-- Tudo numa transação. Meia limpeza — histórico fora e saldo dentro —
-- é exatamente o estado que ninguém consegue explicar depois.
-- ─────────────────────────────────────────────────────────────
BEGIN;

WITH tenant AS (SELECT 'COLE-AQUI-O-UUID-DA-EMPRESA'::uuid AS id),

     -- ── o histórico ──────────────────────────────────────────
     -- As solicitações de reposição saem aqui junto: elas são
     -- movimentações marcadas, não uma tabela à parte.
     d1 AS (DELETE FROM "MOVIMENTACOES_ESTOQUE" WHERE tenant_id IN (SELECT id FROM tenant) RETURNING 1),
     d2 AS (DELETE FROM "PEDIDOS_REPOSICAO"     WHERE tenant_id IN (SELECT id FROM tenant) RETURNING 1),
     d3 AS (DELETE FROM "INSUMO_MOVIMENTOS"     WHERE tenant_id IN (SELECT id FROM tenant) RETURNING 1),

     -- ── o financeiro, a receber e a pagar ────────────────────
     d4 AS (DELETE FROM "LANCAMENTOS"           WHERE tenant_id IN (SELECT id FROM tenant) RETURNING 1),

     -- ── e o saldo, que é coluna e não soma ───────────────────
     u1 AS (UPDATE "PRODUTOS" SET current_stock = 0
             WHERE tenant_id IN (SELECT id FROM tenant) AND COALESCE(current_stock, 0) <> 0 RETURNING 1),
     u2 AS (UPDATE "INSUMOS"  SET current_stock = 0
             WHERE tenant_id IN (SELECT id FROM tenant) AND COALESCE(current_stock, 0) <> 0 RETURNING 1)

SELECT
  (SELECT count(*) FROM d1) AS movimentacoes,
  (SELECT count(*) FROM d2) AS pedidos_reposicao,
  (SELECT count(*) FROM d3) AS mov_insumos,
  (SELECT count(*) FROM d4) AS lancamentos,
  (SELECT count(*) FROM u1) AS produtos_zerados,
  (SELECT count(*) FROM u2) AS insumos_zerados;

-- CONFIRA OS NÚMEROS ACIMA. Batendo com o passo 1:
COMMIT;
-- Não batendo:
-- ROLLBACK;


-- ─────────────────────────────────────────────────────────────
-- PASSO 4 — CONFERIR (tem que voltar tudo zero)
-- ─────────────────────────────────────────────────────────────
WITH t AS (SELECT 'COLE-AQUI-O-UUID-DA-EMPRESA'::uuid AS id)
SELECT 'movimentações' AS o_que, count(*) FROM "MOVIMENTACOES_ESTOQUE", t WHERE "MOVIMENTACOES_ESTOQUE".tenant_id = t.id
UNION ALL SELECT 'lançamentos',  count(*) FROM "LANCAMENTOS", t WHERE "LANCAMENTOS".tenant_id = t.id
UNION ALL SELECT 'produtos com saldo', count(*) FROM "PRODUTOS", t
  WHERE "PRODUTOS".tenant_id = t.id AND COALESCE(current_stock, 0) <> 0;
