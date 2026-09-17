-- ============================================================
-- 126. INSCRIÇÃO ESTADUAL/MUNICIPAL E CERTIDÕES DA EMPRESA.
--
--      Contábil › Empresas ganha:
--        · IE e IM no cadastro de cada CNPJ;
--        · as certidões da empresa (CND Federal, Estadual, Municipal,
--          FGTS, Trabalhista...), com emissão, validade e o arquivo.
--
--      O arquivo vai para o bucket PRIVADO: certidão traz CNPJ, situação
--      fiscal e débitos, e não pode circular por link permanente. A tela
--      pede um link assinado, que expira, na hora de abrir.
-- ============================================================

ALTER TABLE "CONTABIL_EMPRESAS" ADD COLUMN IF NOT EXISTS inscricao_estadual  VARCHAR(30);
ALTER TABLE "CONTABIL_EMPRESAS" ADD COLUMN IF NOT EXISTS inscricao_municipal VARCHAR(30);

CREATE TABLE IF NOT EXISTS "CONTABIL_CERTIDOES" (
  id            UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id     UUID NOT NULL REFERENCES "EMPRESAS"(id) ON DELETE CASCADE,
  company_id    UUID NOT NULL REFERENCES "CONTABIL_EMPRESAS"(id) ON DELETE CASCADE,
  tipo          VARCHAR(40) NOT NULL,          -- federal | estadual | municipal | fgts | trabalhista | outra
  descricao     VARCHAR(120),
  numero        VARCHAR(80),
  emissao       DATE,
  validade      DATE,
  arquivo       TEXT,                          -- caminho no bucket privado
  arquivo_nome  VARCHAR(200),
  observacao    TEXT,
  created_by    UUID,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_contabil_certidoes_empresa ON "CONTABIL_CERTIDOES"(tenant_id, company_id, validade);

ALTER TABLE "CONTABIL_CERTIDOES" ENABLE ROW LEVEL SECURITY;
