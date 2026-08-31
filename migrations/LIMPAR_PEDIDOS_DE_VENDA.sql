-- ============================================================
-- ZERAR OS PEDIDOS DE VENDA — limpeza de base de teste.
--
-- NÃO É UMA MIGRAÇÃO. Este arquivo não entra em _MIGRATIONS e não deve
-- rodar sozinho nunca: é uma ferramenta de uso manual, para o dia em
-- que se quer recomeçar a base com os pedidos de teste fora do caminho.
--
-- O QUE ELE APAGA: os pedidos de venda e tudo que pendura neles —
-- itens, notas fiscais, lançamentos de receita, comissões, perdas,
-- alertas, uso de cupom — mais a fila de pagamentos da loja.
--
-- O QUE ELE NÃO TOCA: clientes, produtos, estoque, fornecedores,
-- compras, colaboradores, configurações. Quem sobrevive é o cadastro;
-- quem morre é o movimento.
--
-- A NUMERAÇÃO SE RESOLVE SOZINHA. `proximo_numero_venda` é
-- MAX(number)+1 lido da própria tabela — não existe sequence para
-- reiniciar. Com a tabela vazia, o próximo pedido nasce PV-000001.
--
-- ⚠️ IRREVERSÍVEL depois que você largar o backup. Leia o passo 0.
-- ============================================================


-- ─────────────────────────────────────────────────────────────
-- PASSO 0 — QUAL EMPRESA (obrigatório)
--
-- O sistema é multiempresa. Sem o filtro por tenant, este script
-- apagaria os pedidos de TODAS as empresas do banco. Rode a consulta
-- abaixo, copie o id da sua empresa e use nos passos seguintes.
-- ─────────────────────────────────────────────────────────────
SELECT id, name, cnpj FROM "EMPRESAS" ORDER BY name;


-- ─────────────────────────────────────────────────────────────
-- PASSO 1 — O QUE VAI SUMIR (confira antes de apagar)
--
-- Troque o UUID abaixo pelo da sua empresa nas duas ocorrências de
-- :tenant e rode. Se os números não fizerem sentido, PARE.
-- ─────────────────────────────────────────────────────────────
WITH t AS (SELECT 'COLE-AQUI-O-UUID-DA-EMPRESA'::uuid AS id)
SELECT 'pedidos de venda'   AS o_que, count(*) FROM "VENDAS",         t WHERE "VENDAS".tenant_id        = t.id
UNION ALL SELECT 'itens',            count(*) FROM "VENDA_ITENS" vi WHERE vi.sale_id IN (SELECT id FROM "VENDAS", t WHERE "VENDAS".tenant_id = t.id)
UNION ALL SELECT 'notas fiscais',    count(*) FROM "NOTAS_FISCAIS", t WHERE "NOTAS_FISCAIS".tenant_id = t.id
UNION ALL SELECT 'lanç. de receita', count(*) FROM "LANCAMENTOS",   t WHERE "LANCAMENTOS".tenant_id   = t.id AND reference_type = 'sale'
UNION ALL SELECT 'fila da loja',     count(*) FROM "PEDIDOS_LOJA",  t WHERE "PEDIDOS_LOJA".tenant_id  = t.id;


-- ─────────────────────────────────────────────────────────────
-- PASSO 2 — O BACKUP (não pule)
--
-- Cópias completas das duas tabelas que importam, com a data no nome.
-- Custa segundos, ocupa quase nada, e é a diferença entre "apaguei
-- errado" e "apaguei errado e não tem volta".
--
-- Para restaurar depois:
--   INSERT INTO "VENDAS"      SELECT * FROM backup_vendas_20260831;
--   INSERT INTO "VENDA_ITENS" SELECT * FROM backup_venda_itens_20260831;
--
-- Quando tiver certeza de que não precisa mais:
--   DROP TABLE backup_vendas_20260831, backup_venda_itens_20260831;
-- ─────────────────────────────────────────────────────────────
CREATE TABLE backup_vendas_20260831      AS SELECT * FROM "VENDAS";
CREATE TABLE backup_venda_itens_20260831 AS SELECT * FROM "VENDA_ITENS";
CREATE TABLE backup_lancamentos_20260831 AS SELECT * FROM "LANCAMENTOS" WHERE reference_type = 'sale';


-- ─────────────────────────────────────────────────────────────
-- PASSO 3 — APAGAR
--
-- Tudo numa transação só: ou vai inteiro, ou não vai nada. Meia
-- limpeza deixaria lançamento financeiro apontando para pedido que não
-- existe mais, que é pior do que não ter limpado.
--
-- A ORDEM É DE FORA PARA DENTRO. As tabelas que penduram em VENDAS vêm
-- antes; VENDAS por último. Duas delas (ALERTAS_PEDIDO e
-- AGENDA_VENDEDOR) têm chave estrangeira declarada e se resolveriam
-- sozinhas — estão aqui assim mesmo, porque depender de cascade
-- invisível é o tipo de coisa que se descobre errado tarde demais.
--
-- Troque o UUID em `tenant` e rode o bloco inteiro de uma vez.
-- ─────────────────────────────────────────────────────────────
BEGIN;

WITH tenant AS (SELECT 'COLE-AQUI-O-UUID-DA-EMPRESA'::uuid AS id),
     pedidos AS (SELECT v.id FROM "VENDAS" v, tenant t WHERE v.tenant_id = t.id),

     -- ── o que pendura no pedido ──────────────────────────────
     d1  AS (DELETE FROM "VENDA_ITENS"        WHERE sale_id IN (SELECT id FROM pedidos) RETURNING 1),
     d2  AS (DELETE FROM "ALERTAS_PEDIDO"     WHERE sale_id IN (SELECT id FROM pedidos) RETURNING 1),
     d3  AS (DELETE FROM "NOTAS_FISCAIS"      WHERE tenant_id IN (SELECT id FROM tenant) RETURNING 1),
     d4  AS (DELETE FROM "VENDEDOR_COMISSOES" WHERE tenant_id IN (SELECT id FROM tenant) RETURNING 1),
     d5  AS (DELETE FROM "PRODUCAO_PERDAS"    WHERE tenant_id IN (SELECT id FROM tenant) RETURNING 1),
     d6  AS (DELETE FROM "PERDAS_MATRIZ"      WHERE tenant_id IN (SELECT id FROM tenant) RETURNING 1),
     d7  AS (DELETE FROM "CUPONS_USOS"        WHERE sale_id IN (SELECT id FROM pedidos) RETURNING 1),

     -- ── o dinheiro que veio dos pedidos ──────────────────────
     -- Só `reference_type = 'sale'`: despesa, folha e conta a pagar
     -- não têm nada a ver com pedido de venda e ficam onde estão.
     d8  AS (DELETE FROM "LANCAMENTOS"
             WHERE tenant_id IN (SELECT id FROM tenant) AND reference_type = 'sale' RETURNING 1),

     -- ── a fila de pagamentos da loja ─────────────────────────
     d9  AS (DELETE FROM "PEDIDOS_LOJA"       WHERE tenant_id IN (SELECT id FROM tenant) RETURNING 1),

     -- ── e por fim os pedidos ─────────────────────────────────
     d10 AS (DELETE FROM "VENDAS"             WHERE id IN (SELECT id FROM pedidos) RETURNING 1)

SELECT
  (SELECT count(*) FROM d1)  AS itens,
  (SELECT count(*) FROM d2)  AS alertas,
  (SELECT count(*) FROM d3)  AS notas_fiscais,
  (SELECT count(*) FROM d4)  AS comissoes,
  (SELECT count(*) FROM d5)  AS perdas_producao,
  (SELECT count(*) FROM d6)  AS perdas_matriz,
  (SELECT count(*) FROM d7)  AS cupons_usados,
  (SELECT count(*) FROM d8)  AS lancamentos,
  (SELECT count(*) FROM d9)  AS fila_da_loja,
  (SELECT count(*) FROM d10) AS pedidos;

-- CONFIRA OS NÚMEROS ACIMA. Batendo com o passo 1:
COMMIT;
-- Não batendo:
-- ROLLBACK;


-- ─────────────────────────────────────────────────────────────
-- PASSO 4 — CONFERIR
--
-- Tem que voltar tudo zero, e o próximo pedido vai nascer PV-000001.
-- ─────────────────────────────────────────────────────────────
WITH t AS (SELECT 'COLE-AQUI-O-UUID-DA-EMPRESA'::uuid AS id)
SELECT 'pedidos restantes' AS o_que, count(*) FROM "VENDAS", t WHERE "VENDAS".tenant_id = t.id
UNION ALL SELECT 'fila da loja',     count(*) FROM "PEDIDOS_LOJA", t WHERE "PEDIDOS_LOJA".tenant_id = t.id;
