-- ============================================================
-- 121. LOGÍSTICA: AS CAIXAS E A REGRA DE CADA PRODUTO.
--
--      O frete da Total Express sai do peso — o MAIOR entre o real e o
--      cubado (C × L × A em metros × 167). Para isso o sistema precisa
--      saber em que caixa cada pedido viaja, e isso muda com o tempo:
--      a Lyon estima levar um ano ajustando caixas, quantidades e a
--      caixa menor dos pedidos pequenos. Por isso é cadastro, e não
--      número escrito no código.
--
--        CAIXAS  a caixa física: medidas, peso da caixa CHEIA (o "peso
--                líquido" da tabela logística) e o valor da caixa, que
--                entra no pedido uma vez por caixa usada.
--
--        REGRAS  categoria + tamanho → caixa padrão, quantas unidades
--                cabem nela, e a caixa menor para pedido pequeno (até
--                quantas unidades vão nela). O peso de cada copo sai da
--                divisão: peso da caixa cheia ÷ unidades por caixa.
--
--      As regras gerais (12% de acréscimo acima de 70% de ocupação,
--      cobrar o valor da caixa) ficam em EMPRESAS.settings.logistica.
--
--      Substitui, para o frete, as medidas que a migração 118 tinha
--      posto em CATALOGO_EMBALAGEM — que nunca chegaram a ser
--      preenchidas. `caixa_qtd` de lá continua valendo para o que ele
--      sempre fez: o mínimo do liso no catálogo.
-- ============================================================

CREATE TABLE IF NOT EXISTS "LOGISTICA_CAIXAS" (
  id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id       UUID NOT NULL REFERENCES "EMPRESAS"(id) ON DELETE CASCADE,
  nome            VARCHAR(80) NOT NULL,
  largura_cm      NUMERIC(8,2) NOT NULL,
  altura_cm       NUMERIC(8,2) NOT NULL,
  comprimento_cm  NUMERIC(8,2) NOT NULL,
  -- kg — a caixa CHEIA, com os copos dentro
  peso_cheia_kg   NUMERIC(8,3),
  -- R$ — o custo da caixa de papelão, cobrado por caixa usada
  valor           NUMERIC(10,2) NOT NULL DEFAULT 0,
  ativo           BOOLEAN NOT NULL DEFAULT true,
  observacao      TEXT,
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now(),
  UNIQUE (tenant_id, nome)
);

CREATE TABLE IF NOT EXISTS "LOGISTICA_REGRAS" (
  id                      UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id               UUID NOT NULL REFERENCES "EMPRESAS"(id) ON DELETE CASCADE,
  category_id             UUID NOT NULL REFERENCES "CATEGORIAS"(id) ON DELETE CASCADE,
  -- ml; NULL = vale para todos os tamanhos da categoria. Existe porque
  -- o Twister 400 e o 550 são a mesma categoria e viajam em caixas
  -- diferentes.
  capacidade_ml           INTEGER,
  caixa_id                UUID REFERENCES "LOGISTICA_CAIXAS"(id) ON DELETE SET NULL,
  unidades_por_caixa      INTEGER,
  -- O pedido pequeno vai numa caixa menor (ex.: 10 Long Drink na caixa
  -- do Twister 300). Até `unidades_caixa_pequena` unidades, é ela.
  caixa_pequena_id        UUID REFERENCES "LOGISTICA_CAIXAS"(id) ON DELETE SET NULL,
  unidades_caixa_pequena  INTEGER,
  ativo                   BOOLEAN NOT NULL DEFAULT true,
  observacao              TEXT,
  created_at              TIMESTAMPTZ DEFAULT now(),
  updated_at              TIMESTAMPTZ DEFAULT now()
);

-- Uma regra por categoria + tamanho (o "todos os tamanhos" conta como 0).
CREATE UNIQUE INDEX IF NOT EXISTS ux_log_regra_alvo
  ON "LOGISTICA_REGRAS" (tenant_id, category_id, COALESCE(capacidade_ml, 0));

ALTER TABLE "LOGISTICA_CAIXAS" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "LOGISTICA_REGRAS" ENABLE ROW LEVEL SECURITY;

NOTIFY pgrst, 'reload schema';

INSERT INTO "_MIGRATIONS" (version, name) VALUES ('121', 'logistica_caixas')
ON CONFLICT (version) DO NOTHING;
