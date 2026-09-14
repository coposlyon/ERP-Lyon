-- ============================================================
-- 120. TOTAL EXPRESS: O QUE FOI TRANSMITIDO E O QUE VOLTOU.
--
--      A migração 118 trouxe a tabela de preço. Esta guarda a conversa
--      com o webservice (EDI ICS V24):
--
--        ENVIOS  cada pedido transmitido pelo RegistraColeta — aceito ou
--                recusado, com protocolo, AWB e o último status. É por
--                ela que o sistema sabe não transmitir o mesmo pedido de
--                novo: a Total Express recusa volume duplicado.
--
--        LOTES   o retorno cru do ObterTracking. Sem data, a consulta
--                CONSOME o lote do lado deles; guardar antes de aplicar
--                é o que impede um erro no meio do caminho de apagar o
--                status para sempre.
-- ============================================================

CREATE TABLE IF NOT EXISTS "TOTALEXPRESS_ENVIOS" (
  id                    UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id             UUID NOT NULL REFERENCES "EMPRESAS"(id) ON DELETE CASCADE,
  sale_id               UUID NOT NULL REFERENCES "VENDAS"(id) ON DELETE CASCADE,
  pedido                VARCHAR(20) NOT NULL,
  cod_remessa           VARCHAR(20),
  protocolo             VARCHAR(40),
  -- 'enviado' | 'rejeitado'
  situacao              VARCHAR(20) NOT NULL DEFAULT 'enviado',
  erro                  TEXT,
  awb                   VARCHAR(20),
  ultimo_status_codigo  INTEGER,
  ultimo_status         TEXT,
  ultimo_status_em      TIMESTAMPTZ,
  link_rastreio         TEXT,
  resposta              JSONB,
  enviado_por           TEXT,
  created_at            TIMESTAMPTZ DEFAULT now(),
  updated_at            TIMESTAMPTZ DEFAULT now()
);

-- Um envio aceito por pedido. Recusado pode haver vários: corrige-se o
-- cadastro e transmite-se de novo.
CREATE UNIQUE INDEX IF NOT EXISTS ux_tex_envio_aceito
  ON "TOTALEXPRESS_ENVIOS" (tenant_id, sale_id) WHERE situacao = 'enviado';
CREATE INDEX IF NOT EXISTS idx_tex_envio_pedido
  ON "TOTALEXPRESS_ENVIOS" (tenant_id, pedido);

CREATE TABLE IF NOT EXISTS "TOTALEXPRESS_LOTES" (
  id             UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id      UUID NOT NULL REFERENCES "EMPRESAS"(id) ON DELETE CASCADE,
  cod_retorno    BIGINT NOT NULL,
  data_geracao   TIMESTAMPTZ,
  conteudo       JSONB NOT NULL,
  processado_em  TIMESTAMPTZ,
  erro           TEXT,
  created_at     TIMESTAMPTZ DEFAULT now(),
  UNIQUE (tenant_id, cod_retorno)
);

ALTER TABLE "TOTALEXPRESS_ENVIOS" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "TOTALEXPRESS_LOTES"  ENABLE ROW LEVEL SECURITY;

NOTIFY pgrst, 'reload schema';

INSERT INTO "_MIGRATIONS" (version, name) VALUES ('120', 'total_express_webservice')
ON CONFLICT (version) DO NOTHING;
