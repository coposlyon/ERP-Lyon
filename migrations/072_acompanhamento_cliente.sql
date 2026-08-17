-- ============================================================
-- 072. ACOMPANHAMENTO DO PEDIDO PELO CLIENTE
--
--      Duas coisas que a tela do cliente precisa e não existiam.
--
--      1. O WhatsApp do vendedor. O "atendimento humanizado" manda a
--         dúvida para o vendedor DAQUELE pedido — não para um número
--         geral, e o cliente não escolhe atendente. Só que USUARIOS não
--         guardava telefone: ele mora na ficha de colaborador
--         (CLIENTES type='CO'), que nem todo usuário tem. Vira campo, e
--         o backfill abaixo traz o que já existe.
--
--      2. Os avisos que o cliente lê. Ficam por empresa, não no código,
--         porque mudam com a política comercial — a taxa de alteração
--         de arte não é decisão de programador.
-- ============================================================

ALTER TABLE "USUARIOS" ADD COLUMN IF NOT EXISTS phone TEXT;

-- Puxa o telefone da ficha de colaborador, casando pelo e-mail. Só
-- preenche quem está vazio: quem já tiver número no usuário manda.
UPDATE "USUARIOS" u
   SET phone = COALESCE(c.mobile, c.phone)
  FROM "CLIENTES" c
 WHERE c.email = u.email
   AND c.type = 'CO'
   AND u.phone IS NULL
   AND COALESCE(c.mobile, c.phone) IS NOT NULL;

-- ── Avisos do pedido ─────────────────────────────────────────
-- Só para quem ainda não configurou nada: reconfigurar em Configurações
-- não pode ser desfeito por um deploy.
UPDATE "EMPRESAS"
   SET settings = jsonb_set(
         COALESCE(settings, '{}'::jsonb),
         '{pedido_avisos}',
         '[
            "Pagamento somente integral.",
            "Alteração de arte após aprovação: taxa de R$ 20,00.",
            "Alteração de produto poderá gerar novo prazo de produção.",
            "O andamento seguirá conforme disponibilidade e aprovação do pedido."
          ]'::jsonb,
         true)
 WHERE settings -> 'pedido_avisos' IS NULL;

NOTIFY pgrst, 'reload schema';

INSERT INTO "_MIGRATIONS" (version, name) VALUES ('072', 'acompanhamento_cliente')
ON CONFLICT (version) DO NOTHING;
