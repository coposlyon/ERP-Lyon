-- ============================================================
-- 124. O CONTATO DO FORNECEDOR MORA NA MÁQUINA.
--
--      Quem liga para a assistência da Masterink não quer abrir o
--      cadastro de fornecedores: o telefone e o e-mail ficam na aba
--      Cadastro da própria máquina. Se o fornecedor for escolhido da
--      lista, a tela preenche os dois a partir de FORNECEDORES.
-- ============================================================
ALTER TABLE "MAQUINAS" ADD COLUMN IF NOT EXISTS fornecedor_telefone VARCHAR(30);
ALTER TABLE "MAQUINAS" ADD COLUMN IF NOT EXISTS fornecedor_email    VARCHAR(120);

NOTIFY pgrst, 'reload schema';
