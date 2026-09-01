-- ============================================================
-- 097. A TRANSPORTADORA QUE É "O CLIENTE VEM BUSCAR".
--
--      "Retirar em mãos" era uma OPÇÃO FALSA dentro do seletor de
--      transportadora do pedido: aparecia na lista, não era uma
--      transportadora, e existia só para o operador conseguir dizer que
--      o cliente ia buscar.
--
--      A Lyon resolveu isso melhor do que o sistema: cadastrou a
--      retirada como transportadora de verdade, com o próprio CNPJ. O
--      seletor então mostrava as três cadastradas MAIS a opção falsa —
--      duas formas de dizer a mesma coisa, e o operador escolhendo no
--      escuro qual delas o sistema entende.
--
--      Falta uma só coisa para a de verdade bastar: o sistema saber que
--      aquela linha significa retirada. É este campo.
--
--      POR QUE ISSO IMPORTA ALÉM DA TELA. `VENDAS.delivery_mode`
--      (migração 090) é o que lib/atencao.js lê para decidir se o
--      pedido passa por "Em Trânsito". Sem saber que a transportadora
--      escolhida é retirada, todo pedido de balcão voltaria a esperar
--      uma coleta que nunca vem — que era exatamente o defeito que a
--      opção falsa escondia.
-- ============================================================

ALTER TABLE "TRANSPORTADORAS"
  ADD COLUMN IF NOT EXISTS is_pickup BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN "TRANSPORTADORAS".is_pickup IS
  'Marca a linha que representa "o cliente retira no local". Pedido com esta transportadora nasce com delivery_mode = retirada e pula a fase Em Trânsito.';

NOTIFY pgrst, 'reload schema';

INSERT INTO "_MIGRATIONS" (version, name) VALUES ('097', 'transportadora_retirada')
ON CONFLICT (version) DO NOTHING;
