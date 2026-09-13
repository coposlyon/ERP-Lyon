-- ============================================================
-- 119. O SUB-PRODUTO TEM CATEGORIA, COMO O PRODUTO.
--
--      Tampa e canudo são vendidos como produto (custa, cobra, tem foto)
--      mas nunca sozinhos: vão junto com um copo. Por isso ficam em
--      Sub-Produtos, e não em Produtos.
--
--      E, como os produtos, eles se organizam por categoria — Tampas,
--      Canudos, e o que a Lyon criar depois (Alças, Tags). A tela de
--      Sub-Produtos abre nos cards dessas categorias.
--
--      TEXTO, E NÃO UMA TABELA. A categoria do sub-produto é só um
--      nome que agrupa: não tem foto, preço nem regra própria. Uma
--      coluna basta, e "criar categoria nova" é digitar um nome novo.
--
--      As duas linhas que já existem ganham categoria aqui, para a tela
--      não abrir com tudo em "Sem categoria".
-- ============================================================

ALTER TABLE "ITENS" ADD COLUMN IF NOT EXISTS categoria VARCHAR(80);

UPDATE "ITENS" SET categoria = 'Tampas'
 WHERE kind = 'acessorio' AND categoria IS NULL AND name ILIKE 'tampa%';

UPDATE "ITENS" SET categoria = 'Canudos'
 WHERE kind = 'acessorio' AND categoria IS NULL AND name ILIKE 'canudo%';

NOTIFY pgrst, 'reload schema';

INSERT INTO "_MIGRATIONS" (version, name) VALUES ('119', 'categoria_do_sub_produto')
ON CONFLICT (version) DO NOTHING;
