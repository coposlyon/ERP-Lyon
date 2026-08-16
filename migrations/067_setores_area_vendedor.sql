-- ============================================================
-- 067. PERMISSÃO POR SETOR + ÁREA DO VENDEDOR
--
--      Até aqui a permissão era uma lista de módulos colada em cada
--      usuário: contratar um vendedor significava lembrar quais 5
--      módulos marcar, e errar um deixava alguém vendo o custo do
--      produto. Agora o SETOR carrega o acesso, e o usuário só aponta
--      para o setor dele.
--
--      Junto vêm as três tabelas que faltavam para o vendedor
--      trabalhar sem entrar em módulo administrativo: agenda,
--      comunicação com o gerente e o alerta compartilhado entre
--      setores.
-- ============================================================

-- ── Perfil de acesso por setor ───────────────────────────────
-- layout diz QUAL ERP a pessoa vê: 'erp' é o sistema inteiro com os
-- grupos do menu; 'vendedor' é a área enxuta de cinco itens. Não é
-- decoração — é o que impede o vendedor de esbarrar em Estoque.
CREATE TABLE IF NOT EXISTS "SETORES_PERFIS" (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  UUID NOT NULL,
  key        TEXT NOT NULL,
  name       TEXT NOT NULL,
  modules    JSONB NOT NULL DEFAULT '[]'::jsonb,
  layout     TEXT NOT NULL DEFAULT 'erp',
  home_path  TEXT NOT NULL DEFAULT '/',
  sort       INT  NOT NULL DEFAULT 0,
  is_system  BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, key)
);

CREATE INDEX IF NOT EXISTS setores_perfis_tenant_idx ON "SETORES_PERFIS" (tenant_id, sort);

-- O setor do usuário. NULL mantém o comportamento antigo (allowed_modules
-- manda sozinho) — nenhum acesso muda até alguém escolher um setor.
ALTER TABLE "USUARIOS" ADD COLUMN IF NOT EXISTS sector_key TEXT;

-- ── Origem real da venda ─────────────────────────────────────
-- source já existia e diz COMO o pedido entrou (manual x site). origin
-- diz DE ONDE o cliente veio (Shopee, WhatsApp, Instagram...). São
-- perguntas diferentes: um pedido pode nascer no WhatsApp e ser
-- digitado à mão pelo vendedor.
ALTER TABLE "VENDAS" ADD COLUMN IF NOT EXISTS origin TEXT;
CREATE INDEX IF NOT EXISTS vendas_origin_idx ON "VENDAS" (tenant_id, origin);

-- ── Agenda do vendedor ───────────────────────────────────────
-- Reunião, ligação, retorno, compromisso, observação. De propósito não
-- é um CRM: sem funil, sem estágio, sem automação.
CREATE TABLE IF NOT EXISTS "AGENDA_VENDEDOR" (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL,
  user_id     UUID NOT NULL,
  kind        TEXT NOT NULL DEFAULT 'compromisso',
  title       TEXT NOT NULL,
  notes       TEXT,
  customer_id UUID REFERENCES "CLIENTES"(id) ON DELETE SET NULL,
  due_at      TIMESTAMPTZ,
  done        BOOLEAN NOT NULL DEFAULT false,
  done_at     TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS agenda_vendedor_idx
  ON "AGENDA_VENDEDOR" (tenant_id, user_id, due_at);

-- ── Comunicação vendedor ↔ gerente ───────────────────────────
-- Só esse par. O vendedor não fala direto com produção, financeiro,
-- estoque ou designer: ele relata ao gerente e o gerente encaminha.
-- É o que evita o operador da produção recebendo cobrança de três
-- vendedores ao mesmo tempo.
--
-- thread_id agrupa a conversa; sale_id amarra ao pedido quando a
-- mensagem nasceu de um alerta.
CREATE TABLE IF NOT EXISTS "MENSAGENS_INTERNAS" (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    UUID NOT NULL,
  thread_id    UUID NOT NULL DEFAULT gen_random_uuid(),
  from_user_id UUID NOT NULL,
  from_name    TEXT,
  to_user_id   UUID,
  sale_id      UUID REFERENCES "VENDAS"(id) ON DELETE SET NULL,
  subject      TEXT,
  body         TEXT NOT NULL,
  read_at      TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS mensagens_internas_thread_idx
  ON "MENSAGENS_INTERNAS" (tenant_id, thread_id, created_at);
CREATE INDEX IF NOT EXISTS mensagens_internas_caixa_idx
  ON "MENSAGENS_INTERNAS" (tenant_id, to_user_id, read_at);

-- ── Alerta compartilhado entre setores ───────────────────────
-- O nível (normal/atenção/crítico) NÃO mora aqui: ele é calculado do
-- prazo de saída contra o relógio, então guardá-lo nasceria velho.
-- O que se guarda é o que uma pessoa levantou: qual pedido, qual área
-- responsável, qual o problema — e quando foi resolvido.
--
-- A mesma linha aparece para o vendedor e para a área responsável,
-- cada um vendo o que o perfil dele permite.
CREATE TABLE IF NOT EXISTS "ALERTAS_PEDIDO" (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL,
  sale_id     UUID NOT NULL REFERENCES "VENDAS"(id) ON DELETE CASCADE,
  area        TEXT NOT NULL,
  stage       TEXT,
  reason      TEXT,
  raised_by   UUID,
  raised_name TEXT,
  resolved_at TIMESTAMPTZ,
  resolved_by UUID,
  resolution  TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS alertas_pedido_area_idx
  ON "ALERTAS_PEDIDO" (tenant_id, area, resolved_at);
CREATE INDEX IF NOT EXISTS alertas_pedido_venda_idx
  ON "ALERTAS_PEDIDO" (tenant_id, sale_id);

-- ── Setores padrão ───────────────────────────────────────────
-- Semeados para toda empresa que ainda não tem nenhum. São editáveis
-- em Configurações → Permissões por setor; is_system só marca que
-- vieram de fábrica.
INSERT INTO "SETORES_PERFIS" (tenant_id, key, name, modules, layout, home_path, sort, is_system)
SELECT e.id, s.key, s.name, s.modules::jsonb, s.layout, s.home_path, s.sort, true
  FROM "EMPRESAS" e
 CROSS JOIN (VALUES
   ('gerente',    'Gerência',    '["dashboard","products","customers","suppliers","employees","logistics","price-tables","sales","pdv","vendedor","pedidos-vendedor","catalogo","agenda","comunicacao","quotes","customizations","purchases","stock","financial","fiscal","reports","returns","quality","crm","marketing","production","hr"]', 'erp',      '/',          1),
   ('vendedor',   'Vendas',      '["vendedor","pedidos-vendedor","catalogo","agenda","comunicacao"]',                                    'vendedor', '/vendedor',  2),
   ('financeiro', 'Financeiro',  '["dashboard","financial","fiscal","reports","customers"]',                                             'erp',      '/financial', 3),
   ('estoque',    'Estoque',     '["dashboard","stock","products","purchases"]',                                                         'erp',      '/stock',     4),
   ('producao',   'Produção',    '["dashboard","production","quality","customizations"]',                                                'erp',      '/production',5),
   ('logistica',  'Logística',   '["dashboard","logistics","sales"]',                                                                    'erp',      '/logistics', 6),
   ('designer',   'Design',      '["dashboard","customizations"]',                                                                       'erp',      '/customizations', 7),
   ('qualidade',  'Qualidade',   '["dashboard","quality","production"]',                                                                 'erp',      '/quality',   8)
 ) AS s(key, name, modules, layout, home_path, sort)
 WHERE NOT EXISTS (SELECT 1 FROM "SETORES_PERFIS" p WHERE p.tenant_id = e.id);

ALTER TABLE "SETORES_PERFIS"    ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AGENDA_VENDEDOR"   ENABLE ROW LEVEL SECURITY;
ALTER TABLE "MENSAGENS_INTERNAS" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ALERTAS_PEDIDO"    ENABLE ROW LEVEL SECURITY;

NOTIFY pgrst, 'reload schema';

INSERT INTO "_MIGRATIONS" (version, name) VALUES ('067', 'setores_area_vendedor')
ON CONFLICT (version) DO NOTHING;
