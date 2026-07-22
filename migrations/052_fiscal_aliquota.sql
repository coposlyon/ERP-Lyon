-- ============================================================
-- 052. CONFIG_FISCAL: alíquota efetiva sobre a venda.
--      O imposto passa a ser definido no módulo FISCAL e flui
--      automaticamente para a Formação de Preço e o Rateio —
--      em vez de ficar duplicado na precificação.
-- ============================================================

ALTER TABLE "CONFIG_FISCAL"
  ADD COLUMN IF NOT EXISTS aliquota_venda NUMERIC(6,2);

COMMENT ON COLUMN "CONFIG_FISCAL".aliquota_venda IS
  'Alíquota efetiva sobre a venda em % (ex.: Simples 6.00). Alimenta a formação de preço.';

-- PostgREST só enxerga a coluna nova depois de recarregar o cache
NOTIFY pgrst, 'reload schema';

INSERT INTO "_MIGRATIONS" (version, name) VALUES ('052', 'fiscal_aliquota')
ON CONFLICT (version) DO NOTHING;
