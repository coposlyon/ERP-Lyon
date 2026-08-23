-- ============================================================
-- 082. O PONTO QUE FALA COM AS OCORRÊNCIAS.
--
-- Duas coisas nascem aqui:
--
-- 1) RH_NOTIFICACOES — a fila de avisos. Quando alguém passa da
--    tolerância, o sistema precisa pedir justificativa pelo WhatsApp.
--    Sem uma fila, "notificação enviada" vira fé: ninguém sabe se saiu,
--    se falhou ou se foi entregue duas vezes. Cada linha aqui é uma
--    tentativa registrada, com o texto exato que foi (ou seria) enviado.
--
--    E enquanto NÃO houver integração de WhatsApp configurada, a linha
--    fica em 'pendente' com a mensagem pronta — o RH copia e manda à
--    mão, e o sistema não mente dizendo que enviou.
--
-- 2) A ocorrência ganha ligação com o dia do ponto que a originou, para
--    ninguém precisar cruzar data e nome no olho.
-- ============================================================

CREATE TABLE IF NOT EXISTS "RH_NOTIFICACOES" (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL,
  employee_id   UUID,
  canal         TEXT NOT NULL DEFAULT 'whatsapp',   -- whatsapp | email | sistema
  destino       TEXT,                               -- o número/e-mail usado
  assunto       TEXT,
  mensagem      TEXT NOT NULL,
  motivo        TEXT,                               -- atraso | falta | justificativa | ferias | documento
  ref_type      TEXT,                               -- ocorrencia | ponto | ferias
  ref_id        UUID,
  status        TEXT NOT NULL DEFAULT 'pendente',   -- pendente | enviada | falhou | cancelada
  erro          TEXT,
  tentativas    INT DEFAULT 0,
  enviada_em    TIMESTAMPTZ,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS rh_notif_tenant ON "RH_NOTIFICACOES" (tenant_id, status, created_at DESC);

-- De qual dia de ponto veio a ocorrência
ALTER TABLE "RH_OCORRENCIAS" ADD COLUMN IF NOT EXISTS ponto_id UUID;
ALTER TABLE "RH_OCORRENCIAS" ADD COLUMN IF NOT EXISTS notificado_em TIMESTAMPTZ;

-- Uma ocorrência automática por pessoa/dia/tipo. É esta trava que
-- impede o recálculo do ponto de criar dez atrasos para o mesmo dia.
CREATE UNIQUE INDEX IF NOT EXISTS rh_ocorrencias_unica_dia
  ON "RH_OCORRENCIAS" (tenant_id, employee_id, occurred_on, kind)
  WHERE origin = 'ponto';

INSERT INTO "_MIGRATIONS" (version, name) VALUES ('082', 'ponto_ocorrencias')
ON CONFLICT (version) DO NOTHING;
