-- ============================================================
-- 107. O CHECK DO STATUS DA NOTA SAI.
--
-- Depois de a 106 soltar o tamanho da coluna, a emissão parou no
-- vizinho: `NOTAS_FISCAIS_status_check`. Ele aceita cinco valores em
-- inglês — pending, processing, authorized, cancelled, error — que são
-- do modelo antigo, anterior à integração. O que o sistema grava hoje é
-- o que a Focus/SEFAZ devolve, em português: `processando_autorizacao`,
-- `autorizado`, `cancelado`, e ainda `erro_autorizacao` e `denegado`
-- quando a SEFAZ recusa.
--
-- POR QUE TIRAR EM VEZ DE ATUALIZAR A LISTA. Porque a lista não é
-- nossa. Quem define esses valores é a SEFAZ, repassada pelo gateway;
-- um status novo do lado deles vira erro de gravação do nosso lado — e
-- vira no pior momento possível, DEPOIS de a nota já ter sido
-- transmitida. Foi exatamente o que aconteceu duas vezes seguidas
-- nesta tabela.
--
-- Um CHECK que precisa de migração toda vez que o governo mexe numa
-- palavra não protege nada: só garante que o ERP perca o registro de
-- uma nota que existe na SEFAZ.
--
-- O `type_check` fica: `type` é a coluna legada (o código escreve em
-- `tipo`), está sempre nula e CHECK não reprova nulo.
-- ============================================================

ALTER TABLE "NOTAS_FISCAIS"
  DROP CONSTRAINT IF EXISTS "NOTAS_FISCAIS_status_check";

NOTIFY pgrst, 'reload schema';

INSERT INTO "_MIGRATIONS" (version, name) VALUES ('107', 'nota_status_sem_check')
ON CONFLICT (version) DO NOTHING;
