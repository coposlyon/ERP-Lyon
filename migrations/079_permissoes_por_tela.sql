-- ============================================================
-- 079. PERMISSÃO POR TELA.
--
-- Até aqui o acesso era por MÓDULO: 'financial' abria dez telas de
-- uma vez, e não havia como dar o Contas a Pagar sem dar junto a
-- Formação de Preço. Esta coluna guarda, por pessoa, a lista das
-- telas que ela enxerga — os mesmos caminhos do menu (/stock,
-- /rateio/produto, ...).
--
-- NULL = ninguém escolheu tela nenhuma para esta pessoa, e vale a
-- regra antiga (o módulo decide sozinho). Lista vazia é escolha:
-- a pessoa não vê nada. Essa diferença é de propósito — sem ela,
-- todo usuário antigo viraria um usuário sem acesso no dia em que
-- a coluna nascesse.
--
-- O módulo continua sendo a trava do SERVIDOR. A permissão por tela
-- decide o que a pessoa vê e por onde navega; o que a API entrega
-- continua preso ao módulo. Tirar a tela sem tirar o módulo esconde
-- o caminho, não o direito.
-- ============================================================

ALTER TABLE "USUARIOS" ADD COLUMN IF NOT EXISTS allowed_screens JSONB;

COMMENT ON COLUMN "USUARIOS".allowed_screens IS
  'Telas liberadas (caminhos do menu). NULL = sem restrição por tela; [] = nenhuma tela.';

INSERT INTO "_MIGRATIONS" (version, name) VALUES ('079', 'permissoes_por_tela')
ON CONFLICT (version) DO NOTHING;
