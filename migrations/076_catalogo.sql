-- ============================================================
-- 076. CATÁLOGO DE PRODUTOS PERSONALIZADOS
--
--      O caminho do cliente: família → modelo → configuração → arte →
--      carrinho → orçamento → pagamento. Seis telas, UMA base de dados.
--
--      O QUE ESTA MIGRAÇÃO NÃO FAZ. Não cria um segundo cadastro de
--      produto. O catálogo LÊ o cadastro mestre (PRODUTOS, CATEGORIAS) e
--      a configuração técnica (074). Se amanhã o Administrativo fechar
--      "Degradê + Borda" para o Long Drink, o catálogo para de oferecer
--      no mesmo instante, porque é a mesma linha de PRODUTO_COMPATIBILIDADE
--      que a produção lê.
--
--      O QUE FALTAVA E ESTA MIGRAÇÃO RESOLVE:
--
--      1. A FAMÍLIA. O cliente procura "Canecas", não "CANECA SLIM
--         TRADICIONAL". As categorias do ERP são técnicas (categoria +
--         acabamento no mesmo nome); a família é a vitrine. Uma família
--         reúne várias categorias — "Canecas" tem a tradicional e a slim.
--
--      2. O NOME DE VITRINE DA CATEGORIA. "CANECA SLIM TRADICIONAL" é o
--         nome de dentro. Na tela o cliente lê "Caneca Slim", e o
--         acabamento escolhido completa o resto: "Caneca Slim Degradê
--         com Borda 400 ml". O nome comercial é MONTADO, nunca guardado
--         — guardar significaria criar 13 produtos por modelo só para
--         mudar uma palavra.
--
--      3. O GABARITO. O editor de arte precisa saber, em milímetros,
--         onde a arte pode existir. Sem isso a arte volta da gráfica
--         cortada — e o prejuízo é da Lyon, não do cliente.
--
--      4. A REGRA DE CAIXA DO LISO. "Caixa de 100, até 4 cores" é regra
--         comercial, e regra comercial muda. Fica no banco por produto ou
--         categoria, não escrita na página.
--
--      5. O BANCO DE ARTES. Ocasião (casamento, formatura) e os modelos
--         de arte de cada uma, com os campos que o cliente pode editar.
--         Comprar um pacote de artes novo não pode exigir deploy.
--
--      6. O PROJETO DE ARTE. O que o cliente montou fica salvo e amarrado
--         ao item do carrinho — e depois ao pedido, à produção e à
--         gráfica. Uma arte, um lugar.
-- ============================================================

-- ── 1. A vitrine: famílias de produto ───────────────────────
CREATE TABLE IF NOT EXISTS "CATALOGO_FAMILIAS" (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL REFERENCES "EMPRESAS"(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  -- O endereço da família na URL: /catalogo/long-drink. Estável mesmo se
  -- o nome mudar, para o link que o vendedor já mandou não morrer.
  slug        TEXT NOT NULL,
  descricao   TEXT,
  -- Nome do ícone (lucide) — o Administrativo escolhe de uma lista, e a
  -- tela desenha. Sem ícone a tela usa o padrão, nunca fica quebrada.
  icone       TEXT,
  seq         INT  NOT NULL DEFAULT 100,
  is_active   BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, slug)
);

-- Quem está em cada família. Mesmo padrão da matriz de compatibilidade
-- (074): a regra é da CATEGORIA inteira ou de um PRODUTO específico.
CREATE TABLE IF NOT EXISTS "CATALOGO_FAMILIA_ITENS" (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL REFERENCES "EMPRESAS"(id) ON DELETE CASCADE,
  familia_id  UUID NOT NULL REFERENCES "CATALOGO_FAMILIAS"(id) ON DELETE CASCADE,
  category_id UUID REFERENCES "CATEGORIAS"(id) ON DELETE CASCADE,
  product_id  UUID REFERENCES "PRODUTOS"(id)   ON DELETE CASCADE,
  seq         INT  NOT NULL DEFAULT 100,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT familia_item_um_alvo CHECK (
    (category_id IS NOT NULL AND product_id IS NULL) OR
    (category_id IS NULL AND product_id IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_familia_itens ON "CATALOGO_FAMILIA_ITENS" (tenant_id, familia_id);

-- ── 2. O nome que o cliente lê ──────────────────────────────
-- "CANECA SLIM TRADICIONAL" → "Caneca Slim". Vazio = a tela deriva do
-- nome técnico; preenchido = o Administrativo mandou.
ALTER TABLE "CATEGORIAS" ADD COLUMN IF NOT EXISTS nome_catalogo TEXT;

-- O acabamento também tem nome de vitrine: "Degradê + Borda" é como a
-- fábrica fala; "Degradê com Borda" é como o cliente lê.
ALTER TABLE "CONFIG_ACABAMENTOS" ADD COLUMN IF NOT EXISTS label_comercial TEXT;
-- Quanto este acabamento acrescenta por unidade. Sem isto todo acabamento
-- custaria igual ao liso, o que não é verdade em nenhuma fábrica.
ALTER TABLE "CONFIG_ACABAMENTOS" ADD COLUMN IF NOT EXISTS preco_adicional NUMERIC(12,4) NOT NULL DEFAULT 0;
-- Aparece no catálogo do cliente? Um acabamento pode existir para a
-- produção e não ser vendido no site.
ALTER TABLE "CONFIG_ACABAMENTOS" ADD COLUMN IF NOT EXISTS no_catalogo BOOLEAN NOT NULL DEFAULT TRUE;

-- Amarra o acabamento a uma tabela de preco que ja existe na ficha de
-- Precificacao (product.print_pricing): 'degrade', 'pintura',
-- 'borda_metalizada'. Preenchido, o preco vem da ficha; vazio, vale o
-- preco_adicional acima. Nao inventamos uma segunda tabela de preco.
ALTER TABLE "CONFIG_ACABAMENTOS" ADD COLUMN IF NOT EXISTS preco_metodo TEXT;

ALTER TABLE "CONFIG_PROCESSOS" ADD COLUMN IF NOT EXISTS preco_adicional NUMERIC(12,4) NOT NULL DEFAULT 0;
-- A química da tinta. O cliente NÃO escolhe: o material do copo escolhe.
-- 'PS' | 'PP' | ... casado com PRODUTOS.ink_type.
ALTER TABLE "CONFIG_PROCESSOS" ADD COLUMN IF NOT EXISTS linha_tinta TEXT;
ALTER TABLE "CONFIG_PROCESSOS" ADD COLUMN IF NOT EXISTS preco_metodo TEXT;

-- ── 3. O gabarito da arte ───────────────────────────────────
CREATE TABLE IF NOT EXISTS "CATALOGO_GABARITOS" (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    UUID NOT NULL REFERENCES "EMPRESAS"(id) ON DELETE CASCADE,
  category_id  UUID REFERENCES "CATEGORIAS"(id) ON DELETE CASCADE,
  product_id   UUID REFERENCES "PRODUTOS"(id)   ON DELETE CASCADE,

  altura_mm    NUMERIC(8,2) NOT NULL,
  largura_mm   NUMERIC(8,2) NOT NULL,
  -- A área segura: quanto a arte precisa recuar da borda para não sair
  -- cortada. 2 mm é o padrão da casa; cada produto pode ter o seu.
  margem_mm    NUMERIC(8,2) NOT NULL DEFAULT 2,
  -- Este produto aceita verso? Copo de parede dupla, não.
  permite_verso BOOLEAN NOT NULL DEFAULT TRUE,
  observacao   TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT gabarito_um_alvo CHECK (
    (category_id IS NOT NULL AND product_id IS NULL) OR
    (category_id IS NULL AND product_id IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_gabarito_cat  ON "CATALOGO_GABARITOS" (tenant_id, category_id);
CREATE INDEX IF NOT EXISTS idx_gabarito_prod ON "CATALOGO_GABARITOS" (tenant_id, product_id);

-- ── 4. A regra de caixa do pedido liso ──────────────────────
CREATE TABLE IF NOT EXISTS "CATALOGO_EMBALAGEM" (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id          UUID NOT NULL REFERENCES "EMPRESAS"(id) ON DELETE CASCADE,
  category_id        UUID REFERENCES "CATEGORIAS"(id) ON DELETE CASCADE,
  product_id         UUID REFERENCES "PRODUTOS"(id)   ON DELETE CASCADE,
  caixa_qtd          INT NOT NULL DEFAULT 100,
  max_cores_caixa    INT NOT NULL DEFAULT 4,
  min_caixas         INT NOT NULL DEFAULT 1,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT embalagem_um_alvo CHECK (
    (category_id IS NOT NULL AND product_id IS NULL) OR
    (category_id IS NULL AND product_id IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_embalagem_cat  ON "CATALOGO_EMBALAGEM" (tenant_id, category_id);
CREATE INDEX IF NOT EXISTS idx_embalagem_prod ON "CATALOGO_EMBALAGEM" (tenant_id, product_id);

-- ── 5. Ocasiões e o banco de artes ──────────────────────────
CREATE TABLE IF NOT EXISTS "CATALOGO_OCASIOES" (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL REFERENCES "EMPRESAS"(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  slug        TEXT NOT NULL,
  icone       TEXT,
  seq         INT  NOT NULL DEFAULT 100,
  -- Aparece nos botões da frente ou só dentro de "+ Mais opções".
  destaque    BOOLEAN NOT NULL DEFAULT FALSE,
  is_active   BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, slug)
);

CREATE TABLE IF NOT EXISTS "CATALOGO_ARTES" (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL REFERENCES "EMPRESAS"(id) ON DELETE CASCADE,
  codigo      TEXT NOT NULL,
  name        TEXT NOT NULL,
  ocasiao_id  UUID REFERENCES "CATALOGO_OCASIOES"(id) ON DELETE SET NULL,

  -- O desenho em si. SVG porque a arte tem que ir para a gráfica em
  -- vetor: um PNG do editor vira serrilha na tela de serigrafia.
  svg         TEXT,
  thumb_url   TEXT,

  -- OS CAMPOS QUE O CLIENTE PODE MEXER. Mesma ideia dos `campos` do
  -- acabamento (074): a arte carrega o que ela abre, e o editor desenha.
  --   [{ "key":"nome1", "label":"Alterar nome 1", "tipo":"texto",
  --      "padrao":"Bruna", "max":18 }, ...]
  -- Só o que está aqui é editável. O resto do vetor é intocável — é o
  -- que impede o cliente de desmontar a arte sem querer.
  elementos   JSONB NOT NULL DEFAULT '[]'::jsonb,

  -- As fontes liberadas para esta arte. Fonte que a gráfica não tem é
  -- fonte que vai virar Arial na hora de imprimir.
  fontes      JSONB NOT NULL DEFAULT '[]'::jsonb,

  -- Vale só para certas famílias? Vazio = serve para todas.
  familias    JSONB NOT NULL DEFAULT '[]'::jsonb,

  seq         INT  NOT NULL DEFAULT 100,
  is_active   BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, codigo)
);

CREATE INDEX IF NOT EXISTS idx_artes_ocasiao ON "CATALOGO_ARTES" (tenant_id, ocasiao_id, seq);

-- ── 6. O que o cliente montou ───────────────────────────────
CREATE TABLE IF NOT EXISTS "CATALOGO_PROJETOS" (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    UUID NOT NULL REFERENCES "EMPRESAS"(id) ON DELETE CASCADE,

  -- Quem montou. O visitante ainda não é cliente quando desenha — só
  -- vira no pagamento. Por isso o dono é a sessão, e o customer_id entra
  -- depois, quando existir.
  visitor_id   TEXT,
  customer_id  UUID REFERENCES "CLIENTES"(id) ON DELETE SET NULL,

  product_id   UUID REFERENCES "PRODUTOS"(id) ON DELETE SET NULL,
  arte_id      UUID REFERENCES "CATALOGO_ARTES"(id) ON DELETE SET NULL,

  -- 'frente' | 'frente_verso'
  posicao      TEXT NOT NULL DEFAULT 'frente',

  -- O gabarito VIGENTE quando a arte foi montada, copiado para dentro do
  -- projeto. Se o Administrativo mudar o gabarito amanhã, a arte que já
  -- foi paga continua sabendo em que medida foi aprovada.
  gabarito     JSONB NOT NULL DEFAULT '{}'::jsonb,

  -- O conteúdo de cada face:
  --   { "frente": { "arte_id": …, "valores": {…} },
  --     "verso":  { … } }
  faces        JSONB NOT NULL DEFAULT '{}'::jsonb,

  preview_url  TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_projetos_visitor ON "CATALOGO_PROJETOS" (tenant_id, visitor_id);

NOTIFY pgrst, 'reload schema';

INSERT INTO "_MIGRATIONS" (version, name) VALUES ('076', 'catalogo')
ON CONFLICT (version) DO NOTHING;
