-- ============================================================
-- 095. O COMPROVANTE MORA NA PARCELA
--
--      ONDE ELE ESTAVA. Havia um `receipt_url` em VENDAS: UM comprovante
--      para o pedido inteiro. Serve enquanto o cliente paga de uma vez —
--      e nao serve para nada do que a Lyon faz de verdade:
--
--        entrada + saldo    dois comprovantes, em datas diferentes
--        boleto 30/60/90    tres boletos e tres comprovantes
--
--      Com um campo so, o segundo pagamento apaga o primeiro. O
--      comprovante nao e do pedido: e DAQUELA parcela.
--
--      POR QUE EM LANCAMENTOS. Porque a parcela ja mora la. O pedido a
--      prazo ja gera uma linha por parcela (routes/sales.js), com
--      vencimento, valor e numero — e o webhook do Pix ja da baixa
--      nelas. Criar uma tabela nova de "parcelas do pedido" seria a
--      segunda lista das mesmas parcelas, e o dia em que as duas
--      discordarem e o dia em que o financeiro para de confiar nas duas.
--
--      A LEITURA VEM JUNTO E FICA SEPARADA DO QUE FOI CONFERIDO.
--      `receipt_read` guarda o que a maquina LEU na imagem (data, hora,
--      valor, banco). `receipt_status` guarda o que a PESSOA decidiu.
--      Sao coisas diferentes: a leitura pode errar, e um comprovante
--      pode ser falso com todos os campos legiveis. Guardar as duas no
--      mesmo campo seria perder justamente a pergunta da conciliacao —
--      "o que a maquina achou bate com o que eu conferi?".
-- ============================================================

ALTER TABLE "LANCAMENTOS"
  -- O arquivo anexado (caminho no bucket privado; link assinado na hora)
  ADD COLUMN IF NOT EXISTS receipt_url    TEXT,
  -- O que a leitura extraiu: { data, hora, valor, banco, pagador, obs }
  ADD COLUMN IF NOT EXISTS receipt_read   JSONB,
  -- pendente   anexado, esperando a conferencia de sexta
  -- conferido  o financeiro olhou e bateu
  -- divergente a leitura nao bateu com o esperado (valor ou data)
  -- recusado   o financeiro olhou e nao aceitou
  ADD COLUMN IF NOT EXISTS receipt_status TEXT,
  ADD COLUMN IF NOT EXISTS receipt_at     TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS receipt_by     TEXT,
  -- O PDF do boleto desta parcela. Hoje o financeiro anexa; quando a
  -- emissao pelo banco entrar, e ela que preenche — o portal do cliente
  -- le daqui de qualquer jeito.
  ADD COLUMN IF NOT EXISTS boleto_url     TEXT;

-- A tela de conciliacao pergunta sempre a mesma coisa: "o que entrou
-- nesta semana e ainda nao foi conferido?". Sem indice, e varredura da
-- tabela inteira toda sexta.
CREATE INDEX IF NOT EXISTS idx_lancamentos_conferencia
  ON "LANCAMENTOS" (tenant_id, receipt_status, receipt_at)
  WHERE receipt_url IS NOT NULL;

COMMENT ON COLUMN "LANCAMENTOS".receipt_read IS
  'O que a leitura automatica extraiu da imagem. E o que a MAQUINA achou, nao o que foi conferido.';
COMMENT ON COLUMN "LANCAMENTOS".receipt_status IS
  'pendente | conferido | divergente | recusado. E o que a PESSOA decidiu.';

NOTIFY pgrst, 'reload schema';

INSERT INTO "_MIGRATIONS" (version, name) VALUES ('095', 'comprovante_parcela')
ON CONFLICT (version) DO NOTHING;
