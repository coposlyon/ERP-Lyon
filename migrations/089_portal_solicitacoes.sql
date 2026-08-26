-- ============================================================
-- 089. A FILA DE SOLICITAÇÕES DO PORTAL.
--
-- A regra do portal é uma só: PORTAL NÃO CRIA UMA SEGUNDA INFORMAÇÃO.
-- Ele consulta o cadastro mestre ou PEDE alteração dele. Sem esta
-- tabela, "solicitar troca de banco" só teria dois caminhos possíveis,
-- e os dois são ruins:
--
--   a) o portal escreve direto no cadastro   → o RH descobre depois,
--      sem ninguém ter decidido, e a folha paga na conta nova antes de
--      alguém conferir se o pedido é mesmo daquela pessoa;
--   b) o portal guarda um "banco do portal"  → duas verdades sobre a
--      mesma conta, e um dia elas discordam.
--
-- Aqui o pedido fica sendo PEDIDO até um humano decidir. Aprovar é o
-- que move o cadastro mestre — e é por isso que `decided_by` existe:
-- consequência para a pessoa tem que ter nome de quem decidiu.
--
-- O QUE **NÃO** ENTRA AQUI:
--
--   férias        → já moram em RH_FERIAS (status 'pending' É a fila)
--   justificativa → já mora em RH_OCORRENCIAS
--   demissão      → já mora em RH_DESLIGAMENTOS ('solicitado')
--
-- Duplicá-los aqui seria repetir o erro que a tabela existe para
-- evitar. O portal MOSTRA os quatro juntos numa lista só; o banco
-- continua com cada fato no lugar de onde o RH já lê.
--
--   kind     cadastral | documento | beneficio | ponto | outro
--   payload  o que foi pedido, no formato do cadastro mestre
--            (ex.: { bank: {...}, motivo: '...' })
--   applied_at  quando a aprovação REALMENTE moveu o cadastro — sem
--            isto, "aprovada" e "aplicada" viram a mesma palavra para
--            dois estados diferentes.
-- ============================================================

CREATE TABLE IF NOT EXISTS "RH_SOLICITACOES" (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL,
  employee_id   UUID NOT NULL REFERENCES "CLIENTES"(id) ON DELETE CASCADE,
  kind          TEXT NOT NULL,
  titulo        TEXT,
  descricao     TEXT,
  payload       JSONB NOT NULL DEFAULT '{}'::jsonb,
  anexo_url     TEXT,
  status        TEXT NOT NULL DEFAULT 'aberta',
    -- aberta | em_analise | aprovada | recusada | cancelada
  origin        TEXT DEFAULT 'portal',
  decided_by    UUID,
  decided_at    TIMESTAMPTZ,
  decision_note TEXT,
  applied_at    TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS rh_solic_colab
  ON "RH_SOLICITACOES" (tenant_id, employee_id, created_at DESC);
CREATE INDEX IF NOT EXISTS rh_solic_fila
  ON "RH_SOLICITACOES" (tenant_id, status, created_at DESC);

-- Backend usa a service_role (BYPASSRLS). Com RLS ligada e sem
-- política, a anon key não alcança a tabela — mesma ideia da 011.
ALTER TABLE "RH_SOLICITACOES" ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE "RH_SOLICITACOES" IS
  'Pedidos do Portal do Colaborador que ainda não viraram fato no cadastro mestre.';

NOTIFY pgrst, 'reload schema';

INSERT INTO "_MIGRATIONS" (version, name) VALUES ('089', 'portal_solicitacoes')
ON CONFLICT (version) DO NOTHING;
