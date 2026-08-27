-- ============================================================
-- 093. NF-e RECEBIDAS — as compras do CNPJ, vindas da SEFAZ.
--
-- O módulo Fiscal só sabia SAIR: emitir a nota da venda, consultar,
-- cancelar. A entrada não existia. Compra que a Lyon faz só chegava ao
-- sistema se alguém digitasse, e "alguém digitar" é uma promessa que
-- nenhuma empresa cumpre com todas as notas — o que faltasse ficava
-- fora do estoque, do custo e da apuração, sem ninguém saber que
-- faltou.
--
-- A SEFAZ sabe. Toda NF-e emitida CONTRA o CNPJ da Lyon passa por ela,
-- e o serviço de Distribuição de DF-e devolve essa lista para quem tem
-- o certificado da empresa. Não depende do fornecedor mandar o XML, não
-- depende de e-mail, não depende de digitação: se a nota existe, ela
-- aparece.
--
-- `versao` É O MARCADOR DA SINCRONIA. A Focus devolve, junto da lista,
-- um X-Max-Version; a próxima consulta pede só o que veio depois dele.
-- É isso que faz a sincronização ser incremental em vez de rebaixar o
-- CNPJ inteiro toda vez — e é isso que a coluna guarda.
-- ============================================================

CREATE TABLE IF NOT EXISTS "NFE_RECEBIDAS" (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL REFERENCES "EMPRESAS"(id) ON DELETE CASCADE,

  -- A chave de 44 dígitos é a identidade da nota no Brasil inteiro.
  -- Única por empresa: a mesma nota nunca entra duas vezes, por mais
  -- vezes que a sincronização rode.
  chave         VARCHAR(44) NOT NULL,

  nome_emitente      VARCHAR(200),
  documento_emitente VARCHAR(20),

  valor_total   NUMERIC(15,2) NOT NULL DEFAULT 0,
  data_emissao  TIMESTAMPTZ,
  situacao      VARCHAR(30),          -- autorizada | cancelada | denegada
  tipo_nfe      VARCHAR(2),           -- 0 = entrada, 1 = saída (na visão de quem emitiu)
  nfe_completa  BOOLEAN NOT NULL DEFAULT false,

  -- A manifestação do destinatário. NULL = ninguém se manifestou ainda,
  -- e é esse NULL que a tela usa para cobrar.
  manifestacao       VARCHAR(20),     -- ciencia | confirmacao | desconhecimento | nao_realizada
  manifestacao_at    TIMESTAMPTZ,
  manifestacao_proto VARCHAR(60),

  -- Baixado sob demanda: guardar o XML de toda nota do CNPJ desde
  -- sempre e sem ninguém pedir e um custo de armazenamento que nao se
  -- justifica ate alguem querer o arquivo.
  xml           TEXT,

  -- Quando esta nota virar uma compra lançada, o vínculo mora aqui.
  purchase_id   UUID,

  versao        BIGINT NOT NULL DEFAULT 0,
  raw           JSONB,

  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT nfe_recebidas_chave_unica UNIQUE (tenant_id, chave)
);

CREATE INDEX IF NOT EXISTS nfe_recebidas_tenant_idx
  ON "NFE_RECEBIDAS" (tenant_id, data_emissao DESC);
-- A pergunta mais frequente da tela: "o que ainda não foi manifestado?"
CREATE INDEX IF NOT EXISTS nfe_recebidas_pendentes_idx
  ON "NFE_RECEBIDAS" (tenant_id) WHERE manifestacao IS NULL;

ALTER TABLE "NFE_RECEBIDAS" ENABLE ROW LEVEL SECURITY;

-- ── O marcador da sincronia ───────────────────────────────
-- Fica na config fiscal porque é dela que a sincronização depende (CNPJ,
-- token, ambiente). Uma tabela só para guardar um número seria uma
-- viagem a mais ao banco em toda sincronização.
ALTER TABLE "CONFIG_FISCAL"
  ADD COLUMN IF NOT EXISTS recebidas_versao   BIGINT      NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS recebidas_sync_at  TIMESTAMPTZ;

-- PostgREST só enxerga o que é novo depois de recarregar o cache
NOTIFY pgrst, 'reload schema';

INSERT INTO "_MIGRATIONS" (version, name) VALUES ('093', 'nfe_recebidas')
ON CONFLICT (version) DO NOTHING;
