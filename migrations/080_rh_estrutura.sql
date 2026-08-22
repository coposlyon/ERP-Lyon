-- ============================================================
-- 080. A ESTRUTURA DO RH — UMA INFORMAÇÃO, UMA ORIGEM.
--
-- O RH tinha ponto, férias, folha e documentos, mas não tinha a
-- ESTRUTURA que dá sentido a eles: departamento, cargo, CBO, gestor,
-- centro de custo. Sem isso, cada tela inventava o próprio texto —
-- "Comercial" digitado à mão no cadastro de um, "COMERCIAL" no de
-- outro — e nenhum número batia entre telas.
--
-- Estas tabelas são o cadastro mestre da organização. Toda tela do RH
-- lê daqui: quem trabalha onde, com qual jornada, sob qual gestor, em
-- qual centro de custo. Mudou aqui, mudou em todo lugar.
--
-- OCORRÊNCIAS, ADMISSÕES e DESLIGAMENTOS entram como PROCESSO, não
-- como texto solto: o atraso que o ponto detecta vira uma linha em
-- RH_OCORRENCIAS que a tela de Ocorrências lê, que a folha desconta e
-- que o eSocial informa. Um fato, um registro, vários leitores.
-- ============================================================

-- ── Departamentos (os setores da empresa) ───────────────────
CREATE TABLE IF NOT EXISTS "RH_DEPARTAMENTOS" (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL,
  code          TEXT NOT NULL,
  name          TEXT NOT NULL,
  manager_id    UUID,                       -- CLIENTES(type='CO'): o gestor responsável
  cost_center_id UUID,                      -- CENTROS_CUSTO
  default_scale_id UUID,                    -- ESCALAS: jornada padrão do setor
  parent_id     UUID,                       -- organograma: a quem responde
  sort          INT DEFAULT 0,
  is_active     BOOLEAN DEFAULT TRUE,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (tenant_id, code)
);

-- ── Cargos (com CBO, que o eSocial exige) ───────────────────
CREATE TABLE IF NOT EXISTS "RH_CARGOS" (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL,
  name          TEXT NOT NULL,
  cbo           TEXT,
  department_id UUID,
  base_salary   NUMERIC(12,2),
  is_active     BOOLEAN DEFAULT TRUE,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (tenant_id, name)
);

-- ── Ocorrências (atraso, falta, justificativa, advertência) ─
-- Nascem sozinhas do ponto e do portal do colaborador. A decisão
-- disciplinar é humana: `decided_by` só é preenchido por gente.
CREATE TABLE IF NOT EXISTS "RH_OCORRENCIAS" (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL,
  employee_id   UUID NOT NULL,
  kind          TEXT NOT NULL,              -- atraso | falta | justificativa | advertencia | suspensao | outro
  occurred_on   DATE NOT NULL,
  severity      TEXT DEFAULT 'media',       -- baixa | media | alta
  origin        TEXT DEFAULT 'ponto',       -- ponto | portal | gestor | sistema
  status        TEXT DEFAULT 'aberta',      -- aberta | em_analise | justificada | aprovada | recusada | encaminhada
  minutes       INT,                        -- atraso: quantos minutos
  description   TEXT,
  document_url  TEXT,                       -- comprovante enviado pelo colaborador
  ai_score      INT,                        -- triagem da IA (0–100); NÃO decide nada
  ai_note       TEXT,
  decided_by    UUID,                       -- quem decidiu (usuário autorizado)
  decided_at    TIMESTAMPTZ,
  sla_due_at    TIMESTAMPTZ,                -- prazo de análise
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS rh_ocorrencias_tenant_data ON "RH_OCORRENCIAS" (tenant_id, occurred_on DESC);
CREATE INDEX IF NOT EXISTS rh_ocorrencias_colab ON "RH_OCORRENCIAS" (tenant_id, employee_id);

-- ── Admissões (o processo, não o cadastro) ──────────────────
-- O cadastro do colaborador continua sendo as cinco etapas
-- aprovadas. Esta tabela acompanha o ANDAMENTO delas.
CREATE TABLE IF NOT EXISTS "RH_ADMISSOES" (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL,
  employee_id   UUID,                       -- CLIENTES(type='CO'), quando já existir
  candidate_name TEXT,                      -- antes de existir cadastro (captação)
  department_id UUID,
  cargo_id      UUID,
  stage         TEXT DEFAULT 'captacao',    -- captacao | dados_pessoais | dados_trabalhistas | contrato | documentacao | revisao | concluida
  expected_date DATE,
  responsible_id UUID,
  status        TEXT DEFAULT 'em_andamento',-- em_andamento | aguardando_docs | aguardando_aprovacao | concluida | cancelada
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

-- ── Desligamentos ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "RH_DESLIGAMENTOS" (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL,
  employee_id   UUID NOT NULL,
  kind          TEXT,                       -- sem_justa_causa | pedido_demissao | justa_causa | termino_contrato | acordo
  requested_by  TEXT DEFAULT 'empresa',     -- empresa | colaborador (portal)
  notice        TEXT,                       -- trabalhado | indenizado | dispensado
  exit_date     DATE,
  exam_required BOOLEAN DEFAULT TRUE,       -- exame demissional: condicional, não obrigatório sempre
  exam_done_on  DATE,
  homolog_required BOOLEAN DEFAULT FALSE,   -- homologação: só quando a CCT exigir
  homolog_on    DATE,
  rescission_total NUMERIC(12,2),
  access_revoked_at TIMESTAMPTZ,
  esocial_status TEXT,
  status        TEXT DEFAULT 'em_andamento',
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- SEMENTES — a estrutura combinada com o Pablo.
-- Sete setores. Os números de colaboradores NÃO ficam aqui: eles
-- são contados do cadastro, sempre.
-- ============================================================
DO $$
DECLARE t UUID := 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
BEGIN
  -- Centros de custo que faltavam para fechar os sete setores
  INSERT INTO "CENTROS_CUSTO" (tenant_id, code, name, is_active)
  SELECT t, v.code, v.name, TRUE FROM (VALUES
    ('COM','Comercial'), ('RH','Recursos Humanos'), ('FIN','Financeiro'),
    ('MKT','Marketing'), ('DSG','Designer')
  ) AS v(code,name)
  WHERE NOT EXISTS (SELECT 1 FROM "CENTROS_CUSTO" c WHERE c.tenant_id = t AND c.code = v.code);

  -- Os sete departamentos
  INSERT INTO "RH_DEPARTAMENTOS" (tenant_id, code, name, sort)
  SELECT t, v.code, v.name, v.sort FROM (VALUES
    ('COM-01','Comercial',1), ('PRO-01','Produção',2), ('ADM-01','RH',3),
    ('FIN-01','Financeiro',4), ('LOG-01','Logística',5), ('MKT-01','Marketing',6),
    ('DSG-01','Designer',7)
  ) AS v(code,name,sort)
  WHERE NOT EXISTS (SELECT 1 FROM "RH_DEPARTAMENTOS" d WHERE d.tenant_id = t AND d.code = v.code);

  -- Cargos com CBO (o eSocial pede o CBO, não o nome bonito)
  INSERT INTO "RH_CARGOS" (tenant_id, name, cbo)
  SELECT t, v.name, v.cbo FROM (VALUES
    ('Vendedor Interno','5211-10'), ('Auxiliar de Produção','7842-05'),
    ('Assistente de RH','4110-10'), ('Estagiário Financeiro','4110-10'),
    ('Estagiário Logística','4241-05'), ('Designer Gráfico','2515-05'),
    ('Analista de Marketing','2531-05'), ('Pintor Industrial','7233-15'),
    ('Operador de Máquinas','8211-10'), ('Auxiliar de Embalagem','7842-05')
  ) AS v(name,cbo)
  WHERE NOT EXISTS (SELECT 1 FROM "RH_CARGOS" c WHERE c.tenant_id = t AND c.name = v.name);

  -- A jornada de ESTÁGIO (30h) — os dois estagiários não podem herdar
  -- as 44h do CLT, e sem esta escala cadastrada era o que acontecia.
  INSERT INTO "ESCALAS" (tenant_id, name, daily_minutes, weekdays, entry_time, exit_time, break_minutes, tolerance_minutes)
  SELECT t, 'Estágio 30h (Seg a Sex)', 360, ARRAY[1,2,3,4,5], '08:00', '14:00', 0, 5
  WHERE NOT EXISTS (SELECT 1 FROM "ESCALAS" e WHERE e.tenant_id = t AND e.name = 'Estágio 30h (Seg a Sex)');

  -- Tolerância combinada: 5 minutos, não 10.
  UPDATE "ESCALAS" SET tolerance_minutes = 5
  WHERE tenant_id = t AND tolerance_minutes = 10;
END $$;

INSERT INTO "_MIGRATIONS" (version, name) VALUES ('080', 'rh_estrutura')
ON CONFLICT (version) DO NOTHING;
