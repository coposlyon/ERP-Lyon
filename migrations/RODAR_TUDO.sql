-- ============================================================
-- APLICAR TODAS AS MIGRAÇÕES (96 arquivos, 000 a 099)
--
-- Cole no Supabase → SQL Editor → Run.
--
-- É SEGURO RODAR COM O BANCO JÁ POPULADO. Cada migração é idempotente:
-- usa IF NOT EXISTS, CREATE OR REPLACE, ON CONFLICT DO NOTHING, e os
-- cinco arquivos que inserem dado de partida (043, 053, 065, 067, 092)
-- estão todos protegidos por WHERE NOT EXISTS. Conferi um por um antes
-- de montar este pacote — o que já está aplicado é simplesmente pulado.
--
-- Ao final, "_MIGRATIONS" fica com as 95 versões registradas e o
-- diagnóstico (arquivo 1) para de acusar faltantes.
--
-- DEPOIS DISSO, resolva a causa: defina DATABASE_URL nas variáveis de
-- ambiente do Discloud (a connection string do Postgres do Supabase,
-- em Project Settings → Database → Connection string → URI). Com ela
-- definida, o próprio ERP aplica as migrações novas no boot e este
-- trabalho manual deixa de existir.
-- ============================================================



-- ==========================================================
-- 000_controle.sql
-- ==========================================================
-- Tabela de controle de migrações — rode este arquivo primeiro (uma vez).
CREATE TABLE IF NOT EXISTS "_MIGRATIONS" (
  version    TEXT PRIMARY KEY,
  name       TEXT,
  applied_at TIMESTAMPTZ DEFAULT now()
);


-- ==========================================================
-- 001_clientes_produtos.sql
-- ==========================================================
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

INSERT INTO "_MIGRATIONS" (version, name) VALUES ('001', 'clientes_produtos')
ON CONFLICT (version) DO NOTHING;


-- ==========================================================
-- 002_rh_completo.sql
-- ==========================================================
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

INSERT INTO "_MIGRATIONS" (version, name) VALUES ('002', 'rh_completo')
ON CONFLICT (version) DO NOTHING;


-- ==========================================================
-- 003_permissoes.sql
-- ==========================================================
-- ============================================================
-- 9. PERMISSÕES — módulos permitidos por usuário
--    NULL  = sem restrição (admins e usuários legados)
--    []    = nenhum módulo (só dashboard)
--    [...] = lista de módulos permitidos
-- ============================================================
ALTER TABLE "USUARIOS"
  ADD COLUMN IF NOT EXISTS allowed_modules JSONB DEFAULT NULL;

INSERT INTO "_MIGRATIONS" (version, name) VALUES ('003', 'permissoes')
ON CONFLICT (version) DO NOTHING;


-- ==========================================================
-- 004_venda_transacional.sql
-- ==========================================================
-- ============================================================
-- 10. VENDA TRANSACIONAL — função criar_venda
--     Toda a venda (numeração, cabeçalho, itens, baixa de estoque
--     e movimentações) acontece em UMA transação: ou grava tudo,
--     ou nada. O preço é calculado AQUI (faixas de quantidade
--     price_tiers ou sale_price) — o preço vindo do cliente só é
--     aceito se for maior, ou se _allow_price_override = true
--     (admin/gerente).
-- ============================================================
CREATE OR REPLACE FUNCTION criar_venda(
  _tenant_id            UUID,
  _user_id              UUID,
  _customer_id          UUID,
  _type                 TEXT,
  _items                JSONB,
  _discount             NUMERIC DEFAULT 0,
  _payment_method       TEXT    DEFAULT NULL,
  _notes                TEXT    DEFAULT NULL,
  _delivery_date        DATE    DEFAULT NULL,
  _artwork_url          TEXT    DEFAULT NULL,
  _artwork_notes        TEXT    DEFAULT NULL,
  _allow_price_override BOOLEAN DEFAULT false
) RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
  v_number        BIGINT;
  v_sale          "VENDAS"%ROWTYPE;
  v_item          JSONB;
  v_tier          JSONB;
  v_product       RECORD;
  v_qty           NUMERIC;
  v_price         NUMERIC;
  v_client_price  NUMERIC;
  v_item_discount NUMERIC;
  v_subtotal      NUMERIC := 0;
BEGIN
  IF _items IS NULL OR jsonb_array_length(_items) = 0 THEN
    RAISE EXCEPTION 'A venda deve ter ao menos um item';
  END IF;
  _discount := GREATEST(COALESCE(_discount, 0), 0);

  -- Numeração sequencial por tenant (advisory lock evita duplicidade
  -- em vendas simultâneas)
  PERFORM pg_advisory_xact_lock(hashtext(_tenant_id::text || ':venda'));
  SELECT COALESCE(MAX(number), 0) + 1 INTO v_number
    FROM "VENDAS" WHERE tenant_id = _tenant_id;

  DROP TABLE IF EXISTS tmp_venda_itens;
  CREATE TEMP TABLE tmp_venda_itens (
    product_id    UUID,
    quantity      NUMERIC,
    unit_price    NUMERIC,
    discount      NUMERIC,
    total         NUMERIC,
    customization JSONB,
    prev_stock    NUMERIC
  ) ON COMMIT DROP;

  FOR v_item IN SELECT * FROM jsonb_array_elements(_items) LOOP
    v_qty := COALESCE((v_item->>'quantity')::NUMERIC, 0);
    IF v_qty <= 0 THEN
      RAISE EXCEPTION 'Quantidade inválida em um dos itens';
    END IF;

    SELECT id, name, sale_price, price_tiers, is_active, current_stock
      INTO v_product
      FROM "PRODUTOS"
     WHERE id = (v_item->>'product_id')::UUID
       AND tenant_id = _tenant_id
     FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Produto não encontrado ou de outra empresa';
    END IF;
    IF v_product.is_active = false THEN
      RAISE EXCEPTION 'Produto inativo: %', v_product.name;
    END IF;

    -- Preço oficial do servidor: faixa por quantidade ou preço de venda
    v_price := COALESCE(v_product.sale_price, 0);
    FOR v_tier IN SELECT * FROM jsonb_array_elements(COALESCE(v_product.price_tiers, '[]'::jsonb)) LOOP
      IF v_qty >= COALESCE((v_tier->>'min_qty')::NUMERIC, 0)
         AND ((v_tier->>'max_qty') IS NULL OR v_qty <= (v_tier->>'max_qty')::NUMERIC) THEN
        v_price := COALESCE((v_tier->>'price')::NUMERIC, v_price);
      END IF;
    END LOOP;

    v_client_price := (v_item->>'unit_price')::NUMERIC;
    IF _allow_price_override AND v_client_price IS NOT NULL AND v_client_price >= 0 THEN
      v_price := v_client_price;   -- admin/gerente: preço livre
    ELSIF v_client_price IS NOT NULL AND v_client_price > v_price THEN
      v_price := v_client_price;   -- vender acima da tabela é sempre permitido
    END IF;

    v_item_discount := GREATEST(COALESCE((v_item->>'discount')::NUMERIC, 0), 0);
    IF v_item_discount > v_qty * v_price THEN
      RAISE EXCEPTION 'Desconto do item maior que o valor do item (%)', v_product.name;
    END IF;

    INSERT INTO tmp_venda_itens VALUES (
      v_product.id, v_qty, v_price, v_item_discount,
      v_qty * v_price - v_item_discount,
      CASE WHEN v_item ? 'customization' THEN v_item->'customization' ELSE NULL END,
      COALESCE(v_product.current_stock, 0)
    );
    v_subtotal := v_subtotal + (v_qty * v_price);

    UPDATE "PRODUTOS"
       SET current_stock = COALESCE(current_stock, 0) - v_qty
     WHERE id = v_product.id;
  END LOOP;

  IF _discount > v_subtotal THEN
    RAISE EXCEPTION 'Desconto maior que o subtotal da venda';
  END IF;

  INSERT INTO "VENDAS" (
    tenant_id, number, type, customer_id, user_id, status,
    subtotal, discount, total, notes, artwork_url, artwork_notes,
    delivery_date, payment_method
  ) VALUES (
    _tenant_id, v_number, COALESCE(_type, 'sale'), _customer_id, _user_id, 'confirmed',
    v_subtotal, _discount, v_subtotal - _discount, _notes, _artwork_url, _artwork_notes,
    _delivery_date, _payment_method
  ) RETURNING * INTO v_sale;

  INSERT INTO "VENDA_ITENS" (sale_id, product_id, quantity, unit_price, discount, total, customization)
  SELECT v_sale.id, product_id, quantity, unit_price, discount, total, customization
    FROM tmp_venda_itens;

  INSERT INTO "MOVIMENTACOES_ESTOQUE" (
    tenant_id, product_id, type, quantity,
    previous_stock, current_stock,
    reference_type, reference_id, user_id, notes
  )
  SELECT _tenant_id, t.product_id, 'exit', t.quantity,
         t.prev_stock, t.prev_stock - t.quantity,
         'sale', v_sale.id, _user_id, 'Venda #' || v_number
    FROM tmp_venda_itens t;

  RETURN to_jsonb(v_sale);
END;
$$;

INSERT INTO "_MIGRATIONS" (version, name) VALUES ('004', 'venda_transacional')
ON CONFLICT (version) DO NOTHING;


-- ==========================================================
-- 005_auditoria.sql
-- ==========================================================
-- ============================================================
-- 005. AUDITORIA — trilha de alterações
--      Registra quem fez o quê, em qual entidade e quando.
--      Alimentada pelo backend (lib/audit.js) em todas as
--      operações sensíveis: preços, vendas, estoque, ponto,
--      folha, usuários e financeiro.
-- ============================================================
CREATE TABLE IF NOT EXISTS "AUDITORIA" (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  UUID NOT NULL,
  user_id    UUID,
  user_name  TEXT,
  action     TEXT NOT NULL,   -- create | update | delete | status | password | access | adjustment ...
  entity     TEXT NOT NULL,   -- product | sale | user | customer | stock | ponto | payroll | financial ...
  entity_id  TEXT,
  details    JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS auditoria_tenant_data_idx
  ON "AUDITORIA" (tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS auditoria_entity_idx
  ON "AUDITORIA" (tenant_id, entity, entity_id);

INSERT INTO "_MIGRATIONS" (version, name) VALUES ('005', 'auditoria')
ON CONFLICT (version) DO NOTHING;


-- ==========================================================
-- 006_fiscal_nfe.sql
-- ==========================================================
-- ============================================================
-- 006. FISCAL / NF-e — integração Focus NFe
--      CONFIG_FISCAL: dados do emitente + tokens da API por tenant
--      NOTAS_FISCAIS: alinhada ao fluxo Focus (ref, chave, status,
--      links de DANFE/XML, retorno bruto da API)
-- ============================================================

CREATE TABLE IF NOT EXISTS "CONFIG_FISCAL" (
  tenant_id          UUID PRIMARY KEY,
  -- Emitente
  cnpj               TEXT,
  razao_social       TEXT,
  nome_fantasia      TEXT,
  inscricao_estadual TEXT,
  inscricao_municipal TEXT,
  regime_tributario  TEXT DEFAULT 'simples',   -- simples | normal
  -- Endereço do emitente
  logradouro         TEXT,
  numero             TEXT,
  complemento        TEXT,
  bairro             TEXT,
  municipio          TEXT,
  uf                 TEXT,
  cep                TEXT,
  codigo_municipio   TEXT,                      -- código IBGE
  telefone           TEXT,
  -- Padrões fiscais (podem ser sobrescritos por produto)
  ncm_padrao         TEXT DEFAULT '39241000',   -- copos de plástico
  cfop_interno       TEXT DEFAULT '5102',
  cfop_interestadual TEXT DEFAULT '6102',
  csosn_padrao       TEXT DEFAULT '102',        -- Simples Nacional
  cst_padrao         TEXT DEFAULT '00',         -- Regime normal
  pis_cst            TEXT DEFAULT '49',
  cofins_cst         TEXT DEFAULT '49',
  natureza_operacao  TEXT DEFAULT 'Venda de mercadoria',
  -- Focus NFe
  ambiente           TEXT DEFAULT 'homologacao', -- homologacao | producao
  focus_token_homologacao TEXT,
  focus_token_producao    TEXT,
  updated_at         TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "NOTAS_FISCAIS" (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL,
  sale_id     UUID,
  created_at  TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE "NOTAS_FISCAIS"
  ADD COLUMN IF NOT EXISTS ref           TEXT,
  ADD COLUMN IF NOT EXISTS tipo          TEXT DEFAULT 'nfe',
  ADD COLUMN IF NOT EXISTS ambiente      TEXT,
  ADD COLUMN IF NOT EXISTS status        TEXT DEFAULT 'processando_autorizacao',
  ADD COLUMN IF NOT EXISTS numero        TEXT,
  ADD COLUMN IF NOT EXISTS serie         TEXT,
  ADD COLUMN IF NOT EXISTS chave         TEXT,
  ADD COLUMN IF NOT EXISTS total         NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS destinatario  TEXT,
  ADD COLUMN IF NOT EXISTS danfe_url     TEXT,
  ADD COLUMN IF NOT EXISTS xml_url       TEXT,
  ADD COLUMN IF NOT EXISTS motivo        TEXT,
  ADD COLUMN IF NOT EXISTS response      JSONB,
  ADD COLUMN IF NOT EXISTS authorized_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS cancelled_at  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS user_id       UUID;

CREATE UNIQUE INDEX IF NOT EXISTS notas_fiscais_ref_idx ON "NOTAS_FISCAIS" (ref);
CREATE INDEX IF NOT EXISTS notas_fiscais_tenant_idx ON "NOTAS_FISCAIS" (tenant_id, created_at DESC);

INSERT INTO "_MIGRATIONS" (version, name) VALUES ('006', 'fiscal_nfe')
ON CONFLICT (version) DO NOTHING;


-- ==========================================================
-- 007_venda_a_prazo.sql
-- ==========================================================
-- ============================================================
-- 007. VENDA A PRAZO — criar_venda gera contas a receber
--      Quando _payment_method = 'a_prazo', a função gera N
--      parcelas em LANCAMENTOS (type receivable, pending),
--      dentro da MESMA transação da venda.
--      Substitui a função da migração 004 (DROP do overload antigo
--      antes de recriar, para não duplicar assinaturas).
-- ============================================================

DROP FUNCTION IF EXISTS criar_venda(
  UUID, UUID, UUID, TEXT, JSONB, NUMERIC, TEXT, TEXT, DATE, TEXT, TEXT, BOOLEAN
);

CREATE OR REPLACE FUNCTION criar_venda(
  _tenant_id            UUID,
  _user_id              UUID,
  _customer_id          UUID,
  _type                 TEXT,
  _items                JSONB,
  _discount             NUMERIC DEFAULT 0,
  _payment_method       TEXT    DEFAULT NULL,
  _notes                TEXT    DEFAULT NULL,
  _delivery_date        DATE    DEFAULT NULL,
  _artwork_url          TEXT    DEFAULT NULL,
  _artwork_notes        TEXT    DEFAULT NULL,
  _allow_price_override BOOLEAN DEFAULT false,
  _installments         INT     DEFAULT 1,
  _first_due_date       DATE    DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
  v_number        BIGINT;
  v_sale          "VENDAS"%ROWTYPE;
  v_item          JSONB;
  v_tier          JSONB;
  v_product       RECORD;
  v_qty           NUMERIC;
  v_price         NUMERIC;
  v_client_price  NUMERIC;
  v_item_discount NUMERIC;
  v_subtotal      NUMERIC := 0;
  v_total         NUMERIC;
  v_n             INT;
  v_parcela       NUMERIC;
  v_due           DATE;
  i               INT;
BEGIN
  IF _items IS NULL OR jsonb_array_length(_items) = 0 THEN
    RAISE EXCEPTION 'A venda deve ter ao menos um item';
  END IF;
  _discount := GREATEST(COALESCE(_discount, 0), 0);

  PERFORM pg_advisory_xact_lock(hashtext(_tenant_id::text || ':venda'));
  SELECT COALESCE(MAX(number), 0) + 1 INTO v_number
    FROM "VENDAS" WHERE tenant_id = _tenant_id;

  DROP TABLE IF EXISTS tmp_venda_itens;
  CREATE TEMP TABLE tmp_venda_itens (
    product_id    UUID,
    quantity      NUMERIC,
    unit_price    NUMERIC,
    discount      NUMERIC,
    total         NUMERIC,
    customization JSONB,
    prev_stock    NUMERIC
  ) ON COMMIT DROP;

  FOR v_item IN SELECT * FROM jsonb_array_elements(_items) LOOP
    v_qty := COALESCE((v_item->>'quantity')::NUMERIC, 0);
    IF v_qty <= 0 THEN
      RAISE EXCEPTION 'Quantidade inválida em um dos itens';
    END IF;

    SELECT id, name, sale_price, price_tiers, is_active, current_stock
      INTO v_product
      FROM "PRODUTOS"
     WHERE id = (v_item->>'product_id')::UUID
       AND tenant_id = _tenant_id
     FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Produto não encontrado ou de outra empresa';
    END IF;
    IF v_product.is_active = false THEN
      RAISE EXCEPTION 'Produto inativo: %', v_product.name;
    END IF;

    v_price := COALESCE(v_product.sale_price, 0);
    FOR v_tier IN SELECT * FROM jsonb_array_elements(COALESCE(v_product.price_tiers, '[]'::jsonb)) LOOP
      IF v_qty >= COALESCE((v_tier->>'min_qty')::NUMERIC, 0)
         AND ((v_tier->>'max_qty') IS NULL OR v_qty <= (v_tier->>'max_qty')::NUMERIC) THEN
        v_price := COALESCE((v_tier->>'price')::NUMERIC, v_price);
      END IF;
    END LOOP;

    v_client_price := (v_item->>'unit_price')::NUMERIC;
    IF _allow_price_override AND v_client_price IS NOT NULL AND v_client_price >= 0 THEN
      v_price := v_client_price;
    ELSIF v_client_price IS NOT NULL AND v_client_price > v_price THEN
      v_price := v_client_price;
    END IF;

    v_item_discount := GREATEST(COALESCE((v_item->>'discount')::NUMERIC, 0), 0);
    IF v_item_discount > v_qty * v_price THEN
      RAISE EXCEPTION 'Desconto do item maior que o valor do item (%)', v_product.name;
    END IF;

    INSERT INTO tmp_venda_itens VALUES (
      v_product.id, v_qty, v_price, v_item_discount,
      v_qty * v_price - v_item_discount,
      CASE WHEN v_item ? 'customization' THEN v_item->'customization' ELSE NULL END,
      COALESCE(v_product.current_stock, 0)
    );
    v_subtotal := v_subtotal + (v_qty * v_price);

    UPDATE "PRODUTOS"
       SET current_stock = COALESCE(current_stock, 0) - v_qty
     WHERE id = v_product.id;
  END LOOP;

  IF _discount > v_subtotal THEN
    RAISE EXCEPTION 'Desconto maior que o subtotal da venda';
  END IF;
  v_total := v_subtotal - _discount;

  INSERT INTO "VENDAS" (
    tenant_id, number, type, customer_id, user_id, status,
    subtotal, discount, total, notes, artwork_url, artwork_notes,
    delivery_date, payment_method
  ) VALUES (
    _tenant_id, v_number, COALESCE(_type, 'sale'), _customer_id, _user_id, 'confirmed',
    v_subtotal, _discount, v_total, _notes, _artwork_url, _artwork_notes,
    _delivery_date, _payment_method
  ) RETURNING * INTO v_sale;

  INSERT INTO "VENDA_ITENS" (sale_id, product_id, quantity, unit_price, discount, total, customization)
  SELECT v_sale.id, product_id, quantity, unit_price, discount, total, customization
    FROM tmp_venda_itens;

  INSERT INTO "MOVIMENTACOES_ESTOQUE" (
    tenant_id, product_id, type, quantity,
    previous_stock, current_stock,
    reference_type, reference_id, user_id, notes
  )
  SELECT _tenant_id, t.product_id, 'exit', t.quantity,
         t.prev_stock, t.prev_stock - t.quantity,
         'sale', v_sale.id, _user_id, 'Venda #' || v_number
    FROM tmp_venda_itens t;

  -- Venda a prazo → gera contas a receber
  IF _payment_method = 'a_prazo' THEN
    IF _customer_id IS NULL THEN
      RAISE EXCEPTION 'Venda a prazo exige um cliente identificado';
    END IF;
    v_n     := GREATEST(COALESCE(_installments, 1), 1);
    v_due   := COALESCE(_first_due_date, CURRENT_DATE + 30);
    v_parcela := ROUND(v_total / v_n, 2);

    FOR i IN 1..v_n LOOP
      INSERT INTO "LANCAMENTOS" (
        tenant_id, user_id, description, type, amount, paid_amount,
        due_date, status, customer_id, document_number,
        installment, total_installments, reference_type, reference_id
      ) VALUES (
        _tenant_id, _user_id,
        'Venda #' || v_number || CASE WHEN v_n > 1 THEN ' (' || i || '/' || v_n || ')' ELSE '' END,
        'receivable',
        CASE WHEN i = v_n THEN v_total - v_parcela * (v_n - 1) ELSE v_parcela END,
        0,
        (v_due + ((i - 1) || ' month')::interval)::date,
        'pending', _customer_id, 'Venda #' || v_number,
        i, v_n, 'sale', v_sale.id
      );
    END LOOP;
  END IF;

  RETURN to_jsonb(v_sale);
END;
$$;

INSERT INTO "_MIGRATIONS" (version, name) VALUES ('007', 'venda_a_prazo')
ON CONFLICT (version) DO NOTHING;


-- ==========================================================
-- 008_feriados.sql
-- ==========================================================
-- ============================================================
-- 008. FERIADOS — calendário de feriados
--      Dias marcados aqui não contam como falta no ponto
--      (viram situação "Feriado"). Seed dos feriados nacionais
--      de 2026; estaduais/municipais podem ser adicionados na tela.
-- ============================================================
CREATE TABLE IF NOT EXISTS "FERIADOS" (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  UUID NOT NULL,
  date       DATE NOT NULL,
  name       TEXT NOT NULL,
  type       TEXT DEFAULT 'nacional',  -- nacional | estadual | municipal | facultativo
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS feriados_tenant_date_idx ON "FERIADOS" (tenant_id, date);

INSERT INTO "FERIADOS" (tenant_id, date, name, type) VALUES
  ('a1b2c3d4-e5f6-7890-abcd-ef1234567890', '2026-01-01', 'Confraternização Universal', 'nacional'),
  ('a1b2c3d4-e5f6-7890-abcd-ef1234567890', '2026-02-16', 'Carnaval',                   'nacional'),
  ('a1b2c3d4-e5f6-7890-abcd-ef1234567890', '2026-02-17', 'Carnaval',                   'nacional'),
  ('a1b2c3d4-e5f6-7890-abcd-ef1234567890', '2026-04-03', 'Sexta-feira Santa',          'nacional'),
  ('a1b2c3d4-e5f6-7890-abcd-ef1234567890', '2026-04-21', 'Tiradentes',                 'nacional'),
  ('a1b2c3d4-e5f6-7890-abcd-ef1234567890', '2026-05-01', 'Dia do Trabalho',            'nacional'),
  ('a1b2c3d4-e5f6-7890-abcd-ef1234567890', '2026-06-04', 'Corpus Christi',             'nacional'),
  ('a1b2c3d4-e5f6-7890-abcd-ef1234567890', '2026-09-07', 'Independência do Brasil',    'nacional'),
  ('a1b2c3d4-e5f6-7890-abcd-ef1234567890', '2026-10-12', 'Nossa Senhora Aparecida',    'nacional'),
  ('a1b2c3d4-e5f6-7890-abcd-ef1234567890', '2026-11-02', 'Finados',                    'nacional'),
  ('a1b2c3d4-e5f6-7890-abcd-ef1234567890', '2026-11-15', 'Proclamação da República',   'nacional'),
  ('a1b2c3d4-e5f6-7890-abcd-ef1234567890', '2026-11-20', 'Consciência Negra',          'nacional'),
  ('a1b2c3d4-e5f6-7890-abcd-ef1234567890', '2026-12-25', 'Natal',                      'nacional')
ON CONFLICT (tenant_id, date) DO NOTHING;

INSERT INTO "_MIGRATIONS" (version, name) VALUES ('008', 'feriados')
ON CONFLICT (version) DO NOTHING;


-- ==========================================================
-- 009_design_3d.sql
-- ==========================================================
-- ============================================================
-- 009. ESTÚDIO 3D — guarda a configuração do design no produto
--      personalizado (modelo, cores por parte, acabamento, logo).
-- ============================================================
ALTER TABLE "PERSONALIZACOES"
  ADD COLUMN IF NOT EXISTS design_3d   JSONB,
  ADD COLUMN IF NOT EXISTS preview_url TEXT;

INSERT INTO "_MIGRATIONS" (version, name) VALUES ('009', 'design_3d')
ON CONFLICT (version) DO NOTHING;


-- ==========================================================
-- 010_compra_transacional.sql
-- ==========================================================
-- ============================================================
-- 010. COMPRA TRANSACIONAL — função criar_compra
--      Cabeçalho, itens, entrada de estoque e custo médio
--      ponderado em UMA transação.
-- ============================================================
CREATE OR REPLACE FUNCTION criar_compra(
  _tenant_id   UUID,
  _user_id     UUID,
  _supplier_id UUID,
  _items       JSONB,
  _discount    NUMERIC DEFAULT 0,
  _notes       TEXT    DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
  v_number   BIGINT;
  v_purchase "COMPRAS"%ROWTYPE;
  v_item     JSONB;
  v_qty      NUMERIC;
  v_price    NUMERIC;
  v_subtotal NUMERIC := 0;
  v_estoque  NUMERIC;
  v_custo    NUMERIC;
  v_novo     NUMERIC;
  v_found    BOOLEAN;
BEGIN
  IF _items IS NULL OR jsonb_array_length(_items) = 0 THEN
    RAISE EXCEPTION 'A compra deve ter ao menos um item';
  END IF;
  _discount := GREATEST(COALESCE(_discount, 0), 0);

  PERFORM pg_advisory_xact_lock(hashtext(_tenant_id::text || ':compra'));
  SELECT COALESCE(MAX(number), 0) + 1 INTO v_number FROM "COMPRAS" WHERE tenant_id = _tenant_id;

  -- valida e calcula subtotal
  FOR v_item IN SELECT * FROM jsonb_array_elements(_items) LOOP
    v_qty   := COALESCE((v_item->>'quantity')::NUMERIC, 0);
    v_price := GREATEST(COALESCE((v_item->>'unit_price')::NUMERIC, 0), 0);
    IF v_qty <= 0 THEN RAISE EXCEPTION 'Quantidade inválida em um item'; END IF;
    SELECT true INTO v_found FROM "PRODUTOS"
      WHERE id = (v_item->>'product_id')::UUID AND tenant_id = _tenant_id;
    IF v_found IS NOT TRUE THEN RAISE EXCEPTION 'Produto não encontrado ou de outra empresa'; END IF;
    v_subtotal := v_subtotal + v_qty * v_price;
  END LOOP;

  INSERT INTO "COMPRAS" (tenant_id, number, supplier_id, user_id, status, subtotal, discount, total, notes)
  VALUES (_tenant_id, v_number, _supplier_id, _user_id, 'received', v_subtotal, _discount, v_subtotal - _discount, _notes)
  RETURNING * INTO v_purchase;

  FOR v_item IN SELECT * FROM jsonb_array_elements(_items) LOOP
    v_qty   := (v_item->>'quantity')::NUMERIC;
    v_price := GREATEST(COALESCE((v_item->>'unit_price')::NUMERIC, 0), 0);

    SELECT current_stock, cost_price INTO v_estoque, v_custo
      FROM "PRODUTOS" WHERE id = (v_item->>'product_id')::UUID AND tenant_id = _tenant_id FOR UPDATE;

    v_novo := v_custo;
    IF v_price > 0 THEN
      v_novo := ROUND((GREATEST(COALESCE(v_estoque,0),0) * COALESCE(v_custo,0) + v_qty * v_price)
                      / NULLIF(GREATEST(COALESCE(v_estoque,0),0) + v_qty, 0), 2);
    END IF;

    INSERT INTO "COMPRA_ITENS" (purchase_id, product_id, quantity, unit_price, total)
    VALUES (v_purchase.id, (v_item->>'product_id')::UUID, v_qty, v_price, v_qty * v_price);

    INSERT INTO "MOVIMENTACOES_ESTOQUE" (tenant_id, product_id, type, quantity, previous_stock, current_stock, reference_type, reference_id, user_id, notes)
    VALUES (_tenant_id, (v_item->>'product_id')::UUID, 'entry', v_qty, COALESCE(v_estoque,0), COALESCE(v_estoque,0) + v_qty, 'purchase', v_purchase.id, _user_id, 'Compra #' || v_number);

    UPDATE "PRODUTOS"
       SET current_stock = COALESCE(current_stock, 0) + v_qty,
           cost_price = COALESCE(v_novo, cost_price)
     WHERE id = (v_item->>'product_id')::UUID;
  END LOOP;

  RETURN to_jsonb(v_purchase);
END;
$$;

INSERT INTO "_MIGRATIONS" (version, name) VALUES ('010', 'compra_transacional')
ON CONFLICT (version) DO NOTHING;


-- ==========================================================
-- 011_rls.sql
-- ==========================================================
-- ============================================================
-- 011. RLS — Row Level Security (defesa em profundidade)
--      O backend usa a service_role key (que tem BYPASSRLS),
--      então NADA muda para a aplicação. Mas com RLS ligada e
--      sem políticas, o acesso direto via anon/authenticated key
--      (PostgREST público) fica BLOQUEADO. Se a anon key vazar,
--      os dados continuam protegidos.
-- ============================================================
DO $$
DECLARE
  t TEXT;
  tabelas TEXT[] := ARRAY[
    'CLIENTES','PRODUTOS','FORNECEDORES','USUARIOS','EMPRESAS','CATEGORIAS',
    'VENDAS','VENDA_ITENS','COMPRAS','COMPRA_ITENS','MOVIMENTACOES_ESTOQUE',
    'LANCAMENTOS','ORCAMENTOS','ORCAMENTO_ITENS','PERSONALIZACOES','PERSONALIZACAO_HISTORICO',
    'NOTAS_FISCAIS','CONFIG_FISCAL','ESCALAS','SITUACOES','RH_PONTO','RH_MARCACOES',
    'RH_FERIAS','RH_SALARIOS','RH_DOCUMENTOS','FERIADOS','AUDITORIA',
    'PLANO_CONTAS','CENTROS_CUSTO','CONTAS_BANCARIAS','VARIANTES_PRODUTO','PEDIDOS_REPOSICAO'
  ];
BEGIN
  FOREACH t IN ARRAY tabelas LOOP
    IF to_regclass('public.' || quote_ident(t)) IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    END IF;
  END LOOP;
END $$;

INSERT INTO "_MIGRATIONS" (version, name) VALUES ('011', 'rls')
ON CONFLICT (version) DO NOTHING;


-- ==========================================================
-- 012_metas.sql
-- ==========================================================
-- ============================================================
-- 012. METAS — meta de vendas mensal por tenant
-- ============================================================
CREATE TABLE IF NOT EXISTS "METAS" (
  tenant_id      UUID PRIMARY KEY,
  monthly_sales  NUMERIC(14,2) DEFAULT 0,
  updated_at     TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE "METAS" ENABLE ROW LEVEL SECURITY;

INSERT INTO "_MIGRATIONS" (version, name) VALUES ('012', 'metas')
ON CONFLICT (version) DO NOTHING;


-- ==========================================================
-- 013_folha_kind.sql
-- ==========================================================
-- ============================================================
-- 013. FOLHA — tipo de folha (mensal, 13º, férias)
--      Permite 13º e férias no mesmo mês de referência sem
--      sobrescrever o salário mensal.
-- ============================================================
ALTER TABLE "RH_SALARIOS"
  ADD COLUMN IF NOT EXISTS kind TEXT DEFAULT 'mensal';

UPDATE "RH_SALARIOS" SET kind = 'mensal' WHERE kind IS NULL;

DROP INDEX IF EXISTS rh_salarios_uniq_idx;
CREATE UNIQUE INDEX IF NOT EXISTS rh_salarios_uniq_idx
  ON "RH_SALARIOS" (tenant_id, employee_id, reference_month, kind);

INSERT INTO "_MIGRATIONS" (version, name) VALUES ('013', 'folha_kind')
ON CONFLICT (version) DO NOTHING;


-- ==========================================================
-- 014_pix.sql
-- ==========================================================
-- ============================================================
-- 014. PIX — dados da cobrança PIX nos lançamentos
-- ============================================================
ALTER TABLE "LANCAMENTOS"
  ADD COLUMN IF NOT EXISTS gateway_payment_id TEXT,
  ADD COLUMN IF NOT EXISTS pix_qr            TEXT,
  ADD COLUMN IF NOT EXISTS pix_copy_paste    TEXT;

CREATE INDEX IF NOT EXISTS lancamentos_gateway_idx ON "LANCAMENTOS" (gateway_payment_id);

INSERT INTO "_MIGRATIONS" (version, name) VALUES ('014', 'pix')
ON CONFLICT (version) DO NOTHING;


-- ==========================================================
-- 015_clientes_busca_digitos.sql
-- ==========================================================
-- ============================================================
-- 015. Busca de clientes por dígitos (telefone/CPF/CNPJ)
-- Colunas geradas só com dígitos, para buscar "4399523972"
-- mesmo que o telefone esteja salvo como "43 9952-3972".
-- ============================================================
ALTER TABLE "CLIENTES"
  ADD COLUMN IF NOT EXISTS phone_digits  TEXT GENERATED ALWAYS AS (regexp_replace(COALESCE(phone,    ''), '[^0-9]', '', 'g')) STORED,
  ADD COLUMN IF NOT EXISTS mobile_digits TEXT GENERATED ALWAYS AS (regexp_replace(COALESCE(mobile,   ''), '[^0-9]', '', 'g')) STORED,
  ADD COLUMN IF NOT EXISTS doc_digits    TEXT GENERATED ALWAYS AS (regexp_replace(COALESCE(cpf_cnpj, ''), '[^0-9]', '', 'g')) STORED;

CREATE INDEX IF NOT EXISTS clientes_phone_digits_idx  ON "CLIENTES" (phone_digits);
CREATE INDEX IF NOT EXISTS clientes_mobile_digits_idx ON "CLIENTES" (mobile_digits);
CREATE INDEX IF NOT EXISTS clientes_doc_digits_idx    ON "CLIENTES" (doc_digits);

INSERT INTO "_MIGRATIONS" (version, name) VALUES ('015', 'clientes_busca_digitos')
ON CONFLICT (version) DO NOTHING;


-- ==========================================================
-- 016_produto_qtd_minima.sql
-- ==========================================================
-- ============================================================
-- 016. Quantidade mínima de pedido por produto (usada na loja)
-- ============================================================
ALTER TABLE "PRODUTOS"
  ADD COLUMN IF NOT EXISTS min_order_qty INT DEFAULT 1;

UPDATE "PRODUTOS" SET min_order_qty = 1 WHERE min_order_qty IS NULL;

INSERT INTO "_MIGRATIONS" (version, name) VALUES ('016', 'produto_qtd_minima')
ON CONFLICT (version) DO NOTHING;


-- ==========================================================
-- 017_preco_por_impressao.sql
-- ==========================================================
-- ============================================================
-- 017. Preço por tipo de impressão (Serigrafia / Transfer / DTF)
-- Cada tipo tem sua própria tabela de preço por quantidade.
-- Formato do JSON:
--   {
--     "serigrafia": { "price": 2.89, "tiers": [{"min_qty":10,"max_qty":20,"price":6}] },
--     "transfer":   { "price": 3.50, "tiers": [...] },
--     "dtf":        { "price": 4.20, "tiers": [...] }
--   }
-- ============================================================
ALTER TABLE "PRODUTOS"
  ADD COLUMN IF NOT EXISTS print_pricing JSONB DEFAULT '{}'::jsonb;

INSERT INTO "_MIGRATIONS" (version, name) VALUES ('017', 'preco_por_impressao')
ON CONFLICT (version) DO NOTHING;


-- ==========================================================
-- 018_marketing.sql
-- ==========================================================
-- ============================================================
-- 018. Marketing — histórico de campanhas (WhatsApp / Facebook / Instagram)
-- ============================================================
CREATE TABLE IF NOT EXISTS "CAMPANHAS_MKT" (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL,
  user_id     UUID,
  title       TEXT,
  message     TEXT,
  image_url   TEXT,
  channels    JSONB DEFAULT '[]'::jsonb,
  segment     JSONB DEFAULT '{}'::jsonb,
  results     JSONB DEFAULT '{}'::jsonb,
  status      TEXT DEFAULT 'sent',
  created_at  TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS campanhas_mkt_tenant_idx ON "CAMPANHAS_MKT" (tenant_id, created_at DESC);

INSERT INTO "_MIGRATIONS" (version, name) VALUES ('018', 'marketing')
ON CONFLICT (version) DO NOTHING;


-- ==========================================================
-- 019_producao.sql
-- ==========================================================
-- ============================================================
-- 019. Produção (PCP) — etapas Revelação / Produção / Embalagem
-- Campos na própria venda (pedido). production_stage:
--   aguardando_arte | aguardando_producao | revelacao | producao | embalagem | finalizado
-- ============================================================
ALTER TABLE "VENDAS"
  ADD COLUMN IF NOT EXISTS production_stage  TEXT DEFAULT 'aguardando_producao',
  ADD COLUMN IF NOT EXISTS event_date        DATE,
  ADD COLUMN IF NOT EXISTS ship_date         DATE,
  ADD COLUMN IF NOT EXISTS ship_time         TEXT,
  ADD COLUMN IF NOT EXISTS carrier           TEXT,
  ADD COLUMN IF NOT EXISTS art_file          TEXT,
  ADD COLUMN IF NOT EXISTS production_obs     TEXT,
  ADD COLUMN IF NOT EXISTS production_log    JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS revelacao_inicio  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS revelacao_fim     TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS producao_inicio   TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS producao_fim      TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS embalagem_inicio  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS embalagem_fim     TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS vendas_production_stage_idx ON "VENDAS" (tenant_id, production_stage);

INSERT INTO "_MIGRATIONS" (version, name) VALUES ('019', 'producao')
ON CONFLICT (version) DO NOTHING;


-- ==========================================================
-- 020_perdas_frete.sql
-- ==========================================================
-- ============================================================
-- 020. Perda na produção + frete no pedido
-- ============================================================
CREATE TABLE IF NOT EXISTS "PRODUCAO_PERDAS" (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    UUID NOT NULL,
  sale_id      UUID,
  product_id   UUID,
  product_name TEXT,
  quantity     NUMERIC(12,2) NOT NULL DEFAULT 0,
  user_id      UUID,
  user_name    TEXT,
  notes        TEXT,
  created_at   TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS producao_perdas_idx ON "PRODUCAO_PERDAS" (tenant_id, sale_id);

ALTER TABLE "VENDAS"
  ADD COLUMN IF NOT EXISTS freight NUMERIC(12,2) DEFAULT 0;

INSERT INTO "_MIGRATIONS" (version, name) VALUES ('020', 'perdas_frete')
ON CONFLICT (version) DO NOTHING;


-- ==========================================================
-- 021_loja_grupo_min.sql
-- ==========================================================
-- ============================================================
-- 021. Loja: agrupar copos por modelo + pedido mínimo 10
-- store_group = modelo (card na loja) · store_color = cor (opção dentro do card)
-- Auto-deriva do nome "MODELO - COR ...": antes/depois do primeiro " - ".
-- ============================================================
ALTER TABLE "PRODUTOS"
  ADD COLUMN IF NOT EXISTS store_group TEXT,
  ADD COLUMN IF NOT EXISTS store_color TEXT;

UPDATE "PRODUTOS"
   SET store_group = NULLIF(TRIM(split_part(name, ' - ', 1)), ''),
       store_color = NULLIF(TRIM(SUBSTRING(name FROM POSITION(' - ' IN name) + 3)), '')
 WHERE (store_group IS NULL OR store_group = '')
   AND name LIKE '% - %';

-- Pedido mínimo passa a ser 10 (era 1)
ALTER TABLE "PRODUTOS" ALTER COLUMN min_order_qty SET DEFAULT 10;
UPDATE "PRODUTOS" SET min_order_qty = 10 WHERE min_order_qty IS NULL OR min_order_qty <= 1;

INSERT INTO "_MIGRATIONS" (version, name) VALUES ('021', 'loja_grupo_min')
ON CONFLICT (version) DO NOTHING;


-- ==========================================================
-- 022_fk_produtos_ondelete.sql
-- ==========================================================
-- ============================================================
-- 022. ON DELETE nas FKs que apontam para PRODUTOS
-- Permite apagar produtos: movimentações/variantes somem junto (CASCADE);
-- itens de venda/orçamento mantêm o histórico, só perdem o vínculo (SET NULL).
-- ============================================================

-- 1) remove TODAS as FKs que referenciam PRODUTOS(id)
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT tc.table_name, tc.constraint_name
      FROM information_schema.table_constraints tc
      JOIN information_schema.constraint_column_usage ccu
        ON tc.constraint_name = ccu.constraint_name AND tc.table_schema = ccu.table_schema
     WHERE tc.constraint_type = 'FOREIGN KEY'
       AND ccu.table_name = 'PRODUTOS' AND ccu.column_name = 'id'
  LOOP
    EXECUTE format('ALTER TABLE %I DROP CONSTRAINT %I', r.table_name, r.constraint_name);
  END LOOP;
END $$;

-- 2) recria com o comportamento certo
ALTER TABLE IF EXISTS "MOVIMENTACOES_ESTOQUE"
  ADD CONSTRAINT "MOVIMENTACOES_ESTOQUE_product_id_fkey"
  FOREIGN KEY (product_id) REFERENCES "PRODUTOS"(id) ON DELETE CASCADE;

ALTER TABLE IF EXISTS "VARIANTES_PRODUTO"
  ADD CONSTRAINT "VARIANTES_PRODUTO_product_id_fkey"
  FOREIGN KEY (product_id) REFERENCES "PRODUTOS"(id) ON DELETE CASCADE;

ALTER TABLE IF EXISTS "VENDA_ITENS"     ALTER COLUMN product_id DROP NOT NULL;
ALTER TABLE IF EXISTS "VENDA_ITENS"
  ADD CONSTRAINT "VENDA_ITENS_product_id_fkey"
  FOREIGN KEY (product_id) REFERENCES "PRODUTOS"(id) ON DELETE SET NULL;

ALTER TABLE IF EXISTS "ORCAMENTO_ITENS" ALTER COLUMN product_id DROP NOT NULL;
ALTER TABLE IF EXISTS "ORCAMENTO_ITENS"
  ADD CONSTRAINT "ORCAMENTO_ITENS_product_id_fkey"
  FOREIGN KEY (product_id) REFERENCES "PRODUTOS"(id) ON DELETE SET NULL;

INSERT INTO "_MIGRATIONS" (version, name) VALUES ('022', 'fk_produtos_ondelete')
ON CONFLICT (version) DO NOTHING;


-- ==========================================================
-- 023_nascimento_ie_fornecedor.sql
-- ==========================================================
-- ============================================================
-- 023. Data de nascimento (cliente PF) + IE no fornecedor
-- ============================================================
ALTER TABLE "CLIENTES"     ADD COLUMN IF NOT EXISTS birth_date DATE;
ALTER TABLE "FORNECEDORES" ADD COLUMN IF NOT EXISTS ie TEXT;

INSERT INTO "_MIGRATIONS" (version, name) VALUES ('023', 'nascimento_ie_fornecedor')
ON CONFLICT (version) DO NOTHING;


-- ==========================================================
-- 024_producao_datas_fotos.sql
-- ==========================================================
-- ============================================================
-- 024. Produção: prazo máximo de entrega + fotos do produto +
--      data do evento informada pelo cliente no site
-- ============================================================
ALTER TABLE "VENDAS"     ADD COLUMN IF NOT EXISTS max_delivery_date DATE;
ALTER TABLE "VENDAS"     ADD COLUMN IF NOT EXISTS production_photos JSONB DEFAULT '[]'::jsonb;

ALTER TABLE "ORCAMENTOS" ADD COLUMN IF NOT EXISTS event_date        DATE;
ALTER TABLE "ORCAMENTOS" ADD COLUMN IF NOT EXISTS max_delivery_date DATE;

INSERT INTO "_MIGRATIONS" (version, name) VALUES ('024', 'producao_datas_fotos')
ON CONFLICT (version) DO NOTHING;


-- ==========================================================
-- 025_clientes_timestamps.sql
-- ==========================================================
-- ============================================================
-- 025. Datas de criação e atualização do cadastro do cliente
-- ============================================================
ALTER TABLE "CLIENTES" ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT now();
ALTER TABLE "CLIENTES" ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();

INSERT INTO "_MIGRATIONS" (version, name) VALUES ('025', 'clientes_timestamps')
ON CONFLICT (version) DO NOTHING;


-- ==========================================================
-- 026_cliente_perfil.sql
-- ==========================================================
-- ============================================================
-- 026. Perfil do cliente na loja: foto (avatar) + histórico de
--      alterações feitas pelo próprio cliente
-- ============================================================
ALTER TABLE "CLIENTES" ADD COLUMN IF NOT EXISTS avatar_url      TEXT;
ALTER TABLE "CLIENTES" ADD COLUMN IF NOT EXISTS profile_history JSONB DEFAULT '[]'::jsonb;

INSERT INTO "_MIGRATIONS" (version, name) VALUES ('026', 'cliente_perfil')
ON CONFLICT (version) DO NOTHING;


-- ==========================================================
-- 027_produto_variations.sql
-- ==========================================================
-- ============================================================
-- 027. Variações selecionáveis do produto (cor / borda / volume)
--      Ex.: TAÇA GIN JATEADO = 1 produto com 41 cores e 18 bordas.
-- ============================================================
ALTER TABLE "PRODUTOS" ADD COLUMN IF NOT EXISTS variations JSONB DEFAULT '{}'::jsonb;

INSERT INTO "_MIGRATIONS" (version, name) VALUES ('027', 'produto_variations')
ON CONFLICT (version) DO NOTHING;


-- ==========================================================
-- 028_categorias_dedupe.sql
-- ==========================================================
-- ============================================================
-- 028. Remove categorias duplicadas e impede novas duplicatas
-- ============================================================

-- 1) Repõe os produtos para a categoria mais antiga (menor id) de cada nome
WITH dup AS (
  SELECT id, first_value(id) OVER (PARTITION BY tenant_id, upper(trim(name)) ORDER BY id) AS keep_id
  FROM "CATEGORIAS"
)
UPDATE "PRODUTOS" p
SET category_id = d.keep_id
FROM dup d
WHERE p.category_id = d.id AND d.id <> d.keep_id;

-- 2) Apaga as categorias duplicadas
WITH dup AS (
  SELECT id, first_value(id) OVER (PARTITION BY tenant_id, upper(trim(name)) ORDER BY id) AS keep_id
  FROM "CATEGORIAS"
)
DELETE FROM "CATEGORIAS" c
USING dup d
WHERE c.id = d.id AND d.id <> d.keep_id;

-- 3) Impede duplicar categorias com o mesmo nome (por empresa)
CREATE UNIQUE INDEX IF NOT EXISTS categorias_tenant_name_uq
  ON "CATEGORIAS" (tenant_id, upper(trim(name)));

INSERT INTO "_MIGRATIONS" (version, name) VALUES ('028', 'categorias_dedupe')
ON CONFLICT (version) DO NOTHING;


-- ==========================================================
-- 029_venda_source.sql
-- ==========================================================
-- ============================================================
-- 029. Origem da venda (manual x site) para os Pedidos de Venda
-- ============================================================
ALTER TABLE "VENDAS" ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'manual';

INSERT INTO "_MIGRATIONS" (version, name) VALUES ('029', 'venda_source')
ON CONFLICT (version) DO NOTHING;


-- ==========================================================
-- 030_venda_operation_date.sql
-- ==========================================================
-- ============================================================
-- 030. Data da operação (data escolhida ao registrar a venda)
-- ============================================================
ALTER TABLE "VENDAS" ADD COLUMN IF NOT EXISTS operation_date DATE;

INSERT INTO "_MIGRATIONS" (version, name) VALUES ('030', 'venda_operation_date')
ON CONFLICT (version) DO NOTHING;


-- ==========================================================
-- 031_venda_status_check.sql
-- ==========================================================
-- ============================================================
-- 031. Atualiza o CHECK de status da VENDA para os 9 status novos
--      (mantém os antigos por compatibilidade com vendas existentes)
-- ============================================================
ALTER TABLE "VENDAS" DROP CONSTRAINT IF EXISTS "VENDAS_status_check";

ALTER TABLE "VENDAS" ADD CONSTRAINT "VENDAS_status_check" CHECK (status IN (
  -- novos (pedido de venda)
  'iniciando_pedido', 'aguardando_financeiro', 'aguardando_estoque', 'aguardando_arte',
  'aguardando_vegetal', 'aguardando_revelacao', 'aguardando_coleta', 'em_transito', 'entregue',
  -- antigos (compatibilidade)
  'open', 'confirmed', 'in_production', 'ready', 'delivered', 'cancelled', 'completed'
));

INSERT INTO "_MIGRATIONS" (version, name) VALUES ('031', 'venda_status_check')
ON CONFLICT (version) DO NOTHING;


-- ==========================================================
-- 032_produto_imagens.sql
-- ==========================================================
-- ============================================================
-- 032. Foto do produto + foto por cor (loja troca ao selecionar)
-- ============================================================
ALTER TABLE "PRODUTOS" ADD COLUMN IF NOT EXISTS image_url        TEXT;
ALTER TABLE "PRODUTOS" ADD COLUMN IF NOT EXISTS variation_images JSONB DEFAULT '{}'::jsonb;

INSERT INTO "_MIGRATIONS" (version, name) VALUES ('032', 'produto_imagens')
ON CONFLICT (version) DO NOTHING;


-- ==========================================================
-- 033_empresas_settings.sql
-- ==========================================================
-- 033: garante a coluna settings (JSONB) na tabela EMPRESAS
-- Usada para configurações do site, incluindo o "modo manutenção" dos cadastros.
ALTER TABLE "EMPRESAS" ADD COLUMN IF NOT EXISTS settings jsonb NOT NULL DEFAULT '{}'::jsonb;


-- ==========================================================
-- 034_vendas_order_key.sql
-- ==========================================================
-- 034: chave aleatória (até 5 dígitos) do pedido de venda
ALTER TABLE "VENDAS" ADD COLUMN IF NOT EXISTS order_key text;


-- ==========================================================
-- 035_vendas_pintura.sql
-- ==========================================================
-- 035: etapa de Pintura na produção (timestamps de início/fim)
ALTER TABLE "VENDAS" ADD COLUMN IF NOT EXISTS pintura_inicio timestamptz;
ALTER TABLE "VENDAS" ADD COLUMN IF NOT EXISTS pintura_fim    timestamptz;


-- ==========================================================
-- 036_serigrafia.sql
-- ==========================================================
-- 036: serigrafia — perdas de matriz e durabilidade de quadros (telas)
CREATE TABLE IF NOT EXISTS "PERDAS_MATRIZ" (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  sale_id uuid,
  quadro text,
  motivo text,
  obs text,
  area_cm2 numeric,
  emulsao_g numeric default 0,
  sensib_g numeric default 0,
  removedor_ml numeric default 0,
  custo numeric default 0,
  user_id uuid,
  user_name text,
  created_at timestamptz default now()
);

CREATE TABLE IF NOT EXISTS "QUADROS" (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  numero text not null,
  gravacoes int default 0,
  recuperacoes int default 0,
  ativo boolean default true,
  obs text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
CREATE UNIQUE INDEX IF NOT EXISTS quadros_tenant_numero ON "QUADROS"(tenant_id, numero);


-- ==========================================================
-- 037_cliente_bloqueio_cupons.sql
-- ==========================================================
-- 037: bloqueio/observação de cliente + total comprado em 12 meses + cupons de desconto

-- Cliente: bloqueio (problemático/chato) + total comprado nos últimos 12 meses (para estrelas automáticas)
ALTER TABLE "CLIENTES" ADD COLUMN IF NOT EXISTS blocked boolean DEFAULT false;
ALTER TABLE "CLIENTES" ADD COLUMN IF NOT EXISTS block_reason text;
ALTER TABLE "CLIENTES" ADD COLUMN IF NOT EXISTS total_12m numeric DEFAULT 0;

-- Cupons de desconto
CREATE TABLE IF NOT EXISTS "CUPONS" (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  code text not null,
  description text,
  discount_type text not null default 'percent',  -- 'percent' | 'value'
  discount_value numeric not null default 0,
  min_total numeric default 0,                     -- pedido mínimo
  max_uses int,                                    -- null = ilimitado
  used_count int default 0,
  per_customer int,                                -- limite de uso por cliente (null = sem limite)
  customer_id uuid,                                -- null = qualquer cliente; preenchido = exclusivo de 1 cliente
  valid_from date,
  valid_until date,
  active boolean default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
CREATE UNIQUE INDEX IF NOT EXISTS cupons_tenant_code ON "CUPONS"(tenant_id, upper(code));

-- Registro de usos do cupom (para auditoria e limite por cliente)
CREATE TABLE IF NOT EXISTS "CUPONS_USOS" (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  coupon_id uuid not null,
  customer_id uuid,
  sale_id uuid,
  discount numeric default 0,
  created_at timestamptz default now()
);
CREATE INDEX IF NOT EXISTS cupons_usos_coupon ON "CUPONS_USOS"(coupon_id);


-- ==========================================================
-- 038_venda_transportadora_rastreio.sql
-- ==========================================================
-- 038: transportadora e código de rastreio no pedido de venda
ALTER TABLE "VENDAS" ADD COLUMN IF NOT EXISTS carrier_id uuid;
ALTER TABLE "VENDAS" ADD COLUMN IF NOT EXISTS tracking_code text;


-- ==========================================================
-- 039_produto_show_in_store.sql
-- ==========================================================
-- ============================================================
-- 039. Flag de visibilidade na loja (mostrar/ocultar produto no site)
-- ============================================================
ALTER TABLE "PRODUTOS" ADD COLUMN IF NOT EXISTS show_in_store BOOLEAN NOT NULL DEFAULT true;

INSERT INTO "_MIGRATIONS" (version, name) VALUES ('039', 'produto_show_in_store')
ON CONFLICT (version) DO NOTHING;


-- ==========================================================
-- 040_contas_precificacao.sql
-- ==========================================================
-- ============================================================
-- 040. CENTRAL DE CONTAS + PRECIFICAÇÃO
--      1) DESPESAS_FIXAS: despesas recorrentes (aluguel, luz,
--         internet...) que geram contas a pagar todo mês.
--      2) LANCAMENTOS ganha vínculo com a despesa fixa e o mês
--         de competência (geração idempotente: nunca duplica).
--      3) Índices para a visão mensal da Central de Contas.
-- ============================================================

CREATE TABLE IF NOT EXISTS "DESPESAS_FIXAS" (
  id               UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id        UUID NOT NULL REFERENCES "EMPRESAS"(id) ON DELETE CASCADE,
  name             VARCHAR(160) NOT NULL,
  amount           DECIMAL(15,2) NOT NULL CHECK (amount >= 0),
  due_day          SMALLINT NOT NULL DEFAULT 5 CHECK (due_day BETWEEN 1 AND 31),
  supplier_id      UUID REFERENCES "FORNECEDORES"(id),
  chart_account_id UUID,
  cost_center_id   UUID,
  notes            TEXT,
  auto_generate    BOOLEAN NOT NULL DEFAULT true,  -- gera conta do mês automaticamente
  start_month      DATE NOT NULL DEFAULT date_trunc('month', CURRENT_DATE)::date,
  end_month        DATE,                            -- NULL = sem fim
  is_active        BOOLEAN NOT NULL DEFAULT true,
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  updated_at       TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_despesas_fixas_tenant
  ON "DESPESAS_FIXAS"(tenant_id) WHERE is_active;

-- Vínculo do lançamento com a despesa fixa + mês de competência
ALTER TABLE "LANCAMENTOS" ADD COLUMN IF NOT EXISTS fixed_expense_id UUID REFERENCES "DESPESAS_FIXAS"(id) ON DELETE SET NULL;
ALTER TABLE "LANCAMENTOS" ADD COLUMN IF NOT EXISTS competence_month DATE;

-- Idempotência: 1 conta por despesa fixa por mês
CREATE UNIQUE INDEX IF NOT EXISTS uq_lancamentos_fixa_mes
  ON "LANCAMENTOS"(tenant_id, fixed_expense_id, competence_month)
  WHERE fixed_expense_id IS NOT NULL;

-- Visão mensal (Central de Contas)
CREATE INDEX IF NOT EXISTS idx_lancamentos_tenant_tipo_venc
  ON "LANCAMENTOS"(tenant_id, type, due_date);

-- RLS igual às demais tabelas (backend usa service key; anon fica bloqueado)
ALTER TABLE "DESPESAS_FIXAS" ENABLE ROW LEVEL SECURITY;

INSERT INTO "_MIGRATIONS" (version, name) VALUES ('040', 'contas_precificacao')
ON CONFLICT (version) DO NOTHING;


-- ==========================================================
-- 041_jt_express.sql
-- ==========================================================
-- ============================================================
-- 041. J&T EXPRESS — integração de envios
--      Guarda o id do pedido logístico (txlogisticId) na venda
--      para permitir cancelamento e reimpressão de etiqueta.
--      O código de rastreio (billCode) usa a coluna tracking_code
--      já criada na migração 038.
-- ============================================================

ALTER TABLE "VENDAS" ADD COLUMN IF NOT EXISTS jt_tx_id TEXT;

INSERT INTO "_MIGRATIONS" (version, name) VALUES ('041', 'jt_express')
ON CONFLICT (version) DO NOTHING;


-- ==========================================================
-- 042_precificacao.sql
-- ==========================================================
-- ============================================================
-- 042. PRECIFICAÇÃO / FORMAÇÃO DE PREÇO
--      1) PRECIFICACOES: fichas de formação de preço por produto
--         (matéria-prima, personalização, tintas, embalagem, frete,
--         rateio de custos fixos, impostos e margens).
--      2) COMPRAS ganha coluna freight (frete da compra) para o
--         rateio automático de frete na precificação.
-- ============================================================

CREATE TABLE IF NOT EXISTS "PRECIFICACOES" (
  id                 UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id          UUID NOT NULL REFERENCES "EMPRESAS"(id) ON DELETE CASCADE,
  product_id         UUID REFERENCES "PRODUTOS"(id) ON DELETE SET NULL,
  user_id            UUID REFERENCES "USUARIOS"(id),

  -- Dados do produto
  name               VARCHAR(255) NOT NULL,
  category           VARCHAR(120),
  capacity           VARCHAR(60),
  color_model        VARCHAR(120),
  print_type         VARCHAR(60)  DEFAULT 'serigrafia',
  print_colors       SMALLINT     DEFAULT 1,
  calc_quantity      INTEGER      NOT NULL DEFAULT 1000,
  calc_reference     VARCHAR(60)  DEFAULT 'producao_propria',
  description        TEXT,

  -- Blocos de custo (matéria-prima, personalização, tintas,
  -- embalagem, frete) — estrutura livre em JSON
  blocks             JSONB NOT NULL DEFAULT '{}',

  -- Impostos e margens
  tax_regime         VARCHAR(40)   DEFAULT 'simples',
  tax_pct            DECIMAL(6,2)  DEFAULT 4,
  tax_notes          TEXT,
  margin_min_pct     DECIMAL(6,2)  DEFAULT 20,
  margin_ideal_pct   DECIMAL(6,2)  DEFAULT 40,
  margin_premium_pct DECIMAL(6,2)  DEFAULT 50,

  -- Valores calculados (snapshot no salvamento, p/ relatórios)
  overhead_unit      DECIMAL(15,4) DEFAULT 0,  -- rateio custos fixos/un
  cost_direct        DECIMAL(15,4) DEFAULT 0,  -- matéria-prima/un
  cost_subtotal      DECIMAL(15,4) DEFAULT 0,  -- custos antes do imposto/un
  cost_unit          DECIMAL(15,4) DEFAULT 0,  -- custo total unitário
  price_min          DECIMAL(15,2) DEFAULT 0,
  price_ideal        DECIMAL(15,2) DEFAULT 0,
  price_premium      DECIMAL(15,2) DEFAULT 0,

  is_active          BOOLEAN NOT NULL DEFAULT true,
  created_at         TIMESTAMPTZ DEFAULT NOW(),
  updated_at         TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_precificacoes_tenant
  ON "PRECIFICACOES"(tenant_id) WHERE is_active;
CREATE INDEX IF NOT EXISTS idx_precificacoes_product
  ON "PRECIFICACOES"(product_id);

-- Frete da compra (integração Compras → Precificação)
ALTER TABLE "COMPRAS" ADD COLUMN IF NOT EXISTS freight NUMERIC(12,2) DEFAULT 0;

-- RLS igual às demais tabelas (backend usa service key; anon fica bloqueado)
ALTER TABLE "PRECIFICACOES" ENABLE ROW LEVEL SECURITY;

INSERT INTO "_MIGRATIONS" (version, name) VALUES ('042', 'precificacao')
ON CONFLICT (version) DO NOTHING;


-- ==========================================================
-- 043_contabil.sql
-- ==========================================================
-- ============================================================
-- 043. MÓDULO CONTÁBIL / FISCAL
--      1) CONTABIL_EMPRESAS: múltiplos CNPJs (empresa faturadora)
--         com regime, limite anual e alíquota — monitoramento do
--         limite do Simples e simulador de faturamento.
--      2) CONTAS_FINANCEIRAS ganham vínculo com a empresa (banco
--         de cada CNPJ) e dados bancários.
--      3) VENDAS ganham empresa faturadora e conta de destino.
-- ============================================================

CREATE TABLE IF NOT EXISTS "CONTABIL_EMPRESAS" (
  id               UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id        UUID NOT NULL REFERENCES "EMPRESAS"(id) ON DELETE CASCADE,
  razao_social     VARCHAR(255) NOT NULL,
  nome_fantasia    VARCHAR(255),
  cnpj             VARCHAR(18),
  regime           VARCHAR(30) DEFAULT 'simples'
    CHECK (regime IN ('mei', 'simples', 'presumido', 'real')),
  annual_limit     DECIMAL(15,2) DEFAULT 4800000,  -- limite anual configurável
  aliquota         DECIMAL(6,2)  DEFAULT 4,        -- alíquota efetiva (%)
  cert_expiry      DATE,                            -- vencimento do certificado digital
  is_default       BOOLEAN NOT NULL DEFAULT false,  -- empresa padrão dos pedidos
  is_active        BOOLEAN NOT NULL DEFAULT true,
  notes            TEXT,
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  updated_at       TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_contabil_empresas_tenant
  ON "CONTABIL_EMPRESAS"(tenant_id) WHERE is_active;

-- Empresa padrão criada a partir do cadastro do tenant (1x por tenant)
INSERT INTO "CONTABIL_EMPRESAS" (tenant_id, razao_social, cnpj, is_default)
SELECT e.id, e.name, e.cnpj, true
FROM "EMPRESAS" e
WHERE NOT EXISTS (SELECT 1 FROM "CONTABIL_EMPRESAS" c WHERE c.tenant_id = e.id);

-- Bancos vinculados à empresa (Nubank Lyon, Cresol Lyon...)
ALTER TABLE "CONTAS_FINANCEIRAS" ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES "CONTABIL_EMPRESAS"(id) ON DELETE SET NULL;
ALTER TABLE "CONTAS_FINANCEIRAS" ADD COLUMN IF NOT EXISTS bank_name VARCHAR(100);
ALTER TABLE "CONTAS_FINANCEIRAS" ADD COLUMN IF NOT EXISTS agency VARCHAR(20);
ALTER TABLE "CONTAS_FINANCEIRAS" ADD COLUMN IF NOT EXISTS account_number VARCHAR(30);
ALTER TABLE "CONTAS_FINANCEIRAS" ADD COLUMN IF NOT EXISTS pix_key VARCHAR(140);

-- Empresa faturadora + conta de destino no pedido
ALTER TABLE "VENDAS" ADD COLUMN IF NOT EXISTS billing_company_id UUID REFERENCES "CONTABIL_EMPRESAS"(id);
ALTER TABLE "VENDAS" ADD COLUMN IF NOT EXISTS receiving_account_id UUID REFERENCES "CONTAS_FINANCEIRAS"(id);
CREATE INDEX IF NOT EXISTS idx_vendas_billing_company ON "VENDAS"(billing_company_id);

-- RLS igual às demais tabelas (backend usa service key; anon fica bloqueado)
ALTER TABLE "CONTABIL_EMPRESAS" ENABLE ROW LEVEL SECURITY;

INSERT INTO "_MIGRATIONS" (version, name) VALUES ('043', 'contabil')
ON CONFLICT (version) DO NOTHING;


-- ==========================================================
-- 044_tipos_produto.sql
-- ==========================================================
-- ============================================================
-- 044. Tipos de produto (menu do site): COPOS, CANECAS, TAÇAS...
--      Cada produto pode ter um tipo; no site o tipo vira o menu
--      superior e as categorias (LONG DRINK TRADICIONAL etc.)
--      aparecem como subcategorias dentro dele.
-- ============================================================
CREATE TABLE IF NOT EXISTS "TIPOS_PRODUTO" (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  UUID NOT NULL,
  name       TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tipos_produto_tenant ON "TIPOS_PRODUTO"(tenant_id);

ALTER TABLE "PRODUTOS" ADD COLUMN IF NOT EXISTS tipo_id UUID REFERENCES "TIPOS_PRODUTO"(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_produtos_tipo ON "PRODUTOS"(tipo_id);

INSERT INTO "_MIGRATIONS" (version, name) VALUES ('044', 'tipos_produto')
ON CONFLICT (version) DO NOTHING;


-- ==========================================================
-- 045_lyon_prime.sql
-- ==========================================================
-- ============================================================
-- 045. Programa Lyon Prime
--      - CLIENTES: vendedor responsável, prazo de boleto e
--        selo de confiança
--      - LYON_PRIME_HISTORICO: evolução de estrelas e selo
--        (quem subiu/desceu, quando e com qual faturamento)
-- ============================================================
ALTER TABLE "CLIENTES" ADD COLUMN IF NOT EXISTS vendedor TEXT;
ALTER TABLE "CLIENTES" ADD COLUMN IF NOT EXISTS boleto_days INTEGER;
ALTER TABLE "CLIENTES" ADD COLUMN IF NOT EXISTS selo_confianca BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS "LYON_PRIME_HISTORICO" (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL,
  customer_id UUID NOT NULL,
  event       TEXT NOT NULL,            -- 'stars' | 'selo'
  stars_from  INTEGER,
  stars_to    INTEGER,
  selo        BOOLEAN,
  total_12m   NUMERIC,
  note        TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_prime_hist_tenant_cliente
  ON "LYON_PRIME_HISTORICO"(tenant_id, customer_id, created_at DESC);

INSERT INTO "_MIGRATIONS" (version, name) VALUES ('045', 'lyon_prime')
ON CONFLICT (version) DO NOTHING;


-- ==========================================================
-- 046_esocial.sql
-- ==========================================================
-- ============================================================
-- 046. eSocial — modelo de dados
--
--      O RH já calcula folha, ponto e férias para uso interno, mas os
--      dados que o GOVERNO exige não existiam no banco. Esta migração
--      cria essa base:
--
--      CONFIG_ESOCIAL          dados do empregador (S-1000) + gateway
--      RH_ESOCIAL_TRABALHADOR  dados do trabalhador exigidos no S-2200
--      RH_RUBRICAS             tabela de rubricas (S-1010)
--      RH_SALARIOS_ITENS       folha detalhada por rubrica (S-1200)
--      ESOCIAL_EVENTOS         fila de eventos (protocolo → recibo)
--
--      Nada aqui altera o RH existente: RH_SALARIOS continua sendo a
--      folha calculada, e RH_SALARIOS_ITENS a detalha por rubrica.
-- ============================================================

-- ============================================================
-- 1. CONFIG_ESOCIAL — empregador + credenciais do gateway
--    Um registro por tenant, mesmo padrão do CONFIG_FISCAL (006).
--    O certificado A1 NÃO fica aqui: quem guarda e assina é o gateway.
-- ============================================================
CREATE TABLE IF NOT EXISTS "CONFIG_ESOCIAL" (
  tenant_id            UUID PRIMARY KEY,

  -- Gateway (quem assina o XML e transmite ao governo)
  provider             TEXT DEFAULT 'tecnospeed',    -- tecnospeed | resocial | l2maker | custom
  provider_base_url    TEXT,                          -- sobrescreve a base padrão do provider
  ambiente             TEXT DEFAULT 'restrita',       -- restrita (produção restrita) | producao
  provider_token_restrita TEXT,
  provider_token_producao TEXT,
  provider_empregador_id  TEXT,                       -- id da empresa no painel do gateway

  -- Identificação do empregador (S-1000 / ideEmpregador)
  tp_insc              SMALLINT DEFAULT 1,            -- 1=CNPJ, 2=CPF
  nr_insc              TEXT,                          -- CNPJ (8 dígitos = raiz, ou 14)
  razao_social         TEXT,

  -- infoCadastro (S-1000)
  classif_trib         TEXT,                          -- classificação tributária (ex.: '03' Simples)
  nat_jur              TEXT,                          -- natureza jurídica (ex.: '2062')
  ind_coop             SMALLINT DEFAULT 0,            -- 0=não cooperativa
  ind_constr           SMALLINT DEFAULT 0,            -- 0=não é construtora
  ind_desf             SMALLINT DEFAULT 0,            -- desoneração da folha
  ind_opc_cp           SMALLINT,                      -- opção pelo cálculo da contrib. previdenciária
  ind_porte            SMALLINT,                      -- 1=ME
  ind_opt_reg_eletron  SMALLINT DEFAULT 0,            -- registro eletrônico de empregados
  ind_ent_ed           SMALLINT DEFAULT 0,            -- entidade educativa
  ind_ett              SMALLINT DEFAULT 0,            -- empresa de trabalho temporário
  nr_reg_ett           TEXT,

  -- Contato do empregador (S-1000 / contato)
  nm_ctt               TEXT,
  cpf_ctt              TEXT,
  fone_ctt             TEXT,
  email_ctt            TEXT,

  -- Alíquotas (S-1020 / infoEstab)
  cnae_preponderante   TEXT,
  aliq_rat             NUMERIC(5,2),                  -- 1, 2 ou 3
  fap                  NUMERIC(5,4),                  -- fator acidentário (0.5000 a 2.0000)

  -- Controle de faseamento: o eSocial só aceita eventos periódicos
  -- depois que a tabela de empregador/estabelecimento está aceita.
  ini_valid            TEXT,                          -- AAAA-MM de início da obrigatoriedade
  updated_at           TIMESTAMPTZ DEFAULT now()
);

-- Reexecução segura: alinha colunas caso a tabela já exista.
ALTER TABLE "CONFIG_ESOCIAL"
  ADD COLUMN IF NOT EXISTS provider             TEXT DEFAULT 'tecnospeed',
  ADD COLUMN IF NOT EXISTS provider_base_url    TEXT,
  ADD COLUMN IF NOT EXISTS ambiente             TEXT DEFAULT 'restrita',
  ADD COLUMN IF NOT EXISTS provider_token_restrita TEXT,
  ADD COLUMN IF NOT EXISTS provider_token_producao TEXT,
  ADD COLUMN IF NOT EXISTS provider_empregador_id  TEXT,
  ADD COLUMN IF NOT EXISTS tp_insc              SMALLINT DEFAULT 1,
  ADD COLUMN IF NOT EXISTS nr_insc              TEXT,
  ADD COLUMN IF NOT EXISTS razao_social         TEXT,
  ADD COLUMN IF NOT EXISTS classif_trib         TEXT,
  ADD COLUMN IF NOT EXISTS nat_jur              TEXT,
  ADD COLUMN IF NOT EXISTS ind_coop             SMALLINT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS ind_constr           SMALLINT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS ind_desf             SMALLINT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS ind_opc_cp           SMALLINT,
  ADD COLUMN IF NOT EXISTS ind_porte            SMALLINT,
  ADD COLUMN IF NOT EXISTS ind_opt_reg_eletron  SMALLINT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS ind_ent_ed           SMALLINT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS ind_ett              SMALLINT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS nr_reg_ett           TEXT,
  ADD COLUMN IF NOT EXISTS nm_ctt               TEXT,
  ADD COLUMN IF NOT EXISTS cpf_ctt              TEXT,
  ADD COLUMN IF NOT EXISTS fone_ctt             TEXT,
  ADD COLUMN IF NOT EXISTS email_ctt            TEXT,
  ADD COLUMN IF NOT EXISTS cnae_preponderante   TEXT,
  ADD COLUMN IF NOT EXISTS aliq_rat             NUMERIC(5,2),
  ADD COLUMN IF NOT EXISTS fap                  NUMERIC(5,4),
  ADD COLUMN IF NOT EXISTS ini_valid            TEXT,
  ADD COLUMN IF NOT EXISTS updated_at           TIMESTAMPTZ DEFAULT now();

-- ============================================================
-- 2. RH_ESOCIAL_TRABALHADOR — dados exigidos no S-2200
--    Tabela dedicada em vez de colunas em CLIENTES: o colaborador
--    vive em CLIENTES (com admission_data solto), e o eSocial exige
--    campos estruturados e validados. Manter separado evita poluir
--    o cadastro de clientes e deixa a origem dos dados explícita.
-- ============================================================
CREATE TABLE IF NOT EXISTS "RH_ESOCIAL_TRABALHADOR" (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           UUID NOT NULL,
  employee_id         UUID NOT NULL REFERENCES "CLIENTES"(id) ON DELETE CASCADE,

  -- Identificação (ideTrabalhador)
  cpf                 TEXT NOT NULL,
  nis                 TEXT,                    -- PIS/PASEP/NIT
  matricula           TEXT,                    -- matrícula no empregador

  -- Dados pessoais (nascimento)
  nome                TEXT NOT NULL,
  nome_social         TEXT,
  data_nascimento     DATE,
  sexo                TEXT,                    -- M | F
  raca_cor            SMALLINT,                -- 1..6 conforme tabela 12
  estado_civil        SMALLINT,                -- 1..5
  grau_instrucao      TEXT,                    -- tabela 13
  nome_mae            TEXT,
  nome_pai            TEXT,

  -- Nascimento / nacionalidade
  pais_nascimento     TEXT DEFAULT '105',      -- código país (105 = Brasil)
  pais_nacionalidade  TEXT DEFAULT '105',
  uf_nascimento       TEXT,
  municipio_nascimento TEXT,                   -- código IBGE

  -- Vínculo (infoRegimeTrab / infoContrato)
  categoria           SMALLINT,                -- ex.: 101 = empregado geral
  cbo                 TEXT,                    -- código CBO da função
  data_admissao       DATE,
  tp_admissao         SMALLINT DEFAULT 1,      -- 1 = admissão
  ind_admissao        SMALLINT DEFAULT 1,      -- 1 = normal
  tp_reg_trab         SMALLINT DEFAULT 1,      -- 1 = CLT
  tp_reg_prev         SMALLINT DEFAULT 1,      -- 1 = RGPS
  nat_atividade       SMALLINT DEFAULT 1,      -- 1 = urbano, 2 = rural
  tp_contr            SMALLINT DEFAULT 1,      -- 1 = prazo indeterminado
  dt_term             DATE,                    -- se prazo determinado
  clau_assec          SMALLINT,

  -- Remuneração e jornada
  salario_base        NUMERIC(12,2),
  und_sal_fixo        SMALLINT DEFAULT 5,      -- 5 = mensal
  dsc_sal_var         TEXT,
  tp_jornada          SMALLINT,
  dsc_jorn_trab       TEXT,
  qtd_hrs_sem         NUMERIC(5,2),
  escala_id           UUID,                    -- espelha ESCALAS quando houver

  -- Local de trabalho (localTrabGeral)
  local_tp_insc       SMALLINT DEFAULT 1,
  local_nr_insc       TEXT,

  -- Documentos (documentos / CTPS, RG, CNH)
  ctps_numero         TEXT,
  ctps_serie          TEXT,
  ctps_uf             TEXT,
  rg_numero           TEXT,
  rg_orgao_emissor    TEXT,
  rg_data_expedicao   DATE,
  cnh_numero          TEXT,
  cnh_categoria       TEXT,
  cnh_validade        DATE,

  -- Estruturas variáveis ficam em JSONB (o leiaute permite N ocorrências)
  endereco            JSONB DEFAULT '{}'::jsonb,
  dependentes         JSONB DEFAULT '[]'::jsonb,

  -- Situação no eSocial
  situacao            TEXT DEFAULT 'pendente', -- pendente | enviado | ativo | desligado
  data_desligamento   DATE,
  mtv_desligamento    TEXT,                    -- tabela 19
  created_at          TIMESTAMPTZ DEFAULT now(),
  updated_at          TIMESTAMPTZ DEFAULT now()
);

-- Um cadastro eSocial por colaborador; CPF único por tenant.
CREATE UNIQUE INDEX IF NOT EXISTS esocial_trab_employee_idx
  ON "RH_ESOCIAL_TRABALHADOR" (tenant_id, employee_id);
CREATE UNIQUE INDEX IF NOT EXISTS esocial_trab_cpf_idx
  ON "RH_ESOCIAL_TRABALHADOR" (tenant_id, cpf);
CREATE INDEX IF NOT EXISTS esocial_trab_situacao_idx
  ON "RH_ESOCIAL_TRABALHADOR" (tenant_id, situacao);

-- ============================================================
-- 3. RH_RUBRICAS — tabela de rubricas (S-1010)
--    O S-1200 não transmite "salário bruto": transmite rubricas.
--    Cada verba (salário, hora extra, INSS, IRRF...) precisa existir
--    aqui com seus códigos de incidência antes de aparecer na folha.
-- ============================================================
CREATE TABLE IF NOT EXISTS "RH_RUBRICAS" (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           UUID NOT NULL,
  cod_rubrica         TEXT NOT NULL,
  ide_tabela_rubrica  TEXT NOT NULL DEFAULT '1',
  ini_valid           TEXT NOT NULL,           -- AAAA-MM
  fim_valid           TEXT,
  dsc_rubrica         TEXT NOT NULL,
  nat_rubrica         SMALLINT,                -- tabela 3 (natureza)
  tp_rubrica          SMALLINT NOT NULL,       -- 1=provento 2=desconto 3=informativa 4=inform. dedutora
  cod_inc_cp          TEXT,                    -- incidência previdenciária
  cod_inc_irrf        TEXT,
  cod_inc_fgts        TEXT,
  cod_inc_sind        TEXT,
  teto_remun          SMALLINT DEFAULT 0,
  observacao          TEXT,
  is_system           BOOLEAN DEFAULT false,   -- criada pelo seed, não editável
  is_active           BOOLEAN DEFAULT true,
  created_at          TIMESTAMPTZ DEFAULT now(),
  updated_at          TIMESTAMPTZ DEFAULT now()
);

-- A chave real do eSocial é (código + tabela + início de validade).
CREATE UNIQUE INDEX IF NOT EXISTS rh_rubricas_uniq_idx
  ON "RH_RUBRICAS" (tenant_id, cod_rubrica, ide_tabela_rubrica, ini_valid);

-- ============================================================
-- 4. RH_SALARIOS_ITENS — folha detalhada por rubrica (S-1200)
--    Liga a folha já calculada (RH_SALARIOS) às rubricas.
-- ============================================================
CREATE TABLE IF NOT EXISTS "RH_SALARIOS_ITENS" (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           UUID NOT NULL,
  payroll_id          UUID NOT NULL REFERENCES "RH_SALARIOS"(id) ON DELETE CASCADE,
  rubrica_id          UUID REFERENCES "RH_RUBRICAS"(id) ON DELETE SET NULL,
  cod_rubrica         TEXT NOT NULL,
  ide_tabela_rubrica  TEXT DEFAULT '1',
  qtd_rubrica         NUMERIC(12,2),
  fator_rubrica       NUMERIC(12,2),
  vr_unit             NUMERIC(12,2),
  vr_rubrica          NUMERIC(12,2) NOT NULL,
  ind_apur_ir         SMALLINT DEFAULT 0,      -- 0 = mensal, 1 = RRA
  ordem               INT DEFAULT 0,
  created_at          TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS rh_sal_itens_payroll_idx
  ON "RH_SALARIOS_ITENS" (tenant_id, payroll_id, ordem);

-- ============================================================
-- 5. ESOCIAL_EVENTOS — fila de transmissão
--    O eSocial é assíncrono: envia lote → recebe protocolo → consulta
--    → recebe recibo (ou rejeição). Esta tabela é a máquina de estado.
-- ============================================================
CREATE TABLE IF NOT EXISTS "ESOCIAL_EVENTOS" (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           UUID NOT NULL,

  tipo                TEXT NOT NULL,           -- S-1000, S-1005, S-1010, S-2200, S-1200, S-1210, S-2299
  ambiente            TEXT,                    -- restrita | producao (congelado no envio)

  -- A que registro do ERP este evento se refere
  ref_type            TEXT,                    -- empregador | estabelecimento | rubrica | trabalhador | folha
  ref_id              UUID,
  per_apur            TEXT,                    -- AAAA-MM (eventos periódicos)

  payload             JSONB,                   -- o que foi mandado ao gateway
  xml                 TEXT,                    -- XML assinado, quando o gateway devolve

  -- Máquina de estado
  status              TEXT NOT NULL DEFAULT 'pendente',
    -- pendente | enviando | aguardando_retorno | sucesso | rejeitado | erro | cancelado
  protocolo           TEXT,                    -- devolvido no envio do lote
  recibo              TEXT,                    -- nrRecibo quando aceito
  retorno             JSONB,                   -- resposta bruta (mensagens/erros)
  erro_msg            TEXT,                    -- primeira mensagem de erro, para a tela
  tentativas          INT DEFAULT 0,

  sent_at             TIMESTAMPTZ,
  processed_at        TIMESTAMPTZ,
  created_at          TIMESTAMPTZ DEFAULT now(),
  updated_at          TIMESTAMPTZ DEFAULT now(),
  user_id             UUID
);

CREATE INDEX IF NOT EXISTS esocial_eventos_tenant_idx
  ON "ESOCIAL_EVENTOS" (tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS esocial_eventos_status_idx
  ON "ESOCIAL_EVENTOS" (tenant_id, status);
CREATE INDEX IF NOT EXISTS esocial_eventos_ref_idx
  ON "ESOCIAL_EVENTOS" (tenant_id, ref_type, ref_id);
-- Consulta de retorno: quem está aguardando tem protocolo.
CREATE INDEX IF NOT EXISTS esocial_eventos_protocolo_idx
  ON "ESOCIAL_EVENTOS" (protocolo) WHERE protocolo IS NOT NULL;

-- ============================================================
-- 6. Seed de rubricas básicas
--    Códigos e descrições são LIVRES (cada empresa define os seus);
--    o que o governo valida são natureza e incidências. Estas cobrem
--    exatamente o que o calcFolha() já produz hoje:
--    salário, hora extra, bônus, INSS e IRRF.
--    Incidências conforme tabela 3 do leiaute; conferir com a
--    contabilidade antes de transmitir em produção.
-- ============================================================
INSERT INTO "RH_RUBRICAS"
  (tenant_id, cod_rubrica, ide_tabela_rubrica, ini_valid, dsc_rubrica,
   nat_rubrica, tp_rubrica, cod_inc_cp, cod_inc_irrf, cod_inc_fgts, is_system)
VALUES
  ('a1b2c3d4-e5f6-7890-abcd-ef1234567890', '1000', '1', '2026-01', 'Salário base',
   1000, 1, '11', '11', '11', true),
  ('a1b2c3d4-e5f6-7890-abcd-ef1234567890', '1010', '1', '2026-01', 'Horas extras',
   1005, 1, '11', '11', '11', true),
  ('a1b2c3d4-e5f6-7890-abcd-ef1234567890', '1020', '1', '2026-01', 'Bônus / gratificação',
   1301, 1, '11', '11', '11', true),
  ('a1b2c3d4-e5f6-7890-abcd-ef1234567890', '9000', '1', '2026-01', 'INSS a recolher',
   9201, 2, '31', '31', '00', true),
  ('a1b2c3d4-e5f6-7890-abcd-ef1234567890', '9010', '1', '2026-01', 'IRRF a recolher',
   9203, 2, '00', '31', '00', true)
ON CONFLICT (tenant_id, cod_rubrica, ide_tabela_rubrica, ini_valid) DO NOTHING;

INSERT INTO "_MIGRATIONS" (version, name) VALUES ('046', 'esocial')
ON CONFLICT (version) DO NOTHING;


-- ==========================================================
-- 047_lancamentos_colunas.sql
-- ==========================================================
-- ============================================================
-- 047. LANCAMENTOS: garantir colunas usadas pela Central de
--      Contas ("Gerar contas do mês"). A tabela base não tinha
--      user_id, e chart_account_id / cost_center_id dependiam
--      do APLICAR_MELHORIAS.sql ter rodado. Sem elas o insert
--      falha com "Could not find the column ... in the schema
--      cache" e o botão devolve erro 500.
--      Tudo IF NOT EXISTS: seguro rodar mesmo se já existirem.
-- ============================================================

-- Sem FK em chart/cost: PLANO_CONTAS e CENTROS_CUSTO podem não
-- existir ainda (mesmo padrão de DESPESAS_FIXAS, que também não usa FK)
ALTER TABLE "LANCAMENTOS" ADD COLUMN IF NOT EXISTS user_id UUID;
ALTER TABLE "LANCAMENTOS" ADD COLUMN IF NOT EXISTS chart_account_id UUID;
ALTER TABLE "LANCAMENTOS" ADD COLUMN IF NOT EXISTS cost_center_id UUID;

-- Reafirma as colunas da 040 (caso ela não tenha sido aplicada)
ALTER TABLE "LANCAMENTOS" ADD COLUMN IF NOT EXISTS fixed_expense_id UUID REFERENCES "DESPESAS_FIXAS"(id) ON DELETE SET NULL;
ALTER TABLE "LANCAMENTOS" ADD COLUMN IF NOT EXISTS competence_month DATE;

-- PostgREST só enxerga colunas novas depois de recarregar o cache
NOTIFY pgrst, 'reload schema';

INSERT INTO "_MIGRATIONS" (version, name) VALUES ('047', 'lancamentos_colunas')
ON CONFLICT (version) DO NOTHING;


-- ==========================================================
-- 048_despesas_fixas_colaborador.sql
-- ==========================================================
-- ============================================================
-- 048. DESPESAS_FIXAS ganha vínculo com o colaborador.
--      Ao cadastrar/editar um colaborador (RH), o salário vira
--      automaticamente uma despesa fixa na categoria
--      "Funcionários" do Rateio — sem digitar duas vezes.
--      Excluir o colaborador remove a despesa (CASCADE).
-- ============================================================

ALTER TABLE "DESPESAS_FIXAS" ADD COLUMN IF NOT EXISTS employee_id UUID REFERENCES "CLIENTES"(id) ON DELETE CASCADE;

-- 1 despesa de salário por colaborador
CREATE UNIQUE INDEX IF NOT EXISTS uq_despesas_fixas_employee
  ON "DESPESAS_FIXAS"(tenant_id, employee_id)
  WHERE employee_id IS NOT NULL;

-- PostgREST só enxerga colunas novas depois de recarregar o cache
NOTIFY pgrst, 'reload schema';

INSERT INTO "_MIGRATIONS" (version, name) VALUES ('048', 'despesas_fixas_colaborador')
ON CONFLICT (version) DO NOTHING;


-- ==========================================================
-- 049_despesas_fixas_layout.sql
-- ==========================================================
-- ============================================================
-- 049. DESPESAS_FIXAS: novo layout do Rateio de Custos.
--      Colunas para categoria (grupo), centro de custo,
--      periodicidade (mensal/anual) e valor original.
--      Despesa anual: amount = original/12 (rateio automático).
-- ============================================================

ALTER TABLE "DESPESAS_FIXAS" ADD COLUMN IF NOT EXISTS category VARCHAR(60);
ALTER TABLE "DESPESAS_FIXAS" ADD COLUMN IF NOT EXISTS cost_center VARCHAR(60);
ALTER TABLE "DESPESAS_FIXAS" ADD COLUMN IF NOT EXISTS periodicity VARCHAR(10) NOT NULL DEFAULT 'mensal';
ALTER TABLE "DESPESAS_FIXAS" ADD COLUMN IF NOT EXISTS original_amount DECIMAL(15,2);
ALTER TABLE "DESPESAS_FIXAS" ADD COLUMN IF NOT EXISTS due_month SMALLINT CHECK (due_month BETWEEN 1 AND 12);

-- Valor original = valor atual para as despesas já cadastradas (mensais)
UPDATE "DESPESAS_FIXAS" SET original_amount = amount WHERE original_amount IS NULL;

-- Categoriza o que já existe pelos nomes mais comuns
UPDATE "DESPESAS_FIXAS" SET category = CASE
  WHEN employee_id IS NOT NULL THEN 'RH'
  WHEN name ILIKE '%marketing%' OR name ILIKE '%instagram%' OR name ILIKE '%anúncio%' THEN 'Marketing'
  WHEN name ILIKE '%sistema%' OR name ILIKE '%erp%' OR name ILIKE '%host%' OR name ILIKE '%google%' OR name ILIKE '%software%' OR name ILIKE '%internet%' THEN 'Tecnologia'
  WHEN name ILIKE '%frete%' OR name ILIKE '%transporte%' OR name ILIKE '%combust%' THEN 'Logística'
  WHEN name ILIKE '%banco%' OR name ILIKE '%tarifa%' OR name ILIKE '%juros%' THEN 'Financeiro'
  WHEN name ILIKE '%colaborador%' OR name ILIKE '%funcionário%' OR name ILIKE '%pró-labore%' OR name ILIKE '%salário%' THEN 'RH'
  ELSE 'Administrativa'
END
WHERE category IS NULL;

-- PostgREST só enxerga colunas novas depois de recarregar o cache
NOTIFY pgrst, 'reload schema';

INSERT INTO "_MIGRATIONS" (version, name) VALUES ('049', 'despesas_fixas_layout')
ON CONFLICT (version) DO NOTHING;


-- ==========================================================
-- 050_insumos.sql
-- ==========================================================
-- ============================================================
-- 050. ENGENHARIA DE CUSTOS — INSUMOS
--      Catálogo central de materiais (tintas, solventes, emulsão,
--      telas, vegetal, embalagem...). Cada insumo tem custo por
--      unidade base (valor ÷ volume da embalagem) e o método de
--      rateio no produto: por CONSUMO (ml/g por peça) ou por
--      VIDA ÚTIL (nº de impressões/usos que o item aguenta).
-- ============================================================

CREATE TABLE IF NOT EXISTS "INSUMOS" (
  id            UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id     UUID NOT NULL REFERENCES "EMPRESAS"(id) ON DELETE CASCADE,

  category      VARCHAR(80)  NOT NULL,           -- Tintas, Solventes, Emulsão, Telas...
  name          VARCHAR(160) NOT NULL,           -- Acrisolv Azul
  supplier_id   UUID REFERENCES "FORNECEDORES"(id) ON DELETE SET NULL,
  supplier_name VARCHAR(160),                    -- fallback quando não é fornecedor cadastrado

  base_unit     VARCHAR(12)  NOT NULL DEFAULT 'ml', -- ml, l, g, kg, m, m2, un, folha
  package_qty   NUMERIC(15,4) NOT NULL CHECK (package_qty > 0), -- volume da embalagem (ex: 900)
  package_price NUMERIC(15,2) NOT NULL CHECK (package_price >= 0), -- valor pago (ex: 180)

  -- Como o custo entra no produto
  cost_method   VARCHAR(12)  NOT NULL DEFAULT 'consumo', -- 'consumo' | 'vida_util'
  consumption   NUMERIC(15,6) DEFAULT 0,          -- consumo médio por peça (na base_unit)
  lifespan      NUMERIC(15,2) DEFAULT 0,          -- nº de impressões/usos (método vida_util)

  notes         TEXT,
  is_active     BOOLEAN NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_insumos_tenant   ON "INSUMOS"(tenant_id) WHERE is_active;
CREATE INDEX IF NOT EXISTS idx_insumos_category ON "INSUMOS"(tenant_id, category);

ALTER TABLE "INSUMOS" ENABLE ROW LEVEL SECURITY;

-- PostgREST só enxerga a tabela nova depois de recarregar o cache
NOTIFY pgrst, 'reload schema';

INSERT INTO "_MIGRATIONS" (version, name) VALUES ('050', 'insumos')
ON CONFLICT (version) DO NOTHING;


-- ==========================================================
-- 051_despesas_origem.sql
-- ==========================================================
-- ============================================================
-- 051. DESPESAS_FIXAS: origem do lançamento.
--      De onde a despesa veio: digitada à mão, gerada pelo RH
--      (salário), pelo Financeiro ou por um contrato recorrente.
--      Serve para auditar o que é automático e o que é manual.
-- ============================================================

ALTER TABLE "DESPESAS_FIXAS"
  ADD COLUMN IF NOT EXISTS origin VARCHAR(20) NOT NULL DEFAULT 'manual';

-- Salários já sincronizados do RH passam a ficar marcados como tal
UPDATE "DESPESAS_FIXAS"
   SET origin = 'rh'
 WHERE employee_id IS NOT NULL AND origin = 'manual';

CREATE INDEX IF NOT EXISTS idx_despesas_fixas_origin
  ON "DESPESAS_FIXAS"(tenant_id, origin);

-- PostgREST só enxerga a coluna nova depois de recarregar o cache
NOTIFY pgrst, 'reload schema';

INSERT INTO "_MIGRATIONS" (version, name) VALUES ('051', 'despesas_origem')
ON CONFLICT (version) DO NOTHING;


-- ==========================================================
-- 052_fiscal_aliquota.sql
-- ==========================================================
-- ============================================================
-- 052. CONFIG_FISCAL: alíquota efetiva sobre a venda.
--      O imposto passa a ser definido no módulo FISCAL e flui
--      automaticamente para a Formação de Preço e o Rateio —
--      em vez de ficar duplicado na precificação.
-- ============================================================

ALTER TABLE "CONFIG_FISCAL"
  ADD COLUMN IF NOT EXISTS aliquota_venda NUMERIC(6,2);

COMMENT ON COLUMN "CONFIG_FISCAL".aliquota_venda IS
  'Alíquota efetiva sobre a venda em % (ex.: Simples 6.00). Alimenta a formação de preço.';

-- PostgREST só enxerga a coluna nova depois de recarregar o cache
NOTIFY pgrst, 'reload schema';

INSERT INTO "_MIGRATIONS" (version, name) VALUES ('052', 'fiscal_aliquota')
ON CONFLICT (version) DO NOTHING;


-- ==========================================================
-- 053_insumos_completo.sql
-- ==========================================================
-- ============================================================
-- 053. INSUMOS — fechamento do módulo
--      · vínculo com PRODUTOS (compras/estoque já rodam nessa
--        tabela; assim o insumo herda saldo e última compra sem
--        criar uma segunda fonte de verdade)
--      · estoque mínimo e origem do custo
--      · múltiplos fornecedores por insumo
--      · histórico de preço (auditoria da variação de custo)
-- ============================================================

ALTER TABLE "INSUMOS"
  ADD COLUMN IF NOT EXISTS product_id  UUID REFERENCES "PRODUTOS"(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS min_stock   NUMERIC(15,4) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cost_source VARCHAR(20)   NOT NULL DEFAULT 'manual'; -- manual | compra | nfe

CREATE INDEX IF NOT EXISTS idx_insumos_product ON "INSUMOS"(product_id);

-- ── Fornecedores do insumo (o marcado como padrão define o custo) ──
CREATE TABLE IF NOT EXISTS "INSUMO_FORNECEDORES" (
  id             UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id      UUID NOT NULL REFERENCES "EMPRESAS"(id) ON DELETE CASCADE,
  insumo_id      UUID NOT NULL REFERENCES "INSUMOS"(id) ON DELETE CASCADE,
  supplier_id    UUID REFERENCES "FORNECEDORES"(id) ON DELETE SET NULL,
  supplier_name  VARCHAR(160),
  package_qty    NUMERIC(15,4) NOT NULL CHECK (package_qty > 0),
  package_price  NUMERIC(15,2) NOT NULL CHECK (package_price >= 0),
  lead_time_days SMALLINT,
  is_default     BOOLEAN NOT NULL DEFAULT false,
  notes          TEXT,
  created_at     TIMESTAMPTZ DEFAULT NOW(),
  updated_at     TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_insumo_forn ON "INSUMO_FORNECEDORES"(tenant_id, insumo_id);

-- ── Histórico de preço ────────────────────────────────────
CREATE TABLE IF NOT EXISTS "INSUMO_PRECOS" (
  id            UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id     UUID NOT NULL REFERENCES "EMPRESAS"(id) ON DELETE CASCADE,
  insumo_id     UUID NOT NULL REFERENCES "INSUMOS"(id) ON DELETE CASCADE,
  supplier_id   UUID REFERENCES "FORNECEDORES"(id) ON DELETE SET NULL,
  supplier_name VARCHAR(160),
  package_qty   NUMERIC(15,4) NOT NULL,
  package_price NUMERIC(15,2) NOT NULL,
  unit_cost     NUMERIC(15,6) NOT NULL,
  source        VARCHAR(20) NOT NULL DEFAULT 'manual', -- manual | compra | nfe
  reference     VARCHAR(80),                           -- nº da compra/NF
  user_name     VARCHAR(160),
  created_at    TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_insumo_precos ON "INSUMO_PRECOS"(tenant_id, insumo_id, created_at DESC);

ALTER TABLE "INSUMO_FORNECEDORES" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "INSUMO_PRECOS"       ENABLE ROW LEVEL SECURITY;

-- Preço atual de cada insumo vira o primeiro ponto do histórico
INSERT INTO "INSUMO_PRECOS" (tenant_id, insumo_id, package_qty, package_price, unit_cost, source, user_name)
SELECT i.tenant_id, i.id, i.package_qty, i.package_price,
       CASE WHEN i.package_qty > 0 THEN i.package_price / i.package_qty ELSE 0 END,
       'manual', 'carga inicial'
  FROM "INSUMOS" i
 WHERE NOT EXISTS (SELECT 1 FROM "INSUMO_PRECOS" p WHERE p.insumo_id = i.id);

-- PostgREST só enxerga o que é novo depois de recarregar o cache
NOTIFY pgrst, 'reload schema';

INSERT INTO "_MIGRATIONS" (version, name) VALUES ('053', 'insumos_completo')
ON CONFLICT (version) DO NOTHING;


-- ==========================================================
-- 054_transportadora_documentos.sql
-- ==========================================================
-- 054_transportadora_documentos.sql
-- Documentos obrigatorios da transportadora (Contrato Comercial assinado e
-- Tabela de Precos vigente) + identificacao de quem anexou. Estrutura do jsonb:
-- {
--   "attachments": [
--     { "id", "kind": "contrato" | "tabela", "name", "url", "path",
--       "type", "size", "uploaded_at",
--       "uploaded_by": { "name", "cpf", "cargo" } }
--   ],
--   "responsible": { "name", "cpf", "cargo", "at" }
-- }
ALTER TABLE "TRANSPORTADORAS"
  ADD COLUMN IF NOT EXISTS documents jsonb NOT NULL DEFAULT '{}'::jsonb;


-- ==========================================================
-- 055_fornecedor_documentos.sql
-- ==========================================================
-- 055_fornecedor_documentos.sql
-- Documento do fornecedor (Contrato Comercial assinado) + identificacao de quem
-- anexou. Mesma estrutura da transportadora (migration 054), com um unico kind.
-- Estrutura do jsonb:
-- {
--   "attachments": [
--     { "id", "kind": "contrato", "name", "url", "path",
--       "type", "size", "uploaded_at",
--       "uploaded_by": { "name", "cpf", "cargo" } }
--   ],
--   "responsible": { "name", "cpf", "cargo", "at" }
-- }
ALTER TABLE "FORNECEDORES"
  ADD COLUMN IF NOT EXISTS documents jsonb NOT NULL DEFAULT '{}'::jsonb;


-- ==========================================================
-- 056_vendas_metalizacao.sql
-- ==========================================================
-- ============================================================
-- 056. Etapa de Metalização na produção (timestamps de início/fim)
--      (renumerada de 047 → 056 para resolver colisão com
--       047_lancamentos_colunas.sql)
--
--      Fluxo: Revelação → Pintura → METALIZAÇÃO → Produção → Embalagem
--
--      A etapa é OPCIONAL: só os pedidos com borda metalizada passam
--      por ela. Por isso a Produção aceita vir tanto da Pintura quanto
--      da Metalização (regra no front, em canDo).
-- ============================================================
ALTER TABLE "VENDAS" ADD COLUMN IF NOT EXISTS metalizacao_inicio timestamptz;
ALTER TABLE "VENDAS" ADD COLUMN IF NOT EXISTS metalizacao_fim    timestamptz;

INSERT INTO "_MIGRATIONS" (version, name) VALUES ('056', 'vendas_metalizacao')
ON CONFLICT (version) DO NOTHING;


-- ==========================================================
-- 057_precificacao_tabela.sql
-- ==========================================================
-- ============================================================
-- 057. Tabela de Precificação (produto → ficha compartilhada)
--
--      O preço de venda sai do cadastro do produto e passa a ser
--      CALCULADO pela ficha de Formação de Preço (PRECIFICACOES), que
--      vira uma "tabela mestre" compartilhada por vários produtos.
--
--      Fluxo na loja:
--        produto → pricing_sheet_id → ficha
--               → avalia o custo na quantidade pedida
--               → + custo da impressão escolhida (blocks.print_costs)
--               → ÷ (1 − margem)  = preço
--
--      As faixas de quantidade (blocks.tiers) e os custos de impressão
--      (blocks.print_costs) ficam no JSONB `blocks` da ficha — sem
--      tabela nova. Mudar a serigrafia 1 vez recalcula todos os
--      produtos ligados.
-- ============================================================

-- Vínculo do produto com a ficha/tabela. ON DELETE SET NULL: apagar a
-- ficha não apaga o produto — ele só volta ao preço antigo (fallback).
ALTER TABLE "PRODUTOS"
  ADD COLUMN IF NOT EXISTS pricing_sheet_id UUID
    REFERENCES "PRECIFICACOES"(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_produtos_pricing_sheet
  ON "PRODUTOS"(pricing_sheet_id) WHERE pricing_sheet_id IS NOT NULL;

-- Marca uma ficha como "tabela mestre" (compartilhável e listável no
-- seletor do produto). Fichas antigas (1 por produto) seguem existindo;
-- só as marcadas aparecem como tabela de precificação.
ALTER TABLE "PRECIFICACOES"
  ADD COLUMN IF NOT EXISTS is_master BOOLEAN DEFAULT false;

INSERT INTO "_MIGRATIONS" (version, name) VALUES ('057', 'precificacao_tabela')
ON CONFLICT (version) DO NOTHING;


-- ==========================================================
-- 058_produto_base_receita.sql
-- ==========================================================
-- ============================================================
-- 058. Produto-base × produto acabado + receita (BOM de produção)
--
--      Separa o COPO CRU comprado do fornecedor (tem estoque físico)
--      do PRODUTO ACABADO produzido internamente (degradê, borda
--      metalizada, jateado, serigrafia, laser, DTF), que aparece no
--      site mas NÃO tem estoque próprio: ele consome um copo-base +
--      insumos.
--
--      Decisões (definidas com o cliente):
--       · Reserva no pedido, baixa física na produção
--         (VENDAS.insumos_baixados marca se a baixa já ocorreu).
--       · Reposição = alerta/sugestão ao atingir o ponto de pedido.
-- ============================================================

-- Tipo do produto no fluxo de estoque/produção:
--   simple       — produto comum com estoque próprio (comportamento atual)
--   base         — copo cru/liso comprado do fornecedor (estoque físico)
--   manufactured — acabado produzido internamente (SEM estoque próprio;
--                  consome base_product_id + a receita de insumos)
ALTER TABLE "PRODUTOS"
  ADD COLUMN IF NOT EXISTS product_kind    TEXT NOT NULL DEFAULT 'simple',
  ADD COLUMN IF NOT EXISTS base_product_id UUID REFERENCES "PRODUTOS"(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS reorder_qty     NUMERIC(15,4);  -- sugestão de compra ao repor (opcional)

CREATE INDEX IF NOT EXISTS idx_produtos_base ON "PRODUTOS"(base_product_id) WHERE base_product_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_produtos_kind ON "PRODUTOS"(tenant_id, product_kind);

-- ── Receita do produto acabado ────────────────────────────
-- Quais processos e insumos o acabado consome, por peça.
-- qty_per_piece NULL = usa o consumo padrão do próprio insumo
-- (INSUMOS.consumption). O copo-base NÃO entra aqui — fica em
-- PRODUTOS.base_product_id (1 base por acabado).
CREATE TABLE IF NOT EXISTS "PRODUTO_RECEITA" (
  id            UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id     UUID NOT NULL REFERENCES "EMPRESAS"(id) ON DELETE CASCADE,
  product_id    UUID NOT NULL REFERENCES "PRODUTOS"(id) ON DELETE CASCADE,   -- o acabado
  process       TEXT,               -- degrade | borda_metalizada | jateado | serigrafia | laser | dtf | ...
  insumo_id     UUID REFERENCES "INSUMOS"(id) ON DELETE CASCADE,
  qty_per_piece NUMERIC(15,6),      -- consumo por peça (override; NULL = usa INSUMOS.consumption)
  notes         TEXT,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_receita_product ON "PRODUTO_RECEITA"(tenant_id, product_id);
CREATE INDEX IF NOT EXISTS idx_receita_insumo  ON "PRODUTO_RECEITA"(tenant_id, insumo_id);

ALTER TABLE "PRODUTO_RECEITA" ENABLE ROW LEVEL SECURITY;

-- ── Reserva × baixa física ────────────────────────────────
-- Enquanto insumos_baixados = false, a venda apenas RESERVA o copo-base
-- e os insumos (somem da disponibilidade do site). A baixa FÍSICA do
-- estoque acontece na confirmação da produção, quando este vira true.
-- Reservado(item) = pedidos com insumos_baixados = false.
ALTER TABLE "VENDAS"
  ADD COLUMN IF NOT EXISTS insumos_baixados BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_vendas_insumos_baixados
  ON "VENDAS"(tenant_id, insumos_baixados) WHERE insumos_baixados = false;

-- PostgREST só enxerga as colunas/tabela novas após recarregar o cache
NOTIFY pgrst, 'reload schema';

INSERT INTO "_MIGRATIONS" (version, name) VALUES ('058', 'produto_base_receita')
ON CONFLICT (version) DO NOTHING;


-- ==========================================================
-- 059_precificacao_categoria.sql
-- ==========================================================
-- ============================================================
-- 059. Tabela de Precificação por CATEGORIA
--
--      A ficha de Formação de Preço (PRECIFICACOES) pode ser ligada a
--      uma CATEGORIA inteira. Assim edita-se o preço da categoria UMA
--      vez e vale para todos os produtos dela (edição em massa natural).
--
--      Resolução do preço de um produto na loja:
--        1) product.pricing_sheet_id  (override explícito do produto)
--        2) a ficha mestre (is_master) cuja category_id = product.category_id
--        3) fallback: preço próprio do produto (transição)
-- ============================================================

ALTER TABLE "PRECIFICACOES"
  ADD COLUMN IF NOT EXISTS category_id UUID REFERENCES "CATEGORIAS"(id) ON DELETE SET NULL;

-- Uma ficha mestre por categoria (a mais recente vence, mas evita duplicar).
CREATE INDEX IF NOT EXISTS idx_precificacoes_categoria
  ON "PRECIFICACOES"(tenant_id, category_id) WHERE category_id IS NOT NULL AND is_master;

NOTIFY pgrst, 'reload schema';

INSERT INTO "_MIGRATIONS" (version, name) VALUES ('059', 'precificacao_categoria')
ON CONFLICT (version) DO NOTHING;


-- ==========================================================
-- 060_cliente_google_contato.sql
-- ==========================================================
-- ============================================================
-- 060. Google Contatos — vínculo do cliente com o contato do Google
--
--      Guarda o resourceName do contato criado no Google Contacts do
--      dono (via People API). Assim, ao editar o cliente, o sistema
--      ATUALIZA o contato existente em vez de duplicar.
-- ============================================================
ALTER TABLE "CLIENTES"
  ADD COLUMN IF NOT EXISTS google_resource_name TEXT;

NOTIFY pgrst, 'reload schema';

INSERT INTO "_MIGRATIONS" (version, name) VALUES ('060', 'cliente_google_contato')
ON CONFLICT (version) DO NOTHING;


-- ==========================================================
-- 061_produto_tinta.sql
-- ==========================================================
-- ============================================================
-- 061. Tinta do copo (PP / PS)
--
--      Tipo de tinta usado na personalização do copo. Preenchido
--      pela Edição em massa (Produtos) e sugerido no Lançamento de
--      Produto do pedido de venda.
-- ============================================================
ALTER TABLE "PRODUTOS"
  ADD COLUMN IF NOT EXISTS ink_type TEXT;

NOTIFY pgrst, 'reload schema';

INSERT INTO "_MIGRATIONS" (version, name) VALUES ('061', 'produto_tinta')
ON CONFLICT (version) DO NOTHING;


-- ==========================================================
-- 062_cadastro_solicitacoes.sql
-- ==========================================================
-- ============================================================
-- 062. Solicitações de alteração de cadastro (links públicos)
--
--      Quem informa um CPF/CNPJ já cadastrado nos links públicos
--      (/cadastro, /cadastro-fornecedor, /cadastro-transportadora)
--      NÃO altera o registro direto: os dados propostos e os
--      documentos anexados ficam nesta fila, e um administrador
--      aprova ou rejeita dentro do sistema.
--
--      Nenhum dado do cadastro existente é devolvido ao link
--      público — o solicitante envia às cegas.
--
--      payload     = dados propostos (mesmo formato do cadastro)
--      changes     = [{ field, label, from, to }] calculado no envio
--      attachments = [{ id, kind, name, url, path, type, size,
--                       uploaded_at, uploaded_by }]
-- ============================================================
CREATE TABLE IF NOT EXISTS "CADASTRO_SOLICITACOES" (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    UUID NOT NULL,
  entity       TEXT NOT NULL CHECK (entity IN ('cliente', 'fornecedor', 'transportadora')),
  entity_id    UUID,
  doc_digits   TEXT NOT NULL,
  entity_name  TEXT,
  status       TEXT NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente', 'aprovada', 'rejeitada')),
  payload      JSONB NOT NULL DEFAULT '{}'::jsonb,
  changes      JSONB NOT NULL DEFAULT '[]'::jsonb,
  attachments  JSONB NOT NULL DEFAULT '[]'::jsonb,
  requested_by JSONB NOT NULL DEFAULT '{}'::jsonb,
  note         TEXT,
  reviewed_by      UUID,
  reviewed_by_name TEXT,
  reviewed_at      TIMESTAMPTZ,
  review_note      TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS cadastro_solicitacoes_pendentes_idx
  ON "CADASTRO_SOLICITACOES" (tenant_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS cadastro_solicitacoes_entidade_idx
  ON "CADASTRO_SOLICITACOES" (tenant_id, entity, entity_id);

-- O backend usa a service_role key (BYPASSRLS); com RLS ligada e sem
-- políticas, o acesso direto pela anon key fica bloqueado (mesma ideia da
-- migration 011).
ALTER TABLE "CADASTRO_SOLICITACOES" ENABLE ROW LEVEL SECURITY;

-- Os documentos aprovados de CLIENTE entram em admission_data.attachments
-- (formato já usado por /api/customers/:id/attachments). Fornecedor e
-- transportadora continuam em documents (migrations 054/055).

NOTIFY pgrst, 'reload schema';

INSERT INTO "_MIGRATIONS" (version, name) VALUES ('062', 'cadastro_solicitacoes')
ON CONFLICT (version) DO NOTHING;


-- ==========================================================
-- 063_pedidos_loja_pix.sql
-- ==========================================================
-- ============================================================
-- 063. Pedidos da loja com pagamento PIX (chave própria — Nubank)
--
--      O pedido feito no site NÃO vira mais uma VENDA na hora.
--      Ele fica nesta fila com status 'aguardando_pagamento' e só
--      entra no Comercial (VENDAS + VENDA_ITENS) depois que o
--      pagamento é confirmado no ERP.
--
--      Por que uma tabela própria e não uma VENDA "pendente":
--      pedido não pago não pode aparecer em Pedidos de Venda, nem
--      somar no dashboard, no DRE ou nos relatórios. Ficando fora
--      de VENDAS, nenhum desses lugares precisa de filtro novo.
--
--      customer = {name, phone, email, company} no momento do pedido
--      items    = itens já com preço calculado no servidor e preview
--                 (URL do Storage, não data URL)
--      pix_*    = copia-e-cola gerado na chave PIX do tenant
--                 (EMPRESAS.settings.pix). O dinheiro cai direto na
--                 conta; a confirmação é feita dentro do ERP.
-- ============================================================
CREATE TABLE IF NOT EXISTS "PEDIDOS_LOJA" (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         UUID NOT NULL,
  customer_id       UUID,
  customer          JSONB NOT NULL DEFAULT '{}'::jsonb,
  items             JSONB NOT NULL DEFAULT '[]'::jsonb,
  subtotal          NUMERIC(14,2) NOT NULL DEFAULT 0,
  freight           NUMERIC(14,2) NOT NULL DEFAULT 0,
  total             NUMERIC(14,2) NOT NULL DEFAULT 0,
  notes             TEXT,
  event_date        DATE,
  status            TEXT NOT NULL DEFAULT 'aguardando_pagamento'
                    CHECK (status IN ('aguardando_pagamento','pago','expirado','cancelado')),
  pix_key           TEXT,
  pix_copy_paste    TEXT,
  pix_txid          TEXT,
  receipt_url       TEXT,
  paid_notified_at  TIMESTAMPTZ,
  confirmed_at      TIMESTAMPTZ,
  confirmed_by      UUID,
  confirmed_by_name TEXT,
  canceled_reason   TEXT,
  sale_id           UUID,
  expires_at        TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS pedidos_loja_fila_idx
  ON "PEDIDOS_LOJA" (tenant_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS pedidos_loja_cliente_idx
  ON "PEDIDOS_LOJA" (tenant_id, customer_id);
CREATE INDEX IF NOT EXISTS pedidos_loja_venda_idx
  ON "PEDIDOS_LOJA" (sale_id);

-- O backend usa a service_role key (BYPASSRLS); com RLS ligada e sem
-- políticas, o acesso direto pela anon key fica bloqueado (migration 011).
ALTER TABLE "PEDIDOS_LOJA" ENABLE ROW LEVEL SECURITY;

NOTIFY pgrst, 'reload schema';

INSERT INTO "_MIGRATIONS" (version, name) VALUES ('063', 'pedidos_loja_pix')
ON CONFLICT (version) DO NOTHING;


-- ==========================================================
-- 064_promo_curtidas.sql
-- ==========================================================
-- ============================================================
-- 064. Curtidas nas promoções da loja
--
--      As promoções em si moram em EMPRESAS.settings.site.promos
--      (o lojista edita em Configurações → Site). O que não cabe
--      num JSON de configuração é a curtida: ela é do VISITANTE,
--      chega a qualquer hora e precisa ser contada sem corrida
--      entre duas pessoas salvando o mesmo settings.
--
--      Curtir não pede login — quem entra na loja curte. A
--      identidade é um id anônimo que o navegador guarda no
--      localStorage (visitor_id), e a UNIQUE abaixo é o que
--      impede a mesma pessoa de contar duas vezes. Não é à prova
--      de quem limpa o navegador de propósito, e não precisa
--      ser: é termômetro de vitrine, não votação.
--
--      promo_id é TEXT porque vem do JSON da configuração, não
--      de uma tabela — não há FK para apontar.
-- ============================================================
CREATE TABLE IF NOT EXISTS "PROMO_CURTIDAS" (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  UUID NOT NULL,
  promo_id   TEXT NOT NULL,
  visitor_id TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, promo_id, visitor_id)
);

-- contagem por promoção (a leitura mais frequente: abrir a home)
CREATE INDEX IF NOT EXISTS promo_curtidas_promo_idx
  ON "PROMO_CURTIDAS" (tenant_id, promo_id);
-- "o que ESTE visitante já curtiu", para acender os corações
CREATE INDEX IF NOT EXISTS promo_curtidas_visitante_idx
  ON "PROMO_CURTIDAS" (tenant_id, visitor_id);

-- O backend usa a service_role key (BYPASSRLS); com RLS ligada e sem
-- políticas, o acesso direto pela anon key fica bloqueado (migration 011).
ALTER TABLE "PROMO_CURTIDAS" ENABLE ROW LEVEL SECURITY;

NOTIFY pgrst, 'reload schema';

INSERT INTO "_MIGRATIONS" (version, name) VALUES ('064', 'promo_curtidas')
ON CONFLICT (version) DO NOTHING;


-- ==========================================================
-- 065_vendedor.sql
-- ==========================================================
-- ============================================================
-- 065. PAINEL DO VENDEDOR
--
--      O Dashboard do Vendedor mede UNIDADES, não reais: a meta
--      é "15.000 copos no mês", a comissão nasce do que passou
--      dela e o bônus só sai depois de 3 meses seguidos batendo.
--      Nada disso pode ficar dentro do código — o Administrativo
--      muda faixa, meta, bônus e território sem programador.
--
--      Quatro tabelas de configuração + duas de registro:
--
--      VENDEDOR_PLANOS     faixas do plano (Jan/Fev/Mar = 15.000 un
--                          e R$ 1.500 de bônus, e assim por diante).
--                          Agrupadas por plan_group para que dois
--                          vendedores possam seguir planos diferentes.
--      VENDEDORES          o cadastro comercial do usuário: território
--                          (UFs que ele atende), plano que segue e
--                          tamanho da carteira (Top 10/20/30/50).
--      PROMOCOES_VENDEDOR  as ofertas que o Administrativo libera. O
--                          vendedor escolhe entre elas — não inventa
--                          preço promocional.
--      VENDEDOR_COMISSOES  quais pedidos foram classificados como
--                          excedente elegível e quanto cada um gerou.
--      OFERTAS_VENDEDOR    o que foi disparado por WhatsApp, para quem.
-- ============================================================

-- ── Faixas do plano de metas ─────────────────────────────────
-- months guarda os meses cobertos pela faixa ({1,2,3} = Jan/Fev/Mar).
-- monthly_goal é em UNIDADES; cycle_bonus e commission_pct em R$ e %.
CREATE TABLE IF NOT EXISTS "VENDEDOR_PLANOS" (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      UUID NOT NULL,
  plan_group     TEXT NOT NULL DEFAULT 'padrao',
  name           TEXT NOT NULL,
  seq            INT  NOT NULL DEFAULT 1,
  months         INT[] NOT NULL DEFAULT '{}',
  monthly_goal   NUMERIC(14,2) NOT NULL DEFAULT 0,
  cycle_bonus    NUMERIC(14,2) NOT NULL DEFAULT 0,
  cycle_months   INT  NOT NULL DEFAULT 3,
  commission_pct NUMERIC(6,3)  NOT NULL DEFAULT 2,
  is_active      BOOLEAN NOT NULL DEFAULT true,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS vendedor_planos_tenant_idx
  ON "VENDEDOR_PLANOS" (tenant_id, plan_group, seq);

-- ── Cadastro comercial do vendedor ───────────────────────────
CREATE TABLE IF NOT EXISTS "VENDEDORES" (
  user_id      UUID PRIMARY KEY,
  tenant_id    UUID NOT NULL,
  is_active    BOOLEAN NOT NULL DEFAULT true,
  region_label TEXT,
  territory    TEXT[] NOT NULL DEFAULT '{}',
  plan_group   TEXT   NOT NULL DEFAULT 'padrao',
  top_clients  INT    NOT NULL DEFAULT 10,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS vendedores_tenant_idx ON "VENDEDORES" (tenant_id);

-- ── Promoções liberadas pelo Administrativo ──────────────────
-- Sem uma linha aqui o vendedor não tem o que ofertar: é isto que
-- impede o preço promocional de nascer no meio da conversa.
CREATE TABLE IF NOT EXISTS "PROMOCOES_VENDEDOR" (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        UUID NOT NULL,
  product_id       UUID REFERENCES "PRODUTOS"(id) ON DELETE CASCADE,
  title            TEXT,
  suggested_qty    NUMERIC(14,2),
  valid_until      DATE,
  promo_price      NUMERIC(14,4),
  discount_pct     NUMERIC(6,3),
  message_template TEXT,
  is_active        BOOLEAN NOT NULL DEFAULT true,
  created_by       UUID,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS promocoes_vendedor_tenant_idx
  ON "PROMOCOES_VENDEDOR" (tenant_id, is_active);

-- ── Pedidos classificados como excedente elegível ────────────
-- units_before é quanto o vendedor já tinha acumulado quando este
-- pedido entrou: é o que separa "pedido que ajudou a bater a meta"
-- de "pedido que veio depois dela" — e só o segundo paga comissão.
-- Um pedido que atravessa a linha entra proporcionalmente.
CREATE TABLE IF NOT EXISTS "VENDEDOR_COMISSOES" (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        UUID NOT NULL,
  user_id          UUID NOT NULL,
  sale_id          UUID NOT NULL,
  reference_month  TEXT NOT NULL,
  monthly_goal     NUMERIC(14,2) NOT NULL DEFAULT 0,
  units_before     NUMERIC(14,2) NOT NULL DEFAULT 0,
  units_total      NUMERIC(14,2) NOT NULL DEFAULT 0,
  units_eligible   NUMERIC(14,2) NOT NULL DEFAULT 0,
  amount_eligible  NUMERIC(14,2) NOT NULL DEFAULT 0,
  commission_pct   NUMERIC(6,3)  NOT NULL DEFAULT 0,
  commission_value NUMERIC(14,2) NOT NULL DEFAULT 0,
  computed_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, sale_id)
);

CREATE INDEX IF NOT EXISTS vendedor_comissoes_mes_idx
  ON "VENDEDOR_COMISSOES" (tenant_id, user_id, reference_month);

-- ── Ofertas disparadas por WhatsApp ──────────────────────────
CREATE TABLE IF NOT EXISTS "OFERTAS_VENDEDOR" (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  UUID NOT NULL,
  user_id    UUID,
  promo_id   UUID,
  product_id UUID,
  customers  JSONB NOT NULL DEFAULT '[]'::jsonb,
  message    TEXT,
  image_url  TEXT,
  results    JSONB NOT NULL DEFAULT '{}'::jsonb,
  status     TEXT NOT NULL DEFAULT 'sent',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ofertas_vendedor_idx
  ON "OFERTAS_VENDEDOR" (tenant_id, user_id, created_at DESC);

-- ── Plano padrão para quem ainda não configurou nada ─────────
-- Roda para toda empresa e só quando o grupo 'padrao' está vazio,
-- então rodar a migração de novo não duplica faixa.
INSERT INTO "VENDEDOR_PLANOS"
  (tenant_id, plan_group, name, seq, months, monthly_goal, cycle_bonus, cycle_months, commission_pct)
SELECT e.id, 'padrao', f.name, f.seq, f.months, f.goal, f.bonus, 3, 2
  FROM "EMPRESAS" e
 CROSS JOIN (VALUES
   ('Meta 1', 1, ARRAY[1,2,3],    15000, 1500),
   ('Meta 2', 2, ARRAY[4,5,6],    30000, 3000),
   ('Meta 3', 3, ARRAY[7,8,9],    45000, 4500),
   ('Meta 4', 4, ARRAY[10,11,12], 60000, 6000)
 ) AS f(name, seq, months, goal, bonus)
 WHERE NOT EXISTS (
   SELECT 1 FROM "VENDEDOR_PLANOS" p
    WHERE p.tenant_id = e.id AND p.plan_group = 'padrao'
 );

-- O backend usa a service_role key (BYPASSRLS); com RLS ligada e sem
-- políticas, o acesso pela anon key fica bloqueado (migration 011).
ALTER TABLE "VENDEDOR_PLANOS"     ENABLE ROW LEVEL SECURITY;
ALTER TABLE "VENDEDORES"          ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PROMOCOES_VENDEDOR"  ENABLE ROW LEVEL SECURITY;
ALTER TABLE "VENDEDOR_COMISSOES"  ENABLE ROW LEVEL SECURITY;
ALTER TABLE "OFERTAS_VENDEDOR"    ENABLE ROW LEVEL SECURITY;

NOTIFY pgrst, 'reload schema';

INSERT INTO "_MIGRATIONS" (version, name) VALUES ('065', 'vendedor')
ON CONFLICT (version) DO NOTHING;


-- ==========================================================
-- 066_vendedor_artes_envios.sql
-- ==========================================================
-- ============================================================
-- 066. ARTES APROVADAS + REGISTRO INDIVIDUAL DE ENVIO
--
--      Duas lacunas do painel do vendedor:
--
--      1. A arte da oferta não pode ser "qualquer arquivo do
--         computador do vendedor". Só sai o que o Administrativo
--         aprovou — daí ARTES_PROMOCIONAIS, mais o campo image_url
--         na promoção. O seletor do vendedor lê dessas duas fontes
--         (e das campanhas de Marketing já publicadas); o servidor
--         recusa qualquer URL fora dessa lista.
--
--      2. Campanha em massa não pode ser disparo cego. OFERTAS_VENDEDOR
--         guarda o cabeçalho da campanha; OFERTAS_ENVIOS guarda UMA
--         LINHA POR CLIENTE — quem, telefone, produto, texto que ele
--         de fato recebeu, hora, status e a resposta dele. É o que
--         permite responder "o que foi enviado para a Casas do Tur no
--         dia 14?" sem depender da memória de ninguém.
-- ============================================================

-- ── Arte aprovada para uso comercial ─────────────────────────
CREATE TABLE IF NOT EXISTS "ARTES_PROMOCIONAIS" (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL,
  title       TEXT,
  image_url   TEXT NOT NULL,
  product_id  UUID REFERENCES "PRODUTOS"(id) ON DELETE SET NULL,
  promo_id    UUID,
  is_active   BOOLEAN NOT NULL DEFAULT true,
  created_by  UUID,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS artes_promocionais_tenant_idx
  ON "ARTES_PROMOCIONAIS" (tenant_id, is_active);

-- A promoção pode ter a própria arte, que é a que o vendedor usa por padrão
ALTER TABLE "PROMOCOES_VENDEDOR" ADD COLUMN IF NOT EXISTS image_url TEXT;

-- ── Uma linha por destinatário ───────────────────────────────
-- message guarda o texto JÁ PERSONALIZADO (com o nome do cliente
-- dentro): é o que ele recebeu, não o modelo. Guardar o modelo
-- deixaria "o que foi combinado com este cliente" em aberto.
--
-- provider_message_id é o id da Meta: é por ele que os callbacks de
-- entregue/lido encontram a linha depois.
CREATE TABLE IF NOT EXISTS "OFERTAS_ENVIOS" (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           UUID NOT NULL,
  oferta_id           UUID REFERENCES "OFERTAS_VENDEDOR"(id) ON DELETE CASCADE,
  user_id             UUID,
  user_name           TEXT,
  customer_id         UUID,
  customer_name       TEXT,
  phone               TEXT,
  phone_digits        TEXT,
  promo_id            UUID,
  product_id          UUID,
  product_name        TEXT,
  message             TEXT,
  image_url           TEXT,
  status              TEXT NOT NULL DEFAULT 'pending',
  provider_message_id TEXT,
  error               TEXT,
  sent_at             TIMESTAMPTZ,
  delivered_at        TIMESTAMPTZ,
  read_at             TIMESTAMPTZ,
  replied_at          TIMESTAMPTZ,
  reply_text          TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ofertas_envios_campanha_idx
  ON "OFERTAS_ENVIOS" (tenant_id, oferta_id);
CREATE INDEX IF NOT EXISTS ofertas_envios_vendedor_idx
  ON "OFERTAS_ENVIOS" (tenant_id, user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS ofertas_envios_cliente_idx
  ON "OFERTAS_ENVIOS" (tenant_id, customer_id, created_at DESC);
-- O webhook da Meta chega com o número, não com o id do cliente:
-- é por este índice que a resposta encontra o envio dela.
CREATE INDEX IF NOT EXISTS ofertas_envios_telefone_idx
  ON "OFERTAS_ENVIOS" (phone_digits, created_at DESC);
CREATE INDEX IF NOT EXISTS ofertas_envios_provider_idx
  ON "OFERTAS_ENVIOS" (provider_message_id);

ALTER TABLE "ARTES_PROMOCIONAIS" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "OFERTAS_ENVIOS"     ENABLE ROW LEVEL SECURITY;

NOTIFY pgrst, 'reload schema';

INSERT INTO "_MIGRATIONS" (version, name) VALUES ('066', 'vendedor_artes_envios')
ON CONFLICT (version) DO NOTHING;


-- ==========================================================
-- 067_setores_area_vendedor.sql
-- ==========================================================
-- ============================================================
-- 067. PERMISSÃO POR SETOR + ÁREA DO VENDEDOR
--
--      Até aqui a permissão era uma lista de módulos colada em cada
--      usuário: contratar um vendedor significava lembrar quais 5
--      módulos marcar, e errar um deixava alguém vendo o custo do
--      produto. Agora o SETOR carrega o acesso, e o usuário só aponta
--      para o setor dele.
--
--      Junto vêm as três tabelas que faltavam para o vendedor
--      trabalhar sem entrar em módulo administrativo: agenda,
--      comunicação com o gerente e o alerta compartilhado entre
--      setores.
-- ============================================================

-- ── Perfil de acesso por setor ───────────────────────────────
-- layout diz QUAL ERP a pessoa vê: 'erp' é o sistema inteiro com os
-- grupos do menu; 'vendedor' é a área enxuta de cinco itens. Não é
-- decoração — é o que impede o vendedor de esbarrar em Estoque.
CREATE TABLE IF NOT EXISTS "SETORES_PERFIS" (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  UUID NOT NULL,
  key        TEXT NOT NULL,
  name       TEXT NOT NULL,
  modules    JSONB NOT NULL DEFAULT '[]'::jsonb,
  layout     TEXT NOT NULL DEFAULT 'erp',
  home_path  TEXT NOT NULL DEFAULT '/',
  sort       INT  NOT NULL DEFAULT 0,
  is_system  BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, key)
);

CREATE INDEX IF NOT EXISTS setores_perfis_tenant_idx ON "SETORES_PERFIS" (tenant_id, sort);

-- O setor do usuário. NULL mantém o comportamento antigo (allowed_modules
-- manda sozinho) — nenhum acesso muda até alguém escolher um setor.
ALTER TABLE "USUARIOS" ADD COLUMN IF NOT EXISTS sector_key TEXT;

-- ── Origem real da venda ─────────────────────────────────────
-- source já existia e diz COMO o pedido entrou (manual x site). origin
-- diz DE ONDE o cliente veio (Shopee, WhatsApp, Instagram...). São
-- perguntas diferentes: um pedido pode nascer no WhatsApp e ser
-- digitado à mão pelo vendedor.
ALTER TABLE "VENDAS" ADD COLUMN IF NOT EXISTS origin TEXT;
CREATE INDEX IF NOT EXISTS vendas_origin_idx ON "VENDAS" (tenant_id, origin);

-- ── Agenda do vendedor ───────────────────────────────────────
-- Reunião, ligação, retorno, compromisso, observação. De propósito não
-- é um CRM: sem funil, sem estágio, sem automação.
CREATE TABLE IF NOT EXISTS "AGENDA_VENDEDOR" (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL,
  user_id     UUID NOT NULL,
  kind        TEXT NOT NULL DEFAULT 'compromisso',
  title       TEXT NOT NULL,
  notes       TEXT,
  customer_id UUID REFERENCES "CLIENTES"(id) ON DELETE SET NULL,
  due_at      TIMESTAMPTZ,
  done        BOOLEAN NOT NULL DEFAULT false,
  done_at     TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS agenda_vendedor_idx
  ON "AGENDA_VENDEDOR" (tenant_id, user_id, due_at);

-- ── Comunicação vendedor ↔ gerente ───────────────────────────
-- Só esse par. O vendedor não fala direto com produção, financeiro,
-- estoque ou designer: ele relata ao gerente e o gerente encaminha.
-- É o que evita o operador da produção recebendo cobrança de três
-- vendedores ao mesmo tempo.
--
-- thread_id agrupa a conversa; sale_id amarra ao pedido quando a
-- mensagem nasceu de um alerta.
CREATE TABLE IF NOT EXISTS "MENSAGENS_INTERNAS" (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    UUID NOT NULL,
  thread_id    UUID NOT NULL DEFAULT gen_random_uuid(),
  from_user_id UUID NOT NULL,
  from_name    TEXT,
  to_user_id   UUID,
  sale_id      UUID REFERENCES "VENDAS"(id) ON DELETE SET NULL,
  subject      TEXT,
  body         TEXT NOT NULL,
  read_at      TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS mensagens_internas_thread_idx
  ON "MENSAGENS_INTERNAS" (tenant_id, thread_id, created_at);
CREATE INDEX IF NOT EXISTS mensagens_internas_caixa_idx
  ON "MENSAGENS_INTERNAS" (tenant_id, to_user_id, read_at);

-- ── Alerta compartilhado entre setores ───────────────────────
-- O nível (normal/atenção/crítico) NÃO mora aqui: ele é calculado do
-- prazo de saída contra o relógio, então guardá-lo nasceria velho.
-- O que se guarda é o que uma pessoa levantou: qual pedido, qual área
-- responsável, qual o problema — e quando foi resolvido.
--
-- A mesma linha aparece para o vendedor e para a área responsável,
-- cada um vendo o que o perfil dele permite.
CREATE TABLE IF NOT EXISTS "ALERTAS_PEDIDO" (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL,
  sale_id     UUID NOT NULL REFERENCES "VENDAS"(id) ON DELETE CASCADE,
  area        TEXT NOT NULL,
  stage       TEXT,
  reason      TEXT,
  raised_by   UUID,
  raised_name TEXT,
  resolved_at TIMESTAMPTZ,
  resolved_by UUID,
  resolution  TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS alertas_pedido_area_idx
  ON "ALERTAS_PEDIDO" (tenant_id, area, resolved_at);
CREATE INDEX IF NOT EXISTS alertas_pedido_venda_idx
  ON "ALERTAS_PEDIDO" (tenant_id, sale_id);

-- ── Setores padrão ───────────────────────────────────────────
-- Semeados para toda empresa que ainda não tem nenhum. São editáveis
-- em Configurações → Permissões por setor; is_system só marca que
-- vieram de fábrica.
INSERT INTO "SETORES_PERFIS" (tenant_id, key, name, modules, layout, home_path, sort, is_system)
SELECT e.id, s.key, s.name, s.modules::jsonb, s.layout, s.home_path, s.sort, true
  FROM "EMPRESAS" e
 CROSS JOIN (VALUES
   ('gerente',    'Gerência',    '["dashboard","products","customers","suppliers","employees","logistics","price-tables","sales","pdv","vendedor","pedidos-vendedor","catalogo","agenda","comunicacao","quotes","customizations","purchases","stock","financial","fiscal","reports","returns","quality","crm","marketing","production","hr"]', 'erp',      '/',          1),
   ('vendedor',   'Vendas',      '["vendedor","pedidos-vendedor","catalogo","agenda","comunicacao"]',                                    'vendedor', '/vendedor',  2),
   ('financeiro', 'Financeiro',  '["dashboard","financial","fiscal","reports","customers"]',                                             'erp',      '/financial', 3),
   ('estoque',    'Estoque',     '["dashboard","stock","products","purchases"]',                                                         'erp',      '/stock',     4),
   ('producao',   'Produção',    '["dashboard","production","quality","customizations"]',                                                'erp',      '/production',5),
   ('logistica',  'Logística',   '["dashboard","logistics","sales"]',                                                                    'erp',      '/logistics', 6),
   ('designer',   'Design',      '["dashboard","customizations"]',                                                                       'erp',      '/customizations', 7),
   ('qualidade',  'Qualidade',   '["dashboard","quality","production"]',                                                                 'erp',      '/quality',   8)
 ) AS s(key, name, modules, layout, home_path, sort)
 WHERE NOT EXISTS (SELECT 1 FROM "SETORES_PERFIS" p WHERE p.tenant_id = e.id);

ALTER TABLE "SETORES_PERFIS"    ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AGENDA_VENDEDOR"   ENABLE ROW LEVEL SECURITY;
ALTER TABLE "MENSAGENS_INTERNAS" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ALERTAS_PEDIDO"    ENABLE ROW LEVEL SECURITY;

NOTIFY pgrst, 'reload schema';

INSERT INTO "_MIGRATIONS" (version, name) VALUES ('067', 'setores_area_vendedor')
ON CONFLICT (version) DO NOTHING;


-- ==========================================================
-- 068_status_fluxo_completo.sql
-- ==========================================================
-- ============================================================
-- 068. FLUXO COMPLETO DE STATUS DO PEDIDO
--
--      A migração 031 abriu 9 status; o fluxo real da fábrica tem
--      etapa de vegetal, revelação, pintura, borda, gravação,
--      embalagem e conferência, cada uma com "aguardando", "em
--      processo" e "finalizada". Sem esses valores no CHECK, a
--      Produção não consegue registrar onde o pedido está, e a coluna
--      Atenção do vendedor não tem como saber quem está segurando.
--
--      Nem todo pedido percorre todas as etapas: o caminho depende do
--      produto e dos processos contratados. O CHECK só diz o que é
--      valor válido, não a ordem obrigatória.
--
--      Os status antigos continuam aceitos — pedido que já existe não
--      pode virar inválido por causa de um deploy.
-- ============================================================
ALTER TABLE "VENDAS" DROP CONSTRAINT IF EXISTS "VENDAS_status_check";

ALTER TABLE "VENDAS" ADD CONSTRAINT "VENDAS_status_check" CHECK (status IN (
  -- abertura
  'iniciando_pedido', 'aguardando_financeiro', 'aguardando_estoque',
  -- arte
  'aguardando_arte',
  -- vegetal
  'aguardando_vegetal', 'vegetal_impresso',
  -- revelação
  'aguardando_revelacao', 'revelacao_processo', 'revelacao_finalizada',
  -- pintura
  'aguardando_pintura', 'pintura_processo', 'pintura_finalizada',
  -- borda
  'aguardando_borda', 'borda_processo', 'borda_finalizada',
  -- gravação
  'aguardando_gravacao', 'gravacao_processo', 'gravacao_finalizada',
  -- produção
  'aguardando_producao', 'producao_processo', 'producao_finalizada',
  -- embalagem
  'aguardando_embalagem', 'embalando_pedido', 'embalagem_finalizada',
  -- qualidade
  'aguardando_qualidade', 'conferencia_processo', 'qualidade_finalizada',
  -- logística
  'aguardando_logistica', 'aguardando_coleta', 'coleta_processo',
  'mercadoria_coletada', 'produto_retirado', 'em_transito',
  -- fim
  'entregue', 'pedido_finalizado',
  -- antigos (compatibilidade com pedidos já gravados)
  'open', 'confirmed', 'in_production', 'ready', 'delivered', 'cancelled', 'completed'
));

-- A carteira do vendedor é sempre "meus pedidos, do mais novo para o
-- mais velho": é esse o índice que ela usa.
CREATE INDEX IF NOT EXISTS vendas_vendedor_idx
  ON "VENDAS" (tenant_id, user_id, created_at DESC);

-- E a busca por código do cliente cai neste
CREATE INDEX IF NOT EXISTS vendas_cliente_idx
  ON "VENDAS" (tenant_id, customer_id);

NOTIFY pgrst, 'reload schema';

INSERT INTO "_MIGRATIONS" (version, name) VALUES ('068', 'status_fluxo_completo')
ON CONFLICT (version) DO NOTHING;


-- ==========================================================
-- 069_origem_pedido.sql
-- ==========================================================
-- ============================================================
-- 069. ORIGEM DA VENDA — preencher o que já dá para saber
--
--      A coluna `origin` nasceu na 067 e está vazia. Ela responde "de
--      onde veio este cliente" (Shopee, WhatsApp, Site...), enquanto a
--      `source`, que já existia, responde outra coisa: "como o pedido
--      entrou" (o próprio cliente pelo site x digitado à mão).
--
--      Aqui só se preenche o que o banco JÁ SABE: pedido com
--      source='site' nasceu no site, ponto. Os pedidos manuais antigos
--      ficam NULL de propósito — ninguém registrou de onde vieram, e
--      chutar "Presencial" para todos criaria um relatório que parece
--      verdade e não é. A tela mostra "não informado" e o Administrativo
--      corrige um a um se quiser.
-- ============================================================

UPDATE "VENDAS"
   SET origin = 'Site'
 WHERE origin IS NULL
   AND source IN ('site', 'loja');

-- Mesma ideia nos orçamentos que vieram da loja, quando a coluna existir
ALTER TABLE "ORCAMENTOS" ADD COLUMN IF NOT EXISTS origin TEXT;

NOTIFY pgrst, 'reload schema';

INSERT INTO "_MIGRATIONS" (version, name) VALUES ('069', 'origem_pedido')
ON CONFLICT (version) DO NOTHING;


-- ==========================================================
-- 070_linha_do_tempo_pedido.sql
-- ==========================================================
-- ============================================================
-- 070. LINHA DO TEMPO DO PEDIDO
--
--      A tela de detalhes mostra o caminho inteiro do pedido, e o
--      caminho tem etapas de confirmação que o CHECK ainda não aceitava:
--      pagamento confirmado, estoque confirmado, arte aprovada, foto do
--      produto pronto e a espera pela entrega. Sem elas, a produção não
--      conseguia registrar "já passei por aqui" — só "estou esperando".
--
--      Cada par "Aguardando X" → "X Finalizada" existe de propósito: um
--      diz que a bola está com alguém, o outro que ela saiu de lá. É o
--      que faz a linha do tempo mostrar progresso em vez de um pedido
--      parado no mesmo balão por três dias.
--
--      Continua valendo que nem todo pedido percorre todas as etapas: o
--      caminho depende do produto e dos processos contratados.
-- ============================================================
ALTER TABLE "VENDAS" DROP CONSTRAINT IF EXISTS "VENDAS_status_check";

ALTER TABLE "VENDAS" ADD CONSTRAINT "VENDAS_status_check" CHECK (status IN (
  -- abertura e financeiro
  'iniciando_pedido', 'aguardando_financeiro', 'pagamento_confirmado',
  -- estoque
  'aguardando_estoque', 'estoque_confirmado',
  -- arte
  'aguardando_arte', 'arte_aprovada',
  -- vegetal
  'aguardando_vegetal', 'vegetal_impresso',
  -- revelação
  'aguardando_revelacao', 'revelacao_processo', 'revelacao_finalizada',
  -- pintura
  'aguardando_pintura', 'pintura_processo', 'pintura_finalizada',
  -- borda
  'aguardando_borda', 'borda_processo', 'borda_finalizada',
  -- gravação
  'aguardando_gravacao', 'gravacao_processo', 'gravacao_finalizada',
  -- produção
  'aguardando_producao', 'producao_processo', 'producao_finalizada',
  -- embalagem
  'aguardando_embalagem', 'embalando_pedido', 'embalagem_finalizada',
  -- qualidade
  'aguardando_qualidade', 'conferencia_processo', 'qualidade_finalizada',
  -- foto do produto pronto (o cliente confere antes da coleta)
  'aguardando_foto', 'foto_enviada',
  -- logística
  'aguardando_logistica', 'aguardando_coleta', 'coleta_processo',
  'mercadoria_coletada', 'produto_retirado', 'em_transito', 'aguardando_entrega',
  -- fim
  'entregue', 'pedido_finalizado',
  -- antigos (compatibilidade com pedidos já gravados)
  'open', 'confirmed', 'in_production', 'ready', 'delivered', 'cancelled', 'completed'
));

-- ── Cotação do frete ─────────────────────────────────────────
-- Hoje o número da cotação é colado dentro de `notes` como texto livre
-- ("Cotação do frete: BRSP158732"). Isso serve para ler, não para
-- procurar: quando a transportadora liga perguntando pela cotação,
-- ninguém acha o pedido por ela. Vira campo.
ALTER TABLE "VENDAS" ADD COLUMN IF NOT EXISTS freight_quote TEXT;
CREATE INDEX IF NOT EXISTS vendas_freight_quote_idx
  ON "VENDAS" (tenant_id, freight_quote);

-- ── Avisos do pedido ─────────────────────────────────────────
-- As "Informações Importantes" da tela (custo de alteração de arte,
-- política de devolução, pagamento integral). Ficam por tenant em
-- EMPRESAS.settings.pedido_avisos; a coluna abaixo é o que um pedido
-- específico acrescenta ao padrão.
ALTER TABLE "VENDAS" ADD COLUMN IF NOT EXISTS avisos JSONB DEFAULT '[]'::jsonb;

NOTIFY pgrst, 'reload schema';

INSERT INTO "_MIGRATIONS" (version, name) VALUES ('070', 'linha_do_tempo_pedido')
ON CONFLICT (version) DO NOTHING;


-- ==========================================================
-- 071_prazos_coleta.sql
-- ==========================================================
-- ============================================================
-- 071. DATA DE COLETA E PRAZO DE TRANSPORTE
--
--      O quadro "Prazos e Entrega" da tela de detalhes mostra quatro
--      datas, e duas delas não existiam:
--
--      collect_date    quando a transportadora vem buscar. Hoje isso
--                      é combinado por telefone e não fica em lugar
--                      nenhum — quando o cliente pergunta "que dia
--                      sai?", alguém tem que lembrar.
--      transport_days  o prazo em dias úteis que a transportadora deu
--                      na cotação. Guardar o número (e não só a data
--                      de entrega) é o que permite recalcular a
--                      previsão quando a coleta atrasa.
--
--      As duas são previsão, não fato consumado: o que aconteceu de
--      verdade fica na linha do tempo (mercadoria_coletada, entregue).
-- ============================================================
ALTER TABLE "VENDAS" ADD COLUMN IF NOT EXISTS collect_date   DATE;
ALTER TABLE "VENDAS" ADD COLUMN IF NOT EXISTS transport_days INT;

NOTIFY pgrst, 'reload schema';

INSERT INTO "_MIGRATIONS" (version, name) VALUES ('071', 'prazos_coleta')
ON CONFLICT (version) DO NOTHING;


-- ==========================================================
-- 072_acompanhamento_cliente.sql
-- ==========================================================
-- ============================================================
-- 072. ACOMPANHAMENTO DO PEDIDO PELO CLIENTE
--
--      Duas coisas que a tela do cliente precisa e não existiam.
--
--      1. O WhatsApp do vendedor. O "atendimento humanizado" manda a
--         dúvida para o vendedor DAQUELE pedido — não para um número
--         geral, e o cliente não escolhe atendente. Só que USUARIOS não
--         guardava telefone: ele mora na ficha de colaborador
--         (CLIENTES type='CO'), que nem todo usuário tem. Vira campo, e
--         o backfill abaixo traz o que já existe.
--
--      2. Os avisos que o cliente lê. Ficam por empresa, não no código,
--         porque mudam com a política comercial — a taxa de alteração
--         de arte não é decisão de programador.
-- ============================================================

ALTER TABLE "USUARIOS" ADD COLUMN IF NOT EXISTS phone TEXT;

-- Puxa o telefone da ficha de colaborador, casando pelo e-mail. Só
-- preenche quem está vazio: quem já tiver número no usuário manda.
UPDATE "USUARIOS" u
   SET phone = COALESCE(c.mobile, c.phone)
  FROM "CLIENTES" c
 WHERE c.email = u.email
   AND c.type = 'CO'
   AND u.phone IS NULL
   AND COALESCE(c.mobile, c.phone) IS NOT NULL;

-- ── Avisos do pedido ─────────────────────────────────────────
-- Só para quem ainda não configurou nada: reconfigurar em Configurações
-- não pode ser desfeito por um deploy.
UPDATE "EMPRESAS"
   SET settings = jsonb_set(
         COALESCE(settings, '{}'::jsonb),
         '{pedido_avisos}',
         '[
            "Pagamento somente integral.",
            "Alteração de arte após aprovação: taxa de R$ 20,00.",
            "Alteração de produto poderá gerar novo prazo de produção.",
            "O andamento seguirá conforme disponibilidade e aprovação do pedido."
          ]'::jsonb,
         true)
 WHERE settings -> 'pedido_avisos' IS NULL;

NOTIFY pgrst, 'reload schema';

INSERT INTO "_MIGRATIONS" (version, name) VALUES ('072', 'acompanhamento_cliente')
ON CONFLICT (version) DO NOTHING;


-- ==========================================================
-- 073_municipios.sql
-- ==========================================================
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


-- ==========================================================
-- 074_config_tecnica_produto.sql
-- ==========================================================
-- ============================================================
-- 074. CONFIGURAÇÃO TÉCNICA DO PRODUTO
--
--      A fonte única de "o que pode ser feito com cada copo".
--
--      O PROBLEMA QUE ISTO RESOLVE. A tela de orçamento precisa abrir
--      "De/Para" quando o acabamento é Degradê, "Cor do jateado" quando
--      é Jateado, e nada disso quando é Liso. Escrever esse "se for
--      degradê, faça isso" dentro da página significa mexer no código a
--      cada acabamento novo — e mexer em quatro páginas, porque a mesma
--      pergunta reaparece no pedido, na produção e na compra de insumo.
--
--      Aqui o acabamento CARREGA os campos que ele abre. A tela não sabe
--      o que é degradê: ela recebe uma lista de campos e desenha. Um
--      acabamento novo é uma linha no banco, não um deploy.
--
--      TRÊS CATÁLOGOS E UMA MATRIZ:
--
--        CONFIG_ACABAMENTOS  o que dá para fazer (Degradê, Jateado,
--                            Bicolor, Degradê + Borda…), e quais campos
--                            e processos cada um exige
--        CONFIG_CORES        as cores, separadas por onde se aplicam —
--                            cor de pintura não é cor de borda nem cor
--                            de personalização, e misturar as três numa
--                            lista só é o que faz o vendedor pedir
--                            borda "Azul Bebê" que não existe em borda
--        CONFIG_PROCESSOS    serigrafia 1 cor, transfer colorido, laser
--
--        PRODUTO_COMPATIBILIDADE  quem pode com quem
--
--      A matriz aceita regra por CATEGORIA ou por PRODUTO. Quase tudo é
--      da categoria ("todo Twister aceita degradê"); o produto entra só
--      para a exceção ("este aqui não"). Regra de produto vence a de
--      categoria, e `permitido = false` bloqueia — é o que permite abrir
--      para a categoria inteira e fechar um caso sem reescrever o resto.
-- ============================================================

-- ── O que dá para fazer ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS "CONFIG_ACABAMENTOS" (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    UUID NOT NULL REFERENCES "EMPRESAS"(id) ON DELETE CASCADE,
  name         TEXT NOT NULL,
  seq          INT  NOT NULL DEFAULT 100,

  -- Os processos que este acabamento OBRIGA. É daqui que a linha do
  -- tempo do pedido descobre se mostra a etapa de pintura e a de borda,
  -- em vez de adivinhar pelo nome do produto.
  requer_pintura     BOOLEAN NOT NULL DEFAULT FALSE,
  requer_borda       BOOLEAN NOT NULL DEFAULT FALSE,
  requer_jateamento  BOOLEAN NOT NULL DEFAULT FALSE,

  -- OS CAMPOS QUE ESTE ACABAMENTO ABRE. É o coração da tabela:
  --   [{ "key":"cor_base", "label":"De", "grupo":"pintura", "obrigatorio":true },
  --    { "key":"cor_topo", "label":"Para", "grupo":"pintura", "obrigatorio":true }]
  -- `grupo` diz de qual lista de cores o campo se alimenta. A tela lê
  -- isto e monta os selects sozinha.
  campos       JSONB NOT NULL DEFAULT '[]'::jsonb,

  is_active    BOOLEAN NOT NULL DEFAULT TRUE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, name)
);

-- ── As cores, separadas por onde se aplicam ─────────────────
CREATE TABLE IF NOT EXISTS "CONFIG_CORES" (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL REFERENCES "EMPRESAS"(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  -- 'produto' | 'pintura' | 'borda' | 'jateado' | 'personalizacao'
  grupo       TEXT NOT NULL,
  hex         TEXT,
  -- A tinta que esta cor consome. Sem isto o orçamento não consegue
  -- dizer quanto de insumo vai embora, que é o pedido do item 14.
  insumo_id   UUID REFERENCES "INSUMOS"(id) ON DELETE SET NULL,
  seq         INT  NOT NULL DEFAULT 100,
  is_active   BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, grupo, name)
);

-- ── Como a arte vai para o copo ─────────────────────────────
CREATE TABLE IF NOT EXISTS "CONFIG_PROCESSOS" (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL REFERENCES "EMPRESAS"(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  max_cores   INT,
  seq         INT  NOT NULL DEFAULT 100,
  is_active   BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, name)
);

-- ── Quem pode com quem ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS "PRODUTO_COMPATIBILIDADE" (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL REFERENCES "EMPRESAS"(id) ON DELETE CASCADE,

  -- Um dos dois, nunca os dois: a regra é da categoria inteira ou
  -- daquele produto. O CHECK abaixo é o que impede a linha ambígua.
  category_id UUID REFERENCES "CATEGORIAS"(id) ON DELETE CASCADE,
  product_id  UUID REFERENCES "PRODUTOS"(id)   ON DELETE CASCADE,

  -- 'acabamento' | 'cor' | 'processo' | 'acessorio'
  tipo        TEXT NOT NULL,
  ref_id      UUID NOT NULL,

  -- FALSE é a exceção que fecha o que a categoria abriu.
  permitido   BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT compat_um_alvo CHECK (
    (category_id IS NOT NULL AND product_id IS NULL) OR
    (category_id IS NULL AND product_id IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_compat_categoria ON "PRODUTO_COMPATIBILIDADE" (tenant_id, category_id, tipo);
CREATE INDEX IF NOT EXISTS idx_compat_produto   ON "PRODUTO_COMPATIBILIDADE" (tenant_id, product_id, tipo);
CREATE INDEX IF NOT EXISTS idx_cores_grupo      ON "CONFIG_CORES" (tenant_id, grupo, seq);

NOTIFY pgrst, 'reload schema';

INSERT INTO "_MIGRATIONS" (version, name) VALUES ('074', 'config_tecnica_produto')
ON CONFLICT (version) DO NOTHING;


-- ==========================================================
-- 075_documentos_pedido.sql
-- ==========================================================
-- ============================================================
-- 075. COMPROVANTE DE PAGAMENTO NO PEDIDO
--
--      O card Documentos oferece "Baixar Comprovante", e o comprovante
--      existia só em PEDIDOS_LOJA.receipt_url — ou seja, só para pedido
--      que nasceu na loja. Pedido lançado pelo vendedor, que é a maioria,
--      não tinha onde guardar o comprovante que o cliente manda no
--      WhatsApp, e o botão prometia um arquivo que não existia.
--
--      Agora a venda carrega o próprio comprovante. O da loja continua em
--      PEDIDOS_LOJA (é o registro daquele pedido de loja) e é COPIADO
--      para cá no backfill: o pedido de venda é onde todo mundo procura,
--      e obrigar a tela a saber de qual das duas tabelas ler seria a
--      mesma pergunta com duas respostas.
-- ============================================================
ALTER TABLE "VENDAS" ADD COLUMN IF NOT EXISTS receipt_url TEXT;

-- Traz o que já existe dos pedidos de loja que viraram venda.
UPDATE "VENDAS" v
   SET receipt_url = p.receipt_url
  FROM "PEDIDOS_LOJA" p
 WHERE p.sale_id = v.id
   AND p.receipt_url IS NOT NULL
   AND v.receipt_url IS NULL;

NOTIFY pgrst, 'reload schema';

INSERT INTO "_MIGRATIONS" (version, name) VALUES ('075', 'documentos_pedido')
ON CONFLICT (version) DO NOTHING;


-- ==========================================================
-- 076_catalogo.sql
-- ==========================================================
-- ============================================================
-- 076. CATÁLOGO DE PRODUTOS PERSONALIZADOS
--
--      O caminho do cliente: família → modelo → configuração → arte →
--      carrinho → orçamento → pagamento. Seis telas, UMA base de dados.
--
--      O QUE ESTA MIGRAÇÃO NÃO FAZ. Não cria um segundo cadastro de
--      produto. O catálogo LÊ o cadastro mestre (PRODUTOS, CATEGORIAS) e
--      a configuração técnica (074). Se amanhã o Administrativo fechar
--      "Degradê + Borda" para o Long Drink, o catálogo para de oferecer
--      no mesmo instante, porque é a mesma linha de PRODUTO_COMPATIBILIDADE
--      que a produção lê.
--
--      O QUE FALTAVA E ESTA MIGRAÇÃO RESOLVE:
--
--      1. A FAMÍLIA. O cliente procura "Canecas", não "CANECA SLIM
--         TRADICIONAL". As categorias do ERP são técnicas (categoria +
--         acabamento no mesmo nome); a família é a vitrine. Uma família
--         reúne várias categorias — "Canecas" tem a tradicional e a slim.
--
--      2. O NOME DE VITRINE DA CATEGORIA. "CANECA SLIM TRADICIONAL" é o
--         nome de dentro. Na tela o cliente lê "Caneca Slim", e o
--         acabamento escolhido completa o resto: "Caneca Slim Degradê
--         com Borda 400 ml". O nome comercial é MONTADO, nunca guardado
--         — guardar significaria criar 13 produtos por modelo só para
--         mudar uma palavra.
--
--      3. O GABARITO. O editor de arte precisa saber, em milímetros,
--         onde a arte pode existir. Sem isso a arte volta da gráfica
--         cortada — e o prejuízo é da Lyon, não do cliente.
--
--      4. A REGRA DE CAIXA DO LISO. "Caixa de 100, até 4 cores" é regra
--         comercial, e regra comercial muda. Fica no banco por produto ou
--         categoria, não escrita na página.
--
--      5. O BANCO DE ARTES. Ocasião (casamento, formatura) e os modelos
--         de arte de cada uma, com os campos que o cliente pode editar.
--         Comprar um pacote de artes novo não pode exigir deploy.
--
--      6. O PROJETO DE ARTE. O que o cliente montou fica salvo e amarrado
--         ao item do carrinho — e depois ao pedido, à produção e à
--         gráfica. Uma arte, um lugar.
-- ============================================================

-- ── 1. A vitrine: famílias de produto ───────────────────────
CREATE TABLE IF NOT EXISTS "CATALOGO_FAMILIAS" (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL REFERENCES "EMPRESAS"(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  -- O endereço da família na URL: /catalogo/long-drink. Estável mesmo se
  -- o nome mudar, para o link que o vendedor já mandou não morrer.
  slug        TEXT NOT NULL,
  descricao   TEXT,
  -- Nome do ícone (lucide) — o Administrativo escolhe de uma lista, e a
  -- tela desenha. Sem ícone a tela usa o padrão, nunca fica quebrada.
  icone       TEXT,
  seq         INT  NOT NULL DEFAULT 100,
  is_active   BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, slug)
);

-- Quem está em cada família. Mesmo padrão da matriz de compatibilidade
-- (074): a regra é da CATEGORIA inteira ou de um PRODUTO específico.
CREATE TABLE IF NOT EXISTS "CATALOGO_FAMILIA_ITENS" (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL REFERENCES "EMPRESAS"(id) ON DELETE CASCADE,
  familia_id  UUID NOT NULL REFERENCES "CATALOGO_FAMILIAS"(id) ON DELETE CASCADE,
  category_id UUID REFERENCES "CATEGORIAS"(id) ON DELETE CASCADE,
  product_id  UUID REFERENCES "PRODUTOS"(id)   ON DELETE CASCADE,
  seq         INT  NOT NULL DEFAULT 100,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT familia_item_um_alvo CHECK (
    (category_id IS NOT NULL AND product_id IS NULL) OR
    (category_id IS NULL AND product_id IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_familia_itens ON "CATALOGO_FAMILIA_ITENS" (tenant_id, familia_id);

-- ── 2. O nome que o cliente lê ──────────────────────────────
-- "CANECA SLIM TRADICIONAL" → "Caneca Slim". Vazio = a tela deriva do
-- nome técnico; preenchido = o Administrativo mandou.
ALTER TABLE "CATEGORIAS" ADD COLUMN IF NOT EXISTS nome_catalogo TEXT;

-- O acabamento também tem nome de vitrine: "Degradê + Borda" é como a
-- fábrica fala; "Degradê com Borda" é como o cliente lê.
ALTER TABLE "CONFIG_ACABAMENTOS" ADD COLUMN IF NOT EXISTS label_comercial TEXT;
-- Quanto este acabamento acrescenta por unidade. Sem isto todo acabamento
-- custaria igual ao liso, o que não é verdade em nenhuma fábrica.
ALTER TABLE "CONFIG_ACABAMENTOS" ADD COLUMN IF NOT EXISTS preco_adicional NUMERIC(12,4) NOT NULL DEFAULT 0;
-- Aparece no catálogo do cliente? Um acabamento pode existir para a
-- produção e não ser vendido no site.
ALTER TABLE "CONFIG_ACABAMENTOS" ADD COLUMN IF NOT EXISTS no_catalogo BOOLEAN NOT NULL DEFAULT TRUE;

-- Amarra o acabamento a uma tabela de preco que ja existe na ficha de
-- Precificacao (product.print_pricing): 'degrade', 'pintura',
-- 'borda_metalizada'. Preenchido, o preco vem da ficha; vazio, vale o
-- preco_adicional acima. Nao inventamos uma segunda tabela de preco.
ALTER TABLE "CONFIG_ACABAMENTOS" ADD COLUMN IF NOT EXISTS preco_metodo TEXT;

ALTER TABLE "CONFIG_PROCESSOS" ADD COLUMN IF NOT EXISTS preco_adicional NUMERIC(12,4) NOT NULL DEFAULT 0;
-- A química da tinta. O cliente NÃO escolhe: o material do copo escolhe.
-- 'PS' | 'PP' | ... casado com PRODUTOS.ink_type.
ALTER TABLE "CONFIG_PROCESSOS" ADD COLUMN IF NOT EXISTS linha_tinta TEXT;
ALTER TABLE "CONFIG_PROCESSOS" ADD COLUMN IF NOT EXISTS preco_metodo TEXT;

-- ── 3. O gabarito da arte ───────────────────────────────────
CREATE TABLE IF NOT EXISTS "CATALOGO_GABARITOS" (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    UUID NOT NULL REFERENCES "EMPRESAS"(id) ON DELETE CASCADE,
  category_id  UUID REFERENCES "CATEGORIAS"(id) ON DELETE CASCADE,
  product_id   UUID REFERENCES "PRODUTOS"(id)   ON DELETE CASCADE,

  altura_mm    NUMERIC(8,2) NOT NULL,
  largura_mm   NUMERIC(8,2) NOT NULL,
  -- A área segura: quanto a arte precisa recuar da borda para não sair
  -- cortada. 2 mm é o padrão da casa; cada produto pode ter o seu.
  margem_mm    NUMERIC(8,2) NOT NULL DEFAULT 2,
  -- Este produto aceita verso? Copo de parede dupla, não.
  permite_verso BOOLEAN NOT NULL DEFAULT TRUE,
  observacao   TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT gabarito_um_alvo CHECK (
    (category_id IS NOT NULL AND product_id IS NULL) OR
    (category_id IS NULL AND product_id IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_gabarito_cat  ON "CATALOGO_GABARITOS" (tenant_id, category_id);
CREATE INDEX IF NOT EXISTS idx_gabarito_prod ON "CATALOGO_GABARITOS" (tenant_id, product_id);

-- ── 4. A regra de caixa do pedido liso ──────────────────────
CREATE TABLE IF NOT EXISTS "CATALOGO_EMBALAGEM" (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id          UUID NOT NULL REFERENCES "EMPRESAS"(id) ON DELETE CASCADE,
  category_id        UUID REFERENCES "CATEGORIAS"(id) ON DELETE CASCADE,
  product_id         UUID REFERENCES "PRODUTOS"(id)   ON DELETE CASCADE,
  caixa_qtd          INT NOT NULL DEFAULT 100,
  max_cores_caixa    INT NOT NULL DEFAULT 4,
  min_caixas         INT NOT NULL DEFAULT 1,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT embalagem_um_alvo CHECK (
    (category_id IS NOT NULL AND product_id IS NULL) OR
    (category_id IS NULL AND product_id IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_embalagem_cat  ON "CATALOGO_EMBALAGEM" (tenant_id, category_id);
CREATE INDEX IF NOT EXISTS idx_embalagem_prod ON "CATALOGO_EMBALAGEM" (tenant_id, product_id);

-- ── 5. Ocasiões e o banco de artes ──────────────────────────
CREATE TABLE IF NOT EXISTS "CATALOGO_OCASIOES" (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL REFERENCES "EMPRESAS"(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  slug        TEXT NOT NULL,
  icone       TEXT,
  seq         INT  NOT NULL DEFAULT 100,
  -- Aparece nos botões da frente ou só dentro de "+ Mais opções".
  destaque    BOOLEAN NOT NULL DEFAULT FALSE,
  is_active   BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, slug)
);

CREATE TABLE IF NOT EXISTS "CATALOGO_ARTES" (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL REFERENCES "EMPRESAS"(id) ON DELETE CASCADE,
  codigo      TEXT NOT NULL,
  name        TEXT NOT NULL,
  ocasiao_id  UUID REFERENCES "CATALOGO_OCASIOES"(id) ON DELETE SET NULL,

  -- O desenho em si. SVG porque a arte tem que ir para a gráfica em
  -- vetor: um PNG do editor vira serrilha na tela de serigrafia.
  svg         TEXT,
  thumb_url   TEXT,

  -- OS CAMPOS QUE O CLIENTE PODE MEXER. Mesma ideia dos `campos` do
  -- acabamento (074): a arte carrega o que ela abre, e o editor desenha.
  --   [{ "key":"nome1", "label":"Alterar nome 1", "tipo":"texto",
  --      "padrao":"Bruna", "max":18 }, ...]
  -- Só o que está aqui é editável. O resto do vetor é intocável — é o
  -- que impede o cliente de desmontar a arte sem querer.
  elementos   JSONB NOT NULL DEFAULT '[]'::jsonb,

  -- As fontes liberadas para esta arte. Fonte que a gráfica não tem é
  -- fonte que vai virar Arial na hora de imprimir.
  fontes      JSONB NOT NULL DEFAULT '[]'::jsonb,

  -- Vale só para certas famílias? Vazio = serve para todas.
  familias    JSONB NOT NULL DEFAULT '[]'::jsonb,

  seq         INT  NOT NULL DEFAULT 100,
  is_active   BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, codigo)
);

CREATE INDEX IF NOT EXISTS idx_artes_ocasiao ON "CATALOGO_ARTES" (tenant_id, ocasiao_id, seq);

-- ── 6. O que o cliente montou ───────────────────────────────
CREATE TABLE IF NOT EXISTS "CATALOGO_PROJETOS" (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    UUID NOT NULL REFERENCES "EMPRESAS"(id) ON DELETE CASCADE,

  -- Quem montou. O visitante ainda não é cliente quando desenha — só
  -- vira no pagamento. Por isso o dono é a sessão, e o customer_id entra
  -- depois, quando existir.
  visitor_id   TEXT,
  customer_id  UUID REFERENCES "CLIENTES"(id) ON DELETE SET NULL,

  product_id   UUID REFERENCES "PRODUTOS"(id) ON DELETE SET NULL,
  arte_id      UUID REFERENCES "CATALOGO_ARTES"(id) ON DELETE SET NULL,

  -- 'frente' | 'frente_verso'
  posicao      TEXT NOT NULL DEFAULT 'frente',

  -- O gabarito VIGENTE quando a arte foi montada, copiado para dentro do
  -- projeto. Se o Administrativo mudar o gabarito amanhã, a arte que já
  -- foi paga continua sabendo em que medida foi aprovada.
  gabarito     JSONB NOT NULL DEFAULT '{}'::jsonb,

  -- O conteúdo de cada face:
  --   { "frente": { "arte_id": …, "valores": {…} },
  --     "verso":  { … } }
  faces        JSONB NOT NULL DEFAULT '{}'::jsonb,

  preview_url  TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_projetos_visitor ON "CATALOGO_PROJETOS" (tenant_id, visitor_id);

NOTIFY pgrst, 'reload schema';

INSERT INTO "_MIGRATIONS" (version, name) VALUES ('076', 'catalogo')
ON CONFLICT (version) DO NOTHING;


-- ==========================================================
-- 077_produto_publicacao.sql
-- ==========================================================
-- ============================================================
-- 077. O PRODUTO MESTRE DECIDE ONDE APARECE
--
--      UM CADASTRO, TRÊS PORTAS. O mesmo Long Drink 350 ml pode ser
--      vendido liso na loja, personalizado no catálogo, nos dois, ou em
--      nenhum dos dois enquanto ainda está sendo montado. Até hoje
--      existia uma chave só (`show_in_store`), e ela decidia os dois
--      sites ao mesmo tempo — quem quisesse tirar um produto do
--      catálogo tirava da loja junto.
--
--      O ESTADO DE RASCUNHO. Começar a cadastrar não é publicar. Produto
--      novo nasce FORA do catálogo (DEFAULT FALSE) e só aparece para o
--      cliente quando alguém marcar. Sem isso, um cadastro pela metade —
--      sem foto, sem preço, sem gabarito — vira card no ar no minuto em
--      que o nome é digitado.
--
--      POR QUE NÃO UM CAMPO "STATUS" ÚNICO. Porque não são estados de
--      uma escada: um produto pode estar publicado no catálogo e fora da
--      loja de lisos ao mesmo tempo. Duas perguntas independentes pedem
--      duas colunas; enfiar as duas num campo só obrigaria a inventar
--      combinações ("ativo_so_catalogo") e a reescrever a lista toda no
--      dia em que aparecer a terceira porta.
--
--      O QUE ESTA MIGRAÇÃO NÃO MUDA. Nada do que já está no ar sai do
--      ar: o backfill copia a visibilidade atual para a coluna nova.
--      Quem estava aparecendo continua aparecendo, e a partir de hoje as
--      duas chaves andam separadas.
-- ============================================================

-- ── A chave do catálogo personalizado ───────────────────────
-- FALSE por padrão: produto novo é rascunho até alguém publicar.
ALTER TABLE "PRODUTOS"
  ADD COLUMN IF NOT EXISTS show_in_catalogo BOOLEAN NOT NULL DEFAULT FALSE;

-- Backfill: o que estava visível continua visível. `show_in_store` era a
-- única chave que existia, então ela é a verdade sobre o passado.
UPDATE "PRODUTOS"
   SET show_in_catalogo = TRUE
 WHERE is_active
   AND COALESCE(show_in_store, TRUE)
   AND show_in_catalogo = FALSE;

-- A vitrine pergunta sempre a mesma coisa: "quais produtos ativos deste
-- tenant estão publicados no catálogo?". Sem índice isso é varredura da
-- tabela inteira a cada abertura da primeira tela.
CREATE INDEX IF NOT EXISTS idx_produtos_catalogo
  ON "PRODUTOS" (tenant_id, show_in_catalogo)
  WHERE is_active;

COMMENT ON COLUMN "PRODUTOS".show_in_catalogo IS
  'Publicado no Catálogo de Produtos Personalizados (/catalogo). Independente de show_in_store, que é a loja de copos lisos (/loja).';

NOTIFY pgrst, 'reload schema';

INSERT INTO "_MIGRATIONS" (version, name) VALUES ('077', 'produto_publicacao')
ON CONFLICT (version) DO NOTHING;


-- ==========================================================
-- 078_remove_jt_express.sql
-- ==========================================================
-- ============================================================
-- 078. FORA A J&T EXPRESS.
--
-- Desfaz o que a migração 041 criou e limpa o que sobrou da
-- integração na configuração da empresa. O frete passa a sair de
-- uma regra só: a tabela por estado (Configurações →
-- Transportadora), preenchida à mão.
--
-- O código já não lê nada disto — rodar esta migração é opcional e
-- serve para o banco parar de carregar coluna e chaves mortas.
-- A coluna tracking_code CONTINUA: o código de rastreio de qualquer
-- transportadora ainda é guardado ali.
-- ============================================================

-- 1) O id do pedido logístico da J&T na venda
ALTER TABLE "VENDAS" DROP COLUMN IF EXISTS jt_tx_id;

-- 2) As credenciais e chaves da J&T dentro de EMPRESAS.settings.frete
--    (jt_*, mais o "enabled", que era o liga/desliga da J&T, e as
--    chaves de cálculo por peso/acréscimo que não existem mais)
UPDATE "EMPRESAS"
SET settings = jsonb_set(
      settings,
      '{frete}',
      (settings->'frete')
        - 'jt_base_url' - 'jt_api_account' - 'jt_private_key'
        - 'jt_customer_code' - 'jt_password' - 'jt_goods_type'
        - 'jt_product_type' - 'jt_default_ncm'
        - 'enabled'
        - 'weight_per_unit_g' - 'freight_markup' - 'default_per_kg'
    )
WHERE settings ? 'frete';

-- 3) O "+ por kg" de cada linha da tabela por estado: o valor agora é
--    um só por estado, digitado à mão.
UPDATE "EMPRESAS"
SET settings = jsonb_set(
      settings,
      '{frete,table}',
      (
        SELECT COALESCE(jsonb_agg(linha - 'per_kg'), '[]'::jsonb)
        FROM jsonb_array_elements(settings->'frete'->'table') AS linha
      )
    )
WHERE jsonb_typeof(settings->'frete'->'table') = 'array';

INSERT INTO "_MIGRATIONS" (version, name) VALUES ('078', 'remove_jt_express')
ON CONFLICT (version) DO NOTHING;


-- ==========================================================
-- 079_permissoes_por_tela.sql
-- ==========================================================
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


-- ==========================================================
-- 080_rh_estrutura.sql
-- ==========================================================
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


-- ==========================================================
-- 081_ferias_afastamentos.sql
-- ==========================================================
-- ============================================================
-- 081. FÉRIAS E AFASTAMENTOS — DUAS COISAS DIFERENTES.
--
-- RH_FERIAS guardava período e status, e mais nada. Com isso, férias
-- programadas e auxílio-doença eram a MESMA linha: o painel não sabia
-- dizer quantas pessoas estavam afastadas, a folha não sabia o que
-- descontar e o eSocial não tinha o que informar. Um atestado de 20
-- dias entrava no sistema com a mesma cara de umas férias de janeiro.
--
-- O que muda aqui:
--
--   kind          separa férias de afastamento, licença e suspensão
--   reason/cid    o motivo — e o CID, que o eSocial exige no S-2230
--   doc_url       o atestado, anexado uma vez e lido por todos
--   aquisitivo    o período que gerou o direito (férias)
--   abono/13º     as escolhas do colaborador, que a folha precisa saber
--   inss_apos_15  afastamento acima de 15 dias vira INSS: quem paga muda
--   exame_retorno o exame de retorno, obrigatório acima de 30 dias
--   aprovação     quem aprovou e quando — decisão é humana, sempre
--
-- O SALDO NÃO É COLUNA. Ele é CALCULADO da admissão, dos períodos já
-- gozados e das faltas do ponto (CLT art. 130). Guardar saldo seria
-- criar um número que envelhece sozinho e passa a discordar do fato.
-- ============================================================

ALTER TABLE "RH_FERIAS" ADD COLUMN IF NOT EXISTS kind TEXT DEFAULT 'ferias';
COMMENT ON COLUMN "RH_FERIAS".kind IS 'ferias | afastamento | licenca | suspensao';

ALTER TABLE "RH_FERIAS" ADD COLUMN IF NOT EXISTS reason TEXT;
ALTER TABLE "RH_FERIAS" ADD COLUMN IF NOT EXISTS cid TEXT;
ALTER TABLE "RH_FERIAS" ADD COLUMN IF NOT EXISTS doc_url TEXT;

-- Período aquisitivo que originou estas férias
ALTER TABLE "RH_FERIAS" ADD COLUMN IF NOT EXISTS aquisitivo_inicio DATE;
ALTER TABLE "RH_FERIAS" ADD COLUMN IF NOT EXISTS aquisitivo_fim DATE;

-- Escolhas do colaborador que a folha precisa conhecer
ALTER TABLE "RH_FERIAS" ADD COLUMN IF NOT EXISTS abono_pecuniario BOOLEAN DEFAULT FALSE;
ALTER TABLE "RH_FERIAS" ADD COLUMN IF NOT EXISTS abono_dias INT;
ALTER TABLE "RH_FERIAS" ADD COLUMN IF NOT EXISTS adiantar_decimo BOOLEAN DEFAULT FALSE;

-- Afastamento: acima de 15 dias o pagamento passa ao INSS, e acima de
-- 30 o retorno exige exame. As duas coisas mudam folha e eSocial.
ALTER TABLE "RH_FERIAS" ADD COLUMN IF NOT EXISTS inss_apos_15 BOOLEAN DEFAULT FALSE;
ALTER TABLE "RH_FERIAS" ADD COLUMN IF NOT EXISTS exame_retorno_exigido BOOLEAN DEFAULT FALSE;
ALTER TABLE "RH_FERIAS" ADD COLUMN IF NOT EXISTS exame_retorno_em DATE;
ALTER TABLE "RH_FERIAS" ADD COLUMN IF NOT EXISTS retorno_real DATE;

-- Quem pediu, quem aprovou, e por onde entrou
ALTER TABLE "RH_FERIAS" ADD COLUMN IF NOT EXISTS requested_by UUID;
ALTER TABLE "RH_FERIAS" ADD COLUMN IF NOT EXISTS origin TEXT DEFAULT 'rh';
COMMENT ON COLUMN "RH_FERIAS".origin IS 'rh | portal | gestor | sistema';
ALTER TABLE "RH_FERIAS" ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ;
ALTER TABLE "RH_FERIAS" ADD COLUMN IF NOT EXISTS esocial_evento_id UUID;
ALTER TABLE "RH_FERIAS" ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

CREATE INDEX IF NOT EXISTS rh_ferias_tenant_periodo ON "RH_FERIAS" (tenant_id, start_date, end_date);
CREATE INDEX IF NOT EXISTS rh_ferias_tipo ON "RH_FERIAS" (tenant_id, kind, status);

-- As linhas que já existiam são férias: era a única coisa que a tabela
-- sabia representar.
UPDATE "RH_FERIAS" SET kind = 'ferias' WHERE kind IS NULL;

INSERT INTO "_MIGRATIONS" (version, name) VALUES ('081', 'ferias_afastamentos')
ON CONFLICT (version) DO NOTHING;


-- ==========================================================
-- 082_ponto_ocorrencias.sql
-- ==========================================================
-- ============================================================
-- 082. O PONTO QUE FALA COM AS OCORRÊNCIAS.
--
-- Duas coisas nascem aqui:
--
-- 1) RH_NOTIFICACOES — a fila de avisos. Quando alguém passa da
--    tolerância, o sistema precisa pedir justificativa pelo WhatsApp.
--    Sem uma fila, "notificação enviada" vira fé: ninguém sabe se saiu,
--    se falhou ou se foi entregue duas vezes. Cada linha aqui é uma
--    tentativa registrada, com o texto exato que foi (ou seria) enviado.
--
--    E enquanto NÃO houver integração de WhatsApp configurada, a linha
--    fica em 'pendente' com a mensagem pronta — o RH copia e manda à
--    mão, e o sistema não mente dizendo que enviou.
--
-- 2) A ocorrência ganha ligação com o dia do ponto que a originou, para
--    ninguém precisar cruzar data e nome no olho.
-- ============================================================

CREATE TABLE IF NOT EXISTS "RH_NOTIFICACOES" (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL,
  employee_id   UUID,
  canal         TEXT NOT NULL DEFAULT 'whatsapp',   -- whatsapp | email | sistema
  destino       TEXT,                               -- o número/e-mail usado
  assunto       TEXT,
  mensagem      TEXT NOT NULL,
  motivo        TEXT,                               -- atraso | falta | justificativa | ferias | documento
  ref_type      TEXT,                               -- ocorrencia | ponto | ferias
  ref_id        UUID,
  status        TEXT NOT NULL DEFAULT 'pendente',   -- pendente | enviada | falhou | cancelada
  erro          TEXT,
  tentativas    INT DEFAULT 0,
  enviada_em    TIMESTAMPTZ,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS rh_notif_tenant ON "RH_NOTIFICACOES" (tenant_id, status, created_at DESC);

-- De qual dia de ponto veio a ocorrência
ALTER TABLE "RH_OCORRENCIAS" ADD COLUMN IF NOT EXISTS ponto_id UUID;
ALTER TABLE "RH_OCORRENCIAS" ADD COLUMN IF NOT EXISTS notificado_em TIMESTAMPTZ;

-- Uma ocorrência automática por pessoa/dia/tipo. É esta trava que
-- impede o recálculo do ponto de criar dez atrasos para o mesmo dia.
CREATE UNIQUE INDEX IF NOT EXISTS rh_ocorrencias_unica_dia
  ON "RH_OCORRENCIAS" (tenant_id, employee_id, occurred_on, kind)
  WHERE origin = 'ponto';

INSERT INTO "_MIGRATIONS" (version, name) VALUES ('082', 'ponto_ocorrencias')
ON CONFLICT (version) DO NOTHING;


-- ==========================================================
-- 083_documentos_rh.sql
-- ==========================================================
-- ============================================================
-- 083. A CENTRAL DOCUMENTAL DO RH.
--
-- RH_DOCUMENTOS guardava o que foi ANEXADO: tipo, arquivo e data. Só
-- isso não responde a pergunta que o RH faz todo dia — "o que está
-- FALTANDO?". Faltava saber o que é obrigatório, o que vence, o que já
-- foi assinado e de onde veio cada papel.
--
-- O QUE ENTRA AQUI:
--
--   doc_key     liga o arquivo ao catálogo (contrato_clt, rg, aso…)
--   category    pessoal | trabalhista | contratual | medico | financeiro
--               | politica | dependente | conjuge
--   status      anexado | pendente | assinado | vencido | recusado
--   expires_at  validade — quando existir
--   sem_validade  DOCUMENTO QUE NÃO VENCE, e isso é uma escolha
--               explícita (item 9): contrato por prazo indeterminado
--               não pode aparecer como "vencendo" só porque o campo de
--               data ficou vazio.
--   required    se a falta dele trava a admissão
--   origin      colaborador | sistema | rh  (o ERP gera parte deles)
--   signed_at   assinatura eletrônica, quando houver
--
-- A regra do kit vale aqui: esta é a CENTRAL ÚNICA de anexos. As outras
-- telas só mostram status e o botão de visualizar — nenhuma delas
-- guarda arquivo por conta própria.
-- ============================================================

ALTER TABLE "RH_DOCUMENTOS" ADD COLUMN IF NOT EXISTS doc_key TEXT;
ALTER TABLE "RH_DOCUMENTOS" ADD COLUMN IF NOT EXISTS category TEXT;
ALTER TABLE "RH_DOCUMENTOS" ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'anexado';
ALTER TABLE "RH_DOCUMENTOS" ADD COLUMN IF NOT EXISTS expires_at DATE;
ALTER TABLE "RH_DOCUMENTOS" ADD COLUMN IF NOT EXISTS sem_validade BOOLEAN DEFAULT FALSE;
ALTER TABLE "RH_DOCUMENTOS" ADD COLUMN IF NOT EXISTS required BOOLEAN DEFAULT FALSE;
ALTER TABLE "RH_DOCUMENTOS" ADD COLUMN IF NOT EXISTS origin TEXT DEFAULT 'rh';
ALTER TABLE "RH_DOCUMENTOS" ADD COLUMN IF NOT EXISTS signed_at TIMESTAMPTZ;
ALTER TABLE "RH_DOCUMENTOS" ADD COLUMN IF NOT EXISTS signed_by UUID;
ALTER TABLE "RH_DOCUMENTOS" ADD COLUMN IF NOT EXISTS version TEXT;
ALTER TABLE "RH_DOCUMENTOS" ADD COLUMN IF NOT EXISTS size_bytes BIGINT;
ALTER TABLE "RH_DOCUMENTOS" ADD COLUMN IF NOT EXISTS mime TEXT;
ALTER TABLE "RH_DOCUMENTOS" ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

CREATE INDEX IF NOT EXISTS rh_doc_colab ON "RH_DOCUMENTOS" (tenant_id, employee_id, doc_key);
CREATE INDEX IF NOT EXISTS rh_doc_validade ON "RH_DOCUMENTOS" (tenant_id, expires_at)
  WHERE expires_at IS NOT NULL;

-- As linhas antigas: o que já estava anexado continua anexado, e o
-- `type` vira a chave até alguém reclassificar.
UPDATE "RH_DOCUMENTOS" SET status = 'anexado' WHERE status IS NULL;
UPDATE "RH_DOCUMENTOS" SET doc_key = type WHERE doc_key IS NULL;

-- ── Políticas corporativas: versionadas UMA vez ─────────────
-- O kit é explícito: a política é cadastrada e versionada uma única vez
-- no Administrativo, e o colaborador aceita a VERSÃO VIGENTE. Guardar
-- uma cópia do texto por colaborador seria multiplicar por 20 (ou por
-- 500) um documento que é um só.
CREATE TABLE IF NOT EXISTS "RH_POLITICAS" (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    UUID NOT NULL,
  chave        TEXT NOT NULL,
  titulo       TEXT NOT NULL,
  versao       TEXT NOT NULL DEFAULT '1.0',
  vigente_desde DATE DEFAULT CURRENT_DATE,
  conteudo     TEXT,
  arquivo_url  TEXT,
  obrigatoria  BOOLEAN DEFAULT TRUE,
  is_active    BOOLEAN DEFAULT TRUE,
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (tenant_id, chave, versao)
);

-- O aceite: quem aceitou, qual versão e quando. É o Termo de Ciência.
CREATE TABLE IF NOT EXISTS "RH_POLITICAS_ACEITES" (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    UUID NOT NULL,
  politica_id  UUID NOT NULL,
  employee_id  UUID NOT NULL,
  versao       TEXT NOT NULL,
  aceito_em    TIMESTAMPTZ DEFAULT NOW(),
  ip           TEXT,
  origem       TEXT DEFAULT 'portal',
  UNIQUE (tenant_id, politica_id, employee_id, versao)
);

DO $$
DECLARE t UUID := 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
BEGIN
  INSERT INTO "RH_POLITICAS" (tenant_id, chave, titulo, versao)
  SELECT t, v.chave, v.titulo, '1.0' FROM (VALUES
    ('conduta','Código de Conduta e Ética'),
    ('lgpd','Política de Privacidade e Proteção de Dados'),
    ('seguranca','Política de Segurança da Informação'),
    ('recursos','Política de Uso de Recursos da Empresa'),
    ('anticorrupcao','Política Anticorrupção e Conflito de Interesses')
  ) AS v(chave,titulo)
  WHERE NOT EXISTS (SELECT 1 FROM "RH_POLITICAS" p WHERE p.tenant_id = t AND p.chave = v.chave);
END $$;

INSERT INTO "_MIGRATIONS" (version, name) VALUES ('083', 'documentos_rh')
ON CONFLICT (version) DO NOTHING;


-- ==========================================================
-- 088_permissoes_por_tela_setor.sql
-- ==========================================================
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


-- ==========================================================
-- 089_portal_solicitacoes.sql
-- ==========================================================
-- ============================================================
-- 089. A FILA DE SOLICITAÇÕES DO PORTAL.
--
-- A regra do portal é uma só: PORTAL NÃO CRIA UMA SEGUNDA INFORMAÇÃO.
-- Ele consulta o cadastro mestre ou PEDE alteração dele. Sem esta
-- tabela, "solicitar troca de banco" só teria dois caminhos possíveis,
-- e os dois são ruins:
--
--   a) o portal escreve direto no cadastro   → o RH descobre depois,
--      sem ninguém ter decidido, e a folha paga na conta nova antes de
--      alguém conferir se o pedido é mesmo daquela pessoa;
--   b) o portal guarda um "banco do portal"  → duas verdades sobre a
--      mesma conta, e um dia elas discordam.
--
-- Aqui o pedido fica sendo PEDIDO até um humano decidir. Aprovar é o
-- que move o cadastro mestre — e é por isso que `decided_by` existe:
-- consequência para a pessoa tem que ter nome de quem decidiu.
--
-- O QUE **NÃO** ENTRA AQUI:
--
--   férias        → já moram em RH_FERIAS (status 'pending' É a fila)
--   justificativa → já mora em RH_OCORRENCIAS
--   demissão      → já mora em RH_DESLIGAMENTOS ('solicitado')
--
-- Duplicá-los aqui seria repetir o erro que a tabela existe para
-- evitar. O portal MOSTRA os quatro juntos numa lista só; o banco
-- continua com cada fato no lugar de onde o RH já lê.
--
--   kind     cadastral | documento | beneficio | ponto | outro
--   payload  o que foi pedido, no formato do cadastro mestre
--            (ex.: { bank: {...}, motivo: '...' })
--   applied_at  quando a aprovação REALMENTE moveu o cadastro — sem
--            isto, "aprovada" e "aplicada" viram a mesma palavra para
--            dois estados diferentes.
-- ============================================================

CREATE TABLE IF NOT EXISTS "RH_SOLICITACOES" (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL,
  employee_id   UUID NOT NULL REFERENCES "CLIENTES"(id) ON DELETE CASCADE,
  kind          TEXT NOT NULL,
  titulo        TEXT,
  descricao     TEXT,
  payload       JSONB NOT NULL DEFAULT '{}'::jsonb,
  anexo_url     TEXT,
  status        TEXT NOT NULL DEFAULT 'aberta',
    -- aberta | em_analise | aprovada | recusada | cancelada
  origin        TEXT DEFAULT 'portal',
  decided_by    UUID,
  decided_at    TIMESTAMPTZ,
  decision_note TEXT,
  applied_at    TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS rh_solic_colab
  ON "RH_SOLICITACOES" (tenant_id, employee_id, created_at DESC);
CREATE INDEX IF NOT EXISTS rh_solic_fila
  ON "RH_SOLICITACOES" (tenant_id, status, created_at DESC);

-- Backend usa a service_role (BYPASSRLS). Com RLS ligada e sem
-- política, a anon key não alcança a tabela — mesma ideia da 011.
ALTER TABLE "RH_SOLICITACOES" ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE "RH_SOLICITACOES" IS
  'Pedidos do Portal do Colaborador que ainda não viraram fato no cadastro mestre.';

NOTIFY pgrst, 'reload schema';

INSERT INTO "_MIGRATIONS" (version, name) VALUES ('089', 'portal_solicitacoes')
ON CONFLICT (version) DO NOTHING;


-- ==========================================================
-- 090_venda_retirada.sql
-- ==========================================================
-- ============================================================
-- 090. ENTREGA OU RETIRADA — a modalidade do pedido.
--
-- A linha do tempo terminava sempre do mesmo jeito: aguardando coleta,
-- coleta realizada, em trânsito, aguardando entrega, entregue. Para
-- quem vai BUSCAR o pedido na fábrica, três dessas etapas nunca vão
-- acontecer — e o cliente fica esperando um caminhão que não existe.
--
-- Faltava o dado. "Retirada no local" existia apenas como uma LINHA DE
-- TEXTO dentro de `notes`, escrita pelo catálogo; nenhuma tela do ERP
-- tinha onde marcar isso, e nenhuma conta conseguia perguntar.
--
--   entrega   (padrão) o pedido vai para uma transportadora
--   retirada  o cliente busca — sem coleta, sem trânsito, sem entrega
--
-- NULL é "ninguém informou", e vale entrega: é o que 100% dos pedidos
-- antigos são, com a exceção que o backfill abaixo recupera.
--
-- O BACKFILL LÊ O QUE JÁ ESTÁ ESCRITO. Os pedidos que vieram do
-- catálogo com retirada carregam a frase em `notes` desde sempre — o
-- dado existia, só não era consultável. Passa a ser.
-- ============================================================

ALTER TABLE "VENDAS" ADD COLUMN IF NOT EXISTS delivery_mode TEXT;

COMMENT ON COLUMN "VENDAS".delivery_mode IS
  'entrega (padrão) | retirada. NULL = não informado, vale entrega.';

UPDATE "VENDAS"
   SET delivery_mode = 'retirada'
 WHERE delivery_mode IS NULL
   AND notes ILIKE '%retirada no local%';

CREATE INDEX IF NOT EXISTS idx_vendas_retirada
  ON "VENDAS" (tenant_id, delivery_mode)
  WHERE delivery_mode = 'retirada';

NOTIFY pgrst, 'reload schema';

INSERT INTO "_MIGRATIONS" (version, name) VALUES ('090', 'venda_retirada')
ON CONFLICT (version) DO NOTHING;


-- ==========================================================
-- 091_retirada_autorizado.sql
-- ==========================================================
-- ============================================================
-- 091. QUEM VAI RETIRAR O PEDIDO.
--
-- Na retirada o pedido sai da fábrica na mão de alguém — e até aqui não
-- havia onde dizer quem é esse alguém. Na prática isso vira uma conversa
-- no balcão ("é para a Maria", "que Maria?") e, no pior caso, a
-- mercadoria entregue a quem não devia.
--
-- O cliente informa NOME e CPF pelo próprio acompanhamento, e no ato da
-- retirada essa pessoa apresenta documento. É simples de propósito: um
-- nome e um documento resolvem o problema real, que é conferir na porta.
--
--   { nome, cpf, informado_em, informado_por }
--
-- `informado_por` guarda de onde veio (portal do cliente ou balcão),
-- porque a autorização vai ser questionada exatamente no dia em que
-- alguém aparecer dizendo que a combinação era outra.
--
-- JSONB e não quatro colunas: isto é UM fato — "a autorização de
-- retirada" — e ele nasce e morre inteiro. Trocar a pessoa é substituir
-- o objeto, não editar campo por campo.
--
-- O CPF fica INTEIRO no banco porque é ele que confere o documento na
-- porta; para a tela ele volta mascarado.
-- ============================================================

ALTER TABLE "VENDAS" ADD COLUMN IF NOT EXISTS pickup_person JSONB;

COMMENT ON COLUMN "VENDAS".pickup_person IS
  'Quem está autorizado a retirar: { nome, cpf, informado_em, informado_por }. NULL = ninguém informado.';

NOTIFY pgrst, 'reload schema';

INSERT INTO "_MIGRATIONS" (version, name) VALUES ('091', 'retirada_autorizado')
ON CONFLICT (version) DO NOTHING;


-- ==========================================================
-- 092_insumo_estoque_proprio.sql
-- ==========================================================
-- ============================================================
-- 092. INSUMOS — ESTOQUE PRÓPRIO.
--
-- Até aqui o insumo não tinha saldo nenhum. A coluna "Estoque" da tela
-- lia o `current_stock` do PRODUTO vinculado — e tinta, verniz e lâmina
-- não são produto de venda, então quase nenhum insumo tinha vínculo e
-- quase todos mostravam um traço. Não havia onde digitar a quantidade.
--
-- A razão original de não criar saldo próprio era não ter duas fontes de
-- verdade. A razão continua boa; a conclusão é que a fonte de verdade do
-- insumo é o INSUMO, e não um produto emprestado do cadastro de venda.
--
-- O saldo não é um campo que se sobrescreve e pronto: cada mudança deixa
-- um MOVIMENTO. Entrada (comprei), saída (usei) e ajuste (contei e era
-- outro). Assim "sumiram 4 litros de tinta" tem onde ser respondido.
-- ============================================================

ALTER TABLE "INSUMOS"
  ADD COLUMN IF NOT EXISTS current_stock NUMERIC(15,4) NOT NULL DEFAULT 0;

-- ── O extrato do insumo ───────────────────────────────────
-- `quantity` é sempre POSITIVA e na unidade base do insumo (ml, g, un).
-- Quem decide se soma ou subtrai é o `tipo` — guardar número negativo
-- obrigaria toda leitura a lembrar do sinal, e uma hora alguém esquece.
CREATE TABLE IF NOT EXISTS "INSUMO_MOVIMENTOS" (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id   UUID NOT NULL REFERENCES "EMPRESAS"(id) ON DELETE CASCADE,
  insumo_id   UUID NOT NULL REFERENCES "INSUMOS"(id) ON DELETE CASCADE,
  tipo        VARCHAR(12) NOT NULL CHECK (tipo IN ('entrada', 'saida', 'ajuste')),
  quantity    NUMERIC(15,4) NOT NULL CHECK (quantity >= 0),
  saldo_apos  NUMERIC(15,4) NOT NULL DEFAULT 0,
  unit_cost   NUMERIC(15,6),
  total       NUMERIC(15,2),
  reference   VARCHAR(80),
  notes       TEXT,
  user_name   VARCHAR(160),
  created_at  TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_insumo_mov ON "INSUMO_MOVIMENTOS"(tenant_id, insumo_id, created_at DESC);

ALTER TABLE "INSUMO_MOVIMENTOS" ENABLE ROW LEVEL SECURITY;

-- ── A carga inicial ───────────────────────────────────────
-- Insumo que HOJE mostra saldo o mostra por causa do produto vinculado.
-- Esse número é copiado uma vez para o saldo próprio: quem já tinha
-- estoque na tela continua com ele depois da migração, e a partir daqui
-- o produto não manda mais no saldo do insumo.
UPDATE "INSUMOS" i
   SET current_stock = COALESCE(p.current_stock, 0)
  FROM "PRODUTOS" p
 WHERE p.id = i.product_id
   AND i.current_stock = 0
   AND COALESCE(p.current_stock, 0) > 0;

INSERT INTO "INSUMO_MOVIMENTOS" (tenant_id, insumo_id, tipo, quantity, saldo_apos, notes, user_name)
SELECT i.tenant_id, i.id, 'ajuste', i.current_stock, i.current_stock,
       'Saldo herdado do produto vinculado na migração 092', 'carga inicial'
  FROM "INSUMOS" i
 WHERE i.current_stock > 0
   AND NOT EXISTS (SELECT 1 FROM "INSUMO_MOVIMENTOS" m WHERE m.insumo_id = i.id);

-- PostgREST só enxerga o que é novo depois de recarregar o cache
NOTIFY pgrst, 'reload schema';

INSERT INTO "_MIGRATIONS" (version, name) VALUES ('092', 'insumo_estoque_proprio')
ON CONFLICT (version) DO NOTHING;


-- ==========================================================
-- 093_nfe_recebidas.sql
-- ==========================================================
-- ============================================================
-- 093. NF-e RECEBIDAS — as compras do CNPJ, vindas da SEFAZ.
--
-- O módulo Fiscal só sabia SAIR: emitir a nota da venda, consultar,
-- cancelar. A entrada não existia. Compra que a Lyon faz só chegava ao
-- sistema se alguém digitasse, e "alguém digitar" é uma promessa que
-- nenhuma empresa cumpre com todas as notas — o que faltasse ficava
-- fora do estoque, do custo e da apuração, sem ninguém saber que
-- faltou.
--
-- A SEFAZ sabe. Toda NF-e emitida CONTRA o CNPJ da Lyon passa por ela,
-- e o serviço de Distribuição de DF-e devolve essa lista para quem tem
-- o certificado da empresa. Não depende do fornecedor mandar o XML, não
-- depende de e-mail, não depende de digitação: se a nota existe, ela
-- aparece.
--
-- `versao` É O MARCADOR DA SINCRONIA. A Focus devolve, junto da lista,
-- um X-Max-Version; a próxima consulta pede só o que veio depois dele.
-- É isso que faz a sincronização ser incremental em vez de rebaixar o
-- CNPJ inteiro toda vez — e é isso que a coluna guarda.
-- ============================================================

CREATE TABLE IF NOT EXISTS "NFE_RECEBIDAS" (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL REFERENCES "EMPRESAS"(id) ON DELETE CASCADE,

  -- A chave de 44 dígitos é a identidade da nota no Brasil inteiro.
  -- Única por empresa: a mesma nota nunca entra duas vezes, por mais
  -- vezes que a sincronização rode.
  chave         VARCHAR(44) NOT NULL,

  nome_emitente      VARCHAR(200),
  documento_emitente VARCHAR(20),

  valor_total   NUMERIC(15,2) NOT NULL DEFAULT 0,
  data_emissao  TIMESTAMPTZ,
  situacao      VARCHAR(30),          -- autorizada | cancelada | denegada
  tipo_nfe      VARCHAR(2),           -- 0 = entrada, 1 = saída (na visão de quem emitiu)
  nfe_completa  BOOLEAN NOT NULL DEFAULT false,

  -- A manifestação do destinatário. NULL = ninguém se manifestou ainda,
  -- e é esse NULL que a tela usa para cobrar.
  manifestacao       VARCHAR(20),     -- ciencia | confirmacao | desconhecimento | nao_realizada
  manifestacao_at    TIMESTAMPTZ,
  manifestacao_proto VARCHAR(60),

  -- Baixado sob demanda: guardar o XML de toda nota do CNPJ desde
  -- sempre e sem ninguém pedir e um custo de armazenamento que nao se
  -- justifica ate alguem querer o arquivo.
  xml           TEXT,

  -- Quando esta nota virar uma compra lançada, o vínculo mora aqui.
  purchase_id   UUID,

  versao        BIGINT NOT NULL DEFAULT 0,
  raw           JSONB,

  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT nfe_recebidas_chave_unica UNIQUE (tenant_id, chave)
);

CREATE INDEX IF NOT EXISTS nfe_recebidas_tenant_idx
  ON "NFE_RECEBIDAS" (tenant_id, data_emissao DESC);
-- A pergunta mais frequente da tela: "o que ainda não foi manifestado?"
CREATE INDEX IF NOT EXISTS nfe_recebidas_pendentes_idx
  ON "NFE_RECEBIDAS" (tenant_id) WHERE manifestacao IS NULL;

ALTER TABLE "NFE_RECEBIDAS" ENABLE ROW LEVEL SECURITY;

-- ── O marcador da sincronia ───────────────────────────────
-- Fica na config fiscal porque é dela que a sincronização depende (CNPJ,
-- token, ambiente). Uma tabela só para guardar um número seria uma
-- viagem a mais ao banco em toda sincronização.
ALTER TABLE "CONFIG_FISCAL"
  ADD COLUMN IF NOT EXISTS recebidas_versao   BIGINT      NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS recebidas_sync_at  TIMESTAMPTZ;

-- PostgREST só enxerga o que é novo depois de recarregar o cache
NOTIFY pgrst, 'reload schema';

INSERT INTO "_MIGRATIONS" (version, name) VALUES ('093', 'nfe_recebidas')
ON CONFLICT (version) DO NOTHING;


-- ==========================================================
-- 094_produto_ambiente.sql
-- ==========================================================
-- ============================================================
-- 094. O MESMO COPO, DUAS CONFIGURACOES DE VENDA
--
--      UM CADASTRO, DOIS AMBIENTES. O Long Drink 350 ml e vendido nos
--      dois lugares: liso na /loja, do jeito que sai da maquina, e
--      personalizado no /catalogo, com acabamento e arte por cima. E o
--      MESMO produto — mesmo codigo, mesmo estoque, mesma ficha de
--      custo. So que ele nao se vende igual nos dois:
--
--        na loja           unidade avulsa, preco de prateleira, foto da
--                          peca como ela e
--        no catalogo       caixa fechada, minimo alto, preco que ja
--                          embute a personalizacao, foto do copo impresso
--
--      Ate hoje as duas vitrines liam as MESMAS colunas de PRODUTOS.
--      Mudar o preco do catalogo mudava o preco da loja no mesmo
--      instante, e nao havia como pedir minimo de 100 no personalizado
--      sem exigir 100 de quem quer um copo liso.
--
--      POR QUE NAO DUPLICAR O PRODUTO. Porque duplicar quebra tudo que
--      depende de haver UM cadastro: o estoque viraria dois saldos do
--      mesmo copo, o custo seria calculado duas vezes, e o dia em que
--      alguem renomeasse um dos dois comecaria a divergencia. O que
--      muda entre os ambientes e um punhado de campos de VITRINE, e e
--      so isso que esta tabela guarda.
--
--      NULO E "HERDA", E ESSE E O PONTO. Cada coluna aqui e uma
--      EXCECAO. Sem linha, ou com o campo nulo, vale o cadastro mestre —
--      e e assim que os 97 copos continuam funcionando hoje sem ninguem
--      preencher nada. Quem quiser um preco so no catalogo preenche um
--      campo; o resto continua seguindo o cadastro, inclusive quando o
--      cadastro mudar amanha.
--
--      A ALTERNATIVA ERA PIOR: colunas `sale_price_catalogo`,
--      `min_order_qty_catalogo`... em PRODUTOS. Some uma coluna por
--      campo a cada ambiente novo, e a tabela que ja tem 47 colunas
--      passaria a ter 60 para responder a mesma pergunta duas vezes.
-- ============================================================

CREATE TABLE IF NOT EXISTS "PRODUTO_AMBIENTE" (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL REFERENCES "EMPRESAS"(id) ON DELETE CASCADE,
  product_id  UUID NOT NULL REFERENCES "PRODUTOS"(id) ON DELETE CASCADE,

  -- 'loja' = a loja de copos lisos (/loja)
  -- 'catalogo' = o catalogo de personalizados (/catalogo)
  -- Texto com CHECK, e nao enum: ambiente novo (marketplace, atacado) e
  -- uma linha no CHECK, e nao um ALTER TYPE que trava a tabela.
  ambiente    TEXT NOT NULL CHECK (ambiente IN ('loja', 'catalogo')),

  -- Daqui para baixo, NULO SIGNIFICA HERDAR. Nenhum default: um zero
  -- gravado por engano seria um copo de graca no ar.
  sale_price      NUMERIC,
  price_tiers     JSONB,
  min_order_qty   INTEGER CHECK (min_order_qty IS NULL OR min_order_qty > 0),
  image_url       TEXT,
  description     TEXT,

  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Uma linha por produto por ambiente. Duas seriam duas respostas para
  -- "quanto custa este copo no catalogo", decididas no par ou impar.
  UNIQUE (tenant_id, product_id, ambiente)
);

-- A vitrine pergunta sempre a mesma coisa: "quais ajustes existem para
-- estes produtos neste ambiente?". Sem indice, e varredura da tabela a
-- cada abertura de pagina da loja.
CREATE INDEX IF NOT EXISTS idx_produto_ambiente_busca
  ON "PRODUTO_AMBIENTE" (tenant_id, ambiente, product_id);

COMMENT ON TABLE "PRODUTO_AMBIENTE" IS
  'Ajustes de vitrine do produto por ambiente de venda. Campo nulo = herda de PRODUTOS.';
COMMENT ON COLUMN "PRODUTO_AMBIENTE".ambiente IS
  'loja = /loja (copos lisos) · catalogo = /catalogo (personalizados)';

-- PostgREST so enxerga a tabela nova depois de recarregar o cache
NOTIFY pgrst, 'reload schema';

INSERT INTO "_MIGRATIONS" (version, name) VALUES ('094', 'produto_ambiente')
ON CONFLICT (version) DO NOTHING;


-- ==========================================================
-- 095_comprovante_parcela.sql
-- ==========================================================
-- ============================================================
-- 095. O COMPROVANTE MORA NA PARCELA
--
--      ONDE ELE ESTAVA. Havia um `receipt_url` em VENDAS: UM comprovante
--      para o pedido inteiro. Serve enquanto o cliente paga de uma vez —
--      e nao serve para nada do que a Lyon faz de verdade:
--
--        entrada + saldo    dois comprovantes, em datas diferentes
--        boleto 30/60/90    tres boletos e tres comprovantes
--
--      Com um campo so, o segundo pagamento apaga o primeiro. O
--      comprovante nao e do pedido: e DAQUELA parcela.
--
--      POR QUE EM LANCAMENTOS. Porque a parcela ja mora la. O pedido a
--      prazo ja gera uma linha por parcela (routes/sales.js), com
--      vencimento, valor e numero — e o webhook do Pix ja da baixa
--      nelas. Criar uma tabela nova de "parcelas do pedido" seria a
--      segunda lista das mesmas parcelas, e o dia em que as duas
--      discordarem e o dia em que o financeiro para de confiar nas duas.
--
--      A LEITURA VEM JUNTO E FICA SEPARADA DO QUE FOI CONFERIDO.
--      `receipt_read` guarda o que a maquina LEU na imagem (data, hora,
--      valor, banco). `receipt_status` guarda o que a PESSOA decidiu.
--      Sao coisas diferentes: a leitura pode errar, e um comprovante
--      pode ser falso com todos os campos legiveis. Guardar as duas no
--      mesmo campo seria perder justamente a pergunta da conciliacao —
--      "o que a maquina achou bate com o que eu conferi?".
-- ============================================================

ALTER TABLE "LANCAMENTOS"
  -- O arquivo anexado (caminho no bucket privado; link assinado na hora)
  ADD COLUMN IF NOT EXISTS receipt_url    TEXT,
  -- O que a leitura extraiu: { data, hora, valor, banco, pagador, obs }
  ADD COLUMN IF NOT EXISTS receipt_read   JSONB,
  -- pendente   anexado, esperando a conferencia de sexta
  -- conferido  o financeiro olhou e bateu
  -- divergente a leitura nao bateu com o esperado (valor ou data)
  -- recusado   o financeiro olhou e nao aceitou
  ADD COLUMN IF NOT EXISTS receipt_status TEXT,
  ADD COLUMN IF NOT EXISTS receipt_at     TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS receipt_by     TEXT,
  -- O PDF do boleto desta parcela. Hoje o financeiro anexa; quando a
  -- emissao pelo banco entrar, e ela que preenche — o portal do cliente
  -- le daqui de qualquer jeito.
  ADD COLUMN IF NOT EXISTS boleto_url     TEXT;

-- A tela de conciliacao pergunta sempre a mesma coisa: "o que entrou
-- nesta semana e ainda nao foi conferido?". Sem indice, e varredura da
-- tabela inteira toda sexta.
CREATE INDEX IF NOT EXISTS idx_lancamentos_conferencia
  ON "LANCAMENTOS" (tenant_id, receipt_status, receipt_at)
  WHERE receipt_url IS NOT NULL;

COMMENT ON COLUMN "LANCAMENTOS".receipt_read IS
  'O que a leitura automatica extraiu da imagem. E o que a MAQUINA achou, nao o que foi conferido.';
COMMENT ON COLUMN "LANCAMENTOS".receipt_status IS
  'pendente | conferido | divergente | recusado. E o que a PESSOA decidiu.';

NOTIFY pgrst, 'reload schema';

INSERT INTO "_MIGRATIONS" (version, name) VALUES ('095', 'comprovante_parcela')
ON CONFLICT (version) DO NOTHING;


-- ==========================================================
-- 096_convite_admissao.sql
-- ==========================================================
-- ============================================================
-- 096. CONVITE DE ADMISSÃO — o colaborador preenche a própria ficha.
--
--      HOJE alguém do RH digita a admissão inteira: nome, CPF, PIS, RG,
--      endereço, cônjuge, filhos, dados bancários. Tudo isso já está na
--      mão da pessoa que está sendo contratada — e é ela quem sabe se o
--      CEP é 86020-000 ou 86020-010. O RH digita de novo, errando o que
--      o outro sabe de cor, e depois liga para conferir.
--
--      Este convite inverte: gera-se um endereço aleatório com prazo, e
--      quem preenche é o próprio colaborador, do celular dele, SEM
--      LOGIN. O RH deixa de digitar e passa a CONFERIR — que é o que ele
--      sabe fazer melhor.
--
--      POR QUE UMA TABELA SEPARADA, E NÃO UM COLABORADOR RASCUNHO.
--
--      O que chega pelo link ainda não é um colaborador: é uma proposta
--      de cadastro, vinda de fora, sem ninguém autenticado por trás.
--      Gravar isso direto em CLIENTES misturaria gente contratada com
--      gente que digitou qualquer coisa num link — e a lista de
--      colaboradores é usada pela folha, pelo ponto e pelo eSocial.
--      Aqui o dado fica em quarentena, em `dados` (jsonb), até alguém do
--      RH aprovar. Só na aprovação nasce o colaborador de verdade.
--
--      O TOKEN É O SEGREDO, E POR ISSO TEM PRAZO. Quem tem o endereço
--      entra: não há senha. É a mesma escolha do link de acompanhamento
--      do pedido, e é aceitável porque o link é gerado sob demanda, vai
--      para uma pessoa só e morre em algumas horas — o prazo é escolhido
--      por quem gera. Depois de usado, também não abre mais.
--
--      NÃO GUARDA ARQUIVO. Documento (RG, comprovante) continua sendo
--      anexado depois, pelo RH ou pelo portal do colaborador, onde já
--      existe controle de quem enviou o quê. Um link anônimo aceitando
--      upload seria uma porta aberta para encher o Storage.
-- ============================================================

CREATE TABLE IF NOT EXISTS "RH_CONVITES_ADMISSAO" (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL REFERENCES "EMPRESAS"(id) ON DELETE CASCADE,

  -- O endereço aleatório. UNIQUE porque ele É a credencial.
  token       TEXT NOT NULL UNIQUE,
  expires_at  TIMESTAMPTZ NOT NULL,

  -- Para o RH saber de quem é o link antes de a pessoa preencher.
  -- Opcional: dá para gerar um link em branco e mandar para quem for.
  convidado_nome  TEXT,
  convidado_email TEXT,

  -- aberto     link criado, ninguém preencheu ainda
  -- enviado    o colaborador preencheu e está esperando conferência
  -- aprovado   virou colaborador (employee_id preenchido)
  -- recusado   o RH devolveu, com motivo
  -- cancelado  o RH matou o link antes de usarem
  status      TEXT NOT NULL DEFAULT 'aberto',

  -- A ficha como ela chegou, crua. Fica guardada mesmo depois de
  -- aprovada: é o documento do que a pessoa declarou, e é o que
  -- responde "quem escreveu esse CPF errado" seis meses depois.
  dados       JSONB,

  employee_id UUID REFERENCES "CLIENTES"(id) ON DELETE SET NULL,

  created_by       UUID,
  created_by_name  TEXT,
  submitted_at     TIMESTAMPTZ,
  reviewed_at      TIMESTAMPTZ,
  reviewed_by      UUID,
  reviewed_by_name TEXT,
  motivo_recusa    TEXT,

  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- A rota pública chega pelo token e por mais nada.
CREATE INDEX IF NOT EXISTS idx_convite_token  ON "RH_CONVITES_ADMISSAO" (token);
-- A aba Pendentes pergunta sempre a mesma coisa: os deste tenant, por status.
CREATE INDEX IF NOT EXISTS idx_convite_tenant ON "RH_CONVITES_ADMISSAO" (tenant_id, status, created_at DESC);

NOTIFY pgrst, 'reload schema';

INSERT INTO "_MIGRATIONS" (version, name) VALUES ('096', 'convite_admissao')
ON CONFLICT (version) DO NOTHING;


-- ==========================================================
-- 097_transportadora_retirada.sql
-- ==========================================================
-- ============================================================
-- 097. A TRANSPORTADORA QUE É "O CLIENTE VEM BUSCAR".
--
--      "Retirar em mãos" era uma OPÇÃO FALSA dentro do seletor de
--      transportadora do pedido: aparecia na lista, não era uma
--      transportadora, e existia só para o operador conseguir dizer que
--      o cliente ia buscar.
--
--      A Lyon resolveu isso melhor do que o sistema: cadastrou a
--      retirada como transportadora de verdade, com o próprio CNPJ. O
--      seletor então mostrava as três cadastradas MAIS a opção falsa —
--      duas formas de dizer a mesma coisa, e o operador escolhendo no
--      escuro qual delas o sistema entende.
--
--      Falta uma só coisa para a de verdade bastar: o sistema saber que
--      aquela linha significa retirada. É este campo.
--
--      POR QUE ISSO IMPORTA ALÉM DA TELA. `VENDAS.delivery_mode`
--      (migração 090) é o que lib/atencao.js lê para decidir se o
--      pedido passa por "Em Trânsito". Sem saber que a transportadora
--      escolhida é retirada, todo pedido de balcão voltaria a esperar
--      uma coleta que nunca vem — que era exatamente o defeito que a
--      opção falsa escondia.
-- ============================================================

ALTER TABLE "TRANSPORTADORAS"
  ADD COLUMN IF NOT EXISTS is_pickup BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN "TRANSPORTADORAS".is_pickup IS
  'Marca a linha que representa "o cliente retira no local". Pedido com esta transportadora nasce com delivery_mode = retirada e pula a fase Em Trânsito.';

NOTIFY pgrst, 'reload schema';

INSERT INTO "_MIGRATIONS" (version, name) VALUES ('097', 'transportadora_retirada')
ON CONFLICT (version) DO NOTHING;


-- ==========================================================
-- 098_reposicao_fornecedor.sql
-- ==========================================================
-- ============================================================
-- 098. O FORNECEDOR RESPONDE A REPOSIÇÃO PELO LINK.
--
--      Até aqui a reposição era um monólogo: o estoque montava a lista,
--      mandava no WhatsApp e esperava. Quando a mercadoria chegava,
--      alguém dava baixa da lista INTEIRA — inclusive do que o
--      fornecedor não tinha e nunca mandou. O estoque passava a
--      acreditar em caixas que não existem.
--
--      Estas colunas abrem o outro lado da conversa. O fornecedor
--      recebe um endereço próprio, confirma quem é, diz de cada item o
--      que TEM, anexa a cotação, e o pedido volta com a resposta dele.
--      A baixa passa a ser do que ele confirmou.
--
--      O TOKEN É A CREDENCIAL, e por isso ele não basta sozinho: quem
--      abre o link ainda precisa confirmar CNPJ e telefone que já estão
--      no cadastro. Link vazado sem os dois não mostra nada — e o link
--      vaza fácil, porque vai por WhatsApp e é encaminhável.
-- ============================================================

ALTER TABLE "PEDIDOS_REPOSICAO"
  ADD COLUMN IF NOT EXISTS public_token     TEXT,
  ADD COLUMN IF NOT EXISTS token_expira_em  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS resposta         JSONB,
  ADD COLUMN IF NOT EXISTS respondido_em    TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS cotacao_url      TEXT,
  ADD COLUMN IF NOT EXISTS tentativas       INTEGER NOT NULL DEFAULT 0;

-- Dois pedidos não podem dividir o mesmo endereço. Índice único e não
-- constraint porque a maioria das linhas tem token nulo (pedido que
-- ninguém mandou para fora ainda), e nulo não colide em índice único.
CREATE UNIQUE INDEX IF NOT EXISTS pedidos_reposicao_token_uk
  ON "PEDIDOS_REPOSICAO" (public_token) WHERE public_token IS NOT NULL;

COMMENT ON COLUMN "PEDIDOS_REPOSICAO".public_token IS
  'Credencial do link do fornecedor. Sozinha não abre: exige CNPJ e telefone do cadastro.';
COMMENT ON COLUMN "PEDIDOS_REPOSICAO".resposta IS
  'O que o fornecedor confirmou ter, item a item: [{ product_id, nome, pedido, tem }]. A baixa no estoque usa `tem`, e não `pedido`.';
COMMENT ON COLUMN "PEDIDOS_REPOSICAO".tentativas IS
  'Erros de CNPJ/telefone no link. Serve para travar a força bruta sobre um token que anda por WhatsApp.';

-- `status` ganha um valor a mais: 'respondido'. A régua completa é
-- pending → respondido → completed. Sem constraint no banco de
-- propósito: os status vivem no código (routes/stock.js), e duplicar a
-- lista aqui é a segunda verdade que amanhã discorda da primeira.

NOTIFY pgrst, 'reload schema';

INSERT INTO "_MIGRATIONS" (version, name) VALUES ('098', 'reposicao_fornecedor')
ON CONFLICT (version) DO NOTHING;


-- ============================================================
-- 099_itens_e_adicionais.sql
-- ============================================================
-- ============================================================
-- 099. O CADASTRO DE ITENS — e o preço saindo de um lugar só.
--
-- O PROBLEMA QUE ISTO RESOLVE. O custo de um copo estava espalhado:
-- matéria-prima no cadastro do produto, tinta e tela na Engenharia de
-- Custos, rateio numa terceira tela, e o que a Lyon COBRA por um canudo
-- não estava em lugar nenhum — ninguém cobrava porque ninguém sabia.
-- Formar preço exigia abrir quatro telas e somar de cabeça.
--
-- A REGRA NOVA É UMA SÓ: tudo que entra num copo é um ITEM, e todo item
-- tem DOIS valores — o que NÓS GASTAMOS e o que NÓS COBRAMOS. O lucro
-- de cada peça deixa de ser conta de planilha e vira subtração.
--
-- POR QUE UMA TABELA E NÃO QUATRO. Canudo, tampa, borda metalizada e
-- tinta são a mesma pergunta com respostas diferentes: "o que isto
-- acrescenta na peça, e quanto custa e cobra". Quatro tabelas seriam
-- quatro CRUDs, quatro telas e quatro lugares para a regra de preço
-- divergir. `kind` separa o que precisa ser separado — e é uma coluna,
-- não um schema.
--
-- A UNIDADE É QUEM FAZ A CONTA FECHAR. Canudo é 'un' e consumo 1: um
-- canudo por copo. Tinta é 'ml' e consumo 5: cinco mililitros por copo.
-- A conta é a MESMA nos dois — `unitario × consumo` —, e é por isso que
-- "R$ 0,15 o ml, gasta 5 ml, entra R$ 0,75" não precisa de código
-- especial para tinta.
-- ============================================================

CREATE TABLE IF NOT EXISTS "ITENS" (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL REFERENCES "EMPRESAS"(id) ON DELETE CASCADE,

  -- O QUE É. Separa o que a tela precisa separar, sem separar o banco.
  --   acessorio  canudo, tampa, alça, tag
  --   borda      as metalizadas (cada cor é um item, com sua foto)
  --   tinta      medida em ml, com consumo por peça
  --   embalagem  caixa, sacola, plástico
  --   outro      o que aparecer amanhã e não cabe acima
  kind          VARCHAR(20)  NOT NULL DEFAULT 'acessorio',
  name          VARCHAR(160) NOT NULL,

  -- A COR É DO ITEM, não um campo solto. "Canudo" não se compra: o que
  -- se compra é "Canudo Preto". Cada cor tem preço e foto próprios, e é
  -- por isso que ela mora aqui e não numa lista à parte.
  color_name    VARCHAR(80),
  color_hex     VARCHAR(9),
  photo_url     TEXT,

  -- ── O QUE NÓS GASTAMOS ────────────────────────────────────
  -- Compra-se em embalagem (pote de 900 ml por R$ 180) e gasta-se em
  -- unidade base (ml). Guardar os dois lados evita a conta de cabeça
  -- que ninguém refaz quando o fornecedor reajusta.
  base_unit     VARCHAR(12)   NOT NULL DEFAULT 'un',  -- un | ml | g | m | folha
  package_qty   NUMERIC(15,4),                        -- 900
  package_cost  NUMERIC(15,4),                        -- 180,00
  unit_cost     NUMERIC(15,6) NOT NULL DEFAULT 0,     -- 0,20 por ml

  -- ── O QUE NÓS COBRAMOS ────────────────────────────────────
  -- O outro lado da moeda, e o que faltava no sistema inteiro.
  unit_price    NUMERIC(15,6) NOT NULL DEFAULT 0,

  -- QUANTO ENTRA EM CADA PEÇA. 1 canudo; 5 ml de tinta.
  consumo       NUMERIC(15,6) NOT NULL DEFAULT 1,

  supplier_id   UUID REFERENCES "FORNECEDORES"(id) ON DELETE SET NULL,
  notes         TEXT,
  is_active     BOOLEAN NOT NULL DEFAULT true,
  seq           INTEGER NOT NULL DEFAULT 0,

  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Mesmo nome + mesma cor + mesmo tipo é o mesmo item. A trava existe
  -- para a importação em massa poder rodar duas vezes sem duplicar.
  CONSTRAINT itens_unico UNIQUE (tenant_id, kind, name, color_name)
);

CREATE INDEX IF NOT EXISTS itens_tenant_kind_idx ON "ITENS" (tenant_id, kind) WHERE is_active;

ALTER TABLE "ITENS" ENABLE ROW LEVEL SECURITY;


-- ============================================================
-- ONDE CADA ITEM SE APLICA.
--
-- É ISTO QUE DÁ A EDIÇÃO EM MASSA. Uma linha com `category_id` liga o
-- item a uma categoria inteira — "todo Long Drink pode levar canudo" é
-- UMA linha, não vinte e quatro. Uma linha com `product_id` é a
-- exceção: aquele copo específico.
--
-- E `category_id` NULO com `product_id` NULO é o curinga: vale para
-- todo produto do catálogo personalizado. É como se liga um adicional
-- em tudo de uma vez.
--
-- `padrao` SEPARA O QUE JÁ ESTÁ NO PREÇO do que é opcional:
--   true   entra sempre — a tinta da serigrafia, que todo personalizado
--          gasta, e cujo custo já compõe o preço de tabela
--   false  o cliente escolhe — canudo, tampa. Só entra na conta do
--          pedido quando marcado, e é o que faz o preço subir na hora
--          da compra em vez de subir para todo mundo.
-- ============================================================

CREATE TABLE IF NOT EXISTS "ITEM_APLICACOES" (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL REFERENCES "EMPRESAS"(id) ON DELETE CASCADE,
  item_id     UUID NOT NULL REFERENCES "ITENS"(id) ON DELETE CASCADE,

  category_id UUID,   -- vale para a categoria inteira
  product_id  UUID,   -- ou só para este produto
  -- os dois nulos = vale para todo produto do catálogo personalizado

  padrao      BOOLEAN NOT NULL DEFAULT false,
  -- Sobrescreve o consumo do item neste contexto (a caneca gasta mais
  -- tinta que o long drink). Nulo = usa o consumo do próprio item.
  consumo     NUMERIC(15,6),

  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- O mesmo item não se aplica duas vezes ao mesmo alvo. NULLS NOT
  -- DISTINCT porque o curinga (os dois nulos) também é um alvo, e sem
  -- isso ele entraria repetido toda vez que alguém clicasse.
  CONSTRAINT item_aplicacao_unica UNIQUE NULLS NOT DISTINCT (tenant_id, item_id, category_id, product_id)
);

CREATE INDEX IF NOT EXISTS item_aplic_categoria_idx ON "ITEM_APLICACOES" (tenant_id, category_id);
CREATE INDEX IF NOT EXISTS item_aplic_produto_idx   ON "ITEM_APLICACOES" (tenant_id, product_id);

ALTER TABLE "ITEM_APLICACOES" ENABLE ROW LEVEL SECURITY;


-- ── O QUE O CLIENTE ESCOLHEU, gravado no item do pedido ──────
-- Sem isto o pedido saberia o preço mas não o porquê: "R$ 6,80" sem
-- dizer que R$ 0,50 era o canudo preto. Na hora da produção e da
-- conferência, é o porquê que importa.
ALTER TABLE "VENDA_ITENS"
  ADD COLUMN IF NOT EXISTS adicionais JSONB NOT NULL DEFAULT '[]'::jsonb;

NOTIFY pgrst, 'reload schema';

INSERT INTO "_MIGRATIONS" (version, name) VALUES ('099', 'itens_e_adicionais')
ON CONFLICT (version) DO NOTHING;
