-- ============================================================
-- 047. Etapa de Metalização na produção (timestamps de início/fim)
--
--      Fluxo: Revelação → Pintura → METALIZAÇÃO → Produção → Embalagem
--
--      A etapa é OPCIONAL: só os pedidos com borda metalizada passam
--      por ela. Por isso a Produção aceita vir tanto da Pintura quanto
--      da Metalização (regra no front, em canDo).
-- ============================================================
ALTER TABLE "VENDAS" ADD COLUMN IF NOT EXISTS metalizacao_inicio timestamptz;
ALTER TABLE "VENDAS" ADD COLUMN IF NOT EXISTS metalizacao_fim    timestamptz;

INSERT INTO "_MIGRATIONS" (version, name) VALUES ('047', 'vendas_metalizacao')
ON CONFLICT (version) DO NOTHING;
