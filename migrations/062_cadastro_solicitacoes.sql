-- ============================================================
-- 062. Solicitações de alteração de cadastro (links públicos)
--
--      Quem informa um CPF/CNPJ já cadastrado nos links públicos
--      (/cadastro, /cadastro-fornecedor, /cadastro-transportadora)
--      NÃO altera o registro direto: os dados propostos e os
--      documentos anexados ficam nesta fila, e um administrador
--      aprova ou rejeita dentro do sistema.
--
--      Nenhum dado do cadastro existente é devolvido ao link
--      público — o solicitante envia às cegas.
--
--      payload     = dados propostos (mesmo formato do cadastro)
--      changes     = [{ field, label, from, to }] calculado no envio
--      attachments = [{ id, kind, name, url, path, type, size,
--                       uploaded_at, uploaded_by }]
-- ============================================================
CREATE TABLE IF NOT EXISTS "CADASTRO_SOLICITACOES" (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    UUID NOT NULL,
  entity       TEXT NOT NULL CHECK (entity IN ('cliente', 'fornecedor', 'transportadora')),
  entity_id    UUID,
  doc_digits   TEXT NOT NULL,
  entity_name  TEXT,
  status       TEXT NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente', 'aprovada', 'rejeitada')),
  payload      JSONB NOT NULL DEFAULT '{}'::jsonb,
  changes      JSONB NOT NULL DEFAULT '[]'::jsonb,
  attachments  JSONB NOT NULL DEFAULT '[]'::jsonb,
  requested_by JSONB NOT NULL DEFAULT '{}'::jsonb,
  note         TEXT,
  reviewed_by      UUID,
  reviewed_by_name TEXT,
  reviewed_at      TIMESTAMPTZ,
  review_note      TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS cadastro_solicitacoes_pendentes_idx
  ON "CADASTRO_SOLICITACOES" (tenant_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS cadastro_solicitacoes_entidade_idx
  ON "CADASTRO_SOLICITACOES" (tenant_id, entity, entity_id);

-- O backend usa a service_role key (BYPASSRLS); com RLS ligada e sem
-- políticas, o acesso direto pela anon key fica bloqueado (mesma ideia da
-- migration 011).
ALTER TABLE "CADASTRO_SOLICITACOES" ENABLE ROW LEVEL SECURITY;

-- Os documentos aprovados de CLIENTE entram em admission_data.attachments
-- (formato já usado por /api/customers/:id/attachments). Fornecedor e
-- transportadora continuam em documents (migrations 054/055).

NOTIFY pgrst, 'reload schema';

INSERT INTO "_MIGRATIONS" (version, name) VALUES ('062', 'cadastro_solicitacoes')
ON CONFLICT (version) DO NOTHING;
