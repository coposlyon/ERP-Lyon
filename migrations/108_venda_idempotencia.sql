-- ============================================================
-- 108. UM CLIQUE, UM PEDIDO.
--
-- O QUE ACONTECEU. Clicar duas vezes em "Confirmar pedido" criou doze
-- pedidos iguais — mesmo cliente, mesmo valor, mesmo minuto. O botão
-- tem `disabled` enquanto a gravação corre, mas `finalizeSale` é async
-- e consulta o Contábil ANTES de disparar a venda: nessa janela o botão
-- ainda está solto, e cada clique enfileira outro pedido.
--
-- A TRAVA DO BOTÃO NÃO BASTA, e é por isso que a proteção mora aqui.
-- Duplo clique é só uma das formas de mandar o mesmo pedido duas vezes;
-- as outras são a rede que repete o POST, o operador que aperta F5 no
-- meio, e a segunda aba aberta no mesmo carrinho. Tela nenhuma protege
-- disso — quem tem de recusar o repetido é quem grava.
--
-- COMO FUNCIONA. A tela gera uma chave por PEDIDO (não por clique) e a
-- manda junto. Chegando duas vezes a mesma chave, a segunda não cria
-- nada: o servidor devolve o pedido que já existe. O índice é único e
-- PARCIAL — só vale para linha que tem chave —, então todo pedido
-- antigo (e todo pedido criado por outro caminho, como o do site)
-- continua entrando sem ela.
-- ============================================================

ALTER TABLE "VENDAS"
  ADD COLUMN IF NOT EXISTS idempotency_key TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS vendas_idempotency_key_idx
    ON "VENDAS" (tenant_id, idempotency_key)
 WHERE idempotency_key IS NOT NULL;

NOTIFY pgrst, 'reload schema';

INSERT INTO "_MIGRATIONS" (version, name) VALUES ('108', 'venda_idempotencia')
ON CONFLICT (version) DO NOTHING;
