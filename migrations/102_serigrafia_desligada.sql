-- ============================================================
-- 102. AS TRÊS SERIGRAFIAS SAEM DO PADRÃO.
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
-- COMO RELIGAR, quando for o caso: Produtos → abrir o modelo →
-- "Catálogo da categoria" → Tipos de impressão → marcar e salvar. Vale
-- para a categoria inteira. É isso que "por padrão desligado" quer
-- dizer: o normal é não, a exceção é sim.
--
-- RODAR DE NOVO NÃO FAZ MAL, e é isso que a torna segura como migração:
-- apagar o que já não existe não é erro. Mas ela roda UMA VEZ — quem
-- religar a serigrafia numa categoria depois deste deploy não vai vê-la
-- ser desligada outra vez no deploy seguinte.
--
-- O QUE ESTAVA LIGADO QUANDO ISTO FOI ESCRITO (07/09/2026):
--     7 categorias  × Serigrafia — 1 cor
--     7 categorias  × Serigrafia — 2 cores
--     7 categorias  × Serigrafia — 3 cores
--    39 produtos    × Serigrafia — 1 cor
--   ─────────────────────────────────────
--    60 linhas
--
-- PARA DESFAZER: migrations/DESFAZER_serigrafia_desligada.sql traz as
-- 60 de volta com os ids originais. Ele NÃO é numerado de propósito —
-- desfazer é decisão de gente, não coisa que um deploy faz sozinho.
--
-- O QUE NÃO MUDA: "Transfer — colorido" continua liberado nos 16
-- produtos em que está, e "Laser" continua bloqueado. Categoria que
-- ficar sem nenhum processo mostra "Nenhum tipo de impressão liberado
-- para este copo" no configurador — a tela aguenta, mas é o que vai
-- acontecer na maioria delas até alguém liberar o Transfer.
-- ============================================================

DELETE FROM "PRODUTO_COMPATIBILIDADE" c
 USING "CONFIG_PROCESSOS" p
 WHERE c.ref_id = p.id
   AND c.tipo = 'processo'
   AND p.tenant_id = c.tenant_id
   AND p.name ILIKE '%serigrafia%';

NOTIFY pgrst, 'reload schema';

INSERT INTO "_MIGRATIONS" (version, name) VALUES ('102', 'serigrafia_desligada')
ON CONFLICT (version) DO NOTHING;
