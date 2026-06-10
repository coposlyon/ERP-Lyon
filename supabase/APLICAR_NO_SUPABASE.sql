-- =================================================================
-- DATOR ERP v2.0 - Script completo de instalação
-- Tabelas em PORTUGUÊS / MAIÚSCULO
-- Cole este arquivo inteiro no SQL Editor do Supabase e execute.
-- =================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "unaccent";

-- =================================================================
-- 1. TABELAS PRINCIPAIS
-- =================================================================

-- Empresas (multi-tenant)
CREATE TABLE IF NOT EXISTS "EMPRESAS" (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  app_name VARCHAR(100) DEFAULT 'Dator ERP',
  cnpj VARCHAR(18) UNIQUE,
  logo_url TEXT,
  address JSONB DEFAULT '{}',
  phone VARCHAR(20),
  email VARCHAR(255),
  plan VARCHAR(50) DEFAULT 'basic',
  is_active BOOLEAN DEFAULT true,
  settings JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Usuários
CREATE TABLE IF NOT EXISTS "USUARIOS" (
  id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  tenant_id UUID REFERENCES "EMPRESAS"(id) ON DELETE CASCADE NOT NULL,
  name VARCHAR(255) NOT NULL,
  email VARCHAR(255) NOT NULL,
  role VARCHAR(50) DEFAULT 'operator' CHECK (role IN ('admin', 'manager', 'operator')),
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Categorias
CREATE TABLE IF NOT EXISTS "CATEGORIAS" (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID REFERENCES "EMPRESAS"(id) ON DELETE CASCADE NOT NULL,
  name VARCHAR(100) NOT NULL,
  parent_id UUID REFERENCES "CATEGORIAS"(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Produtos
CREATE TABLE IF NOT EXISTS "PRODUTOS" (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID REFERENCES "EMPRESAS"(id) ON DELETE CASCADE NOT NULL,
  code VARCHAR(50),
  ean VARCHAR(14),
  name VARCHAR(255) NOT NULL,
  description TEXT,
  category_id UUID REFERENCES "CATEGORIAS"(id),
  unit VARCHAR(10) DEFAULT 'UN',
  cost_price DECIMAL(15,4) DEFAULT 0,
  sale_price DECIMAL(15,4) DEFAULT 0,
  min_stock DECIMAL(15,4) DEFAULT 0,
  current_stock DECIMAL(15,4) DEFAULT 0,
  ncm VARCHAR(8),
  cst VARCHAR(3),
  cfop VARCHAR(4),
  csosn VARCHAR(4),
  pis_cst VARCHAR(2),
  cofins_cst VARCHAR(2),
  photos JSONB DEFAULT '[]',
  is_active BOOLEAN DEFAULT true,
  customizable BOOLEAN DEFAULT false,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_produtos_tenant ON "PRODUTOS"(tenant_id);

CREATE INDEX IF NOT EXISTS idx_produtos_name ON "PRODUTOS" USING gin(to_tsvector('portuguese', name));

-- Clientes
CREATE TABLE IF NOT EXISTS "CLIENTES" (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID REFERENCES "EMPRESAS"(id) ON DELETE CASCADE NOT NULL,
  type VARCHAR(10) DEFAULT 'PF' CHECK (type IN ('PF', 'PJ')),
  name VARCHAR(255) NOT NULL,
  cpf_cnpj VARCHAR(18),
  rg_ie VARCHAR(20),
  email VARCHAR(255),
  phone VARCHAR(20),
  mobile VARCHAR(20),
  address JSONB DEFAULT '{}',
  notes TEXT,
  credit_limit DECIMAL(15,2) DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_clientes_tenant ON "CLIENTES"(tenant_id);

-- Fornecedores
CREATE TABLE IF NOT EXISTS "FORNECEDORES" (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID REFERENCES "EMPRESAS"(id) ON DELETE CASCADE NOT NULL,
  name VARCHAR(255) NOT NULL,
  cnpj VARCHAR(18),
  ie VARCHAR(20),
  email VARCHAR(255),
  phone VARCHAR(20),
  contact_name VARCHAR(255),
  address JSONB DEFAULT '{}',
  notes TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Tabelas de Preço
CREATE TABLE IF NOT EXISTS "TABELAS_PRECO" (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID REFERENCES "EMPRESAS"(id) ON DELETE CASCADE NOT NULL,
  name VARCHAR(100) NOT NULL,
  discount_percent DECIMAL(5,2) DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Vendas
CREATE TABLE IF NOT EXISTS "VENDAS" (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID REFERENCES "EMPRESAS"(id) ON DELETE CASCADE NOT NULL,
  number INTEGER NOT NULL,
  type VARCHAR(20) DEFAULT 'sale' CHECK (type IN ('sale', 'quote', 'order', 'return')),
  customer_id UUID REFERENCES "CLIENTES"(id),
  user_id UUID REFERENCES "USUARIOS"(id),
  status VARCHAR(30) DEFAULT 'confirmed'
    CHECK (status IN ('open', 'confirmed', 'in_production', 'ready', 'delivered', 'cancelled')),
  subtotal DECIMAL(15,2) DEFAULT 0,
  discount DECIMAL(15,2) DEFAULT 0,
  total DECIMAL(15,2) DEFAULT 0,
  notes TEXT,
  artwork_url TEXT,
  artwork_notes TEXT,
  delivery_date DATE,
  payment_method VARCHAR(50),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_vendas_tenant ON "VENDAS"(tenant_id);
CREATE INDEX IF NOT EXISTS idx_vendas_status ON "VENDAS"(status);
CREATE INDEX IF NOT EXISTS idx_vendas_created ON "VENDAS"(created_at DESC);

-- Itens de Venda
CREATE TABLE IF NOT EXISTS "VENDA_ITENS" (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  sale_id UUID REFERENCES "VENDAS"(id) ON DELETE CASCADE NOT NULL,
  product_id UUID REFERENCES "PRODUTOS"(id),
  product_name VARCHAR(255),
  quantity DECIMAL(15,4) NOT NULL,
  unit_price DECIMAL(15,4) NOT NULL,
  discount DECIMAL(15,2) DEFAULT 0,
  total DECIMAL(15,2) NOT NULL,
  customization JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Compras
CREATE TABLE IF NOT EXISTS "COMPRAS" (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID REFERENCES "EMPRESAS"(id) ON DELETE CASCADE NOT NULL,
  number INTEGER NOT NULL,
  supplier_id UUID REFERENCES "FORNECEDORES"(id),
  user_id UUID REFERENCES "USUARIOS"(id),
  status VARCHAR(30) DEFAULT 'received'
    CHECK (status IN ('pending', 'partial', 'received', 'cancelled')),
  subtotal DECIMAL(15,2) DEFAULT 0,
  discount DECIMAL(15,2) DEFAULT 0,
  total DECIMAL(15,2) DEFAULT 0,
  notes TEXT,
  invoice_number VARCHAR(50),
  invoice_key VARCHAR(44),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Itens de Compra
CREATE TABLE IF NOT EXISTS "COMPRA_ITENS" (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  purchase_id UUID REFERENCES "COMPRAS"(id) ON DELETE CASCADE NOT NULL,
  product_id UUID REFERENCES "PRODUTOS"(id),
  product_name VARCHAR(255),
  quantity DECIMAL(15,4) NOT NULL,
  unit_price DECIMAL(15,4) NOT NULL,
  total DECIMAL(15,2) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Movimentações de Estoque
CREATE TABLE IF NOT EXISTS "MOVIMENTACOES_ESTOQUE" (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID REFERENCES "EMPRESAS"(id) ON DELETE CASCADE NOT NULL,
  product_id UUID REFERENCES "PRODUTOS"(id) NOT NULL,
  type VARCHAR(20) NOT NULL CHECK (type IN ('entry', 'exit', 'adjustment', 'return')),
  quantity DECIMAL(15,4) NOT NULL,
  previous_stock DECIMAL(15,4),
  current_stock DECIMAL(15,4),
  reference_type VARCHAR(30),
  reference_id UUID,
  notes TEXT,
  user_id UUID REFERENCES "USUARIOS"(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_movest_tenant ON "MOVIMENTACOES_ESTOQUE"(tenant_id);
CREATE INDEX IF NOT EXISTS idx_movest_product ON "MOVIMENTACOES_ESTOQUE"(product_id);

-- Contas Financeiras
CREATE TABLE IF NOT EXISTS "CONTAS_FINANCEIRAS" (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID REFERENCES "EMPRESAS"(id) ON DELETE CASCADE NOT NULL,
  name VARCHAR(100) NOT NULL,
  type VARCHAR(20) DEFAULT 'checking' CHECK (type IN ('checking', 'savings', 'cash', 'other')),
  balance DECIMAL(15,2) DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Lançamentos (Contas a Pagar / Receber)
CREATE TABLE IF NOT EXISTS "LANCAMENTOS" (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID REFERENCES "EMPRESAS"(id) ON DELETE CASCADE NOT NULL,
  type VARCHAR(20) NOT NULL CHECK (type IN ('receivable', 'payable')),
  description VARCHAR(255),
  amount DECIMAL(15,2) NOT NULL,
  paid_amount DECIMAL(15,2) DEFAULT 0,
  due_date DATE NOT NULL,
  paid_date DATE,
  status VARCHAR(20) DEFAULT 'pending'
    CHECK (status IN ('pending', 'partial', 'paid', 'overdue', 'cancelled')),
  reference_type VARCHAR(30),
  reference_id UUID,
  customer_id UUID REFERENCES "CLIENTES"(id),
  supplier_id UUID REFERENCES "FORNECEDORES"(id),
  payment_method VARCHAR(50),
  account_id UUID REFERENCES "CONTAS_FINANCEIRAS"(id),
  installment_number INTEGER DEFAULT 1,
  installment_total INTEGER DEFAULT 1,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_lancamentos_tenant ON "LANCAMENTOS"(tenant_id);
CREATE INDEX IF NOT EXISTS idx_lancamentos_vencimento ON "LANCAMENTOS"(due_date);

-- Notas Fiscais (NF-e)
CREATE TABLE IF NOT EXISTS "NOTAS_FISCAIS" (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID REFERENCES "EMPRESAS"(id) ON DELETE CASCADE NOT NULL,
  sale_id UUID REFERENCES "VENDAS"(id),
  number INTEGER,
  series VARCHAR(3) DEFAULT '001',
  key VARCHAR(44) UNIQUE,
  type VARCHAR(10) DEFAULT 'nfe' CHECK (type IN ('nfe', 'nfce', 'nfse')),
  status VARCHAR(20) DEFAULT 'pending'
    CHECK (status IN ('pending', 'processing', 'authorized', 'cancelled', 'error')),
  xml_content TEXT,
  pdf_url TEXT,
  protocol VARCHAR(50),
  issued_at TIMESTAMPTZ,
  authorized_at TIMESTAMPTZ,
  cancel_reason TEXT,
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =================================================================
-- 2. FUNÇÕES E TRIGGERS
-- =================================================================

CREATE OR REPLACE FUNCTION proximo_numero_venda(p_tenant_id UUID)
RETURNS INTEGER AS $$
DECLARE next_num INTEGER;
BEGIN
  SELECT COALESCE(MAX(number), 0) + 1 INTO next_num FROM "VENDAS" WHERE tenant_id = p_tenant_id;
  RETURN next_num;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION proximo_numero_compra(p_tenant_id UUID)
RETURNS INTEGER AS $$
DECLARE next_num INTEGER;
BEGIN
  SELECT COALESCE(MAX(number), 0) + 1 INTO next_num FROM "COMPRAS" WHERE tenant_id = p_tenant_id;
  RETURN next_num;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION atualizar_estoque(
  p_tenant_id UUID,
  p_product_id UUID,
  p_quantity DECIMAL,
  p_type VARCHAR,
  p_reference_type VARCHAR DEFAULT NULL,
  p_reference_id UUID DEFAULT NULL,
  p_user_id UUID DEFAULT NULL,
  p_notes TEXT DEFAULT NULL
) RETURNS VOID AS $$
DECLARE prev_stock DECIMAL; new_stock DECIMAL;
BEGIN
  SELECT current_stock INTO prev_stock FROM "PRODUTOS" WHERE id = p_product_id AND tenant_id = p_tenant_id;
  new_stock := prev_stock + p_quantity;
  UPDATE "PRODUTOS" SET current_stock = new_stock, updated_at = NOW() WHERE id = p_product_id AND tenant_id = p_tenant_id;
  INSERT INTO "MOVIMENTACOES_ESTOQUE" (tenant_id, product_id, type, quantity, previous_stock, current_stock, reference_type, reference_id, user_id, notes)
  VALUES (p_tenant_id, p_product_id, p_type, p_quantity, prev_stock, new_stock, p_reference_type, p_reference_id, p_user_id, p_notes);
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION atualizar_timestamp()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trig_empresas_updated ON "EMPRESAS";
CREATE TRIGGER trig_empresas_updated BEFORE UPDATE ON "EMPRESAS" FOR EACH ROW EXECUTE FUNCTION atualizar_timestamp();

DROP TRIGGER IF EXISTS trig_produtos_updated ON "PRODUTOS";
CREATE TRIGGER trig_produtos_updated BEFORE UPDATE ON "PRODUTOS" FOR EACH ROW EXECUTE FUNCTION atualizar_timestamp();

-- =================================================================
-- 3. ROW LEVEL SECURITY (RLS)
-- =================================================================

ALTER TABLE "EMPRESAS" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "USUARIOS" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CATEGORIAS" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PRODUTOS" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CLIENTES" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "FORNECEDORES" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "VENDAS" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "VENDA_ITENS" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "COMPRAS" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "COMPRA_ITENS" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "MOVIMENTACOES_ESTOQUE" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CONTAS_FINANCEIRAS" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "LANCAMENTOS" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "NOTAS_FISCAIS" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "TABELAS_PRECO" ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION obter_empresa_usuario()
RETURNS UUID AS $$
  SELECT tenant_id FROM "USUARIOS" WHERE id = auth.uid();
$$ LANGUAGE sql STABLE SECURITY DEFINER;

CREATE OR REPLACE FUNCTION obter_perfil_usuario()
RETURNS VARCHAR AS $$
  SELECT role FROM "USUARIOS" WHERE id = auth.uid();
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- EMPRESAS
DROP POLICY IF EXISTS empresas_select ON "EMPRESAS";
CREATE POLICY empresas_select ON "EMPRESAS" FOR SELECT USING (id = obter_empresa_usuario());
DROP POLICY IF EXISTS empresas_update ON "EMPRESAS";
CREATE POLICY empresas_update ON "EMPRESAS" FOR UPDATE USING (id = obter_empresa_usuario() AND obter_perfil_usuario() = 'admin');

-- USUARIOS
DROP POLICY IF EXISTS usuarios_select ON "USUARIOS";
CREATE POLICY usuarios_select ON "USUARIOS" FOR SELECT USING (tenant_id = obter_empresa_usuario());
DROP POLICY IF EXISTS usuarios_insert ON "USUARIOS";
CREATE POLICY usuarios_insert ON "USUARIOS" FOR INSERT WITH CHECK (tenant_id = obter_empresa_usuario());
DROP POLICY IF EXISTS usuarios_update ON "USUARIOS";
CREATE POLICY usuarios_update ON "USUARIOS" FOR UPDATE USING (tenant_id = obter_empresa_usuario());

-- Policies genéricas por tenant
DO $$
DECLARE
  t TEXT;
  tables TEXT[] := ARRAY[
    'CATEGORIAS','PRODUTOS','CLIENTES','FORNECEDORES',
    'VENDAS','COMPRAS','MOVIMENTACOES_ESTOQUE',
    'CONTAS_FINANCEIRAS','LANCAMENTOS','NOTAS_FISCAIS','TABELAS_PRECO'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', t || '_tenant', t);
    EXECUTE format(
      'CREATE POLICY %I ON %I FOR ALL USING (tenant_id = obter_empresa_usuario()) WITH CHECK (tenant_id = obter_empresa_usuario())',
      t || '_tenant', t
    );
  END LOOP;
END;
$$;

-- VENDA_ITENS (herda da venda)
DROP POLICY IF EXISTS venda_itens_tenant ON "VENDA_ITENS";
CREATE POLICY venda_itens_tenant ON "VENDA_ITENS" FOR ALL USING (
  EXISTS (SELECT 1 FROM "VENDAS" v WHERE v.id = "VENDA_ITENS".sale_id AND v.tenant_id = obter_empresa_usuario())
);

-- COMPRA_ITENS (herda da compra)
DROP POLICY IF EXISTS compra_itens_tenant ON "COMPRA_ITENS";
CREATE POLICY compra_itens_tenant ON "COMPRA_ITENS" FOR ALL USING (
  EXISTS (SELECT 1 FROM "COMPRAS" c WHERE c.id = "COMPRA_ITENS".purchase_id AND c.tenant_id = obter_empresa_usuario())
);

-- =================================================================
-- 4. DADOS INICIAIS — LYON COPOS
-- =================================================================

INSERT INTO "EMPRESAS" (id, name, app_name, cnpj, phone, email)
VALUES (
  'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
  'Lyon Copos Personalizados',
  'Lyon ERP',
  '00.000.000/0001-00',
  '(44) 99999-9999',
  'contato@lyoncopos.com.br'
) ON CONFLICT DO NOTHING;

-- Categorias padrão
INSERT INTO "CATEGORIAS" (tenant_id, name) VALUES
  ('a1b2c3d4-e5f6-7890-abcd-ef1234567890', 'Copos Personalizados'),
  ('a1b2c3d4-e5f6-7890-abcd-ef1234567890', 'Canecas'),
  ('a1b2c3d4-e5f6-7890-abcd-ef1234567890', 'Garrafas'),
  ('a1b2c3d4-e5f6-7890-abcd-ef1234567890', 'Embalagens'),
  ('a1b2c3d4-e5f6-7890-abcd-ef1234567890', 'Acessórios')
ON CONFLICT DO NOTHING;

-- Conta financeira padrão
INSERT INTO "CONTAS_FINANCEIRAS" (tenant_id, name, type)
VALUES ('a1b2c3d4-e5f6-7890-abcd-ef1234567890', 'Caixa Principal', 'cash')
ON CONFLICT DO NOTHING;

-- =================================================================
-- PASSO FINAL: Crie o usuário em Authentication > Users, depois execute:
--
-- INSERT INTO "USUARIOS" (id, tenant_id, name, email, role)
-- VALUES (
--   'UUID-DO-USUARIO-CRIADO-NO-AUTH',
--   'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
--   'Administrador',
--   'admin@lyoncopos.com.br',
--   'admin'
-- );
-- =================================================================
