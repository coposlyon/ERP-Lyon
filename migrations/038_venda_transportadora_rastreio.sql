-- 038: transportadora e código de rastreio no pedido de venda
ALTER TABLE "VENDAS" ADD COLUMN IF NOT EXISTS carrier_id uuid;
ALTER TABLE "VENDAS" ADD COLUMN IF NOT EXISTS tracking_code text;
