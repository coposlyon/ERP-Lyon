-- ============================================================
-- 065. PAINEL DO VENDEDOR
--
--      O Dashboard do Vendedor mede UNIDADES, não reais: a meta
--      é "15.000 copos no mês", a comissão nasce do que passou
--      dela e o bônus só sai depois de 3 meses seguidos batendo.
--      Nada disso pode ficar dentro do código — o Administrativo
--      muda faixa, meta, bônus e território sem programador.
--
--      Quatro tabelas de configuração + duas de registro:
--
--      VENDEDOR_PLANOS     faixas do plano (Jan/Fev/Mar = 15.000 un
--                          e R$ 1.500 de bônus, e assim por diante).
--                          Agrupadas por plan_group para que dois
--                          vendedores possam seguir planos diferentes.
--      VENDEDORES          o cadastro comercial do usuário: território
--                          (UFs que ele atende), plano que segue e
--                          tamanho da carteira (Top 10/20/30/50).
--      PROMOCOES_VENDEDOR  as ofertas que o Administrativo libera. O
--                          vendedor escolhe entre elas — não inventa
--                          preço promocional.
--      VENDEDOR_COMISSOES  quais pedidos foram classificados como
--                          excedente elegível e quanto cada um gerou.
--      OFERTAS_VENDEDOR    o que foi disparado por WhatsApp, para quem.
-- ============================================================

-- ── Faixas do plano de metas ─────────────────────────────────
-- months guarda os meses cobertos pela faixa ({1,2,3} = Jan/Fev/Mar).
-- monthly_goal é em UNIDADES; cycle_bonus e commission_pct em R$ e %.
CREATE TABLE IF NOT EXISTS "VENDEDOR_PLANOS" (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      UUID NOT NULL,
  plan_group     TEXT NOT NULL DEFAULT 'padrao',
  name           TEXT NOT NULL,
  seq            INT  NOT NULL DEFAULT 1,
  months         INT[] NOT NULL DEFAULT '{}',
  monthly_goal   NUMERIC(14,2) NOT NULL DEFAULT 0,
  cycle_bonus    NUMERIC(14,2) NOT NULL DEFAULT 0,
  cycle_months   INT  NOT NULL DEFAULT 3,
  commission_pct NUMERIC(6,3)  NOT NULL DEFAULT 2,
  is_active      BOOLEAN NOT NULL DEFAULT true,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS vendedor_planos_tenant_idx
  ON "VENDEDOR_PLANOS" (tenant_id, plan_group, seq);

-- ── Cadastro comercial do vendedor ───────────────────────────
CREATE TABLE IF NOT EXISTS "VENDEDORES" (
  user_id      UUID PRIMARY KEY,
  tenant_id    UUID NOT NULL,
  is_active    BOOLEAN NOT NULL DEFAULT true,
  region_label TEXT,
  territory    TEXT[] NOT NULL DEFAULT '{}',
  plan_group   TEXT   NOT NULL DEFAULT 'padrao',
  top_clients  INT    NOT NULL DEFAULT 10,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS vendedores_tenant_idx ON "VENDEDORES" (tenant_id);

-- ── Promoções liberadas pelo Administrativo ──────────────────
-- Sem uma linha aqui o vendedor não tem o que ofertar: é isto que
-- impede o preço promocional de nascer no meio da conversa.
CREATE TABLE IF NOT EXISTS "PROMOCOES_VENDEDOR" (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        UUID NOT NULL,
  product_id       UUID REFERENCES "PRODUTOS"(id) ON DELETE CASCADE,
  title            TEXT,
  suggested_qty    NUMERIC(14,2),
  valid_until      DATE,
  promo_price      NUMERIC(14,4),
  discount_pct     NUMERIC(6,3),
  message_template TEXT,
  is_active        BOOLEAN NOT NULL DEFAULT true,
  created_by       UUID,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS promocoes_vendedor_tenant_idx
  ON "PROMOCOES_VENDEDOR" (tenant_id, is_active);

-- ── Pedidos classificados como excedente elegível ────────────
-- units_before é quanto o vendedor já tinha acumulado quando este
-- pedido entrou: é o que separa "pedido que ajudou a bater a meta"
-- de "pedido que veio depois dela" — e só o segundo paga comissão.
-- Um pedido que atravessa a linha entra proporcionalmente.
CREATE TABLE IF NOT EXISTS "VENDEDOR_COMISSOES" (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        UUID NOT NULL,
  user_id          UUID NOT NULL,
  sale_id          UUID NOT NULL,
  reference_month  TEXT NOT NULL,
  monthly_goal     NUMERIC(14,2) NOT NULL DEFAULT 0,
  units_before     NUMERIC(14,2) NOT NULL DEFAULT 0,
  units_total      NUMERIC(14,2) NOT NULL DEFAULT 0,
  units_eligible   NUMERIC(14,2) NOT NULL DEFAULT 0,
  amount_eligible  NUMERIC(14,2) NOT NULL DEFAULT 0,
  commission_pct   NUMERIC(6,3)  NOT NULL DEFAULT 0,
  commission_value NUMERIC(14,2) NOT NULL DEFAULT 0,
  computed_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, sale_id)
);

CREATE INDEX IF NOT EXISTS vendedor_comissoes_mes_idx
  ON "VENDEDOR_COMISSOES" (tenant_id, user_id, reference_month);

-- ── Ofertas disparadas por WhatsApp ──────────────────────────
CREATE TABLE IF NOT EXISTS "OFERTAS_VENDEDOR" (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  UUID NOT NULL,
  user_id    UUID,
  promo_id   UUID,
  product_id UUID,
  customers  JSONB NOT NULL DEFAULT '[]'::jsonb,
  message    TEXT,
  image_url  TEXT,
  results    JSONB NOT NULL DEFAULT '{}'::jsonb,
  status     TEXT NOT NULL DEFAULT 'sent',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ofertas_vendedor_idx
  ON "OFERTAS_VENDEDOR" (tenant_id, user_id, created_at DESC);

-- ── Plano padrão para quem ainda não configurou nada ─────────
-- Roda para toda empresa e só quando o grupo 'padrao' está vazio,
-- então rodar a migração de novo não duplica faixa.
INSERT INTO "VENDEDOR_PLANOS"
  (tenant_id, plan_group, name, seq, months, monthly_goal, cycle_bonus, cycle_months, commission_pct)
SELECT e.id, 'padrao', f.name, f.seq, f.months, f.goal, f.bonus, 3, 2
  FROM "EMPRESAS" e
 CROSS JOIN (VALUES
   ('Meta 1', 1, ARRAY[1,2,3],    15000, 1500),
   ('Meta 2', 2, ARRAY[4,5,6],    30000, 3000),
   ('Meta 3', 3, ARRAY[7,8,9],    45000, 4500),
   ('Meta 4', 4, ARRAY[10,11,12], 60000, 6000)
 ) AS f(name, seq, months, goal, bonus)
 WHERE NOT EXISTS (
   SELECT 1 FROM "VENDEDOR_PLANOS" p
    WHERE p.tenant_id = e.id AND p.plan_group = 'padrao'
 );

-- O backend usa a service_role key (BYPASSRLS); com RLS ligada e sem
-- políticas, o acesso pela anon key fica bloqueado (migration 011).
ALTER TABLE "VENDEDOR_PLANOS"     ENABLE ROW LEVEL SECURITY;
ALTER TABLE "VENDEDORES"          ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PROMOCOES_VENDEDOR"  ENABLE ROW LEVEL SECURITY;
ALTER TABLE "VENDEDOR_COMISSOES"  ENABLE ROW LEVEL SECURITY;
ALTER TABLE "OFERTAS_VENDEDOR"    ENABLE ROW LEVEL SECURITY;

NOTIFY pgrst, 'reload schema';

INSERT INTO "_MIGRATIONS" (version, name) VALUES ('065', 'vendedor')
ON CONFLICT (version) DO NOTHING;
