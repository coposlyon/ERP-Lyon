-- ============================================================
-- 073. MUNICÍPIOS DO TERRITÓRIO
--
--      O vendedor recebe uma região para atender e hoje só vê a sigla
--      da UF. "Você atende o Paraná" não diz onde ir: são 399 cidades,
--      e a diferença entre Curitiba e Doutor Ulysses é a diferença
--      entre uma rota de um dia e uma de uma semana.
--
--      Esta tabela é a lista dessas cidades. Ela NÃO tem tenant_id de
--      propósito: município é geografia do Brasil, é igual para toda
--      empresa que um dia use o sistema, e duplicar 5.570 linhas por
--      empresa só criaria cópias para sair de sincronia entre si.
--
--      A origem dos dados é pública e cada coluna vem de um lugar
--      diferente (ver lib/municipios.js):
--
--        name, districts   IBGE — localidades
--        is_capital        lista fixa das 27 capitais, conferida
--                          contra o IBGE código a código
--        metro_name        IBGE — regiões metropolitanas
--        population        IBGE — Censo 2022
--        ddd               BrasilAPI
--
--      cep_start / cep_end ficam aqui, mas nascem vazias: a faixa de
--      CEP por município é do DNE dos Correios, que é pago e não tem
--      equivalente público. A coluna existe para receber a base no dia
--      em que ela for comprada ou fornecida — melhor um campo vazio e
--      honesto do que um número inventado que vira endereço errado na
--      etiqueta.
--
--      synced_at diz de quando é a foto. População muda a cada censo,
--      município novo é raro mas acontece: sem essa data ninguém sabe
--      se a lista está velha.
-- ============================================================
CREATE TABLE IF NOT EXISTS "MUNICIPIOS" (
  ibge_code   TEXT PRIMARY KEY,
  uf          TEXT NOT NULL,
  name        TEXT NOT NULL,
  is_capital  BOOLEAN NOT NULL DEFAULT FALSE,
  metro_name  TEXT,
  districts   TEXT[] NOT NULL DEFAULT '{}',
  ddd         TEXT,
  population  INT,
  cep_start   TEXT,
  cep_end     TEXT,
  synced_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- A tela sempre pergunta a mesma coisa: as cidades de uma UF, em ordem
-- alfabética. É esse o índice.
CREATE INDEX IF NOT EXISTS idx_municipios_uf ON "MUNICIPIOS" (uf, name);

NOTIFY pgrst, 'reload schema';

INSERT INTO "_MIGRATIONS" (version, name) VALUES ('073', 'municipios')
ON CONFLICT (version) DO NOTHING;
