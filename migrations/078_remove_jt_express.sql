-- ============================================================
-- 078. FORA A J&T EXPRESS.
--
-- Desfaz o que a migração 041 criou e limpa o que sobrou da
-- integração na configuração da empresa. O frete passa a sair de
-- uma regra só: a tabela por estado (Configurações →
-- Transportadora), preenchida à mão.
--
-- O código já não lê nada disto — rodar esta migração é opcional e
-- serve para o banco parar de carregar coluna e chaves mortas.
-- A coluna tracking_code CONTINUA: o código de rastreio de qualquer
-- transportadora ainda é guardado ali.
-- ============================================================

-- 1) O id do pedido logístico da J&T na venda
ALTER TABLE "VENDAS" DROP COLUMN IF EXISTS jt_tx_id;

-- 2) As credenciais e chaves da J&T dentro de EMPRESAS.settings.frete
--    (jt_*, mais o "enabled", que era o liga/desliga da J&T, e as
--    chaves de cálculo por peso/acréscimo que não existem mais)
UPDATE "EMPRESAS"
SET settings = jsonb_set(
      settings,
      '{frete}',
      (settings->'frete')
        - 'jt_base_url' - 'jt_api_account' - 'jt_private_key'
        - 'jt_customer_code' - 'jt_password' - 'jt_goods_type'
        - 'jt_product_type' - 'jt_default_ncm'
        - 'enabled'
        - 'weight_per_unit_g' - 'freight_markup' - 'default_per_kg'
    )
WHERE settings ? 'frete';

-- 3) O "+ por kg" de cada linha da tabela por estado: o valor agora é
--    um só por estado, digitado à mão.
UPDATE "EMPRESAS"
SET settings = jsonb_set(
      settings,
      '{frete,table}',
      (
        SELECT COALESCE(jsonb_agg(linha - 'per_kg'), '[]'::jsonb)
        FROM jsonb_array_elements(settings->'frete'->'table') AS linha
      )
    )
WHERE jsonb_typeof(settings->'frete'->'table') = 'array';

INSERT INTO "_MIGRATIONS" (version, name) VALUES ('078', 'remove_jt_express')
ON CONFLICT (version) DO NOTHING;
