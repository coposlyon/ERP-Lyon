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
