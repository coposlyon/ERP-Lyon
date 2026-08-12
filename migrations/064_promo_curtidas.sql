-- ============================================================
-- 064. Curtidas nas promoções da loja
--
--      As promoções em si moram em EMPRESAS.settings.site.promos
--      (o lojista edita em Configurações → Site). O que não cabe
--      num JSON de configuração é a curtida: ela é do VISITANTE,
--      chega a qualquer hora e precisa ser contada sem corrida
--      entre duas pessoas salvando o mesmo settings.
--
--      Curtir não pede login — quem entra na loja curte. A
--      identidade é um id anônimo que o navegador guarda no
--      localStorage (visitor_id), e a UNIQUE abaixo é o que
--      impede a mesma pessoa de contar duas vezes. Não é à prova
--      de quem limpa o navegador de propósito, e não precisa
--      ser: é termômetro de vitrine, não votação.
--
--      promo_id é TEXT porque vem do JSON da configuração, não
--      de uma tabela — não há FK para apontar.
-- ============================================================
CREATE TABLE IF NOT EXISTS "PROMO_CURTIDAS" (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  UUID NOT NULL,
  promo_id   TEXT NOT NULL,
  visitor_id TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, promo_id, visitor_id)
);

-- contagem por promoção (a leitura mais frequente: abrir a home)
CREATE INDEX IF NOT EXISTS promo_curtidas_promo_idx
  ON "PROMO_CURTIDAS" (tenant_id, promo_id);
-- "o que ESTE visitante já curtiu", para acender os corações
CREATE INDEX IF NOT EXISTS promo_curtidas_visitante_idx
  ON "PROMO_CURTIDAS" (tenant_id, visitor_id);

-- O backend usa a service_role key (BYPASSRLS); com RLS ligada e sem
-- políticas, o acesso direto pela anon key fica bloqueado (migration 011).
ALTER TABLE "PROMO_CURTIDAS" ENABLE ROW LEVEL SECURITY;

NOTIFY pgrst, 'reload schema';

INSERT INTO "_MIGRATIONS" (version, name) VALUES ('064', 'promo_curtidas')
ON CONFLICT (version) DO NOTHING;
