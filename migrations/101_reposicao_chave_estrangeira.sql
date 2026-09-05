-- ============================================================
-- 101. O LINK DO FORNECEDOR VOLTA A ABRIR.
--
--      SINTOMA: o fornecedor abria o link, digitava CNPJ e telefone
--      certos, e a tela respondia "Link não encontrado." — com o token
--      vivo, dentro do prazo, e o pedido pendente no banco.
--
--      CAUSA: a busca do pedido pelo token pede o fornecedor junto,
--      embutido:
--
--        .select('*, FORNECEDORES ( id, name, cnpj, phone )')
--
--      Embutir assim só funciona quando existe CHAVE ESTRANGEIRA entre
--      as duas tabelas — é por ela que o PostgREST descobre o caminho.
--      `PEDIDOS_REPOSICAO` nasceu (migração 098) sem nenhuma: nem para
--      FORNECEDORES, nem para EMPRESAS. Sem o caminho, a consulta INTEIRA
--      falha; e como o código lê só `data`, o erro vira `null`, e `null`
--      vira "não encontrado". O link estava certo o tempo todo.
--
--      É A MESMA ARMADILHA DE SEMPRE: consulta que falha devolve vazio,
--      e vazio é indistinguível de "não existe". A chave conserta a
--      causa; o código foi conserta do junto para nunca mais depender do
--      embutido (lê o pedido primeiro, o fornecedor depois) — assim, se
--      um dia faltar de novo, o pior que acontece é o portal pedir para
--      falar com a Lyon, e não sumir com a solicitação.
--
--      ON DELETE SET NULL, e não CASCADE: apagar um fornecedor não pode
--      apagar o histórico de reposição dele. O pedido continua lá, com
--      `supplier_name` gravado, e o portal responde "fornecedor não está
--      mais no cadastro" — que é a verdade.
--
--      Conferido antes de escrever: 1 pedido, 0 sem fornecedor, 0 órfãos.
--      A chave entra sem recusar nenhuma linha existente.
-- ============================================================

-- Órfão viraria erro na criação da chave. Não há nenhum hoje; a limpeza
-- fica porque a migração pode rodar num banco de outra idade.
UPDATE "PEDIDOS_REPOSICAO" p
   SET supplier_id = NULL
 WHERE p.supplier_id IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM "FORNECEDORES" f WHERE f.id = p.supplier_id);

ALTER TABLE "PEDIDOS_REPOSICAO"
  DROP CONSTRAINT IF EXISTS "PEDIDOS_REPOSICAO_supplier_id_fkey";

ALTER TABLE "PEDIDOS_REPOSICAO"
  ADD CONSTRAINT "PEDIDOS_REPOSICAO_supplier_id_fkey"
  FOREIGN KEY (supplier_id) REFERENCES "FORNECEDORES"(id) ON DELETE SET NULL;

-- A do tenant pelo mesmo motivo: é o caminho que qualquer consulta
-- futura vai querer embutir, e a ausência dela é uma armadilha armada.
ALTER TABLE "PEDIDOS_REPOSICAO"
  DROP CONSTRAINT IF EXISTS "PEDIDOS_REPOSICAO_tenant_id_fkey";

ALTER TABLE "PEDIDOS_REPOSICAO"
  ADD CONSTRAINT "PEDIDOS_REPOSICAO_tenant_id_fkey"
  FOREIGN KEY (tenant_id) REFERENCES "EMPRESAS"(id) ON DELETE CASCADE;

-- O token é a credencial: procurar por ele tem que ser instantâneo, e
-- dois pedidos com o mesmo token seria o fornecedor de um vendo o do
-- outro. Parcial porque a maioria das linhas tem token nulo.
CREATE UNIQUE INDEX IF NOT EXISTS pedidos_reposicao_token_uk
  ON "PEDIDOS_REPOSICAO" (public_token)
  WHERE public_token IS NOT NULL;
