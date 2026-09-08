-- ============================================================
-- 112. ANEXAR NÃO É PAGAR
--
-- O QUE ESTAVA ERRADO. Anexar o comprovante gravava `paid_amount` na
-- hora: o vendedor subia o print e a parcela aparecia PAGA no
-- Financeiro, sem ninguém do financeiro ter aberto o extrato. O print
-- de uma transferência agendada, o comprovante de outro pedido e o
-- valor digitado errado entravam todos como dinheiro na conta.
--
-- Agora são dois atos, e cada um com o seu dono:
--
--   anexar     o comercial (ou o cliente) diz "paguei", e informa
--              quanto. Fica guardado em `receipt_amount`, esperando.
--
--   confirmar  o financeiro confere o comprovante e CONFIRMA. É aqui
--              que `paid_amount` muda, e é aqui que se registra quem
--              confirmou — `paid_by` e `paid_at`.
--
-- `receipt_by`/`receipt_at`, que já existiam, continuam sendo de quem
-- CONFERIU o papel. Confirmar o dinheiro é o passo seguinte, e por isso
-- tem colunas próprias: a pergunta "quem disse que este dinheiro
-- entrou?" não pode ter a mesma resposta que "quem olhou a imagem".
-- ============================================================

ALTER TABLE "LANCAMENTOS"
  ADD COLUMN IF NOT EXISTS receipt_amount NUMERIC,
  ADD COLUMN IF NOT EXISTS paid_by         TEXT,
  ADD COLUMN IF NOT EXISTS paid_at         TIMESTAMPTZ;

COMMENT ON COLUMN "LANCAMENTOS".receipt_amount IS
  'Valor declarado no comprovante anexado, esperando a confirmação do financeiro.';
COMMENT ON COLUMN "LANCAMENTOS".paid_by IS
  'Quem confirmou a entrada do dinheiro (não quem anexou o comprovante).';

-- A fila do financeiro é "o que tem comprovante e ainda não foi
-- confirmado", lida por vencimento. Sem índice ela varre a tabela toda
-- a cada abertura da tela.
CREATE INDEX IF NOT EXISTS lancamentos_comprovante_pendente_idx
    ON "LANCAMENTOS" (tenant_id, receipt_status, due_date)
 WHERE receipt_url IS NOT NULL;

INSERT INTO "_MIGRATIONS" (version, name) VALUES ('112', 'comprovante_confirmado_pelo_financeiro')
ON CONFLICT (version) DO NOTHING;
