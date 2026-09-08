-- ============================================================
-- 110. O MÓDULO COMUNICAÇÃO — chat da empresa e agenda de todos.
--
-- O QUE JÁ EXISTIA, E POR QUE NÃO BASTAVA.
--
-- `MENSAGENS_INTERNAS` é conversa DIRIGIDA: uma linha por destinatário,
-- vendedor falando com gerente sobre um pedido. Serve para cobrança e
-- para recado com dono — e não serve para "alguém sabe onde parou a
-- tinta preta?", que é pergunta para a sala inteira. Encaixar sala
-- inteira ali significaria uma linha por pessoa por mensagem: dez
-- funcionários, dez cópias do mesmo texto, e a décima primeira pessoa
-- contratada amanhã não enxerga nada do que foi dito antes dela.
--
-- `AGENDA_VENDEDOR` é lista de tarefas PESSOAL: um dono, uma data, um
-- feito/não feito. Serve para o retorno que o vendedor tem de dar — e
-- não serve para reunião, que tem hora de início E de fim, lugar e mais
-- de uma pessoa.
--
-- Esta migração acrescenta o que falta às duas pontas: uma tabela nova
-- para o chat da sala, e as colunas que transformam a lista pessoal num
-- calendário compartilhado. NADA É REESCRITO — os compromissos que já
-- estão lá continuam funcionando exatamente como estavam.
-- ============================================================

-- ── O CHAT DA EMPRESA ────────────────────────────────────────
--
-- UMA LINHA POR MENSAGEM, e não uma por destinatário: a mensagem é da
-- SALA. Quem entrar depois lê o que foi dito antes, que é a diferença
-- entre um chat e uma caixa de entrada.
--
-- `canal` nasce com um valor só ('geral') e existe assim mesmo. O dia
-- em que a produção quiser a sala dela não deve ser o dia em que se
-- descobre que a coluna não existe e que toda mensagem antiga teria de
-- ser migrada para ganhar uma.
CREATE TABLE IF NOT EXISTS "CHAT_MENSAGENS" (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL REFERENCES "EMPRESAS"(id) ON DELETE CASCADE,
  canal       TEXT NOT NULL DEFAULT 'geral',

  user_id     UUID REFERENCES "USUARIOS"(id) ON DELETE SET NULL,
  -- O NOME FICA GRAVADO NA MENSAGEM. `user_id` vira NULL quando alguém
  -- sai da empresa, e sem isto a conversa inteira daquela pessoa
  -- passaria a ser assinada por "—". O que foi dito continua tendo
  -- sido dito por alguém.
  user_name   TEXT,

  body        TEXT NOT NULL,

  -- Responder citando. Aponta para outra mensagem do mesmo canal; se a
  -- citada for apagada, a resposta continua de pé sem a citação, que é
  -- melhor do que sumir junto.
  reply_to    UUID REFERENCES "CHAT_MENSAGENS"(id) ON DELETE SET NULL,

  -- Quem foi chamado pelo nome. Guardado em coluna, e não deduzido do
  -- texto a cada leitura: procurar "@fulano" dentro de mil mensagens
  -- para pintar um badge é trabalho que se faz uma vez, na escrita.
  mencionados UUID[] NOT NULL DEFAULT '{}',

  -- APAGAR NÃO APAGA. A mensagem fica, marcada, e a tela mostra
  -- "mensagem removida". Sumir sem deixar buraco é o que permite
  -- alguém dizer uma coisa, ser respondido, e depois fazer a pergunta
  -- desaparecer — deixando a resposta órfã e o histórico mentiroso.
  deleted_at  TIMESTAMPTZ,
  edited_at   TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- A leitura é sempre "as últimas N deste canal, desta empresa".
CREATE INDEX IF NOT EXISTS chat_mensagens_canal_idx
    ON "CHAT_MENSAGENS" (tenant_id, canal, created_at DESC);

-- ── ATÉ ONDE CADA UM JÁ LEU ──────────────────────────────────
--
-- Uma linha por pessoa por canal, com o instante da última leitura. O
-- não lido sai de uma contagem por data, e não de uma marca em cada
-- mensagem: com marca por mensagem, dez pessoas numa sala de mil
-- mensagens dão dez mil linhas para dizer uma coisa só.
CREATE TABLE IF NOT EXISTS "CHAT_LEITURAS" (
  tenant_id  UUID NOT NULL REFERENCES "EMPRESAS"(id) ON DELETE CASCADE,
  user_id    UUID NOT NULL REFERENCES "USUARIOS"(id) ON DELETE CASCADE,
  canal      TEXT NOT NULL DEFAULT 'geral',
  lido_ate   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (tenant_id, user_id, canal)
);

-- ── A AGENDA VIRA CALENDÁRIO ─────────────────────────────────
--
-- A tabela continua se chamando AGENDA_VENDEDOR por história: ela
-- nasceu na área do vendedor e tem compromissos gravados nela. Renomear
-- custaria mais do que o nome vale.
--
-- `due_at` era a única data: bom para "ligar para o cliente às 14h",
-- inútil para "reunião de produção das 9h às 10h30". As colunas abaixo
-- são o que separa lembrete de compromisso.
ALTER TABLE "AGENDA_VENDEDOR"
  -- Quando termina. NULL = ponto no tempo, como sempre foi.
  ADD COLUMN IF NOT EXISTS end_at       TIMESTAMPTZ,
  -- Dia inteiro: feriado, viagem, entrega combinada "para quinta". Sem
  -- isto, tudo precisa de uma hora inventada.
  ADD COLUMN IF NOT EXISTS dia_inteiro  BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS local        TEXT,
  -- Quem mais está nessa. O dono continua sendo `user_id` — quem marcou
  -- responde pelo compromisso —, e os participantes enxergam e podem
  -- concluir. Reunião com uma pessoa só não é reunião.
  ADD COLUMN IF NOT EXISTS participantes UUID[] NOT NULL DEFAULT '{}',
  -- COMPROMISSO DA EMPRESA, e não de quem digitou. Feriado, parada de
  -- máquina, inventário: aparece para todo mundo sem precisar listar
  -- todo mundo em `participantes` e sem esquecer de acrescentar o
  -- próximo contratado.
  ADD COLUMN IF NOT EXISTS da_empresa   BOOLEAN NOT NULL DEFAULT FALSE;

-- O calendário lê por FAIXA DE DATA — "o que acontece neste mês" —, e é
-- essa a pergunta que precisa de índice. A listagem antiga, por dono,
-- continua atendida pelo índice que já existe.
CREATE INDEX IF NOT EXISTS agenda_periodo_idx
    ON "AGENDA_VENDEDOR" (tenant_id, due_at);

NOTIFY pgrst, 'reload schema';

INSERT INTO "_MIGRATIONS" (version, name) VALUES ('110', 'comunicacao_e_agenda')
ON CONFLICT (version) DO NOTHING;
