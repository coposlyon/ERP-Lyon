-- ============================================================
-- LIMPEZA DOS DADOS DE TESTE — 07/09/2026
--
-- NÃO É MIGRAÇÃO: não tem número, não roda no deploy. É uma faxina
-- pedida à mão, e apagar dado é decisão de gente — não coisa que um
-- servidor faz sozinho ao subir.
--
-- O QUE SAI (conferido no banco antes de escrever):
--     1 venda (PV-000001, a de R$ 0,01 do teste de NF-e) + 1 item
--     1 pedido da loja
--     1 nota fiscal (a rejeitada pela SEFAZ, erro 203)
--     0 notas recebidas (a tabela já está vazia)
--     1 produto com estoque diferente de zero (CS4 - 3119, saldo -200)
--
-- O QUE **NÃO** SAI, de propósito:
--     PRODUTOS, CLIENTES, ITENS, CATEGORIAS — o cadastro fica inteiro.
--     LANCAMENTOS e DESPESAS_FIXAS — ver o bloco do financeiro no fim,
--     que está comentado à espera de decisão.
--
-- BACKUP: as linhas foram salvas em JSON antes, em
--     %LOCALAPPDATA%\Temp\claude\backup-limpeza\
-- Se algo aqui foi longe demais, dá para repor de lá.
-- ============================================================

BEGIN;

-- ── 1. ESTOQUE ZERADO ───────────────────────────────────────
UPDATE "PRODUTOS"
   SET current_stock = 0
 WHERE tenant_id = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890'
   AND current_stock <> 0;

-- ── 2. FISCAL / NF-e ────────────────────────────────────────
DELETE FROM "NOTAS_FISCAIS"
 WHERE tenant_id = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';

DELETE FROM "NFE_RECEBIDAS"
 WHERE tenant_id = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';

-- ── 3. PEDIDOS ──────────────────────────────────────────────
-- Os itens primeiro: VENDA_ITENS aponta para VENDAS por chave
-- estrangeira, e o banco recusa apagar o pai antes do filho.
DELETE FROM "VENDA_ITENS"
 WHERE sale_id IN (
   SELECT id FROM "VENDAS"
    WHERE tenant_id = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890'
 );

DELETE FROM "VENDAS"
 WHERE tenant_id = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';

DELETE FROM "PEDIDOS_LOJA"
 WHERE tenant_id = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';

-- Confere o que sobrou (deve dar tudo zero, menos os produtos).
SELECT 'VENDAS' t, count(*) FROM "VENDAS" WHERE tenant_id = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890'
UNION ALL SELECT 'PEDIDOS_LOJA', count(*) FROM "PEDIDOS_LOJA" WHERE tenant_id = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890'
UNION ALL SELECT 'NOTAS_FISCAIS', count(*) FROM "NOTAS_FISCAIS" WHERE tenant_id = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890'
UNION ALL SELECT 'produtos com estoque', count(*) FROM "PRODUTOS" WHERE tenant_id = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890' AND current_stock <> 0;

COMMIT;


-- ============================================================
-- 4. O FINANCEIRO — PARADO À ESPERA DE DECISÃO.
--
-- "Central de Contas" e "Contas a Receber/Pagar" são a MESMA TABELA
-- (LANCAMENTOS); o que muda entre as duas telas é o recorte. Então
-- "reagendar numa e limpar na outra" apagaria justamente o que seria
-- reagendado.
--
-- Hoje há 19 lançamentos: 18 a pagar em aberto (as despesas fixas do
-- mês) e 1 a receber já pago. Mais 17 DESPESAS_FIXAS, que são o
-- CADASTRO das contas recorrentes (Aluguel dia 25, Contador dia 5,
-- Internet dia 25...) — elas têm dia do mês, não data de vencimento.
--
-- Escolha um dos dois e descomente:
-- ============================================================

-- OPÇÃO A — joga os 18 a pagar para janeiro/2027 e apaga o resto.
-- (é o que "reagendar a Central de Contas e limpar o Receber/Pagar"
--  provavelmente quer dizer)
--
-- UPDATE "LANCAMENTOS"
--    SET due_date = '2027-01-10'
--  WHERE tenant_id = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890'
--    AND type = 'payable' AND status = 'pending';
--
-- DELETE FROM "LANCAMENTOS"
--  WHERE tenant_id = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890'
--    AND NOT (type = 'payable' AND status = 'pending');


-- OPÇÃO B — apaga TODOS os 19 lançamentos.
-- O cadastro de despesas fixas continua de pé e volta a gerar os
-- lançamentos do mês; o histórico é que se perde.
--
-- DELETE FROM "LANCAMENTOS"
--  WHERE tenant_id = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
