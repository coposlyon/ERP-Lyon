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
-- 5. RH — ESCALAS DE TRABALHO
--    Define jornada diária esperada, dias da semana e tolerância.
--    daily_minutes = jornada esperada por dia (480 = 8h)
--    weekdays      = dias úteis (0=Dom, 1=Seg ... 6=Sáb)
-- ============================================================
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
