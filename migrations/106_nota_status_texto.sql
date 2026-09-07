-- ============================================================
-- 106. O STATUS DA NOTA NÃO CABIA NA COLUNA.
--
-- Emitir NF-e morria com "value too long for type character
-- varying(20)" — e o valor que não cabia era o primeiro status que toda
-- nota recebe: `processando_autorizacao`, 23 caracteres numa coluna de
-- 20. Nenhuma nota nunca foi gravada; a emissão falhava na última
-- linha, DEPOIS de a Focus já ter recebido o pedido de autorização.
--
-- POR QUE A 006 NÃO RESOLVEU. Ela declara `status TEXT` com
-- `ADD COLUMN IF NOT EXISTS` — e a coluna já existia, com o
-- VARCHAR(20) do modelo antigo. `IF NOT EXISTS` não altera o que
-- encontra: ele desiste em silêncio. O tipo antigo ficou, e a migração
-- passou como aplicada.
--
-- Os outros campos de texto da tabela já são TEXT. `key` (44) e
-- `protocol` (50) ficam como estão: são tamanhos definidos pela SEFAZ,
-- e não limite nosso.
-- ============================================================

ALTER TABLE "NOTAS_FISCAIS"
  ALTER COLUMN status TYPE TEXT;

-- `type` (10) é o par antigo de `tipo`; ainda é lido por telas velhas e
-- cabe pelo mesmo motivo de sempre ('nfe'), mas não custa soltar.
ALTER TABLE "NOTAS_FISCAIS"
  ALTER COLUMN type TYPE TEXT;

NOTIFY pgrst, 'reload schema';

INSERT INTO "_MIGRATIONS" (version, name) VALUES ('106', 'nota_status_texto')
ON CONFLICT (version) DO NOTHING;
