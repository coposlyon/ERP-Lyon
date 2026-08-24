-- ============================================================
-- 088. O SETOR PASSA A CARREGAR TELAS, NÃO SÓ MÓDULOS.
--
-- Até aqui o setor guardava uma lista de 27 módulos abstratos
-- ('sales', 'stock', 'hr'...). Quem configurava precisava traduzir de
-- cabeça "o Financeiro vê Contas a Pagar" para "marque o módulo
-- financial" — e a tradução não era exata: um módulo abre várias
-- telas de uma vez, sem escolha.
--
-- Agora o setor guarda TELAS, que é o que a pessoa reconhece: os
-- mesmos itens que ela vê no menu lateral, um a um. Os módulos
-- continuam existindo porque é o que a API confere a cada requisição —
-- eles passam a ser DERIVADOS das telas marcadas, não digitados.
--
-- `screens` NULL não é o mesmo que `screens` vazio:
--   NULL  → setor antigo, ainda sem lista de telas: vale só o módulo
--   []    → escolha explícita de não liberar tela nenhuma
--
-- A distinção existe para que este arquivo não tranque ninguém para
-- fora no instante em que rodar. Setor que ainda não foi configurado
-- na tela nova continua funcionando pela regra de módulos.
-- ============================================================

ALTER TABLE "SETORES_PERFIS" ADD COLUMN IF NOT EXISTS screens JSONB;

COMMENT ON COLUMN "SETORES_PERFIS".screens IS
  'Telas liberadas para o setor (caminhos do menu). NULL = sem lista, vale o módulo. [] = nenhuma tela.';

-- O mesmo par no usuário já existia (allowed_screens, allowed_modules).
-- Lá o significado passa a ser: NULL = herda do setor; lista = lista
-- própria, que substitui a do setor. É isso que permite abrir uma tela
-- a mais para uma pessoa sem inventar um setor só para ela.
COMMENT ON COLUMN "USUARIOS".allowed_screens IS
  'NULL = herda as telas do setor. Lista = telas próprias desta pessoa, substituindo as do setor.';
