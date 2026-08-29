-- ============================================================
-- 094. O MESMO COPO, DUAS CONFIGURACOES DE VENDA
--
--      UM CADASTRO, DOIS AMBIENTES. O Long Drink 350 ml e vendido nos
--      dois lugares: liso na /loja, do jeito que sai da maquina, e
--      personalizado no /catalogo, com acabamento e arte por cima. E o
--      MESMO produto — mesmo codigo, mesmo estoque, mesma ficha de
--      custo. So que ele nao se vende igual nos dois:
--
--        na loja           unidade avulsa, preco de prateleira, foto da
--                          peca como ela e
--        no catalogo       caixa fechada, minimo alto, preco que ja
--                          embute a personalizacao, foto do copo impresso
--
--      Ate hoje as duas vitrines liam as MESMAS colunas de PRODUTOS.
--      Mudar o preco do catalogo mudava o preco da loja no mesmo
--      instante, e nao havia como pedir minimo de 100 no personalizado
--      sem exigir 100 de quem quer um copo liso.
--
--      POR QUE NAO DUPLICAR O PRODUTO. Porque duplicar quebra tudo que
--      depende de haver UM cadastro: o estoque viraria dois saldos do
--      mesmo copo, o custo seria calculado duas vezes, e o dia em que
--      alguem renomeasse um dos dois comecaria a divergencia. O que
--      muda entre os ambientes e um punhado de campos de VITRINE, e e
--      so isso que esta tabela guarda.
--
--      NULO E "HERDA", E ESSE E O PONTO. Cada coluna aqui e uma
--      EXCECAO. Sem linha, ou com o campo nulo, vale o cadastro mestre —
--      e e assim que os 97 copos continuam funcionando hoje sem ninguem
--      preencher nada. Quem quiser um preco so no catalogo preenche um
--      campo; o resto continua seguindo o cadastro, inclusive quando o
--      cadastro mudar amanha.
--
--      A ALTERNATIVA ERA PIOR: colunas `sale_price_catalogo`,
--      `min_order_qty_catalogo`... em PRODUTOS. Some uma coluna por
--      campo a cada ambiente novo, e a tabela que ja tem 47 colunas
--      passaria a ter 60 para responder a mesma pergunta duas vezes.
-- ============================================================

CREATE TABLE IF NOT EXISTS "PRODUTO_AMBIENTE" (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL REFERENCES "EMPRESAS"(id) ON DELETE CASCADE,
  product_id  UUID NOT NULL REFERENCES "PRODUTOS"(id) ON DELETE CASCADE,

  -- 'loja' = a loja de copos lisos (/loja)
  -- 'catalogo' = o catalogo de personalizados (/catalogo)
  -- Texto com CHECK, e nao enum: ambiente novo (marketplace, atacado) e
  -- uma linha no CHECK, e nao um ALTER TYPE que trava a tabela.
  ambiente    TEXT NOT NULL CHECK (ambiente IN ('loja', 'catalogo')),

  -- Daqui para baixo, NULO SIGNIFICA HERDAR. Nenhum default: um zero
  -- gravado por engano seria um copo de graca no ar.
  sale_price      NUMERIC,
  price_tiers     JSONB,
  min_order_qty   INTEGER CHECK (min_order_qty IS NULL OR min_order_qty > 0),
  image_url       TEXT,
  description     TEXT,

  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Uma linha por produto por ambiente. Duas seriam duas respostas para
  -- "quanto custa este copo no catalogo", decididas no par ou impar.
  UNIQUE (tenant_id, product_id, ambiente)
);

-- A vitrine pergunta sempre a mesma coisa: "quais ajustes existem para
-- estes produtos neste ambiente?". Sem indice, e varredura da tabela a
-- cada abertura de pagina da loja.
CREATE INDEX IF NOT EXISTS idx_produto_ambiente_busca
  ON "PRODUTO_AMBIENTE" (tenant_id, ambiente, product_id);

COMMENT ON TABLE "PRODUTO_AMBIENTE" IS
  'Ajustes de vitrine do produto por ambiente de venda. Campo nulo = herda de PRODUTOS.';
COMMENT ON COLUMN "PRODUTO_AMBIENTE".ambiente IS
  'loja = /loja (copos lisos) · catalogo = /catalogo (personalizados)';

-- PostgREST so enxerga a tabela nova depois de recarregar o cache
NOTIFY pgrst, 'reload schema';

INSERT INTO "_MIGRATIONS" (version, name) VALUES ('094', 'produto_ambiente')
ON CONFLICT (version) DO NOTHING;
