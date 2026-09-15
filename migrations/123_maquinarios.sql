-- ============================================================
-- 123. MAQUINÁRIOS (E COMPUTADORES E TI): O PATRIMÔNIO QUE PRODUZ.
--
--      A Engenharia de Custos sabia quanto custa a tinta e o aluguel,
--      mas não sabia nada das máquinas — e é nelas que mora a maior
--      despesa escondida da fábrica: a depreciação e a manutenção. Uma
--      Masterink de R$ 98 mil perde R$ 1.960 por mês parada ou rodando,
--      e esse dinheiro precisa estar no preço do copo.
--
--        MAQUINAS             o equipamento. `grupo` separa a fábrica
--                             ('maquinario') dos computadores ('ti') —
--                             mesma conta de depreciação, mesma tela.
--        MAQUINA_PRODUCOES    cada lote rodado: quantidade, horas,
--                             operador. É o que mede o desgaste. A
--                             etapa Produção grava aqui sozinha.
--        MAQUINA_MANUTENCOES  o plano: cada item do checklist com a
--                             periodicidade e a próxima execução.
--        MAQUINA_PECAS        peças e componentes, com estoque, vida
--                             útil e as máquinas em que servem.
--        MAQUINA_EVENTOS      o histórico: revisão, troca de peça,
--                             parada, retomada, marco. Custo aqui é
--                             custo realizado.
--
--      O custo mensal (depreciação + manutenção) entra no rateio das
--      despesas fixas como linha CALCULADA (lib/maquinas.js), e não como
--      linha de DESPESAS_FIXAS: depreciação não é boleto, e gravada ali
--      ela viraria conta a pagar e item do malote do contador.
-- ============================================================

CREATE TABLE IF NOT EXISTS "MAQUINAS" (
  id                        UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id                 UUID NOT NULL REFERENCES "EMPRESAS"(id) ON DELETE CASCADE,
  grupo                     VARCHAR(20) NOT NULL DEFAULT 'maquinario',   -- maquinario | ti
  codigo                    VARCHAR(20) NOT NULL,
  nome                      VARCHAR(120) NOT NULL,
  tipo                      VARCHAR(60),
  setor                     VARCHAR(60),
  status                    VARCHAR(20) NOT NULL DEFAULT 'operacao',     -- operacao | manutencao | inativa
  fabricante                VARCHAR(80),
  modelo                    VARCHAR(80),
  numero_serie              VARCHAR(80),
  supplier_id               UUID REFERENCES "FORNECEDORES"(id) ON DELETE SET NULL,
  fornecedor_nome           VARCHAR(120),
  localizacao               VARCHAR(80),
  responsavel               VARCHAR(80),
  data_aquisicao            DATE,
  nota_fiscal               VARCHAR(60),
  garantia_ate              DATE,

  -- Depreciação e reposição
  valor_aquisicao           NUMERIC(14,2) NOT NULL DEFAULT 0,
  valor_residual            NUMERIC(14,2) NOT NULL DEFAULT 0,
  vida_util_anos            NUMERIC(6,2)  NOT NULL DEFAULT 10,
  vida_util_unidades        NUMERIC(14,0),
  meta_reposicao            NUMERIC(14,2) NOT NULL DEFAULT 0,
  valor_venda_estimado      NUMERIC(14,2) NOT NULL DEFAULT 0,
  reserva_reposicao         NUMERIC(14,2) NOT NULL DEFAULT 0,
  entra_no_rateio           BOOLEAN NOT NULL DEFAULT true,

  -- Produção e desgaste
  capacidade_hora           NUMERIC(10,2),
  producao_inicial          NUMERIC(14,0) NOT NULL DEFAULT 0,   -- o que já tinha rodado antes do sistema
  horas_iniciais            NUMERIC(12,2) NOT NULL DEFAULT 0,
  intervalo_revisao_unidades NUMERIC(14,0),                     -- a cada quantas unidades revisa
  producao_ultima_revisao   NUMERIC(14,0),                      -- acumulado no dia da última revisão
  ultima_revisao            DATE,
  proxima_revisao           DATE,

  observacoes               TEXT,
  created_at                TIMESTAMPTZ DEFAULT now(),
  updated_at                TIMESTAMPTZ DEFAULT now(),
  UNIQUE (tenant_id, codigo)
);
CREATE INDEX IF NOT EXISTS maquinas_tenant_grupo ON "MAQUINAS" (tenant_id, grupo, codigo);

CREATE TABLE IF NOT EXISTS "MAQUINA_PRODUCOES" (
  id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id       UUID NOT NULL REFERENCES "EMPRESAS"(id) ON DELETE CASCADE,
  maquina_id      UUID NOT NULL REFERENCES "MAQUINAS"(id) ON DELETE CASCADE,
  data            DATE NOT NULL DEFAULT CURRENT_DATE,
  produto         VARCHAR(160),
  product_id      UUID REFERENCES "PRODUTOS"(id) ON DELETE SET NULL,
  venda_id        UUID REFERENCES "VENDAS"(id) ON DELETE SET NULL,
  quantidade      NUMERIC(14,0) NOT NULL DEFAULT 0,
  perdas          NUMERIC(14,0) NOT NULL DEFAULT 0,
  horas           NUMERIC(10,2) NOT NULL DEFAULT 0,
  operador        VARCHAR(80),
  origem          VARCHAR(20) NOT NULL DEFAULT 'manual',        -- manual | producao
  observacao      TEXT,
  created_at      TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS maquina_producoes_maq ON "MAQUINA_PRODUCOES" (maquina_id, data DESC);
-- Um pedido rodado numa máquina conta uma vez só, mesmo se a etapa for refeita.
CREATE UNIQUE INDEX IF NOT EXISTS maquina_producoes_venda ON "MAQUINA_PRODUCOES" (maquina_id, venda_id) WHERE venda_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS "MAQUINA_MANUTENCOES" (
  id                  UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id           UUID NOT NULL REFERENCES "EMPRESAS"(id) ON DELETE CASCADE,
  maquina_id          UUID NOT NULL REFERENCES "MAQUINAS"(id) ON DELETE CASCADE,
  item                VARCHAR(120) NOT NULL,
  tipo                VARCHAR(20) NOT NULL DEFAULT 'preventiva',   -- preventiva | preditiva | corretiva
  periodicidade       VARCHAR(20) NOT NULL DEFAULT 'mensal',       -- diaria | semanal | quinzenal | mensal | bimestral | trimestral | semestral | anual
  ultima_execucao     DATE,
  proxima_execucao    DATE,
  responsavel         VARCHAR(80),
  custo_previsto      NUMERIC(12,2) NOT NULL DEFAULT 0,
  ativo               BOOLEAN NOT NULL DEFAULT true,
  observacao          TEXT,
  created_at          TIMESTAMPTZ DEFAULT now(),
  updated_at          TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS maquina_manutencoes_maq ON "MAQUINA_MANUTENCOES" (maquina_id, proxima_execucao);

CREATE TABLE IF NOT EXISTS "MAQUINA_PECAS" (
  id                  UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id           UUID NOT NULL REFERENCES "EMPRESAS"(id) ON DELETE CASCADE,
  codigo              VARCHAR(20) NOT NULL,
  nome                VARCHAR(120) NOT NULL,
  categoria           VARCHAR(40),
  fabricante          VARCHAR(80),
  supplier_id         UUID REFERENCES "FORNECEDORES"(id) ON DELETE SET NULL,
  fornecedor_nome     VARCHAR(120),
  fornecedor_telefone VARCHAR(30),
  valor_unitario      NUMERIC(12,2) NOT NULL DEFAULT 0,
  estoque             NUMERIC(10,0) NOT NULL DEFAULT 0,
  estoque_minimo      NUMERIC(10,0) NOT NULL DEFAULT 0,
  vida_util_meses     NUMERIC(6,0),
  ultima_troca        DATE,
  proxima_troca       DATE,
  maquinas            UUID[] NOT NULL DEFAULT '{}',              -- compatibilidade
  ativo               BOOLEAN NOT NULL DEFAULT true,
  observacao          TEXT,
  created_at          TIMESTAMPTZ DEFAULT now(),
  updated_at          TIMESTAMPTZ DEFAULT now(),
  UNIQUE (tenant_id, codigo)
);
CREATE INDEX IF NOT EXISTS maquina_pecas_maquinas ON "MAQUINA_PECAS" USING GIN (maquinas);

CREATE TABLE IF NOT EXISTS "MAQUINA_EVENTOS" (
  id                  UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id           UUID NOT NULL REFERENCES "EMPRESAS"(id) ON DELETE CASCADE,
  maquina_id          UUID NOT NULL REFERENCES "MAQUINAS"(id) ON DELETE CASCADE,
  data                DATE NOT NULL DEFAULT CURRENT_DATE,
  tipo                VARCHAR(30) NOT NULL,   -- cadastro | revisao | manutencao | troca_peca | parada | retomada | marco | status | reserva | alteracao
  descricao           TEXT,
  responsavel         VARCHAR(80),
  fornecedor          VARCHAR(120),
  custo               NUMERIC(12,2) NOT NULL DEFAULT 0,
  producao_impactada  NUMERIC(14,0),
  horas_parada        NUMERIC(8,2),
  status              VARCHAR(20) NOT NULL DEFAULT 'concluido',   -- concluido | pendente | agendado | cancelado
  peca_id             UUID REFERENCES "MAQUINA_PECAS"(id) ON DELETE SET NULL,
  manutencao_id       UUID REFERENCES "MAQUINA_MANUTENCOES"(id) ON DELETE SET NULL,
  detalhes            JSONB NOT NULL DEFAULT '{}'::jsonb,
  user_id             UUID,
  created_at          TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS maquina_eventos_maq ON "MAQUINA_EVENTOS" (maquina_id, data DESC, created_at DESC);


ALTER TABLE "MAQUINAS"            ENABLE ROW LEVEL SECURITY;
ALTER TABLE "MAQUINA_PRODUCOES"   ENABLE ROW LEVEL SECURITY;
ALTER TABLE "MAQUINA_MANUTENCOES" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "MAQUINA_PECAS"       ENABLE ROW LEVEL SECURITY;
ALTER TABLE "MAQUINA_EVENTOS"     ENABLE ROW LEVEL SECURITY;

NOTIFY pgrst, 'reload schema';
