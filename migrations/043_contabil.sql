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
