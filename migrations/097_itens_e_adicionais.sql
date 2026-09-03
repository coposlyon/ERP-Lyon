-- ============================================================
-- 097. O CADASTRO DE ITENS — e o preço saindo de um lugar só.
--
-- O PROBLEMA QUE ISTO RESOLVE. O custo de um copo estava espalhado:
-- matéria-prima no cadastro do produto, tinta e tela na Engenharia de
-- Custos, rateio numa terceira tela, e o que a Lyon COBRA por um canudo
-- não estava em lugar nenhum — ninguém cobrava porque ninguém sabia.
-- Formar preço exigia abrir quatro telas e somar de cabeça.
--
-- A REGRA NOVA É UMA SÓ: tudo que entra num copo é um ITEM, e todo item
-- tem DOIS valores — o que NÓS GASTAMOS e o que NÓS COBRAMOS. O lucro
-- de cada peça deixa de ser conta de planilha e vira subtração.
--
-- POR QUE UMA TABELA E NÃO QUATRO. Canudo, tampa, borda metalizada e
-- tinta são a mesma pergunta com respostas diferentes: "o que isto
-- acrescenta na peça, e quanto custa e cobra". Quatro tabelas seriam
-- quatro CRUDs, quatro telas e quatro lugares para a regra de preço
-- divergir. `kind` separa o que precisa ser separado — e é uma coluna,
-- não um schema.
--
-- A UNIDADE É QUEM FAZ A CONTA FECHAR. Canudo é 'un' e consumo 1: um
-- canudo por copo. Tinta é 'ml' e consumo 5: cinco mililitros por copo.
-- A conta é a MESMA nos dois — `unitario × consumo` —, e é por isso que
-- "R$ 0,15 o ml, gasta 5 ml, entra R$ 0,75" não precisa de código
-- especial para tinta.
-- ============================================================

CREATE TABLE IF NOT EXISTS "ITENS" (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL REFERENCES "EMPRESAS"(id) ON DELETE CASCADE,

  -- O QUE É. Separa o que a tela precisa separar, sem separar o banco.
  --   acessorio  canudo, tampa, alça, tag
  --   borda      as metalizadas (cada cor é um item, com sua foto)
  --   tinta      medida em ml, com consumo por peça
  --   embalagem  caixa, sacola, plástico
  --   outro      o que aparecer amanhã e não cabe acima
  kind          VARCHAR(20)  NOT NULL DEFAULT 'acessorio',
  name          VARCHAR(160) NOT NULL,

  -- A COR É DO ITEM, não um campo solto. "Canudo" não se compra: o que
  -- se compra é "Canudo Preto". Cada cor tem preço e foto próprios, e é
  -- por isso que ela mora aqui e não numa lista à parte.
  color_name    VARCHAR(80),
  color_hex     VARCHAR(9),
  photo_url     TEXT,

  -- ── O QUE NÓS GASTAMOS ────────────────────────────────────
  -- Compra-se em embalagem (pote de 900 ml por R$ 180) e gasta-se em
  -- unidade base (ml). Guardar os dois lados evita a conta de cabeça
  -- que ninguém refaz quando o fornecedor reajusta.
  base_unit     VARCHAR(12)   NOT NULL DEFAULT 'un',  -- un | ml | g | m | folha
  package_qty   NUMERIC(15,4),                        -- 900
  package_cost  NUMERIC(15,4),                        -- 180,00
  unit_cost     NUMERIC(15,6) NOT NULL DEFAULT 0,     -- 0,20 por ml

  -- ── O QUE NÓS COBRAMOS ────────────────────────────────────
  -- O outro lado da moeda, e o que faltava no sistema inteiro.
  unit_price    NUMERIC(15,6) NOT NULL DEFAULT 0,

  -- QUANTO ENTRA EM CADA PEÇA. 1 canudo; 5 ml de tinta.
  consumo       NUMERIC(15,6) NOT NULL DEFAULT 1,

  supplier_id   UUID REFERENCES "FORNECEDORES"(id) ON DELETE SET NULL,
  notes         TEXT,
  is_active     BOOLEAN NOT NULL DEFAULT true,
  seq           INTEGER NOT NULL DEFAULT 0,

  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Mesmo nome + mesma cor + mesmo tipo é o mesmo item. A trava existe
  -- para a importação em massa poder rodar duas vezes sem duplicar.
  CONSTRAINT itens_unico UNIQUE (tenant_id, kind, name, color_name)
);

CREATE INDEX IF NOT EXISTS itens_tenant_kind_idx ON "ITENS" (tenant_id, kind) WHERE is_active;

ALTER TABLE "ITENS" ENABLE ROW LEVEL SECURITY;


-- ============================================================
-- ONDE CADA ITEM SE APLICA.
--
-- É ISTO QUE DÁ A EDIÇÃO EM MASSA. Uma linha com `category_id` liga o
-- item a uma categoria inteira — "todo Long Drink pode levar canudo" é
-- UMA linha, não vinte e quatro. Uma linha com `product_id` é a
-- exceção: aquele copo específico.
--
-- E `category_id` NULO com `product_id` NULO é o curinga: vale para
-- todo produto do catálogo personalizado. É como se liga um adicional
-- em tudo de uma vez.
--
-- `padrao` SEPARA O QUE JÁ ESTÁ NO PREÇO do que é opcional:
--   true   entra sempre — a tinta da serigrafia, que todo personalizado
--          gasta, e cujo custo já compõe o preço de tabela
--   false  o cliente escolhe — canudo, tampa. Só entra na conta do
--          pedido quando marcado, e é o que faz o preço subir na hora
--          da compra em vez de subir para todo mundo.
-- ============================================================

CREATE TABLE IF NOT EXISTS "ITEM_APLICACOES" (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL REFERENCES "EMPRESAS"(id) ON DELETE CASCADE,
  item_id     UUID NOT NULL REFERENCES "ITENS"(id) ON DELETE CASCADE,

  category_id UUID,   -- vale para a categoria inteira
  product_id  UUID,   -- ou só para este produto
  -- os dois nulos = vale para todo produto do catálogo personalizado

  padrao      BOOLEAN NOT NULL DEFAULT false,
  -- Sobrescreve o consumo do item neste contexto (a caneca gasta mais
  -- tinta que o long drink). Nulo = usa o consumo do próprio item.
  consumo     NUMERIC(15,6),

  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- O mesmo item não se aplica duas vezes ao mesmo alvo. NULLS NOT
  -- DISTINCT porque o curinga (os dois nulos) também é um alvo, e sem
  -- isso ele entraria repetido toda vez que alguém clicasse.
  CONSTRAINT item_aplicacao_unica UNIQUE NULLS NOT DISTINCT (tenant_id, item_id, category_id, product_id)
);

CREATE INDEX IF NOT EXISTS item_aplic_categoria_idx ON "ITEM_APLICACOES" (tenant_id, category_id);
CREATE INDEX IF NOT EXISTS item_aplic_produto_idx   ON "ITEM_APLICACOES" (tenant_id, product_id);

ALTER TABLE "ITEM_APLICACOES" ENABLE ROW LEVEL SECURITY;


-- ── O QUE O CLIENTE ESCOLHEU, gravado no item do pedido ──────
-- Sem isto o pedido saberia o preço mas não o porquê: "R$ 6,80" sem
-- dizer que R$ 0,50 era o canudo preto. Na hora da produção e da
-- conferência, é o porquê que importa.
ALTER TABLE "VENDA_ITENS"
  ADD COLUMN IF NOT EXISTS adicionais JSONB NOT NULL DEFAULT '[]'::jsonb;

NOTIFY pgrst, 'reload schema';

INSERT INTO "_MIGRATIONS" (version, name) VALUES ('097', 'itens_e_adicionais')
ON CONFLICT (version) DO NOTHING;
