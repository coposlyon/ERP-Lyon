-- ============================================================
-- 122. O MALOTE DO CONTADOR TEM HISTÓRICO.
--
--      O malote de pagamentos é a foto de todas as despesas de um mês
--      — contas a pagar, despesas fixas, compras, impostos — reunida
--      para o contador. Montar a foto é consulta; o que faltava era
--      REGISTRAR que ela foi enviada: quando, por quem, para quem, e
--      com quais totais. Sem isso, "mandei o malote de agosto?" só se
--      responde procurando no e-mail.
--
--      Cada linha aqui é um envio. O mesmo mês pode ter mais de um
--      (reenvio com correção) — o histórico mostra todos, o mais novo
--      é o que vale. `resumo` e `itens` guardam a foto do momento:
--      se uma conta mudar depois, o que o contador recebeu continua
--      auditável.
-- ============================================================

CREATE TABLE IF NOT EXISTS "MALOTES_CONTADOR" (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid NOT NULL,
  competencia   date NOT NULL,                       -- primeiro dia do mês
  enviado_em    timestamptz NOT NULL DEFAULT now(),
  enviado_por   text,                                -- nome de quem registrou
  user_id       uuid,
  destinatario  text,                                -- contador / escritório / e-mail
  observacao    text,
  resumo        jsonb NOT NULL DEFAULT '{}'::jsonb,  -- totais no momento do envio
  itens         jsonb NOT NULL DEFAULT '[]'::jsonb,  -- as linhas, como foram enviadas
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS malotes_contador_tenant_mes
  ON "MALOTES_CONTADOR" (tenant_id, competencia DESC, enviado_em DESC);

COMMENT ON TABLE "MALOTES_CONTADOR" IS
  'Registro de cada envio do malote de pagamentos ao contador (foto das despesas do mês).';
