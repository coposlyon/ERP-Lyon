-- ============================================================
-- 074. CONFIGURAÇÃO TÉCNICA DO PRODUTO
--
--      A fonte única de "o que pode ser feito com cada copo".
--
--      O PROBLEMA QUE ISTO RESOLVE. A tela de orçamento precisa abrir
--      "De/Para" quando o acabamento é Degradê, "Cor do jateado" quando
--      é Jateado, e nada disso quando é Liso. Escrever esse "se for
--      degradê, faça isso" dentro da página significa mexer no código a
--      cada acabamento novo — e mexer em quatro páginas, porque a mesma
--      pergunta reaparece no pedido, na produção e na compra de insumo.
--
--      Aqui o acabamento CARREGA os campos que ele abre. A tela não sabe
--      o que é degradê: ela recebe uma lista de campos e desenha. Um
--      acabamento novo é uma linha no banco, não um deploy.
--
--      TRÊS CATÁLOGOS E UMA MATRIZ:
--
--        CONFIG_ACABAMENTOS  o que dá para fazer (Degradê, Jateado,
--                            Bicolor, Degradê + Borda…), e quais campos
--                            e processos cada um exige
--        CONFIG_CORES        as cores, separadas por onde se aplicam —
--                            cor de pintura não é cor de borda nem cor
--                            de personalização, e misturar as três numa
--                            lista só é o que faz o vendedor pedir
--                            borda "Azul Bebê" que não existe em borda
--        CONFIG_PROCESSOS    serigrafia 1 cor, transfer colorido, laser
--
--        PRODUTO_COMPATIBILIDADE  quem pode com quem
--
--      A matriz aceita regra por CATEGORIA ou por PRODUTO. Quase tudo é
--      da categoria ("todo Twister aceita degradê"); o produto entra só
--      para a exceção ("este aqui não"). Regra de produto vence a de
--      categoria, e `permitido = false` bloqueia — é o que permite abrir
--      para a categoria inteira e fechar um caso sem reescrever o resto.
-- ============================================================

-- ── O que dá para fazer ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS "CONFIG_ACABAMENTOS" (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    UUID NOT NULL REFERENCES "EMPRESAS"(id) ON DELETE CASCADE,
  name         TEXT NOT NULL,
  seq          INT  NOT NULL DEFAULT 100,

  -- Os processos que este acabamento OBRIGA. É daqui que a linha do
  -- tempo do pedido descobre se mostra a etapa de pintura e a de borda,
  -- em vez de adivinhar pelo nome do produto.
  requer_pintura     BOOLEAN NOT NULL DEFAULT FALSE,
  requer_borda       BOOLEAN NOT NULL DEFAULT FALSE,
  requer_jateamento  BOOLEAN NOT NULL DEFAULT FALSE,

  -- OS CAMPOS QUE ESTE ACABAMENTO ABRE. É o coração da tabela:
  --   [{ "key":"cor_base", "label":"De", "grupo":"pintura", "obrigatorio":true },
  --    { "key":"cor_topo", "label":"Para", "grupo":"pintura", "obrigatorio":true }]
  -- `grupo` diz de qual lista de cores o campo se alimenta. A tela lê
  -- isto e monta os selects sozinha.
  campos       JSONB NOT NULL DEFAULT '[]'::jsonb,

  is_active    BOOLEAN NOT NULL DEFAULT TRUE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, name)
);

-- ── As cores, separadas por onde se aplicam ─────────────────
CREATE TABLE IF NOT EXISTS "CONFIG_CORES" (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL REFERENCES "EMPRESAS"(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  -- 'produto' | 'pintura' | 'borda' | 'jateado' | 'personalizacao'
  grupo       TEXT NOT NULL,
  hex         TEXT,
  -- A tinta que esta cor consome. Sem isto o orçamento não consegue
  -- dizer quanto de insumo vai embora, que é o pedido do item 14.
  insumo_id   UUID REFERENCES "INSUMOS"(id) ON DELETE SET NULL,
  seq         INT  NOT NULL DEFAULT 100,
  is_active   BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, grupo, name)
);

-- ── Como a arte vai para o copo ─────────────────────────────
CREATE TABLE IF NOT EXISTS "CONFIG_PROCESSOS" (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL REFERENCES "EMPRESAS"(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  max_cores   INT,
  seq         INT  NOT NULL DEFAULT 100,
  is_active   BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, name)
);

-- ── Quem pode com quem ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS "PRODUTO_COMPATIBILIDADE" (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL REFERENCES "EMPRESAS"(id) ON DELETE CASCADE,

  -- Um dos dois, nunca os dois: a regra é da categoria inteira ou
  -- daquele produto. O CHECK abaixo é o que impede a linha ambígua.
  category_id UUID REFERENCES "CATEGORIAS"(id) ON DELETE CASCADE,
  product_id  UUID REFERENCES "PRODUTOS"(id)   ON DELETE CASCADE,

  -- 'acabamento' | 'cor' | 'processo' | 'acessorio'
  tipo        TEXT NOT NULL,
  ref_id      UUID NOT NULL,

  -- FALSE é a exceção que fecha o que a categoria abriu.
  permitido   BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT compat_um_alvo CHECK (
    (category_id IS NOT NULL AND product_id IS NULL) OR
    (category_id IS NULL AND product_id IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_compat_categoria ON "PRODUTO_COMPATIBILIDADE" (tenant_id, category_id, tipo);
CREATE INDEX IF NOT EXISTS idx_compat_produto   ON "PRODUTO_COMPATIBILIDADE" (tenant_id, product_id, tipo);
CREATE INDEX IF NOT EXISTS idx_cores_grupo      ON "CONFIG_CORES" (tenant_id, grupo, seq);

NOTIFY pgrst, 'reload schema';

INSERT INTO "_MIGRATIONS" (version, name) VALUES ('074', 'config_tecnica_produto')
ON CONFLICT (version) DO NOTHING;
