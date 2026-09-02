-- ============================================================
-- 098. O FORNECEDOR RESPONDE A REPOSIÇÃO PELO LINK.
--
--      Até aqui a reposição era um monólogo: o estoque montava a lista,
--      mandava no WhatsApp e esperava. Quando a mercadoria chegava,
--      alguém dava baixa da lista INTEIRA — inclusive do que o
--      fornecedor não tinha e nunca mandou. O estoque passava a
--      acreditar em caixas que não existem.
--
--      Estas colunas abrem o outro lado da conversa. O fornecedor
--      recebe um endereço próprio, confirma quem é, diz de cada item o
--      que TEM, anexa a cotação, e o pedido volta com a resposta dele.
--      A baixa passa a ser do que ele confirmou.
--
--      O TOKEN É A CREDENCIAL, e por isso ele não basta sozinho: quem
--      abre o link ainda precisa confirmar CNPJ e telefone que já estão
--      no cadastro. Link vazado sem os dois não mostra nada — e o link
--      vaza fácil, porque vai por WhatsApp e é encaminhável.
-- ============================================================

ALTER TABLE "PEDIDOS_REPOSICAO"
  ADD COLUMN IF NOT EXISTS public_token     TEXT,
  ADD COLUMN IF NOT EXISTS token_expira_em  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS resposta         JSONB,
  ADD COLUMN IF NOT EXISTS respondido_em    TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS cotacao_url      TEXT,
  ADD COLUMN IF NOT EXISTS tentativas       INTEGER NOT NULL DEFAULT 0;

-- Dois pedidos não podem dividir o mesmo endereço. Índice único e não
-- constraint porque a maioria das linhas tem token nulo (pedido que
-- ninguém mandou para fora ainda), e nulo não colide em índice único.
CREATE UNIQUE INDEX IF NOT EXISTS pedidos_reposicao_token_uk
  ON "PEDIDOS_REPOSICAO" (public_token) WHERE public_token IS NOT NULL;

COMMENT ON COLUMN "PEDIDOS_REPOSICAO".public_token IS
  'Credencial do link do fornecedor. Sozinha não abre: exige CNPJ e telefone do cadastro.';
COMMENT ON COLUMN "PEDIDOS_REPOSICAO".resposta IS
  'O que o fornecedor confirmou ter, item a item: [{ product_id, nome, pedido, tem }]. A baixa no estoque usa `tem`, e não `pedido`.';
COMMENT ON COLUMN "PEDIDOS_REPOSICAO".tentativas IS
  'Erros de CNPJ/telefone no link. Serve para travar a força bruta sobre um token que anda por WhatsApp.';

-- `status` ganha um valor a mais: 'respondido'. A régua completa é
-- pending → respondido → completed. Sem constraint no banco de
-- propósito: os status vivem no código (routes/stock.js), e duplicar a
-- lista aqui é a segunda verdade que amanhã discorda da primeira.

NOTIFY pgrst, 'reload schema';

INSERT INTO "_MIGRATIONS" (version, name) VALUES ('098', 'reposicao_fornecedor')
ON CONFLICT (version) DO NOTHING;
