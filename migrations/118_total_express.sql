-- ============================================================
-- 118. TOTAL EXPRESS: A TABELA NEGOCIADA VIRA BANCO.
--
--      O frete da Total Express não vem de API. Não existe método de
--      cotação: o manual do webservice (EDI ICS V24) só sabe registrar
--      coleta e devolver rastreio. Quem sabe o preço é a planilha
--      negociada — `Tabela_MO-0.1-Londrina-PR.xlsb`, origem
--      LONDRINA/PR, tabela Total Standard.
--
--      Então o preço mora aqui, e não numa chamada HTTP que pode cair.
--
--      COMO O PREÇO SE FORMA (Anexo III da própria tabela):
--
--        preço da tabela + GRIS + Ad Valorem + ICMS/ISS
--
--      e o "preço da tabela" é a célula no cruzamento de duas coisas:
--
--        a GEOGRAFIA COMERCIAL  descoberta pela faixa de CEP do
--                               destinatário (59.959 faixas), e
--        a FAIXA DE PESO        do maior entre o peso real e o cubado
--                               (34 faixas, de 0,001 a 30 kg).
--
--      Acima de 30 kg o preço é o da última faixa mais `adicional_kg`
--      por quilo excedente.
--
--      TRÊS TABELAS, E NÃO UMA:
--
--        ABRANGENCIA  a faixa de CEP e o que ela decide — geografia,
--                     risco (que define o GRIS), prazo, e se o CEP é
--                     atendido ou vai por repostagem.
--        TARIFAS      a grade peso × geografia. 6.630 células.
--        GEOGRAFIAS   o adicional por quilo de cada geografia, que é
--                     por geografia e não por faixa.
--
--      POR QUE tenant_id EM TUDO. A tabela é negociada por empresa: a
--      Lyon tem a dela, e outra empresa no mesmo banco terá outra, com
--      outra origem e outros preços. Sem o tenant, a primeira carga
--      passaria a valer para todo mundo.
--
--      A CARGA NÃO ESTÁ AQUI. São sessenta mil linhas; enfiá-las numa
--      migração faria um arquivo de dez megabytes que o migrador teria
--      de reler a cada subida do servidor. Os dados vêm de
--      `backend/data/totalexpress/*.csv.gz` pelo
--      `node backend/scripts/importar-totalexpress.js`, que é idempotente
--      e pode rodar de novo quando a Total Express reajustar a tabela.
-- ============================================================

-- ── A faixa de CEP e o que ela decide ────────────────────────
CREATE TABLE IF NOT EXISTS "TOTALEXPRESS_ABRANGENCIA" (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id   UUID NOT NULL REFERENCES "EMPRESAS"(id) ON DELETE CASCADE,
  cep_ini     INTEGER NOT NULL,
  cep_fim     INTEGER NOT NULL,
  uf          VARCHAR(2),
  ibge        VARCHAR(7),
  municipio   VARCHAR(80),
  base        VARCHAR(10),
  -- 'Padrão' | 'Alto' | 'Altíssimo' — é ele que escolhe a alíquota do
  -- GRIS. Texto e não enum: a Total Express já usou 'Especial A1'..'B2'
  -- em outras tabelas, e um enum obrigaria migração para aceitá-los.
  risco       VARCHAR(20),
  prazo       INTEGER,
  -- 'Atendido' | 'Repostagem'. Repostagem é entrega via Correios, com
  -- geografia e preço próprios (SPRC, SPRI...) — já vem resolvido na
  -- coluna `geografia`, então o cálculo não precisa saber a diferença.
  atendimento VARCHAR(20),
  localidade  VARCHAR(40),
  geografia   VARCHAR(10) NOT NULL,
  UNIQUE (tenant_id, cep_ini, cep_fim)
);

-- O índice que importa: a busca é sempre "qual faixa contém este CEP".
-- cep_ini DESC porque a consulta pega a última faixa que começa antes do
-- CEP procurado, e aí confere o fim.
CREATE INDEX IF NOT EXISTS idx_tex_abr_cep
  ON "TOTALEXPRESS_ABRANGENCIA" (tenant_id, cep_ini DESC, cep_fim);

-- ── A grade peso × geografia ─────────────────────────────────
CREATE TABLE IF NOT EXISTS "TOTALEXPRESS_TARIFAS" (
  id         UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id  UUID NOT NULL REFERENCES "EMPRESAS"(id) ON DELETE CASCADE,
  geografia  VARCHAR(10) NOT NULL,
  peso_ini   NUMERIC(8,3) NOT NULL,
  peso_fim   NUMERIC(8,3) NOT NULL,
  preco      NUMERIC(12,2) NOT NULL,
  UNIQUE (tenant_id, geografia, peso_ini)
);

CREATE INDEX IF NOT EXISTS idx_tex_tar_busca
  ON "TOTALEXPRESS_TARIFAS" (tenant_id, geografia, peso_fim);

-- ── O adicional por quilo, que é da geografia ────────────────
CREATE TABLE IF NOT EXISTS "TOTALEXPRESS_GEOGRAFIAS" (
  id           UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id    UUID NOT NULL REFERENCES "EMPRESAS"(id) ON DELETE CASCADE,
  geografia    VARCHAR(10) NOT NULL,
  adicional_kg NUMERIC(12,2) NOT NULL DEFAULT 0,
  UNIQUE (tenant_id, geografia)
);

-- ── RLS, no mesmo molde das outras ───────────────────────────
ALTER TABLE "TOTALEXPRESS_ABRANGENCIA" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "TOTALEXPRESS_TARIFAS"     ENABLE ROW LEVEL SECURITY;
ALTER TABLE "TOTALEXPRESS_GEOGRAFIAS"  ENABLE ROW LEVEL SECURITY;

-- ── As caixas em que o copo viaja ────────────────────────────
-- A cubagem precisa das medidas do PACOTE, não do copo. CATALOGO_EMBALAGEM
-- já dizia quantas unidades cabem na caixa (`caixa_qtd`); faltava o
-- tamanho e o peso da caixa vazia. Sem essas quatro colunas o peso
-- cubado é sempre zero, e o frete sai barato demais para carga leve e
-- volumosa — que é exatamente o caso de copo.
ALTER TABLE "CATALOGO_EMBALAGEM"
  ADD COLUMN IF NOT EXISTS caixa_altura      NUMERIC(8,2),
  ADD COLUMN IF NOT EXISTS caixa_largura     NUMERIC(8,2),
  ADD COLUMN IF NOT EXISTS caixa_comprimento NUMERIC(8,2),
  ADD COLUMN IF NOT EXISTS caixa_tara        NUMERIC(8,3);

COMMENT ON COLUMN "CATALOGO_EMBALAGEM".caixa_altura      IS 'cm — altura da caixa fechada, para a cubagem';
COMMENT ON COLUMN "CATALOGO_EMBALAGEM".caixa_largura     IS 'cm — largura da caixa fechada';
COMMENT ON COLUMN "CATALOGO_EMBALAGEM".caixa_comprimento IS 'cm — comprimento da caixa fechada';
COMMENT ON COLUMN "CATALOGO_EMBALAGEM".caixa_tara        IS 'kg — peso da caixa vazia, somado ao peso dos produtos';

NOTIFY pgrst, 'reload schema';

INSERT INTO "_MIGRATIONS" (version, name) VALUES ('118', 'total_express')
ON CONFLICT (version) DO NOTHING;
