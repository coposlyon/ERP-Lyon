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
