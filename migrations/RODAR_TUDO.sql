-- ==============================================================
-- RODAR TUDO - cole no Supabase SQL Editor e RUN. Idempotente.
-- ==============================================================

-- >>>>>>>>>>>>>>>>>>>> 000_controle.sql <<<<<<<<<<<<<<<<<<<<
-- Tabela de controle de migrações — rode este arquivo primeiro (uma vez).
CREATE TABLE IF NOT EXISTS "_MIGRATIONS" (
  version    TEXT PRIMARY KEY,
  name       TEXT,
  applied_at TIMESTAMPTZ DEFAULT now()
);

-- >>>>>>>>>>>>>>>>>>>> 001_clientes_produtos.sql <<<<<<<<<<<<<<<<<<<<
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

-- >>>>>>>>>>>>>>>>>>>> 002_rh_completo.sql <<<<<<<<<<<<<<<<<<<<
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

-- >>>>>>>>>>>>>>>>>>>> 003_permissoes.sql <<<<<<<<<<<<<<<<<<<<
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

-- >>>>>>>>>>>>>>>>>>>> 004_venda_transacional.sql <<<<<<<<<<<<<<<<<<<<
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

-- >>>>>>>>>>>>>>>>>>>> 005_auditoria.sql <<<<<<<<<<<<<<<<<<<<
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

-- >>>>>>>>>>>>>>>>>>>> 006_fiscal_nfe.sql <<<<<<<<<<<<<<<<<<<<
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

-- >>>>>>>>>>>>>>>>>>>> 007_venda_a_prazo.sql <<<<<<<<<<<<<<<<<<<<
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

-- >>>>>>>>>>>>>>>>>>>> 008_feriados.sql <<<<<<<<<<<<<<<<<<<<
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

-- >>>>>>>>>>>>>>>>>>>> 009_design_3d.sql <<<<<<<<<<<<<<<<<<<<
-- ============================================================
-- 009. ESTÚDIO 3D — guarda a configuração do design no produto
--      personalizado (modelo, cores por parte, acabamento, logo).
-- ============================================================
ALTER TABLE "PERSONALIZACOES"
  ADD COLUMN IF NOT EXISTS design_3d   JSONB,
  ADD COLUMN IF NOT EXISTS preview_url TEXT;

INSERT INTO "_MIGRATIONS" (version, name) VALUES ('009', 'design_3d')
ON CONFLICT (version) DO NOTHING;

-- >>>>>>>>>>>>>>>>>>>> 010_compra_transacional.sql <<<<<<<<<<<<<<<<<<<<
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

-- >>>>>>>>>>>>>>>>>>>> 011_rls.sql <<<<<<<<<<<<<<<<<<<<
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

-- >>>>>>>>>>>>>>>>>>>> 012_metas.sql <<<<<<<<<<<<<<<<<<<<
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

-- >>>>>>>>>>>>>>>>>>>> 013_folha_kind.sql <<<<<<<<<<<<<<<<<<<<
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

-- >>>>>>>>>>>>>>>>>>>> 014_pix.sql <<<<<<<<<<<<<<<<<<<<
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

-- >>>>>>>>>>>>>>>>>>>> 015_clientes_busca_digitos.sql <<<<<<<<<<<<<<<<<<<<
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

-- >>>>>>>>>>>>>>>>>>>> 016_produto_qtd_minima.sql <<<<<<<<<<<<<<<<<<<<
-- ============================================================
-- 016. Quantidade mínima de pedido por produto (usada na loja)
-- ============================================================
ALTER TABLE "PRODUTOS"
  ADD COLUMN IF NOT EXISTS min_order_qty INT DEFAULT 1;

UPDATE "PRODUTOS" SET min_order_qty = 1 WHERE min_order_qty IS NULL;

INSERT INTO "_MIGRATIONS" (version, name) VALUES ('016', 'produto_qtd_minima')
ON CONFLICT (version) DO NOTHING;

-- >>>>>>>>>>>>>>>>>>>> 017_preco_por_impressao.sql <<<<<<<<<<<<<<<<<<<<
-- ============================================================
-- 017. Preço por tipo de impressão (Serigrafia / Transfer / DTF)
-- ============================================================
ALTER TABLE "PRODUTOS"
  ADD COLUMN IF NOT EXISTS print_pricing JSONB DEFAULT '{}'::jsonb;

INSERT INTO "_MIGRATIONS" (version, name) VALUES ('017', 'preco_por_impressao')
ON CONFLICT (version) DO NOTHING;

-- >>>>>>>>>>>>>>>>>>>> 018_marketing.sql <<<<<<<<<<<<<<<<<<<<
-- ============================================================
-- 018. Marketing — histórico de campanhas (WhatsApp/Facebook/Instagram)
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

-- >>>>>>>>>>>>>>>>>>>> 019_producao.sql <<<<<<<<<<<<<<<<<<<<
-- ============================================================
-- 019. Produção (PCP) — etapas Revelação / Produção / Embalagem
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

-- >>>>>>>>>>>>>>>>>>>> 020_perdas_frete.sql <<<<<<<<<<<<<<<<<<<<
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

-- >>>>>>>>>>>>>>>>>>>> 021_loja_grupo_min.sql <<<<<<<<<<<<<<<<<<<<
-- ============================================================
-- 021. Loja: agrupar copos por modelo + pedido mínimo 10
-- ============================================================
ALTER TABLE "PRODUTOS"
  ADD COLUMN IF NOT EXISTS store_group TEXT,
  ADD COLUMN IF NOT EXISTS store_color TEXT;

UPDATE "PRODUTOS"
   SET store_group = NULLIF(TRIM(split_part(name, ' - ', 1)), ''),
       store_color = NULLIF(TRIM(SUBSTRING(name FROM POSITION(' - ' IN name) + 3)), '')
 WHERE (store_group IS NULL OR store_group = '')
   AND name LIKE '% - %';

ALTER TABLE "PRODUTOS" ALTER COLUMN min_order_qty SET DEFAULT 10;
UPDATE "PRODUTOS" SET min_order_qty = 10 WHERE min_order_qty IS NULL OR min_order_qty <= 1;

INSERT INTO "_MIGRATIONS" (version, name) VALUES ('021', 'loja_grupo_min')
ON CONFLICT (version) DO NOTHING;


-- >>>>>>>>>>>>>>>>>>>> 023_nascimento_ie_fornecedor.sql <<<<<<<<<<<<<<<<<<<<
ALTER TABLE "CLIENTES"     ADD COLUMN IF NOT EXISTS birth_date DATE;
ALTER TABLE "FORNECEDORES" ADD COLUMN IF NOT EXISTS ie TEXT;
INSERT INTO "_MIGRATIONS" (version, name) VALUES ('023', 'nascimento_ie_fornecedor')
ON CONFLICT (version) DO NOTHING;


-- >>>>>>>>>>>>>>>>>>>> 024_producao_datas_fotos.sql <<<<<<<<<<<<<<<<<<<<
ALTER TABLE "VENDAS"     ADD COLUMN IF NOT EXISTS max_delivery_date DATE;
ALTER TABLE "VENDAS"     ADD COLUMN IF NOT EXISTS production_photos JSONB DEFAULT '[]'::jsonb;
ALTER TABLE "ORCAMENTOS" ADD COLUMN IF NOT EXISTS event_date        DATE;
ALTER TABLE "ORCAMENTOS" ADD COLUMN IF NOT EXISTS max_delivery_date DATE;
INSERT INTO "_MIGRATIONS" (version, name) VALUES ('024', 'producao_datas_fotos')
ON CONFLICT (version) DO NOTHING;


-- >>>>>>>>>>>>>>>>>>>> 025_clientes_timestamps.sql <<<<<<<<<<<<<<<<<<<<
ALTER TABLE "CLIENTES" ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT now();
ALTER TABLE "CLIENTES" ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();
INSERT INTO "_MIGRATIONS" (version, name) VALUES ('025', 'clientes_timestamps')
ON CONFLICT (version) DO NOTHING;


-- >>>>>>>>>>>>>>>>>>>> 026_cliente_perfil.sql <<<<<<<<<<<<<<<<<<<<
ALTER TABLE "CLIENTES" ADD COLUMN IF NOT EXISTS avatar_url      TEXT;
ALTER TABLE "CLIENTES" ADD COLUMN IF NOT EXISTS profile_history JSONB DEFAULT '[]'::jsonb;
INSERT INTO "_MIGRATIONS" (version, name) VALUES ('026', 'cliente_perfil')
ON CONFLICT (version) DO NOTHING;


-- >>>>>>>>>>>>>>>>>>>> 027_produto_variations.sql <<<<<<<<<<<<<<<<<<<<
ALTER TABLE "PRODUTOS" ADD COLUMN IF NOT EXISTS variations JSONB DEFAULT '{}'::jsonb;
INSERT INTO "_MIGRATIONS" (version, name) VALUES ('027', 'produto_variations')
ON CONFLICT (version) DO NOTHING;


-- >>>>>>>>>>>>>>>>>>>> 028_categorias_dedupe.sql <<<<<<<<<<<<<<<<<<<<
WITH dup AS (SELECT id, first_value(id) OVER (PARTITION BY tenant_id, upper(trim(name)) ORDER BY id) AS keep_id FROM "CATEGORIAS")
UPDATE "PRODUTOS" p SET category_id = d.keep_id FROM dup d WHERE p.category_id = d.id AND d.id <> d.keep_id;
WITH dup AS (SELECT id, first_value(id) OVER (PARTITION BY tenant_id, upper(trim(name)) ORDER BY id) AS keep_id FROM "CATEGORIAS")
DELETE FROM "CATEGORIAS" c USING dup d WHERE c.id = d.id AND d.id <> d.keep_id;
CREATE UNIQUE INDEX IF NOT EXISTS categorias_tenant_name_uq ON "CATEGORIAS" (tenant_id, upper(trim(name)));
INSERT INTO "_MIGRATIONS" (version, name) VALUES ('028', 'categorias_dedupe') ON CONFLICT (version) DO NOTHING;
