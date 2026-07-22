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
