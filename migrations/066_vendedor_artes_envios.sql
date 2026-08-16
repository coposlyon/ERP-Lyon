-- ============================================================
-- 066. ARTES APROVADAS + REGISTRO INDIVIDUAL DE ENVIO
--
--      Duas lacunas do painel do vendedor:
--
--      1. A arte da oferta não pode ser "qualquer arquivo do
--         computador do vendedor". Só sai o que o Administrativo
--         aprovou — daí ARTES_PROMOCIONAIS, mais o campo image_url
--         na promoção. O seletor do vendedor lê dessas duas fontes
--         (e das campanhas de Marketing já publicadas); o servidor
--         recusa qualquer URL fora dessa lista.
--
--      2. Campanha em massa não pode ser disparo cego. OFERTAS_VENDEDOR
--         guarda o cabeçalho da campanha; OFERTAS_ENVIOS guarda UMA
--         LINHA POR CLIENTE — quem, telefone, produto, texto que ele
--         de fato recebeu, hora, status e a resposta dele. É o que
--         permite responder "o que foi enviado para a Casas do Tur no
--         dia 14?" sem depender da memória de ninguém.
-- ============================================================

-- ── Arte aprovada para uso comercial ─────────────────────────
CREATE TABLE IF NOT EXISTS "ARTES_PROMOCIONAIS" (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL,
  title       TEXT,
  image_url   TEXT NOT NULL,
  product_id  UUID REFERENCES "PRODUTOS"(id) ON DELETE SET NULL,
  promo_id    UUID,
  is_active   BOOLEAN NOT NULL DEFAULT true,
  created_by  UUID,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS artes_promocionais_tenant_idx
  ON "ARTES_PROMOCIONAIS" (tenant_id, is_active);

-- A promoção pode ter a própria arte, que é a que o vendedor usa por padrão
ALTER TABLE "PROMOCOES_VENDEDOR" ADD COLUMN IF NOT EXISTS image_url TEXT;

-- ── Uma linha por destinatário ───────────────────────────────
-- message guarda o texto JÁ PERSONALIZADO (com o nome do cliente
-- dentro): é o que ele recebeu, não o modelo. Guardar o modelo
-- deixaria "o que foi combinado com este cliente" em aberto.
--
-- provider_message_id é o id da Meta: é por ele que os callbacks de
-- entregue/lido encontram a linha depois.
CREATE TABLE IF NOT EXISTS "OFERTAS_ENVIOS" (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           UUID NOT NULL,
  oferta_id           UUID REFERENCES "OFERTAS_VENDEDOR"(id) ON DELETE CASCADE,
  user_id             UUID,
  user_name           TEXT,
  customer_id         UUID,
  customer_name       TEXT,
  phone               TEXT,
  phone_digits        TEXT,
  promo_id            UUID,
  product_id          UUID,
  product_name        TEXT,
  message             TEXT,
  image_url           TEXT,
  status              TEXT NOT NULL DEFAULT 'pending',
  provider_message_id TEXT,
  error               TEXT,
  sent_at             TIMESTAMPTZ,
  delivered_at        TIMESTAMPTZ,
  read_at             TIMESTAMPTZ,
  replied_at          TIMESTAMPTZ,
  reply_text          TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ofertas_envios_campanha_idx
  ON "OFERTAS_ENVIOS" (tenant_id, oferta_id);
CREATE INDEX IF NOT EXISTS ofertas_envios_vendedor_idx
  ON "OFERTAS_ENVIOS" (tenant_id, user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS ofertas_envios_cliente_idx
  ON "OFERTAS_ENVIOS" (tenant_id, customer_id, created_at DESC);
-- O webhook da Meta chega com o número, não com o id do cliente:
-- é por este índice que a resposta encontra o envio dela.
CREATE INDEX IF NOT EXISTS ofertas_envios_telefone_idx
  ON "OFERTAS_ENVIOS" (phone_digits, created_at DESC);
CREATE INDEX IF NOT EXISTS ofertas_envios_provider_idx
  ON "OFERTAS_ENVIOS" (provider_message_id);

ALTER TABLE "ARTES_PROMOCIONAIS" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "OFERTAS_ENVIOS"     ENABLE ROW LEVEL SECURITY;

NOTIFY pgrst, 'reload schema';

INSERT INTO "_MIGRATIONS" (version, name) VALUES ('066', 'vendedor_artes_envios')
ON CONFLICT (version) DO NOTHING;
