-- =================================================================
-- DATOR ERP v2.1 - Script de Melhorias
-- Cole no SQL Editor do Supabase e execute.
-- =================================================================

-- ─── ORÇAMENTOS ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "ORCAMENTOS" (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID REFERENCES "EMPRESAS"(id) ON DELETE CASCADE NOT NULL,
  number INTEGER NOT NULL,
  customer_id UUID REFERENCES "CLIENTES"(id),
  user_id UUID REFERENCES "USUARIOS"(id),
  status VARCHAR(30) DEFAULT 'open'
    CHECK (status IN ('open','sent','approved','rejected','expired','converted')),
  subtotal DECIMAL(15,2) DEFAULT 0,
  discount DECIMAL(15,2) DEFAULT 0,
  total DECIMAL(15,2) DEFAULT 0,
  notes TEXT,
  valid_until DATE,
  artwork_notes TEXT,
  payment_method VARCHAR(50),
  delivery_days INTEGER DEFAULT 10,
  converted_sale_id UUID REFERENCES "VENDAS"(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_orcamentos_tenant ON "ORCAMENTOS"(tenant_id);
CREATE INDEX IF NOT EXISTS idx_orcamentos_status ON "ORCAMENTOS"(status);

CREATE TABLE IF NOT EXISTS "ORCAMENTO_ITENS" (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  quote_id UUID REFERENCES "ORCAMENTOS"(id) ON DELETE CASCADE NOT NULL,
  product_id UUID REFERENCES "PRODUTOS"(id),
  product_name VARCHAR(255) NOT NULL,
  quantity DECIMAL(15,4) NOT NULL DEFAULT 1,
  unit_price DECIMAL(15,4) NOT NULL DEFAULT 0,
  discount DECIMAL(15,2) DEFAULT 0,
  total DECIMAL(15,2) NOT NULL DEFAULT 0,
  customization JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Sequence para número do orçamento
CREATE SEQUENCE IF NOT EXISTS seq_numero_orcamento START 1;

CREATE OR REPLACE FUNCTION proximo_numero_orcamento(p_tenant_id UUID)
RETURNS INTEGER LANGUAGE plpgsql AS $$
DECLARE v_next INTEGER;
BEGIN
  SELECT COALESCE(MAX(number), 0) + 1 INTO v_next FROM "ORCAMENTOS" WHERE tenant_id = p_tenant_id;
  RETURN v_next;
END;
$$;

-- ─── PLANO DE CONTAS ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "PLANO_CONTAS" (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID REFERENCES "EMPRESAS"(id) ON DELETE CASCADE NOT NULL,
  code VARCHAR(20) NOT NULL,
  name VARCHAR(150) NOT NULL,
  type VARCHAR(10) NOT NULL CHECK (type IN ('receita','despesa','ativo','passivo','patrimonio')),
  parent_id UUID REFERENCES "PLANO_CONTAS"(id),
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_plano_contas_tenant ON "PLANO_CONTAS"(tenant_id);

-- ─── CENTROS DE CUSTO ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "CENTROS_CUSTO" (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID REFERENCES "EMPRESAS"(id) ON DELETE CASCADE NOT NULL,
  code VARCHAR(20),
  name VARCHAR(150) NOT NULL,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ─── CONTAS BANCÁRIAS ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "CONTAS_BANCARIAS" (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID REFERENCES "EMPRESAS"(id) ON DELETE CASCADE NOT NULL,
  name VARCHAR(100) NOT NULL,
  bank_name VARCHAR(100),
  bank_code VARCHAR(10),
  agency VARCHAR(20),
  account VARCHAR(30),
  type VARCHAR(20) DEFAULT 'checking' CHECK (type IN ('checking','savings','cash','investment')),
  balance DECIMAL(15,2) DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ─── TABELA DE PREÇO — ITENS ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS "TABELA_PRECO_ITENS" (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  price_table_id UUID REFERENCES "TABELAS_PRECO"(id) ON DELETE CASCADE NOT NULL,
  product_id UUID REFERENCES "PRODUTOS"(id) ON DELETE CASCADE NOT NULL,
  price DECIMAL(15,4) NOT NULL,
  min_qty DECIMAL(15,4) DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(price_table_id, product_id)
);

-- ─── VARIANTES DE PRODUTO ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "VARIANTES_PRODUTO" (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID REFERENCES "EMPRESAS"(id) ON DELETE CASCADE NOT NULL,
  product_id UUID REFERENCES "PRODUTOS"(id) ON DELETE CASCADE NOT NULL,
  name VARCHAR(100) NOT NULL,
  type VARCHAR(30) DEFAULT 'color' CHECK (type IN ('color','size','material','custom')),
  value VARCHAR(100) NOT NULL,
  extra_price DECIMAL(15,4) DEFAULT 0,
  stock DECIMAL(15,4) DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_variantes_produto ON "VARIANTES_PRODUTO"(product_id);

-- ─── PERSONALIZAÇÕES (Workflow de pedidos) ────────────────────────
CREATE TABLE IF NOT EXISTS "PERSONALIZACOES" (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID REFERENCES "EMPRESAS"(id) ON DELETE CASCADE NOT NULL,
  sale_id UUID REFERENCES "VENDAS"(id),
  customer_id UUID REFERENCES "CLIENTES"(id),
  title VARCHAR(255) NOT NULL,
  status VARCHAR(30) DEFAULT 'briefing'
    CHECK (status IN ('briefing','design','approval','printing','finishing','ready','delivered','cancelled')),
  priority VARCHAR(10) DEFAULT 'normal' CHECK (priority IN ('low','normal','high','urgent')),
  deadline DATE,
  artwork_url TEXT,
  artwork_notes TEXT,
  customer_notes TEXT,
  internal_notes TEXT,
  assigned_to UUID REFERENCES "USUARIOS"(id),
  approved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_personalizacoes_tenant ON "PERSONALIZACOES"(tenant_id);
CREATE INDEX IF NOT EXISTS idx_personalizacoes_status ON "PERSONALIZACOES"(status);

CREATE TABLE IF NOT EXISTS "PERSONALIZACAO_HISTORICO" (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  customization_id UUID REFERENCES "PERSONALIZACOES"(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES "USUARIOS"(id),
  from_status VARCHAR(30),
  to_status VARCHAR(30),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ─── Adicionar campos ao LANCAMENTOS (se não existirem) ───────────
ALTER TABLE "LANCAMENTOS" ADD COLUMN IF NOT EXISTS account_id UUID REFERENCES "CONTAS_BANCARIAS"(id);
ALTER TABLE "LANCAMENTOS" ADD COLUMN IF NOT EXISTS cost_center_id UUID REFERENCES "CENTROS_CUSTO"(id);
ALTER TABLE "LANCAMENTOS" ADD COLUMN IF NOT EXISTS chart_account_id UUID REFERENCES "PLANO_CONTAS"(id);
ALTER TABLE "LANCAMENTOS" ADD COLUMN IF NOT EXISTS installment INTEGER DEFAULT 1;
ALTER TABLE "LANCAMENTOS" ADD COLUMN IF NOT EXISTS total_installments INTEGER DEFAULT 1;
ALTER TABLE "LANCAMENTOS" ADD COLUMN IF NOT EXISTS document_number VARCHAR(50);
ALTER TABLE "LANCAMENTOS" ADD COLUMN IF NOT EXISTS recurrence VARCHAR(20) CHECK (recurrence IN ('none','weekly','monthly','yearly'));

-- ─── RLS POLICIES para novas tabelas ─────────────────────────────
ALTER TABLE "ORCAMENTOS" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "orcamentos_tenant" ON "ORCAMENTOS";
CREATE POLICY "orcamentos_tenant" ON "ORCAMENTOS" USING (tenant_id = obter_empresa_usuario());

ALTER TABLE "ORCAMENTO_ITENS" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "orcamento_itens_tenant" ON "ORCAMENTO_ITENS";
CREATE POLICY "orcamento_itens_tenant" ON "ORCAMENTO_ITENS"
  USING (quote_id IN (SELECT id FROM "ORCAMENTOS" WHERE tenant_id = obter_empresa_usuario()));

ALTER TABLE "PLANO_CONTAS" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "plano_contas_tenant" ON "PLANO_CONTAS";
CREATE POLICY "plano_contas_tenant" ON "PLANO_CONTAS" USING (tenant_id = obter_empresa_usuario());

ALTER TABLE "CENTROS_CUSTO" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "centros_custo_tenant" ON "CENTROS_CUSTO";
CREATE POLICY "centros_custo_tenant" ON "CENTROS_CUSTO" USING (tenant_id = obter_empresa_usuario());

ALTER TABLE "CONTAS_BANCARIAS" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "contas_bancarias_tenant" ON "CONTAS_BANCARIAS";
CREATE POLICY "contas_bancarias_tenant" ON "CONTAS_BANCARIAS" USING (tenant_id = obter_empresa_usuario());

ALTER TABLE "VARIANTES_PRODUTO" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "variantes_produto_tenant" ON "VARIANTES_PRODUTO";
CREATE POLICY "variantes_produto_tenant" ON "VARIANTES_PRODUTO" USING (tenant_id = obter_empresa_usuario());

ALTER TABLE "PERSONALIZACOES" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "personalizacoes_tenant" ON "PERSONALIZACOES";
CREATE POLICY "personalizacoes_tenant" ON "PERSONALIZACOES" USING (tenant_id = obter_empresa_usuario());

-- ─── SEED: Plano de Contas padrão Lyon ───────────────────────────
DO $$
DECLARE v_tid UUID := 'a1b2c3d4-e5f6-7890-abcd-ef1234567890'::UUID;
BEGIN
  IF (SELECT COUNT(*) FROM "PLANO_CONTAS" WHERE tenant_id = v_tid) = 0 THEN
    INSERT INTO "PLANO_CONTAS" (tenant_id, code, name, type) VALUES
      (v_tid, '1', 'RECEITAS', 'receita'),
      (v_tid, '1.1', 'Vendas de Produtos', 'receita'),
      (v_tid, '1.2', 'Serviços de Personalização', 'receita'),
      (v_tid, '1.3', 'Outras Receitas', 'receita'),
      (v_tid, '2', 'DESPESAS OPERACIONAIS', 'despesa'),
      (v_tid, '2.1', 'Fornecedores / Mercadorias', 'despesa'),
      (v_tid, '2.2', 'Folha de Pagamento', 'despesa'),
      (v_tid, '2.3', 'Aluguel e Condomínio', 'despesa'),
      (v_tid, '2.4', 'Energia e Água', 'despesa'),
      (v_tid, '2.5', 'Marketing e Publicidade', 'despesa'),
      (v_tid, '2.6', 'Embalagens e Material', 'despesa'),
      (v_tid, '2.7', 'Frete e Logística', 'despesa'),
      (v_tid, '2.8', 'Impostos e Taxas', 'despesa'),
      (v_tid, '2.9', 'Despesas Diversas', 'despesa');

    INSERT INTO "CENTROS_CUSTO" (tenant_id, code, name) VALUES
      (v_tid, 'ADM', 'Administrativo'),
      (v_tid, 'PROD', 'Produção'),
      (v_tid, 'VEN', 'Vendas'),
      (v_tid, 'LOG', 'Logística');

    INSERT INTO "CONTAS_BANCARIAS" (tenant_id, name, type, balance) VALUES
      (v_tid, 'Caixa', 'cash', 0),
      (v_tid, 'Conta Corrente', 'checking', 0);
  END IF;
END;
$$;
