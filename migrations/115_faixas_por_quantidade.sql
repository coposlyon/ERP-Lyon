-- ============================================================
-- 099. PREÇO POR FAIXA DE QUANTIDADE, TAMBÉM NO ACABAMENTO E NA
--      IMPRESSÃO.
--
--      O produto já tinha faixa: `PRODUTOS.price_tiers` responde "de 100
--      un para cima, sai a tanto". O que faltava era o mesmo raciocínio
--      no que se aplica EM CIMA do copo — o acabamento e o tipo de
--      impressão tinham um número só, `preco_adicional`, cobrado igual
--      para dez peças e para dois mil.
--
--      Na prática é onde a escala mais aparece: montar a tela da
--      serigrafia custa o mesmo para 50 ou 500 copos, e cobrar por
--      unidade o mesmo valor nos dois casos é errar para os dois lados —
--      caro no pedido grande, barato no pequeno.
--
--      O FORMATO É O MESMO DO PRODUTO, de propósito:
--
--        [{ "min_qty": 50,  "max_qty": 99,   "price": 0.40 },
--         { "min_qty": 100, "max_qty": 199,  "price": 0.30 },
--         { "min_qty": 200, "max_qty": null, "price": 0.22 }]
--
--      `max_qty` nulo = "daí para cima". Mesma forma que `price_tiers`,
--      lida pela mesma função (`calc.precoFaixa`) — uma regra de faixa
--      no sistema inteiro, e não três parecidas.
--
--      `preco_adicional` CONTINUA valendo como piso: é o que se cobra
--      quando nenhuma faixa alcança a quantidade. Sem isso, todo
--      acabamento já cadastrado passaria a custar zero no dia em que
--      esta migração rodasse.
-- ============================================================

ALTER TABLE "CONFIG_ACABAMENTOS"
  ADD COLUMN IF NOT EXISTS faixas JSONB NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE "CONFIG_PROCESSOS"
  ADD COLUMN IF NOT EXISTS faixas JSONB NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN "CONFIG_ACABAMENTOS".faixas IS
  'Preço adicional por faixa de quantidade: [{min_qty,max_qty,price}]. max_qty nulo = daí para cima. Vazio = usa preco_adicional.';
COMMENT ON COLUMN "CONFIG_PROCESSOS".faixas IS
  'Preço adicional por faixa de quantidade: [{min_qty,max_qty,price}]. max_qty nulo = daí para cima. Vazio = usa preco_adicional.';

NOTIFY pgrst, 'reload schema';

-- RENUMERADA DE 099 PARA 115, e este e o motivo.
--
-- Existiam DOIS arquivos com o numero 099: este e o
-- 099_itens_e_adicionais.sql. O aplicador de migracoes guarda o que ja
-- rodou pelo NUMERO — entao, no dia em que o 099 do outro arquivo foi
-- registrado, este aqui virou invisivel: nao aparecia como pendente e
-- nunca mais ia rodar. Ficou meses assim, e as colunas abaixo nunca
-- existiram no banco.
INSERT INTO "_MIGRATIONS" (version, name) VALUES ('115', 'faixas_por_quantidade')
ON CONFLICT (version) DO NOTHING;
