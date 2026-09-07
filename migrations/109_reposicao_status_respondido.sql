-- ============================================================
-- 109. O FORNECEDOR NÃO CONSEGUIA RESPONDER.
--
-- O QUE ACONTECIA. O fornecedor abria o link, conferia as quantidades,
-- clicava em "Confirmar e enviar" e levava na cara:
--
--   new row for relation "PEDIDOS_REPOSICAO" violates check constraint
--   "pedidos_reposicao_status_check"
--
-- A tela inteira funcionava; só o último clique não. E a mensagem que
-- ele via era o texto cru do Postgres, dentro da página da Lyon.
--
-- POR QUE. A tabela nasceu com um CHECK de três valores — 'pending',
-- 'completed', 'cancelled'. A migração 098 acrescentou a resposta do
-- fornecedor e um quarto status, 'respondido', anotando que "os status
-- vivem no código". Só que o CHECK antigo continuou lá, e ele não lê
-- comentário: qualquer UPDATE para 'respondido' batia na parede.
--
-- O CHECK FICA, COM A RÉGUA INTEIRA. Tirar a restrição resolveria este
-- caso e abriria a porta para o próximo status escrito errado — um
-- 'respondida' no lugar de 'respondido' entraria calado e sumiria da
-- listagem sem ninguém entender por quê. Uma coluna que só admite quatro
-- valores merece dizer quais são.
--
-- A RÉGUA COMPLETA:
--   pending      a Lyon pediu, o fornecedor ainda não respondeu
--   respondido   o fornecedor disse o que tem — falta a Lyon receber
--   completed    chegou e o estoque foi atualizado
--   cancelled    a Lyon desistiu do pedido
-- ============================================================

ALTER TABLE "PEDIDOS_REPOSICAO"
  DROP CONSTRAINT IF EXISTS pedidos_reposicao_status_check;

ALTER TABLE "PEDIDOS_REPOSICAO"
  ADD CONSTRAINT pedidos_reposicao_status_check
  CHECK (status IN ('pending', 'respondido', 'completed', 'cancelled'));

NOTIFY pgrst, 'reload schema';

INSERT INTO "_MIGRATIONS" (version, name) VALUES ('109', 'reposicao_status_respondido')
ON CONFLICT (version) DO NOTHING;
