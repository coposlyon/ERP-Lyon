-- ============================================================
-- 069. ORIGEM DA VENDA — preencher o que já dá para saber
--
--      A coluna `origin` nasceu na 067 e está vazia. Ela responde "de
--      onde veio este cliente" (Shopee, WhatsApp, Site...), enquanto a
--      `source`, que já existia, responde outra coisa: "como o pedido
--      entrou" (o próprio cliente pelo site x digitado à mão).
--
--      Aqui só se preenche o que o banco JÁ SABE: pedido com
--      source='site' nasceu no site, ponto. Os pedidos manuais antigos
--      ficam NULL de propósito — ninguém registrou de onde vieram, e
--      chutar "Presencial" para todos criaria um relatório que parece
--      verdade e não é. A tela mostra "não informado" e o Administrativo
--      corrige um a um se quiser.
-- ============================================================

UPDATE "VENDAS"
   SET origin = 'Site'
 WHERE origin IS NULL
   AND source IN ('site', 'loja');

-- Mesma ideia nos orçamentos que vieram da loja, quando a coluna existir
ALTER TABLE "ORCAMENTOS" ADD COLUMN IF NOT EXISTS origin TEXT;

NOTIFY pgrst, 'reload schema';

INSERT INTO "_MIGRATIONS" (version, name) VALUES ('069', 'origem_pedido')
ON CONFLICT (version) DO NOTHING;
