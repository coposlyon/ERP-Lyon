-- ============================================================
-- 083. A CENTRAL DOCUMENTAL DO RH.
--
-- RH_DOCUMENTOS guardava o que foi ANEXADO: tipo, arquivo e data. Só
-- isso não responde a pergunta que o RH faz todo dia — "o que está
-- FALTANDO?". Faltava saber o que é obrigatório, o que vence, o que já
-- foi assinado e de onde veio cada papel.
--
-- O QUE ENTRA AQUI:
--
--   doc_key     liga o arquivo ao catálogo (contrato_clt, rg, aso…)
--   category    pessoal | trabalhista | contratual | medico | financeiro
--               | politica | dependente | conjuge
--   status      anexado | pendente | assinado | vencido | recusado
--   expires_at  validade — quando existir
--   sem_validade  DOCUMENTO QUE NÃO VENCE, e isso é uma escolha
--               explícita (item 9): contrato por prazo indeterminado
--               não pode aparecer como "vencendo" só porque o campo de
--               data ficou vazio.
--   required    se a falta dele trava a admissão
--   origin      colaborador | sistema | rh  (o ERP gera parte deles)
--   signed_at   assinatura eletrônica, quando houver
--
-- A regra do kit vale aqui: esta é a CENTRAL ÚNICA de anexos. As outras
-- telas só mostram status e o botão de visualizar — nenhuma delas
-- guarda arquivo por conta própria.
-- ============================================================

ALTER TABLE "RH_DOCUMENTOS" ADD COLUMN IF NOT EXISTS doc_key TEXT;
ALTER TABLE "RH_DOCUMENTOS" ADD COLUMN IF NOT EXISTS category TEXT;
ALTER TABLE "RH_DOCUMENTOS" ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'anexado';
ALTER TABLE "RH_DOCUMENTOS" ADD COLUMN IF NOT EXISTS expires_at DATE;
ALTER TABLE "RH_DOCUMENTOS" ADD COLUMN IF NOT EXISTS sem_validade BOOLEAN DEFAULT FALSE;
ALTER TABLE "RH_DOCUMENTOS" ADD COLUMN IF NOT EXISTS required BOOLEAN DEFAULT FALSE;
ALTER TABLE "RH_DOCUMENTOS" ADD COLUMN IF NOT EXISTS origin TEXT DEFAULT 'rh';
ALTER TABLE "RH_DOCUMENTOS" ADD COLUMN IF NOT EXISTS signed_at TIMESTAMPTZ;
ALTER TABLE "RH_DOCUMENTOS" ADD COLUMN IF NOT EXISTS signed_by UUID;
ALTER TABLE "RH_DOCUMENTOS" ADD COLUMN IF NOT EXISTS version TEXT;
ALTER TABLE "RH_DOCUMENTOS" ADD COLUMN IF NOT EXISTS size_bytes BIGINT;
ALTER TABLE "RH_DOCUMENTOS" ADD COLUMN IF NOT EXISTS mime TEXT;
ALTER TABLE "RH_DOCUMENTOS" ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

CREATE INDEX IF NOT EXISTS rh_doc_colab ON "RH_DOCUMENTOS" (tenant_id, employee_id, doc_key);
CREATE INDEX IF NOT EXISTS rh_doc_validade ON "RH_DOCUMENTOS" (tenant_id, expires_at)
  WHERE expires_at IS NOT NULL;

-- As linhas antigas: o que já estava anexado continua anexado, e o
-- `type` vira a chave até alguém reclassificar.
UPDATE "RH_DOCUMENTOS" SET status = 'anexado' WHERE status IS NULL;
UPDATE "RH_DOCUMENTOS" SET doc_key = type WHERE doc_key IS NULL;

-- ── Políticas corporativas: versionadas UMA vez ─────────────
-- O kit é explícito: a política é cadastrada e versionada uma única vez
-- no Administrativo, e o colaborador aceita a VERSÃO VIGENTE. Guardar
-- uma cópia do texto por colaborador seria multiplicar por 20 (ou por
-- 500) um documento que é um só.
CREATE TABLE IF NOT EXISTS "RH_POLITICAS" (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    UUID NOT NULL,
  chave        TEXT NOT NULL,
  titulo       TEXT NOT NULL,
  versao       TEXT NOT NULL DEFAULT '1.0',
  vigente_desde DATE DEFAULT CURRENT_DATE,
  conteudo     TEXT,
  arquivo_url  TEXT,
  obrigatoria  BOOLEAN DEFAULT TRUE,
  is_active    BOOLEAN DEFAULT TRUE,
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (tenant_id, chave, versao)
);

-- O aceite: quem aceitou, qual versão e quando. É o Termo de Ciência.
CREATE TABLE IF NOT EXISTS "RH_POLITICAS_ACEITES" (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    UUID NOT NULL,
  politica_id  UUID NOT NULL,
  employee_id  UUID NOT NULL,
  versao       TEXT NOT NULL,
  aceito_em    TIMESTAMPTZ DEFAULT NOW(),
  ip           TEXT,
  origem       TEXT DEFAULT 'portal',
  UNIQUE (tenant_id, politica_id, employee_id, versao)
);

DO $$
DECLARE t UUID := 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
BEGIN
  INSERT INTO "RH_POLITICAS" (tenant_id, chave, titulo, versao)
  SELECT t, v.chave, v.titulo, '1.0' FROM (VALUES
    ('conduta','Código de Conduta e Ética'),
    ('lgpd','Política de Privacidade e Proteção de Dados'),
    ('seguranca','Política de Segurança da Informação'),
    ('recursos','Política de Uso de Recursos da Empresa'),
    ('anticorrupcao','Política Anticorrupção e Conflito de Interesses')
  ) AS v(chave,titulo)
  WHERE NOT EXISTS (SELECT 1 FROM "RH_POLITICAS" p WHERE p.tenant_id = t AND p.chave = v.chave);
END $$;

INSERT INTO "_MIGRATIONS" (version, name) VALUES ('083', 'documentos_rh')
ON CONFLICT (version) DO NOTHING;
