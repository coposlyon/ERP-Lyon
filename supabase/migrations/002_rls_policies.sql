-- ============================================================
-- ROW LEVEL SECURITY (RLS)
-- Garante isolamento total entre tenants
-- ============================================================

ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE suppliers ENABLE ROW LEVEL SECURITY;
ALTER TABLE sales ENABLE ROW LEVEL SECURITY;
ALTER TABLE sale_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchases ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchase_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE financial_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE price_tables ENABLE ROW LEVEL SECURITY;

-- Helper function: get current user's tenant_id
CREATE OR REPLACE FUNCTION get_user_tenant_id()
RETURNS UUID AS $$
  SELECT tenant_id FROM user_profiles WHERE id = auth.uid();
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- Helper function: get current user's role
CREATE OR REPLACE FUNCTION get_user_role()
RETURNS VARCHAR AS $$
  SELECT role FROM user_profiles WHERE id = auth.uid();
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- TENANTS: user can only see their own tenant
CREATE POLICY tenants_select ON tenants
  FOR SELECT USING (id = get_user_tenant_id());

CREATE POLICY tenants_update ON tenants
  FOR UPDATE USING (id = get_user_tenant_id() AND get_user_role() = 'admin');

-- USER_PROFILES: users can see profiles of their tenant
CREATE POLICY user_profiles_select ON user_profiles
  FOR SELECT USING (tenant_id = get_user_tenant_id());

CREATE POLICY user_profiles_insert ON user_profiles
  FOR INSERT WITH CHECK (tenant_id = get_user_tenant_id() AND get_user_role() = 'admin');

CREATE POLICY user_profiles_update ON user_profiles
  FOR UPDATE USING (tenant_id = get_user_tenant_id());

-- Generic tenant-based policies for all other tables
DO $$
DECLARE
  t TEXT;
  tables TEXT[] := ARRAY[
    'categories', 'products', 'customers', 'suppliers',
    'sales', 'sale_items', 'purchases', 'purchase_items',
    'stock_movements', 'financial_accounts', 'transactions',
    'invoices', 'price_tables'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    EXECUTE format('
      CREATE POLICY %I_tenant_isolation ON %I
        FOR ALL USING (tenant_id = get_user_tenant_id())
        WITH CHECK (tenant_id = get_user_tenant_id());
    ', t || '_select', t);
  END LOOP;
END;
$$;

-- Sale items inherit from sales
DROP POLICY IF EXISTS sale_items_select_tenant_isolation ON sale_items;
CREATE POLICY sale_items_tenant ON sale_items
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM sales s
      WHERE s.id = sale_items.sale_id
        AND s.tenant_id = get_user_tenant_id()
    )
  );

-- Purchase items inherit from purchases
DROP POLICY IF EXISTS purchase_items_select_tenant_isolation ON purchase_items;
CREATE POLICY purchase_items_tenant ON purchase_items
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM purchases p
      WHERE p.id = purchase_items.purchase_id
        AND p.tenant_id = get_user_tenant_id()
    )
  );
