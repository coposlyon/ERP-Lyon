-- ============================================================
-- 075. COMPROVANTE DE PAGAMENTO NO PEDIDO
--
--      O card Documentos oferece "Baixar Comprovante", e o comprovante
--      existia só em PEDIDOS_LOJA.receipt_url — ou seja, só para pedido
--      que nasceu na loja. Pedido lançado pelo vendedor, que é a maioria,
--      não tinha onde guardar o comprovante que o cliente manda no
--      WhatsApp, e o botão prometia um arquivo que não existia.
--
--      Agora a venda carrega o próprio comprovante. O da loja continua em
--      PEDIDOS_LOJA (é o registro daquele pedido de loja) e é COPIADO
--      para cá no backfill: o pedido de venda é onde todo mundo procura,
--      e obrigar a tela a saber de qual das duas tabelas ler seria a
--      mesma pergunta com duas respostas.
-- ============================================================
ALTER TABLE "VENDAS" ADD COLUMN IF NOT EXISTS receipt_url TEXT;

-- Traz o que já existe dos pedidos de loja que viraram venda.
UPDATE "VENDAS" v
   SET receipt_url = p.receipt_url
  FROM "PEDIDOS_LOJA" p
 WHERE p.sale_id = v.id
   AND p.receipt_url IS NOT NULL
   AND v.receipt_url IS NULL;

NOTIFY pgrst, 'reload schema';

INSERT INTO "_MIGRATIONS" (version, name) VALUES ('075', 'documentos_pedido')
ON CONFLICT (version) DO NOTHING;
