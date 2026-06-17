-- 034: chave aleatória (até 5 dígitos) do pedido de venda
ALTER TABLE "VENDAS" ADD COLUMN IF NOT EXISTS order_key text;
