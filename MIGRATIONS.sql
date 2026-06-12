-- ============================================================
-- COLE ESTE SQL NO SUPABASE > SQL EDITOR E EXECUTE TUDO
-- ============================================================

-- 1. Novos campos em CLIENTES
CREATE SEQUENCE IF NOT EXISTS clientes_display_id_seq START 1;

ALTER TABLE "CLIENTES"
  ADD COLUMN IF NOT EXISTS display_id    BIGINT  DEFAULT nextval('clientes_display_id_seq'),
  ADD COLUMN IF NOT EXISTS instagram     TEXT,
  ADD COLUMN IF NOT EXISTS nome_fantasia TEXT,
  ADD COLUMN IF NOT EXISTS rating        SMALLINT CHECK (rating BETWEEN 1 AND 5),
  ADD COLUMN IF NOT EXISTS admission_data JSONB DEFAULT '{}';

-- Preenche display_id nos clientes já existentes
UPDATE "CLIENTES"
SET display_id = nextval('clientes_display_id_seq')
WHERE display_id IS NULL;

-- 2. Novos campos em PRODUTOS (dimensional + fornecedor)
ALTER TABLE "PRODUTOS"
  ADD COLUMN IF NOT EXISTS supplier_id         UUID REFERENCES "FORNECEDORES"(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS height              NUMERIC(10,3),
  ADD COLUMN IF NOT EXISTS weight              NUMERIC(10,3),
  ADD COLUMN IF NOT EXISTS thickness           NUMERIC(10,3),
  ADD COLUMN IF NOT EXISTS base_circumference  NUMERIC(10,3),
  ADD COLUMN IF NOT EXISTS mouth_circumference NUMERIC(10,3),
  ADD COLUMN IF NOT EXISTS length              NUMERIC(10,3),
  ADD COLUMN IF NOT EXISTS width               NUMERIC(10,3);

-- ============================================================
-- STORAGE BUCKET para anexos de colaboradores
-- Faça isso no Supabase Dashboard > Storage > New Bucket:
--   Nome: colaboradores-anexos
--   Public: SIM (para gerar URLs públicas)
-- OU rode o SQL abaixo (requer extensão pg_storage):
-- SELECT storage.create_bucket('colaboradores-anexos', '{"public": true}');
-- ============================================================

-- 3. Faixas de preço por quantidade nos produtos
ALTER TABLE "PRODUTOS"
  ADD COLUMN IF NOT EXISTS price_tiers JSONB DEFAULT '[]'::jsonb;

-- 4. Categorias padrão para Lyon Copos
INSERT INTO "CATEGORIAS" (tenant_id, name)
VALUES
  ('a1b2c3d4-e5f6-7890-abcd-ef1234567890', 'PRODUTO ACABADO'),
  ('a1b2c3d4-e5f6-7890-abcd-ef1234567890', 'IMPRESSOS'),
  ('a1b2c3d4-e5f6-7890-abcd-ef1234567890', 'LONG DRINK')
ON CONFLICT DO NOTHING;

-- ============================================================
-- 4b. RH — TABELAS BASE (ponto, férias, folha, documentos)
--     Precisam existir para o módulo de RH funcionar. A FK para
--     CLIENTES habilita os JOINs (CLIENTES(...)) do PostgREST.
-- ============================================================
CREATE TABLE IF NOT EXISTS "RH_PONTO" (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id          UUID NOT NULL,
  employee_id        UUID NOT NULL REFERENCES "CLIENTES"(id) ON DELETE CASCADE,
  work_date          DATE NOT NULL,
  entry1             TIME,
  exit1              TIME,
  entry2             TIME,
  exit2              TIME,
  total_minutes      INT DEFAULT 0,
  extra_minutes      INT DEFAULT 0,
  expected_minutes   INT DEFAULT 0,
  late_minutes       INT DEFAULT 0,
  status             TEXT,
  escala_id          UUID,
  absence            BOOLEAN DEFAULT false,
  justification      TEXT,
  notes              TEXT,
  override_situation TEXT,
  override_note      TEXT,
  override_minutes   INT,
  created_at         TIMESTAMPTZ DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS rh_ponto_uniq_idx
  ON "RH_PONTO" (tenant_id, employee_id, work_date);

CREATE TABLE IF NOT EXISTS "RH_FERIAS" (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL,
  employee_id UUID NOT NULL REFERENCES "CLIENTES"(id) ON DELETE CASCADE,
  start_date  DATE NOT NULL,
  end_date    DATE NOT NULL,
  days        INT,
  status      TEXT DEFAULT 'scheduled',
  approved_by UUID,
  notes       TEXT,
  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "RH_SALARIOS" (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        UUID NOT NULL,
  employee_id      UUID NOT NULL REFERENCES "CLIENTES"(id) ON DELETE CASCADE,
  reference_month  TEXT NOT NULL,
  base_salary      NUMERIC(12,2) DEFAULT 0,
  bonus            NUMERIC(12,2) DEFAULT 0,
  overtime_pay     NUMERIC(12,2) DEFAULT 0,
  other_additions  NUMERIC(12,2) DEFAULT 0,
  gross_salary     NUMERIC(12,2) DEFAULT 0,
  inss_deduction   NUMERIC(12,2) DEFAULT 0,
  irrf_deduction   NUMERIC(12,2) DEFAULT 0,
  other_deductions NUMERIC(12,2) DEFAULT 0,
  fgts_value       NUMERIC(12,2) DEFAULT 0,
  net_salary       NUMERIC(12,2) DEFAULT 0,
  status           TEXT DEFAULT 'draft',
  payment_method   TEXT,
  payment_date     DATE,
  notes            TEXT,
  created_at       TIMESTAMPTZ DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS rh_salarios_uniq_idx
  ON "RH_SALARIOS" (tenant_id, employee_id, reference_month);

CREATE TABLE IF NOT EXISTS "RH_DOCUMENTOS" (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL,
  employee_id   UUID NOT NULL REFERENCES "CLIENTES"(id) ON DELETE CASCADE,
  type          TEXT NOT NULL,
  description   TEXT,
  document_date DATE,
  file_url      TEXT,
  notes         TEXT,
  created_at    TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- 5. RH — ESCALAS DE TRABALHO
--    Define jornada diária esperada, dias da semana e tolerância.
--    daily_minutes = jornada esperada por dia (480 = 8h)
--    weekdays      = dias úteis (0=Dom, 1=Seg ... 6=Sáb)
-- ============================================================
-- Se já existe um "stub" de ESCALAS criado à mão (sem as colunas do
-- sistema), remove-o para recriar com o schema correto. Após a recriação
-- a coluna daily_minutes existe, então re-execuções NÃO apagam dados.
DO $$
BEGIN
  IF to_regclass('public."ESCALAS"') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'ESCALAS' AND column_name = 'daily_minutes'
     ) THEN
    DROP TABLE "ESCALAS" CASCADE;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "ESCALAS" (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         UUID NOT NULL,
  name              TEXT NOT NULL,
  daily_minutes     INT  NOT NULL DEFAULT 480,
  weekdays          INT[] NOT NULL DEFAULT '{1,2,3,4,5}',
  entry_time        TIME,
  exit_time         TIME,
  break_minutes     INT  DEFAULT 60,
  tolerance_minutes INT  DEFAULT 10,
  is_active         BOOLEAN DEFAULT true,
  created_at        TIMESTAMPTZ DEFAULT now()
);
-- alinha colunas caso a tabela já exista com outra estrutura
ALTER TABLE "ESCALAS"
  ADD COLUMN IF NOT EXISTS tenant_id         UUID,
  ADD COLUMN IF NOT EXISTS name              TEXT,
  ADD COLUMN IF NOT EXISTS daily_minutes     INT   DEFAULT 480,
  ADD COLUMN IF NOT EXISTS weekdays          INT[] DEFAULT '{1,2,3,4,5}',
  ADD COLUMN IF NOT EXISTS entry_time        TIME,
  ADD COLUMN IF NOT EXISTS exit_time         TIME,
  ADD COLUMN IF NOT EXISTS break_minutes     INT   DEFAULT 60,
  ADD COLUMN IF NOT EXISTS tolerance_minutes INT   DEFAULT 10,
  ADD COLUMN IF NOT EXISTS is_active         BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS created_at        TIMESTAMPTZ DEFAULT now();

CREATE UNIQUE INDEX IF NOT EXISTS escalas_tenant_name_idx ON "ESCALAS" (tenant_id, name);

INSERT INTO "ESCALAS" (tenant_id, name, daily_minutes, weekdays, entry_time, exit_time, tolerance_minutes)
VALUES
  ('a1b2c3d4-e5f6-7890-abcd-ef1234567890', 'Segunda a Sexta (8h)',   480, '{1,2,3,4,5}',   '08:00', '18:00', 10),
  ('a1b2c3d4-e5f6-7890-abcd-ef1234567890', 'Segunda a Sábado (7h20)',440, '{1,2,3,4,5,6}', '08:00', '17:00', 10),
  ('a1b2c3d4-e5f6-7890-abcd-ef1234567890', '6x1 (8h)',               480, '{1,2,3,4,5,6}', '08:00', '17:00', 10),
  ('a1b2c3d4-e5f6-7890-abcd-ef1234567890', '12x36 (12h)',            720, '{1,3,5}',       '07:00', '19:00', 15),
  ('a1b2c3d4-e5f6-7890-abcd-ef1234567890', 'Meio Período (4h)',      240, '{1,2,3,4,5}',   '08:00', '12:00', 10)
ON CONFLICT (tenant_id, name) DO NOTHING;

-- ============================================================
-- 6. RH — SITUAÇÕES DE PONTO
--    Catálogo de situações aplicáveis a um dia de ponto.
--    kind: work | debit | credit | neutral
--    insertable = aparece no menu "Inserir situação"
-- ============================================================
-- A tabela SITUACOES criada manualmente tem uma coluna "Situação" NOT NULL
-- que conflita com o schema do sistema. Remove o stub do usuário; como a
-- tabela recriada NÃO tem a coluna "Situação", re-execuções não apagam nada.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'SITUACOES' AND column_name = 'Situação'
  ) THEN
    DROP TABLE "SITUACOES" CASCADE;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "SITUACOES" (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL,
  code        TEXT NOT NULL,
  name        TEXT NOT NULL,
  kind        TEXT DEFAULT 'neutral',
  color       TEXT DEFAULT 'gray',
  insertable  BOOLEAN DEFAULT true,
  is_system   BOOLEAN DEFAULT false,
  is_active   BOOLEAN DEFAULT true,
  created_at  TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE "SITUACOES"
  ADD COLUMN IF NOT EXISTS tenant_id  UUID,
  ADD COLUMN IF NOT EXISTS code       TEXT,
  ADD COLUMN IF NOT EXISTS name       TEXT,
  ADD COLUMN IF NOT EXISTS kind       TEXT DEFAULT 'neutral',
  ADD COLUMN IF NOT EXISTS color      TEXT DEFAULT 'gray',
  ADD COLUMN IF NOT EXISTS insertable BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS is_system  BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_active  BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT now();

CREATE UNIQUE INDEX IF NOT EXISTS situacoes_tenant_code_idx ON "SITUACOES" (tenant_id, code);

INSERT INTO "SITUACOES" (tenant_id, code, name, kind, color, insertable, is_system)
VALUES
  ('a1b2c3d4-e5f6-7890-abcd-ef1234567890', 'trabalhando',       'Trabalhando',          'work',    'green',  false, true),
  ('a1b2c3d4-e5f6-7890-abcd-ef1234567890', 'atraso',            'Atraso',               'debit',   'red',    false, true),
  ('a1b2c3d4-e5f6-7890-abcd-ef1234567890', 'falta',             'Falta',                'debit',   'red',    false, true),
  ('a1b2c3d4-e5f6-7890-abcd-ef1234567890', 'folga',             'Folga',                'neutral', 'gray',   false, true),
  ('a1b2c3d4-e5f6-7890-abcd-ef1234567890', 'abono',             'Abono',                'credit',  'blue',   true,  false),
  ('a1b2c3d4-e5f6-7890-abcd-ef1234567890', 'atestado',          'Atestado',             'neutral', 'teal',   true,  false),
  ('a1b2c3d4-e5f6-7890-abcd-ef1234567890', 'justificar_horas',  'Justificar Horas',     'credit',  'indigo', true,  false),
  ('a1b2c3d4-e5f6-7890-abcd-ef1234567890', 'falta_justificada', 'Falta Justificada',    'neutral', 'orange', true,  false),
  ('a1b2c3d4-e5f6-7890-abcd-ef1234567890', 'hora_extra',        'Hora Extra',           'credit',  'amber',  true,  false),
  ('a1b2c3d4-e5f6-7890-abcd-ef1234567890', 'banco_credito',     'Crédito Banco Horas',  'credit',  'green',  true,  false),
  ('a1b2c3d4-e5f6-7890-abcd-ef1234567890', 'banco_debito',      'Débito Banco Horas',   'debit',   'red',    true,  false),
  ('a1b2c3d4-e5f6-7890-abcd-ef1234567890', 'ferias',            'Férias',               'neutral', 'purple', true,  false)
ON CONFLICT (tenant_id, code) DO NOTHING;

-- ============================================================
-- 7. RH_PONTO — colunas de apuração (atraso, situação ajustada)
-- ============================================================
ALTER TABLE "RH_PONTO"
  ADD COLUMN IF NOT EXISTS escala_id          UUID,
  ADD COLUMN IF NOT EXISTS expected_minutes   INT  DEFAULT 0,
  ADD COLUMN IF NOT EXISTS late_minutes       INT  DEFAULT 0,
  ADD COLUMN IF NOT EXISTS status             TEXT,
  ADD COLUMN IF NOT EXISTS override_situation TEXT,
  ADD COLUMN IF NOT EXISTS override_note      TEXT,
  ADD COLUMN IF NOT EXISTS override_minutes   INT;

-- Vincula colaborador (CLIENTES.admission_data) a uma escala por id (opcional)
-- A escala fica salva em admission_data->>'scale_id'.

-- ============================================================
-- 8. RH_MARCACOES — batidas/marcações individuais de ponto
--    Cada linha = uma batida (entrada ou saída). O futuro app de
--    marcação insere aqui. RH_PONTO passa a ser a APURAÇÃO diária
--    (totais, atraso, situação) calculada a partir destas batidas.
-- ============================================================
CREATE TABLE IF NOT EXISTS "RH_MARCACOES" (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL,
  employee_id   UUID NOT NULL REFERENCES "CLIENTES"(id) ON DELETE CASCADE,
  work_date     DATE NOT NULL,
  punch_time    TIME NOT NULL,
  punched_at    TIMESTAMPTZ DEFAULT now(),
  source        TEXT DEFAULT 'manual',   -- manual | app | biometria | web
  device        TEXT,
  latitude      NUMERIC(10,7),
  longitude     NUMERIC(10,7),
  registered_by UUID,
  notes         TEXT,
  created_at    TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE "RH_MARCACOES"
  ADD COLUMN IF NOT EXISTS tenant_id     UUID,
  ADD COLUMN IF NOT EXISTS employee_id   UUID,
  ADD COLUMN IF NOT EXISTS work_date     DATE,
  ADD COLUMN IF NOT EXISTS punch_time    TIME,
  ADD COLUMN IF NOT EXISTS punched_at    TIMESTAMPTZ DEFAULT now(),
  ADD COLUMN IF NOT EXISTS source        TEXT DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS device        TEXT,
  ADD COLUMN IF NOT EXISTS latitude      NUMERIC(10,7),
  ADD COLUMN IF NOT EXISTS longitude     NUMERIC(10,7),
  ADD COLUMN IF NOT EXISTS registered_by UUID,
  ADD COLUMN IF NOT EXISTS notes         TEXT,
  ADD COLUMN IF NOT EXISTS created_at    TIMESTAMPTZ DEFAULT now();

CREATE INDEX IF NOT EXISTS rh_marcacoes_lookup_idx
  ON "RH_MARCACOES" (tenant_id, employee_id, work_date, punch_time);
