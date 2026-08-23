-- ============================================================
-- 081. FÉRIAS E AFASTAMENTOS — DUAS COISAS DIFERENTES.
--
-- RH_FERIAS guardava período e status, e mais nada. Com isso, férias
-- programadas e auxílio-doença eram a MESMA linha: o painel não sabia
-- dizer quantas pessoas estavam afastadas, a folha não sabia o que
-- descontar e o eSocial não tinha o que informar. Um atestado de 20
-- dias entrava no sistema com a mesma cara de umas férias de janeiro.
--
-- O que muda aqui:
--
--   kind          separa férias de afastamento, licença e suspensão
--   reason/cid    o motivo — e o CID, que o eSocial exige no S-2230
--   doc_url       o atestado, anexado uma vez e lido por todos
--   aquisitivo    o período que gerou o direito (férias)
--   abono/13º     as escolhas do colaborador, que a folha precisa saber
--   inss_apos_15  afastamento acima de 15 dias vira INSS: quem paga muda
--   exame_retorno o exame de retorno, obrigatório acima de 30 dias
--   aprovação     quem aprovou e quando — decisão é humana, sempre
--
-- O SALDO NÃO É COLUNA. Ele é CALCULADO da admissão, dos períodos já
-- gozados e das faltas do ponto (CLT art. 130). Guardar saldo seria
-- criar um número que envelhece sozinho e passa a discordar do fato.
-- ============================================================

ALTER TABLE "RH_FERIAS" ADD COLUMN IF NOT EXISTS kind TEXT DEFAULT 'ferias';
COMMENT ON COLUMN "RH_FERIAS".kind IS 'ferias | afastamento | licenca | suspensao';

ALTER TABLE "RH_FERIAS" ADD COLUMN IF NOT EXISTS reason TEXT;
ALTER TABLE "RH_FERIAS" ADD COLUMN IF NOT EXISTS cid TEXT;
ALTER TABLE "RH_FERIAS" ADD COLUMN IF NOT EXISTS doc_url TEXT;

-- Período aquisitivo que originou estas férias
ALTER TABLE "RH_FERIAS" ADD COLUMN IF NOT EXISTS aquisitivo_inicio DATE;
ALTER TABLE "RH_FERIAS" ADD COLUMN IF NOT EXISTS aquisitivo_fim DATE;

-- Escolhas do colaborador que a folha precisa conhecer
ALTER TABLE "RH_FERIAS" ADD COLUMN IF NOT EXISTS abono_pecuniario BOOLEAN DEFAULT FALSE;
ALTER TABLE "RH_FERIAS" ADD COLUMN IF NOT EXISTS abono_dias INT;
ALTER TABLE "RH_FERIAS" ADD COLUMN IF NOT EXISTS adiantar_decimo BOOLEAN DEFAULT FALSE;

-- Afastamento: acima de 15 dias o pagamento passa ao INSS, e acima de
-- 30 o retorno exige exame. As duas coisas mudam folha e eSocial.
ALTER TABLE "RH_FERIAS" ADD COLUMN IF NOT EXISTS inss_apos_15 BOOLEAN DEFAULT FALSE;
ALTER TABLE "RH_FERIAS" ADD COLUMN IF NOT EXISTS exame_retorno_exigido BOOLEAN DEFAULT FALSE;
ALTER TABLE "RH_FERIAS" ADD COLUMN IF NOT EXISTS exame_retorno_em DATE;
ALTER TABLE "RH_FERIAS" ADD COLUMN IF NOT EXISTS retorno_real DATE;

-- Quem pediu, quem aprovou, e por onde entrou
ALTER TABLE "RH_FERIAS" ADD COLUMN IF NOT EXISTS requested_by UUID;
ALTER TABLE "RH_FERIAS" ADD COLUMN IF NOT EXISTS origin TEXT DEFAULT 'rh';
COMMENT ON COLUMN "RH_FERIAS".origin IS 'rh | portal | gestor | sistema';
ALTER TABLE "RH_FERIAS" ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ;
ALTER TABLE "RH_FERIAS" ADD COLUMN IF NOT EXISTS esocial_evento_id UUID;
ALTER TABLE "RH_FERIAS" ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

CREATE INDEX IF NOT EXISTS rh_ferias_tenant_periodo ON "RH_FERIAS" (tenant_id, start_date, end_date);
CREATE INDEX IF NOT EXISTS rh_ferias_tipo ON "RH_FERIAS" (tenant_id, kind, status);

-- As linhas que já existiam são férias: era a única coisa que a tabela
-- sabia representar.
UPDATE "RH_FERIAS" SET kind = 'ferias' WHERE kind IS NULL;

INSERT INTO "_MIGRATIONS" (version, name) VALUES ('081', 'ferias_afastamentos')
ON CONFLICT (version) DO NOTHING;
