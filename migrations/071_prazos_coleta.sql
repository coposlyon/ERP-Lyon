-- ============================================================
-- 071. DATA DE COLETA E PRAZO DE TRANSPORTE
--
--      O quadro "Prazos e Entrega" da tela de detalhes mostra quatro
--      datas, e duas delas não existiam:
--
--      collect_date    quando a transportadora vem buscar. Hoje isso
--                      é combinado por telefone e não fica em lugar
--                      nenhum — quando o cliente pergunta "que dia
--                      sai?", alguém tem que lembrar.
--      transport_days  o prazo em dias úteis que a transportadora deu
--                      na cotação. Guardar o número (e não só a data
--                      de entrega) é o que permite recalcular a
--                      previsão quando a coleta atrasa.
--
--      As duas são previsão, não fato consumado: o que aconteceu de
--      verdade fica na linha do tempo (mercadoria_coletada, entregue).
-- ============================================================
ALTER TABLE "VENDAS" ADD COLUMN IF NOT EXISTS collect_date   DATE;
ALTER TABLE "VENDAS" ADD COLUMN IF NOT EXISTS transport_days INT;

NOTIFY pgrst, 'reload schema';

INSERT INTO "_MIGRATIONS" (version, name) VALUES ('071', 'prazos_coleta')
ON CONFLICT (version) DO NOTHING;
