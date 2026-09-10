-- ============================================================
-- 116. DUAS TABELAS DE CONTA BANCÁRIA VIRAM UMA.
--
--      O ERP tinha DUAS tabelas para a mesma coisa:
--
--        CONTAS_BANCARIAS    o que a tela de Configuração Financeira
--                            cadastra, e o que os selects listam.
--                            Aqui moravam "Caixa" e "Conta Corrente".
--
--        CONTAS_FINANCEIRAS  para onde as chaves estrangeiras apontam:
--                            LANCAMENTOS.account_id e
--                            VENDAS.receiving_account_id. Aqui morava
--                            "Caixa Principal".
--
--      Duas listas de conta, sem nenhuma ligação entre elas. O efeito
--      aparecia no momento mais caro possível — ao registrar um
--      recebimento:
--
--        insert or update on table "LANCAMENTOS" violates foreign key
--        constraint "LANCAMENTOS_account_id_fkey"
--
--      O usuário escolhia "Conta Corrente" no select (que veio de
--      CONTAS_BANCARIAS), o id ia para uma coluna que exige
--      CONTAS_FINANCEIRAS, e o banco recusava. NÃO HAVIA COMO DAR
--      CERTO: qualquer conta escolhida naquele select quebrava.
--
--      FICA CONTAS_FINANCEIRAS, e não a outra, por três motivos: é para
--      onde as duas chaves estrangeiras já apontam, é a que o módulo
--      Contábil já lê, e é a que tem as colunas que faltam na outra
--      (pix_key, company_id) — que este negócio usa.
--
--      OS IDS SÃO PRESERVADOS de propósito. Copiar as contas gerando
--      ids novos deixaria para trás qualquer lançamento que já tivesse
--      sido gravado apontando para o id antigo. Com o mesmo id, o que
--      já existia continua válido e o que estava quebrado passa a
--      funcionar.
--
--      A TABELA ANTIGA NÃO É APAGADA. Ela fica ali, intocada, até
--      alguém conferir que nada mais a lê — apagar dado de conta
--      bancária no mesmo dia em que se mexe nela é como se corrige um
--      erro criando outro maior.
-- ============================================================

-- As contas que só existiam na tabela errada passam a existir na certa,
-- com o MESMO id. `type` fora da lista permitida vira 'other' — o CHECK
-- de CONTAS_FINANCEIRAS aceita só checking/savings/cash/other, e um
-- 'investment' vindo da outra tabela derrubaria a migração inteira.
INSERT INTO "CONTAS_FINANCEIRAS"
  (id, tenant_id, name, type, balance, is_active, created_at, bank_name, agency, account_number)
SELECT
  b.id,
  b.tenant_id,
  b.name,
  CASE WHEN b.type IN ('checking', 'savings', 'cash', 'other') THEN b.type ELSE 'other' END,
  COALESCE(b.balance, 0),
  COALESCE(b.is_active, true),
  COALESCE(b.created_at, now()),
  b.bank_name,
  b.agency,
  b.account
FROM "CONTAS_BANCARIAS" b
WHERE EXISTS (SELECT 1 FROM "EMPRESAS" e WHERE e.id = b.tenant_id)
ON CONFLICT (id) DO NOTHING;

-- Marca de onde vieram, para quem for conferir daqui a seis meses saber
-- que aquela linha não foi digitada ali.
COMMENT ON TABLE "CONTAS_BANCARIAS" IS
  'OBSOLETA desde a migração 116. As contas foram copiadas para CONTAS_FINANCEIRAS com o mesmo id; '
  'o sistema inteiro passou a ler e gravar em CONTAS_FINANCEIRAS. Mantida só para conferência.';

COMMENT ON TABLE "CONTAS_FINANCEIRAS" IS
  'As contas bancárias e caixas da empresa. Fonte única desde a migração 116 — '
  'LANCAMENTOS.account_id e VENDAS.receiving_account_id apontam para cá.';

NOTIFY pgrst, 'reload schema';

INSERT INTO "_MIGRATIONS" (version, name) VALUES ('116', 'uma_conta_bancaria_so')
ON CONFLICT (version) DO NOTHING;
