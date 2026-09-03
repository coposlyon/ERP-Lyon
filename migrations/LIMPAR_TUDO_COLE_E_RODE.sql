-- ============================================================
-- LIMPAR PEDIDOS + ESTOQUE + FINANCEIRO — cole e rode.
--
-- Versão sem fricção dos dois scripts separados: aqui não se procura
-- UUID nem se cola nada em lugar nenhum. São DOIS blocos; rode um,
-- olhe, rode o outro.
--
-- A EMPRESA É DESCOBERTA SOZINHA, e com uma trava embutida:
-- `(SELECT id FROM "EMPRESAS")` é uma subconsulta escalar — havendo
-- mais de uma empresa no banco, o Postgres RECUSA com "more than one
-- row returned by a subquery used as an expression" e nada acontece.
-- É de propósito: é exatamente o caso em que apagar sem escolher a
-- empresa levaria os dados de outra junto.
--
-- ⚠️ IRREVERSÍVEL depois que você largar os backups do bloco 1.
-- ============================================================


-- ╔══════════════════════════════════════════════════════════╗
-- ║  BLOCO 1 — CONFERIR E FAZER BACKUP                       ║
-- ║  Não apaga nada. Rode inteiro e leia o resultado.        ║
-- ╚══════════════════════════════════════════════════════════╝

CREATE TABLE IF NOT EXISTS bkp_vendas            AS SELECT * FROM "VENDAS";
CREATE TABLE IF NOT EXISTS bkp_venda_itens       AS SELECT * FROM "VENDA_ITENS";
CREATE TABLE IF NOT EXISTS bkp_lancamentos       AS SELECT * FROM "LANCAMENTOS";
CREATE TABLE IF NOT EXISTS bkp_mov_estoque       AS SELECT * FROM "MOVIMENTACOES_ESTOQUE";
CREATE TABLE IF NOT EXISTS bkp_pedidos_reposicao AS SELECT * FROM "PEDIDOS_REPOSICAO";
CREATE TABLE IF NOT EXISTS bkp_pedidos_loja      AS SELECT * FROM "PEDIDOS_LOJA";
CREATE TABLE IF NOT EXISTS bkp_notas_fiscais     AS SELECT * FROM "NOTAS_FISCAIS";
-- O saldo vai à parte: ele é COLUNA, não soma de movimentação, e coluna
-- zerada não volta de um INSERT.
CREATE TABLE IF NOT EXISTS bkp_saldo_produtos    AS SELECT id, name, current_stock FROM "PRODUTOS";
CREATE TABLE IF NOT EXISTS bkp_saldo_insumos     AS SELECT id, current_stock FROM "INSUMOS";

WITH t AS (SELECT (SELECT id FROM "EMPRESAS") AS id)
SELECT 'pedidos de venda'        AS o_que, count(*) FROM "VENDAS", t               WHERE "VENDAS".tenant_id = t.id
UNION ALL SELECT 'itens dos pedidos',      count(*) FROM "VENDA_ITENS" vi          WHERE vi.sale_id IN (SELECT id FROM "VENDAS", t WHERE "VENDAS".tenant_id = t.id)
UNION ALL SELECT 'fila de pagamentos',     count(*) FROM "PEDIDOS_LOJA", t         WHERE "PEDIDOS_LOJA".tenant_id = t.id
UNION ALL SELECT 'notas fiscais',          count(*) FROM "NOTAS_FISCAIS", t        WHERE "NOTAS_FISCAIS".tenant_id = t.id
UNION ALL SELECT 'contas a receber',       count(*) FROM "LANCAMENTOS", t          WHERE "LANCAMENTOS".tenant_id = t.id AND type = 'receivable'
UNION ALL SELECT 'contas a pagar',         count(*) FROM "LANCAMENTOS", t          WHERE "LANCAMENTOS".tenant_id = t.id AND type = 'payable'
UNION ALL SELECT 'movim. de estoque',      count(*) FROM "MOVIMENTACOES_ESTOQUE", t WHERE "MOVIMENTACOES_ESTOQUE".tenant_id = t.id
UNION ALL SELECT '  ↳ solicit. de reposição', count(*) FROM "MOVIMENTACOES_ESTOQUE", t WHERE "MOVIMENTACOES_ESTOQUE".tenant_id = t.id AND reference_type = 'replenishment_request'
UNION ALL SELECT 'produtos com saldo',     count(*) FROM "PRODUTOS", t             WHERE "PRODUTOS".tenant_id = t.id AND COALESCE(current_stock, 0) <> 0;



-- ╔══════════════════════════════════════════════════════════╗
-- ║  BLOCO 2 — APAGAR                                        ║
-- ║  Só rode depois de ver os números do bloco 1.            ║
-- ║  Tudo numa transação: ou vai inteiro, ou não vai nada.   ║
-- ╚══════════════════════════════════════════════════════════╝

WITH tenant  AS (SELECT (SELECT id FROM "EMPRESAS") AS id),
     pedidos AS (SELECT v.id FROM "VENDAS" v, tenant t WHERE v.tenant_id = t.id),

     -- ── o que pendura no pedido ──────────────────────────────
     d1  AS (DELETE FROM "VENDA_ITENS"           WHERE sale_id   IN (SELECT id FROM pedidos) RETURNING 1),
     d2  AS (DELETE FROM "ALERTAS_PEDIDO"        WHERE sale_id   IN (SELECT id FROM pedidos) RETURNING 1),
     d3  AS (DELETE FROM "CUPONS_USOS"           WHERE sale_id   IN (SELECT id FROM pedidos) RETURNING 1),
     d4  AS (DELETE FROM "NOTAS_FISCAIS"         WHERE tenant_id IN (SELECT id FROM tenant)  RETURNING 1),
     d5  AS (DELETE FROM "VENDEDOR_COMISSOES"    WHERE tenant_id IN (SELECT id FROM tenant)  RETURNING 1),
     d6  AS (DELETE FROM "PEDIDOS_LOJA"          WHERE tenant_id IN (SELECT id FROM tenant)  RETURNING 1),

     -- ── estoque: histórico, solicitações e insumos ───────────
     -- As solicitações de reposição NÃO são tabela própria: são
     -- movimentações com reference_type='replenishment_request', e saem
     -- em d7 junto com o resto.
     d7  AS (DELETE FROM "MOVIMENTACOES_ESTOQUE" WHERE tenant_id IN (SELECT id FROM tenant)  RETURNING 1),
     d8  AS (DELETE FROM "PEDIDOS_REPOSICAO"     WHERE tenant_id IN (SELECT id FROM tenant)  RETURNING 1),
     d9  AS (DELETE FROM "INSUMO_MOVIMENTOS"     WHERE tenant_id IN (SELECT id FROM tenant)  RETURNING 1),
     d10 AS (DELETE FROM "PRODUCAO_PERDAS"       WHERE tenant_id IN (SELECT id FROM tenant)  RETURNING 1),
     d11 AS (DELETE FROM "PERDAS_MATRIZ"         WHERE tenant_id IN (SELECT id FROM tenant)  RETURNING 1),

     -- ── financeiro: a receber E a pagar ──────────────────────
     d12 AS (DELETE FROM "LANCAMENTOS"           WHERE tenant_id IN (SELECT id FROM tenant)  RETURNING 1),

     -- ── e os pedidos, por último ─────────────────────────────
     d13 AS (DELETE FROM "VENDAS"                WHERE id        IN (SELECT id FROM pedidos) RETURNING 1),

     -- ── o saldo, que é coluna e não some com DELETE ──────────
     u1  AS (UPDATE "PRODUTOS" SET current_stock = 0
              WHERE tenant_id IN (SELECT id FROM tenant) AND COALESCE(current_stock, 0) <> 0 RETURNING 1),
     u2  AS (UPDATE "INSUMOS"  SET current_stock = 0
              WHERE tenant_id IN (SELECT id FROM tenant) AND COALESCE(current_stock, 0) <> 0 RETURNING 1)

SELECT
  (SELECT count(*) FROM d13) AS pedidos,
  (SELECT count(*) FROM d1)  AS itens,
  (SELECT count(*) FROM d6)  AS fila_loja,
  (SELECT count(*) FROM d4)  AS notas_fiscais,
  (SELECT count(*) FROM d12) AS lancamentos,
  (SELECT count(*) FROM d7)  AS movim_estoque,
  (SELECT count(*) FROM d8)  AS pedidos_reposicao,
  (SELECT count(*) FROM d9)  AS movim_insumos,
  (SELECT count(*) FROM u1)  AS produtos_zerados,
  (SELECT count(*) FROM u2)  AS insumos_zerados;



-- ╔══════════════════════════════════════════════════════════╗
-- ║  DEPOIS: apagar os backups (só quando tiver certeza)     ║
-- ╚══════════════════════════════════════════════════════════╝
-- DROP TABLE bkp_vendas, bkp_venda_itens, bkp_lancamentos, bkp_mov_estoque,
--            bkp_pedidos_reposicao, bkp_pedidos_loja, bkp_notas_fiscais,
--            bkp_saldo_produtos, bkp_saldo_insumos;
