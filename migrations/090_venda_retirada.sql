-- ============================================================
-- 090. ENTREGA OU RETIRADA — a modalidade do pedido.
--
-- A linha do tempo terminava sempre do mesmo jeito: aguardando coleta,
-- coleta realizada, em trânsito, aguardando entrega, entregue. Para
-- quem vai BUSCAR o pedido na fábrica, três dessas etapas nunca vão
-- acontecer — e o cliente fica esperando um caminhão que não existe.
--
-- Faltava o dado. "Retirada no local" existia apenas como uma LINHA DE
-- TEXTO dentro de `notes`, escrita pelo catálogo; nenhuma tela do ERP
-- tinha onde marcar isso, e nenhuma conta conseguia perguntar.
--
--   entrega   (padrão) o pedido vai para uma transportadora
--   retirada  o cliente busca — sem coleta, sem trânsito, sem entrega
--
-- NULL é "ninguém informou", e vale entrega: é o que 100% dos pedidos
-- antigos são, com a exceção que o backfill abaixo recupera.
--
-- O BACKFILL LÊ O QUE JÁ ESTÁ ESCRITO. Os pedidos que vieram do
-- catálogo com retirada carregam a frase em `notes` desde sempre — o
-- dado existia, só não era consultável. Passa a ser.
-- ============================================================

ALTER TABLE "VENDAS" ADD COLUMN IF NOT EXISTS delivery_mode TEXT;

COMMENT ON COLUMN "VENDAS".delivery_mode IS
  'entrega (padrão) | retirada. NULL = não informado, vale entrega.';

UPDATE "VENDAS"
   SET delivery_mode = 'retirada'
 WHERE delivery_mode IS NULL
   AND notes ILIKE '%retirada no local%';

CREATE INDEX IF NOT EXISTS idx_vendas_retirada
  ON "VENDAS" (tenant_id, delivery_mode)
  WHERE delivery_mode = 'retirada';

NOTIFY pgrst, 'reload schema';

INSERT INTO "_MIGRATIONS" (version, name) VALUES ('090', 'venda_retirada')
ON CONFLICT (version) DO NOTHING;
