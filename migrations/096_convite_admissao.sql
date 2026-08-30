-- ============================================================
-- 096. CONVITE DE ADMISSÃO — o colaborador preenche a própria ficha.
--
--      HOJE alguém do RH digita a admissão inteira: nome, CPF, PIS, RG,
--      endereço, cônjuge, filhos, dados bancários. Tudo isso já está na
--      mão da pessoa que está sendo contratada — e é ela quem sabe se o
--      CEP é 86020-000 ou 86020-010. O RH digita de novo, errando o que
--      o outro sabe de cor, e depois liga para conferir.
--
--      Este convite inverte: gera-se um endereço aleatório com prazo, e
--      quem preenche é o próprio colaborador, do celular dele, SEM
--      LOGIN. O RH deixa de digitar e passa a CONFERIR — que é o que ele
--      sabe fazer melhor.
--
--      POR QUE UMA TABELA SEPARADA, E NÃO UM COLABORADOR RASCUNHO.
--
--      O que chega pelo link ainda não é um colaborador: é uma proposta
--      de cadastro, vinda de fora, sem ninguém autenticado por trás.
--      Gravar isso direto em CLIENTES misturaria gente contratada com
--      gente que digitou qualquer coisa num link — e a lista de
--      colaboradores é usada pela folha, pelo ponto e pelo eSocial.
--      Aqui o dado fica em quarentena, em `dados` (jsonb), até alguém do
--      RH aprovar. Só na aprovação nasce o colaborador de verdade.
--
--      O TOKEN É O SEGREDO, E POR ISSO TEM PRAZO. Quem tem o endereço
--      entra: não há senha. É a mesma escolha do link de acompanhamento
--      do pedido, e é aceitável porque o link é gerado sob demanda, vai
--      para uma pessoa só e morre em algumas horas — o prazo é escolhido
--      por quem gera. Depois de usado, também não abre mais.
--
--      NÃO GUARDA ARQUIVO. Documento (RG, comprovante) continua sendo
--      anexado depois, pelo RH ou pelo portal do colaborador, onde já
--      existe controle de quem enviou o quê. Um link anônimo aceitando
--      upload seria uma porta aberta para encher o Storage.
-- ============================================================

CREATE TABLE IF NOT EXISTS "RH_CONVITES_ADMISSAO" (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL REFERENCES "EMPRESAS"(id) ON DELETE CASCADE,

  -- O endereço aleatório. UNIQUE porque ele É a credencial.
  token       TEXT NOT NULL UNIQUE,
  expires_at  TIMESTAMPTZ NOT NULL,

  -- Para o RH saber de quem é o link antes de a pessoa preencher.
  -- Opcional: dá para gerar um link em branco e mandar para quem for.
  convidado_nome  TEXT,
  convidado_email TEXT,

  -- aberto     link criado, ninguém preencheu ainda
  -- enviado    o colaborador preencheu e está esperando conferência
  -- aprovado   virou colaborador (employee_id preenchido)
  -- recusado   o RH devolveu, com motivo
  -- cancelado  o RH matou o link antes de usarem
  status      TEXT NOT NULL DEFAULT 'aberto',

  -- A ficha como ela chegou, crua. Fica guardada mesmo depois de
  -- aprovada: é o documento do que a pessoa declarou, e é o que
  -- responde "quem escreveu esse CPF errado" seis meses depois.
  dados       JSONB,

  employee_id UUID REFERENCES "CLIENTES"(id) ON DELETE SET NULL,

  created_by       UUID,
  created_by_name  TEXT,
  submitted_at     TIMESTAMPTZ,
  reviewed_at      TIMESTAMPTZ,
  reviewed_by      UUID,
  reviewed_by_name TEXT,
  motivo_recusa    TEXT,

  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- A rota pública chega pelo token e por mais nada.
CREATE INDEX IF NOT EXISTS idx_convite_token  ON "RH_CONVITES_ADMISSAO" (token);
-- A aba Pendentes pergunta sempre a mesma coisa: os deste tenant, por status.
CREATE INDEX IF NOT EXISTS idx_convite_tenant ON "RH_CONVITES_ADMISSAO" (tenant_id, status, created_at DESC);

NOTIFY pgrst, 'reload schema';

INSERT INTO "_MIGRATIONS" (version, name) VALUES ('096', 'convite_admissao')
ON CONFLICT (version) DO NOTHING;
