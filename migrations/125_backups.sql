-- ============================================================
-- 125. BACKUP REDUNDANTE E RECUPERAÇÃO DE DESASTRE.
--
--      O Supabase guarda um backup diário do Postgres — mas é uma cópia
--      dentro do mesmo serviço, restaurável só pelo painel dele. Esta
--      tabela registra a SEGUNDA cópia, feita pelo próprio ERP:
--
--        · todo dia, sozinho, e quando o administrador pedir;
--        · todas as tabelas da empresa, com as linhas-filhas;
--        · compactada (JSON + gzip) no bucket privado BACKUPS do Storage,
--          que é um serviço separado do banco;
--        · com o SHA-256 do arquivo, para provar que ele não mudou;
--        · baixável pela tela Configurações › Backup e restaurável em
--          qualquer Postgres por backend/scripts/restaurar-backup.js.
--
--      Retenção: os 30 diários mais recentes e o primeiro de cada mês
--      por 12 meses. O que passa disso é apagado do Storage e marcado
--      como expirado aqui (a linha fica, como registro).
-- ============================================================

CREATE TABLE IF NOT EXISTS "BACKUPS" (
  id            UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id     UUID NOT NULL REFERENCES "EMPRESAS"(id) ON DELETE CASCADE,
  criado_em     TIMESTAMPTZ NOT NULL DEFAULT now(),
  concluido_em  TIMESTAMPTZ,
  origem        VARCHAR(20) NOT NULL DEFAULT 'manual',     -- manual | automatico
  status        VARCHAR(20) NOT NULL DEFAULT 'gerando',    -- gerando | ok | erro | expirado
  arquivo       TEXT,                                      -- caminho no bucket BACKUPS
  bytes         BIGINT,
  bytes_json    BIGINT,
  sha256        VARCHAR(64),
  tabelas       INTEGER,
  linhas        BIGINT,
  detalhes      JSONB NOT NULL DEFAULT '{}'::jsonb,        -- linhas por tabela
  erro          TEXT,
  usuario       VARCHAR(120),
  user_id       UUID
);
CREATE INDEX IF NOT EXISTS backups_tenant_data ON "BACKUPS" (tenant_id, criado_em DESC);

ALTER TABLE "BACKUPS" ENABLE ROW LEVEL SECURITY;

NOTIFY pgrst, 'reload schema';
