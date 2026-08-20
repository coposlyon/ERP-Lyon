-- ============================================================
-- 077. O PRODUTO MESTRE DECIDE ONDE APARECE
--
--      UM CADASTRO, TRÊS PORTAS. O mesmo Long Drink 350 ml pode ser
--      vendido liso na loja, personalizado no catálogo, nos dois, ou em
--      nenhum dos dois enquanto ainda está sendo montado. Até hoje
--      existia uma chave só (`show_in_store`), e ela decidia os dois
--      sites ao mesmo tempo — quem quisesse tirar um produto do
--      catálogo tirava da loja junto.
--
--      O ESTADO DE RASCUNHO. Começar a cadastrar não é publicar. Produto
--      novo nasce FORA do catálogo (DEFAULT FALSE) e só aparece para o
--      cliente quando alguém marcar. Sem isso, um cadastro pela metade —
--      sem foto, sem preço, sem gabarito — vira card no ar no minuto em
--      que o nome é digitado.
--
--      POR QUE NÃO UM CAMPO "STATUS" ÚNICO. Porque não são estados de
--      uma escada: um produto pode estar publicado no catálogo e fora da
--      loja de lisos ao mesmo tempo. Duas perguntas independentes pedem
--      duas colunas; enfiar as duas num campo só obrigaria a inventar
--      combinações ("ativo_so_catalogo") e a reescrever a lista toda no
--      dia em que aparecer a terceira porta.
--
--      O QUE ESTA MIGRAÇÃO NÃO MUDA. Nada do que já está no ar sai do
--      ar: o backfill copia a visibilidade atual para a coluna nova.
--      Quem estava aparecendo continua aparecendo, e a partir de hoje as
--      duas chaves andam separadas.
-- ============================================================

-- ── A chave do catálogo personalizado ───────────────────────
-- FALSE por padrão: produto novo é rascunho até alguém publicar.
ALTER TABLE "PRODUTOS"
  ADD COLUMN IF NOT EXISTS show_in_catalogo BOOLEAN NOT NULL DEFAULT FALSE;

-- Backfill: o que estava visível continua visível. `show_in_store` era a
-- única chave que existia, então ela é a verdade sobre o passado.
UPDATE "PRODUTOS"
   SET show_in_catalogo = TRUE
 WHERE is_active
   AND COALESCE(show_in_store, TRUE)
   AND show_in_catalogo = FALSE;

-- A vitrine pergunta sempre a mesma coisa: "quais produtos ativos deste
-- tenant estão publicados no catálogo?". Sem índice isso é varredura da
-- tabela inteira a cada abertura da primeira tela.
CREATE INDEX IF NOT EXISTS idx_produtos_catalogo
  ON "PRODUTOS" (tenant_id, show_in_catalogo)
  WHERE is_active;

COMMENT ON COLUMN "PRODUTOS".show_in_catalogo IS
  'Publicado no Catálogo de Produtos Personalizados (/catalogo). Independente de show_in_store, que é a loja de copos lisos (/loja).';

NOTIFY pgrst, 'reload schema';

INSERT INTO "_MIGRATIONS" (version, name) VALUES ('077', 'produto_publicacao')
ON CONFLICT (version) DO NOTHING;
