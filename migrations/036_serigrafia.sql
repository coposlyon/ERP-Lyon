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
