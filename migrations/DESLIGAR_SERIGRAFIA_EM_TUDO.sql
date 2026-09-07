-- ============================================================
-- DESLIGAR AS TRÊS SERIGRAFIAS EM TODO O CATÁLOGO.
--
-- "Serigrafia — 1 cor", "2 cores" e "3 cores" passam a ser DESLIGADAS
-- POR PADRÃO: nenhuma categoria e nenhum produto as oferece, e o
-- configurador para de mostrá-las como tipo de impressão.
--
-- POR QUE APAGAR AS LINHAS E NÃO GRAVAR "BLOQUEADO". Neste sistema,
-- AUSÊNCIA DE LINHA JÁ É "NÃO" — é assim que `configDoModelo` monta a
-- vitrine e é assim que a tela do Administrativo lê. Gravar
-- `permitido = false` para as três encheria a tabela de decisões que
-- ninguém tomou e, pior, transformaria o religar num trabalho de
-- apagar bloqueio em vez de marcar uma caixa.
--
-- COMO RELIGAR DEPOIS, quando for o caso: Produtos → abrir o modelo →
-- "Catálogo da categoria" → Tipos de impressão → marcar e salvar. Vale
-- para a categoria inteira, uma linha por vez, e é isso que "por
-- padrão desligado" quer dizer: o normal é não, a exceção é sim.
--
-- PARA DESFAZER TUDO: rode migrations/DESFAZER_serigrafia_desligada.sql,
-- que traz as 60 linhas exatamente como estavam (com os mesmos ids).
--
-- O QUE ESTAVA LIGADO ANTES DE RODAR ISTO (07/09/2026):
--     7 categorias  × Serigrafia — 1 cor
--     7 categorias  × Serigrafia — 2 cores
--     7 categorias  × Serigrafia — 3 cores
--    39 produtos    × Serigrafia — 1 cor
--   ─────────────────────────────────────
--    60 linhas
--
-- O QUE NÃO MUDA: "Transfer — colorido" continua liberado nos 16
-- produtos em que está, e "Laser" continua bloqueado. Copo cuja
-- categoria ficar sem nenhum processo mostra "Nenhum tipo de impressão
-- liberado para este copo" no configurador — a tela aguenta, mas vale
-- saber que é o que vai acontecer na maioria delas.
-- ============================================================

BEGIN;

-- Confira ANTES o que vai sair (opcional — rode só este SELECT primeiro):
--
-- SELECT p.name, COUNT(*) FILTER (WHERE c.category_id IS NOT NULL) AS categorias,
--        COUNT(*) FILTER (WHERE c.product_id  IS NOT NULL) AS produtos
--   FROM "PRODUTO_COMPATIBILIDADE" c
--   JOIN "CONFIG_PROCESSOS" p ON p.id = c.ref_id
--  WHERE c.tipo = 'processo' AND p.name ILIKE '%serigrafia%'
--  GROUP BY p.name ORDER BY p.name;

DELETE FROM "PRODUTO_COMPATIBILIDADE" c
 USING "CONFIG_PROCESSOS" p
 WHERE c.ref_id = p.id
   AND c.tipo = 'processo'
   AND p.tenant_id = c.tenant_id
   AND p.name ILIKE '%serigrafia%';

-- Deve devolver 0 linhas. Se devolver alguma, algo ficou para trás.
SELECT p.name, c.category_id, c.product_id, c.permitido
  FROM "PRODUTO_COMPATIBILIDADE" c
  JOIN "CONFIG_PROCESSOS" p ON p.id = c.ref_id
 WHERE c.tipo = 'processo' AND p.name ILIKE '%serigrafia%';

COMMIT;

NOTIFY pgrst, 'reload schema';
