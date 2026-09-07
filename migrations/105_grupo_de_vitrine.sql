-- ============================================================
-- 105. O GRUPO DA VITRINE — "Caneca Slim" reunindo as duas categorias.
--
-- O catálogo mostrava um card por CATEGORIA: "CANECA SLIM TRADICIONAL"
-- e "CANECA SLIM DEGRADÊ" eram duas portas para a mesma peça, e o
-- cliente tinha de saber de antemão qual acabamento queria antes de ver
-- o copo. A vitrine passa a ter um card por PEÇA + TAMANHO ("Caneca
-- Slim 400 ml"), e o acabamento vira a escolha de dentro.
--
-- QUEM AGRUPA É O CADASTRO, NÃO UMA REGEX. Já houve duas tentativas de
-- derivar isso do nome ("tirar a última palavra quando ela for um
-- acabamento") e as duas foram desfeitas — a lista de acabamentos muda,
-- e no dia em que mudar a vitrine se reagrupa sozinha, errado e em
-- silêncio.
--
-- `nome_catalogo` JÁ ERA ESSE CAMPO, e já estava preenchido em sete das
-- oito categorias: "Caneca Slim", "Caneca", "Long Drink", "Twister",
-- "Taça Cerveja", "Taça Chandon", "Taça de Vinho". Faltava a Caneca
-- Slim Degradê, e é só isso que esta migração escreve — as duas
-- categorias passam a responder por "Caneca Slim" e viram um card só.
--
-- PARA SEPARAR DE NOVO: basta dar a ela um `nome_catalogo` próprio (ou
-- esvaziar), em Produtos → abrir o modelo → nome de vitrine. Nenhum
-- produto muda de categoria; o que muda é só como a vitrine agrupa.
-- ============================================================

UPDATE "CATEGORIAS"
   SET nome_catalogo = 'Caneca Slim'
 WHERE name = 'CANECA SLIM DEGRADÊ'
   AND (nome_catalogo IS NULL OR btrim(nome_catalogo) = '');

-- Categoria publicada sem nome de vitrine passa a ter o próprio nome:
-- sem isso ela cairia num grupo vazio e sumiria do catálogo.
UPDATE "CATEGORIAS" c
   SET nome_catalogo = c.name
 WHERE (c.nome_catalogo IS NULL OR btrim(c.nome_catalogo) = '')
   AND EXISTS (
         SELECT 1 FROM "PRODUTOS" p
          WHERE p.category_id = c.id AND p.tenant_id = c.tenant_id AND p.is_active
       );

NOTIFY pgrst, 'reload schema';

INSERT INTO "_MIGRATIONS" (version, name) VALUES ('105', 'grupo_de_vitrine')
ON CONFLICT (version) DO NOTHING;
