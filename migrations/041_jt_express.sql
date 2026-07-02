-- ============================================================
-- 041. J&T EXPRESS — integração de envios
--      Guarda o id do pedido logístico (txlogisticId) na venda
--      para permitir cancelamento e reimpressão de etiqueta.
--      O código de rastreio (billCode) usa a coluna tracking_code
--      já criada na migração 038.
-- ============================================================

ALTER TABLE "VENDAS" ADD COLUMN IF NOT EXISTS jt_tx_id TEXT;

INSERT INTO "_MIGRATIONS" (version, name) VALUES ('041', 'jt_express')
ON CONFLICT (version) DO NOTHING;
