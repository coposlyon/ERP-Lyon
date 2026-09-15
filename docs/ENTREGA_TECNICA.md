# ERP Lyon Copos — Documentação Técnica de Entrega

Documento previsto na **Cláusula 7ª** do contrato (entrega de repositórios, documentação, credenciais, scripts e banco). Complementa `SETUP.md` (instalação local), `ESTRUTURA_BANCO.md` (tabelas) e `INTEGRACOES.md` (APIs externas). Nenhuma senha ou chave está escrita aqui: os **nomes** das credenciais estão listados na seção 6 e os **valores** são entregues à CONTRATANTE por canal separado.

---

## 1. Arquitetura

```
navegador ──► Discloud (Node 18+, porta 8080) ──► Supabase (Postgres + Storage + Auth)
              ├─ backend/  Express — API em /api/*
              └─ backend/public/  build do frontend (React 18 + Vite), servido pelo mesmo processo
```

| Camada | Tecnologia | Onde |
|---|---|---|
| Frontend | React 18, Vite, TanStack Query, Tailwind (tema claro/escuro por classe) | `frontend/` → build em `backend/public/` |
| Backend | Node.js, Express, `@supabase/supabase-js`, `pg` | `backend/src/` |
| Banco | Postgres (Supabase), projeto `abtbkajjtuetactzsaou`, região `sa-east-1` | Supabase |
| Arquivos | Supabase Storage — bucket público (imagens de catálogo) e privado (comprovantes, artes, fotos) | Supabase |
| Autenticação | Supabase Auth (e-mail + senha); perfil, setor e permissões em `USUARIOS` | Supabase |
| Hospedagem | Discloud, app `lyoncopos.online`, deploy automático a cada push na `main` | GitHub → Discloud |
| Domínio | `lyoncopos.online` (DNS apontado para o Discloud) | registrador do cliente |

**Multi-tenant por coluna:** toda tabela de negócio tem `tenant_id`; o middleware de autenticação resolve o tenant do usuário e todas as consultas filtram por ele.

---

## 2. Repositório e código-fonte

- **Repositório oficial (propriedade da CONTRATANTE):** https://github.com/coposlyon/ERP-Lyon — branch `main`.
- Cada commit descreve o que mudou e por quê (histórico completo desde o início do projeto). O `git log` é a trilha de alterações da Cláusula 14ª.
- Estrutura:

```
backend/
  src/app.js                 servidor, migrações automáticas no boot
  src/config/env.js          carrega .env e valida variáveis
  src/routes/*.js            uma rota por módulo (sales, financial, production, contador…)
  src/lib/atencao.js         catálogo dos 28 status, módulos e fases
  src/lib/fluxoPedido.js     regras de quem move o quê, requisitos por etapa
  src/lib/pedidoAutomacao.js avanços automáticos (pagamento, arte, estoque)
  src/lib/prazoProducao.js   data-limite de saída em dias úteis + alerta 24h
  scripts/migrate.js         aplica migrações; google-token.js; seeds de teste
  public/                    build do frontend (commitado)
frontend/
  src/pages/<Modulo>/        telas; src/lib/menu.js é o registro de telas e permissões
  src/components/Fluxo/      fila de etapas genérica (Designer, Produção, Logística)
migrations/NNN_*.sql         esquema do banco, em ordem, com comentário do porquê
docs/                        este documento, manual e treinamento
```

---

## 3. Deploy e operação

**Deploy:** `git push origin main` → o Discloud reconstrói e reinicia. O servidor **precisa** ouvir na porta **8080** no Discloud (forçado no código quando detecta o ambiente). Variáveis de ambiente novas só valem após um **novo deploy** (não bastam reiniciar).

**Build do frontend:** `cd frontend && npm run build` gera `backend/public/`, que é commitado — o Discloud não roda o build.

**Migrações:** em `migrations/`, numeradas. Rodam sozinhas no boot (`AUTO_MIGRATE`) ou à mão com `node backend/scripts/migrate.js` (`--dry` só lista). O runner grava em `_MIGRATIONS` e avisa se dois arquivos tiverem o mesmo número. Estado atual: **122 migrações aplicadas**.

**Logs:** painel do Discloud (stdout). Erros de rota aparecem como `[modulo/rota] mensagem`.

**Conexão ao banco fora do app:** usar o **pooler** do Supabase (`aws-1-sa-east-1.pooler.supabase.com:5432`, usuário `postgres.<projeto>`); o host direto `db.<projeto>.supabase.co` é só IPv6 e não responde do Discloud.

---

## 4. Segurança da informação (Cláusula 11ª)

| Exigência | Como está atendida |
|---|---|
| Backups redundantes | Supabase: backups diários automáticos do Postgres (plano do projeto) + PITR quando habilitado. Recomenda-se ainda um `pg_dump` mensal guardado fora do Supabase (comando na seção 5). |
| Trilha de auditoria | Tabela `AUDITORIA` (quem, o quê, quando, em qual registro, detalhes) alimentada por todas as rotas de escrita; `production_log` em cada pedido com cada status, hora e usuário; histórico de cada conta a receber. Nada é apagado — só cancelado/desativado. |
| Controle de acessos | Supabase Auth + setor (`Configurações → Permissões por setor`) + permissão por tela no cadastro do colaborador; o servidor valida o **módulo** em cada rota (`requireModules`). Senha dupla para avançar etapas na fábrica. Chaves de serviço só no servidor. |
| Recuperação de desastre | Código no GitHub; banco restaurável pelo painel do Supabase (backup diário) ou por `pg_restore` do dump; app recriável no Discloud em minutos a partir do repositório + variáveis (seção 6). Procedimento na seção 5. |
| LGPD | Dados pessoais só nas tabelas de cadastro; portal do cliente exige CPF + dado pessoal para abrir o pedido; comprovantes e artes em bucket **privado** com link temporário; `.env` fora do repositório (`.gitignore`). |

---

## 5. Procedimentos

**Backup manual do banco**
```bash
pg_dump "$DATABASE_URL" --no-owner --format=custom --file=lyon_$(date +%Y%m%d).dump
```

**Restaurar** (em um banco vazio ou novo projeto Supabase)
```bash
pg_restore --no-owner --dbname="$DATABASE_URL" lyon_YYYYMMDD.dump
```

**Recriar o app do zero (disaster recovery)**
1. Discloud → novo app tipo *site*, conectar ao GitHub `coposlyon/ERP-Lyon`, branch `main`.
2. Colar as variáveis da seção 6 (valores entregues à parte).
3. Deploy. O boot aplica migrações pendentes e sobe na porta 8080.
4. Apontar o DNS do domínio para o Discloud (se mudou).

**Dar acesso a um novo desenvolvedor**
1. GitHub: adicionar como colaborador em `coposlyon/ERP-Lyon`.
2. Supabase: convidar para a organização com papel *Developer*.
3. Discloud: adicionar como membro do app (ou compartilhar o painel).
4. Ele roda `SETUP.md` localmente com um `.env` próprio.

**Rotina mensal recomendada:** ver *Manual → 12* e *Treinamento → Encontro 6* (fechamento). Tecnicamente: conferir o painel do Supabase (uso de banco/storage), baixar um dump, e verificar em `Contábil → Alertas` a validade do certificado digital.

---

## 6. Credenciais e acessos a entregar (nomes)

Entregues à CONTRATANTE em canal separado, nunca neste arquivo nem no repositório.

**Contas administrativas**
- GitHub — organização/usuário `coposlyon` (dono do repositório)
- Supabase — organização e projeto `abtbkajjtuetactzsaou` (dono)
- Discloud — conta dona do app `lyoncopos.online`
- Registrador do domínio `lyoncopos.online`
- Google Cloud — projeto do OAuth "lyoncoposwebcont" (Google Contatos)
- Usuário **Administrador** do ERP

**Variáveis de ambiente do servidor** (as 11 em produção hoje; o `.env.example` documenta todas as ~60 opcionais)
`NODE_ENV` `PORT` `FRONTEND_URL` `SUPABASE_URL` `SUPABASE_ANON_KEY` `SUPABASE_SERVICE_KEY` `DATABASE_URL` `GROQ_API_KEY` `GOOGLE_CLIENT_ID` `GOOGLE_CLIENT_SECRET` `GOOGLE_REFRESH_TOKEN`

**Integrações que dependem de credenciais da CONTRATANTE** (código pronto, aguardando)
- Certificado digital A1 + emissor de NF-e (`fiscal`)
- Banco: boleto/CNAB (`BOLETO_*`), PIX com gateway (`MP_*`) — hoje PIX manual Nubank por decisão do cliente
- Transportadoras: Total Express (`TOTALEXPRESS_*`, bloqueado por liberação de IP do lado deles), Braspress, Melhor Envio
- WhatsApp Business (`WHATSAPP_*`), Meta/Instagram (`FB_*`, `IG_*`), e-mail (`RESEND_*`)
- Leiaute do escritório contábil para a exportação (hoje genérica em Excel/CSV)

---

## 7. Garantia e suporte (Cláusulas 12ª e 13ª)

- Garantia de **6 meses** a partir da homologação definitiva para erros de programação, sem custo.
- Canal: WhatsApp/e-mail do CONTRATADO. Falha **crítica** (sistema fora do ar, pedido não anda, dinheiro errado) tem prioridade sobre qualquer outra demanda.
- Ao relatar: tela, o que clicou, o que esperava, o que aconteceu, e o número do pedido/conta. A Auditoria e o histórico do pedido geralmente já contam o resto.
