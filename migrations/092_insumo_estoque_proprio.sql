-- ============================================================
-- 092. INSUMOS — ESTOQUE PRÓPRIO.
--
-- Até aqui o insumo não tinha saldo nenhum. A coluna "Estoque" da tela
-- lia o `current_stock` do PRODUTO vinculado — e tinta, verniz e lâmina
-- não são produto de venda, então quase nenhum insumo tinha vínculo e
-- quase todos mostravam um traço. Não havia onde digitar a quantidade.
--
-- A razão original de não criar saldo próprio era não ter duas fontes de
-- verdade. A razão continua boa; a conclusão é que a fonte de verdade do
-- insumo é o INSUMO, e não um produto emprestado do cadastro de venda.
--
-- O saldo não é um campo que se sobrescreve e pronto: cada mudança deixa
-- um MOVIMENTO. Entrada (comprei), saída (usei) e ajuste (contei e era
-- outro). Assim "sumiram 4 litros de tinta" tem onde ser respondido.
-- ============================================================

ALTER TABLE "INSUMOS"
  ADD COLUMN IF NOT EXISTS current_stock NUMERIC(15,4) NOT NULL DEFAULT 0;

-- ── O extrato do insumo ───────────────────────────────────
-- `quantity` é sempre POSITIVA e na unidade base do insumo (ml, g, un).
-- Quem decide se soma ou subtrai é o `tipo` — guardar número negativo
-- obrigaria toda leitura a lembrar do sinal, e uma hora alguém esquece.
CREATE TABLE IF NOT EXISTS "INSUMO_MOVIMENTOS" (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id   UUID NOT NULL REFERENCES "EMPRESAS"(id) ON DELETE CASCADE,
  insumo_id   UUID NOT NULL REFERENCES "INSUMOS"(id) ON DELETE CASCADE,
  tipo        VARCHAR(12) NOT NULL CHECK (tipo IN ('entrada', 'saida', 'ajuste')),
  quantity    NUMERIC(15,4) NOT NULL CHECK (quantity >= 0),
  saldo_apos  NUMERIC(15,4) NOT NULL DEFAULT 0,
  unit_cost   NUMERIC(15,6),
  total       NUMERIC(15,2),
  reference   VARCHAR(80),
  notes       TEXT,
  user_name   VARCHAR(160),
  created_at  TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_insumo_mov ON "INSUMO_MOVIMENTOS"(tenant_id, insumo_id, created_at DESC);

ALTER TABLE "INSUMO_MOVIMENTOS" ENABLE ROW LEVEL SECURITY;

-- ── A carga inicial ───────────────────────────────────────
-- Insumo que HOJE mostra saldo o mostra por causa do produto vinculado.
-- Esse número é copiado uma vez para o saldo próprio: quem já tinha
-- estoque na tela continua com ele depois da migração, e a partir daqui
-- o produto não manda mais no saldo do insumo.
UPDATE "INSUMOS" i
   SET current_stock = COALESCE(p.current_stock, 0)
  FROM "PRODUTOS" p
 WHERE p.id = i.product_id
   AND i.current_stock = 0
   AND COALESCE(p.current_stock, 0) > 0;

INSERT INTO "INSUMO_MOVIMENTOS" (tenant_id, insumo_id, tipo, quantity, saldo_apos, notes, user_name)
SELECT i.tenant_id, i.id, 'ajuste', i.current_stock, i.current_stock,
       'Saldo herdado do produto vinculado na migração 092', 'carga inicial'
  FROM "INSUMOS" i
 WHERE i.current_stock > 0
   AND NOT EXISTS (SELECT 1 FROM "INSUMO_MOVIMENTOS" m WHERE m.insumo_id = i.id);

-- PostgREST só enxerga o que é novo depois de recarregar o cache
NOTIFY pgrst, 'reload schema';

INSERT INTO "_MIGRATIONS" (version, name) VALUES ('092', 'insumo_estoque_proprio')
ON CONFLICT (version) DO NOTHING;
