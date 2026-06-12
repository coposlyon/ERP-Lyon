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
