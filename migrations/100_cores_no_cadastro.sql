-- ============================================================
-- 100. A COR SAI DO NOME E VIRA CADASTRO.
--
-- O PROBLEMA. A cor do copo existia só como TEXTO dentro do nome do
-- produto: "CANECA SLIM TRADICIONAL - AZUL BIC - 400 ML". Ninguém
-- cadastrava cor; ela era digitada, uma vez por produto, 97 vezes. O
-- resultado é o esperado de digitar a mesma informação 97 vezes:
-- "AZUL BEBE" e "AZUL BEBÊ", "TIFANNY" e "TIFFANY", e nenhuma forma de
-- perguntar ao banco "quais cores a Lyon faz?" sem varrer nome por
-- nome com expressão regular — que é exatamente o que o catálogo
-- estava fazendo.
--
-- A COR AGORA É UM ITEM, como a borda e o canudo já são. Mesma tabela,
-- `kind = 'cor'`: ela tem nome, hex, foto e — o que faltava — um lugar
-- onde é cadastrada UMA vez e referenciada por todos os copos daquela
-- cor.
--
-- O NOME DO PRODUTO NÃO MUDA NESTA MIGRAÇÃO, de propósito. Ele aparece
-- em pedidos já fechados, em notas fiscais emitidas e no histórico de
-- estoque; reescrevê-lo faria a nota de ontem falar de um produto que
-- não existe mais com aquele nome. A ligação entra por fora
-- (`cor_item_id`), e a tela passa a ler a ligação em vez do texto.
-- Trocar o nome, se for o caso, é decisão de outro dia e outra
-- migração — e aí já haverá de onde reconstruí-lo.
-- ============================================================

-- ── A COR COMO ITEM ─────────────────────────────────────────
-- `kind = 'cor'` entra na mesma tabela de acessórios, bordas e tintas:
-- é a mesma pergunta ("o que isto acrescenta na peça e quanto custa"),
-- e uma tabela a mais seria mais um CRUD e mais uma tela para a regra
-- de preço divergir.

-- ── A LIGAÇÃO ───────────────────────────────────────────────
ALTER TABLE "PRODUTOS"
  ADD COLUMN IF NOT EXISTS cor_item_id UUID REFERENCES "ITENS"(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS produtos_cor_item_idx
  ON "PRODUTOS" (cor_item_id) WHERE cor_item_id IS NOT NULL;

COMMENT ON COLUMN "PRODUTOS".cor_item_id IS
  'A cor da peça, vinda de ITENS (kind=cor). Substitui a leitura da cor pelo nome do produto.';

NOTIFY pgrst, 'reload schema';

INSERT INTO "_MIGRATIONS" (version, name) VALUES ('100', 'cores_no_cadastro')
ON CONFLICT (version) DO NOTHING;
