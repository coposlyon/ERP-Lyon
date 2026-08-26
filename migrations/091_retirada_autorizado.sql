-- ============================================================
-- 091. QUEM VAI RETIRAR O PEDIDO.
--
-- Na retirada o pedido sai da fábrica na mão de alguém — e até aqui não
-- havia onde dizer quem é esse alguém. Na prática isso vira uma conversa
-- no balcão ("é para a Maria", "que Maria?") e, no pior caso, a
-- mercadoria entregue a quem não devia.
--
-- O cliente informa NOME e CPF pelo próprio acompanhamento, e no ato da
-- retirada essa pessoa apresenta documento. É simples de propósito: um
-- nome e um documento resolvem o problema real, que é conferir na porta.
--
--   { nome, cpf, informado_em, informado_por }
--
-- `informado_por` guarda de onde veio (portal do cliente ou balcão),
-- porque a autorização vai ser questionada exatamente no dia em que
-- alguém aparecer dizendo que a combinação era outra.
--
-- JSONB e não quatro colunas: isto é UM fato — "a autorização de
-- retirada" — e ele nasce e morre inteiro. Trocar a pessoa é substituir
-- o objeto, não editar campo por campo.
--
-- O CPF fica INTEIRO no banco porque é ele que confere o documento na
-- porta; para a tela ele volta mascarado.
-- ============================================================

ALTER TABLE "VENDAS" ADD COLUMN IF NOT EXISTS pickup_person JSONB;

COMMENT ON COLUMN "VENDAS".pickup_person IS
  'Quem está autorizado a retirar: { nome, cpf, informado_em, informado_por }. NULL = ninguém informado.';

NOTIFY pgrst, 'reload schema';

INSERT INTO "_MIGRATIONS" (version, name) VALUES ('091', 'retirada_autorizado')
ON CONFLICT (version) DO NOTHING;
