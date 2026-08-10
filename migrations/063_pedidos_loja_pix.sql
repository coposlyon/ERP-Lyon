-- ============================================================
-- 063. Pedidos da loja com pagamento PIX (chave própria — Nubank)
--
--      O pedido feito no site NÃO vira mais uma VENDA na hora.
--      Ele fica nesta fila com status 'aguardando_pagamento' e só
--      entra no Comercial (VENDAS + VENDA_ITENS) depois que o
--      pagamento é confirmado no ERP.
--
--      Por que uma tabela própria e não uma VENDA "pendente":
--      pedido não pago não pode aparecer em Pedidos de Venda, nem
--      somar no dashboard, no DRE ou nos relatórios. Ficando fora
--      de VENDAS, nenhum desses lugares precisa de filtro novo.
--
--      customer = {name, phone, email, company} no momento do pedido
--      items    = itens já com preço calculado no servidor e preview
--                 (URL do Storage, não data URL)
--      pix_*    = copia-e-cola gerado na chave PIX do tenant
--                 (EMPRESAS.settings.pix). O dinheiro cai direto na
--                 conta; a confirmação é feita dentro do ERP.
-- ============================================================
CREATE TABLE IF NOT EXISTS "PEDIDOS_LOJA" (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         UUID NOT NULL,
  customer_id       UUID,
  customer          JSONB NOT NULL DEFAULT '{}'::jsonb,
  items             JSONB NOT NULL DEFAULT '[]'::jsonb,
  subtotal          NUMERIC(14,2) NOT NULL DEFAULT 0,
  freight           NUMERIC(14,2) NOT NULL DEFAULT 0,
  total             NUMERIC(14,2) NOT NULL DEFAULT 0,
  notes             TEXT,
  event_date        DATE,
  status            TEXT NOT NULL DEFAULT 'aguardando_pagamento'
                    CHECK (status IN ('aguardando_pagamento','pago','expirado','cancelado')),
  pix_key           TEXT,
  pix_copy_paste    TEXT,
  pix_txid          TEXT,
  receipt_url       TEXT,
  paid_notified_at  TIMESTAMPTZ,
  confirmed_at      TIMESTAMPTZ,
  confirmed_by      UUID,
  confirmed_by_name TEXT,
  canceled_reason   TEXT,
  sale_id           UUID,
  expires_at        TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS pedidos_loja_fila_idx
  ON "PEDIDOS_LOJA" (tenant_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS pedidos_loja_cliente_idx
  ON "PEDIDOS_LOJA" (tenant_id, customer_id);
CREATE INDEX IF NOT EXISTS pedidos_loja_venda_idx
  ON "PEDIDOS_LOJA" (sale_id);

-- O backend usa a service_role key (BYPASSRLS); com RLS ligada e sem
-- políticas, o acesso direto pela anon key fica bloqueado (migration 011).
ALTER TABLE "PEDIDOS_LOJA" ENABLE ROW LEVEL SECURITY;

NOTIFY pgrst, 'reload schema';

INSERT INTO "_MIGRATIONS" (version, name) VALUES ('063', 'pedidos_loja_pix')
ON CONFLICT (version) DO NOTHING;
