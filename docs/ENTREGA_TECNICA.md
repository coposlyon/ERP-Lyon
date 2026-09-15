# ERP Lyon Copos — Documentação de Entrega

| Identificação | |
|---|---|
| Sistema | ERP Lyon Copos (Dator ERP) — https://lyoncopos.online |
| Contratante | Lyon Copos — Clodoaldo Farinha, CNPJ 40.899.894/0001-18 |
| Desenvolvimento | Pablo Flores Santarem |
| Data de referência | 15/09/2026 |

Este documento registra **o que foi desenvolvido e entregue, onde cada parte está e como o sistema opera**. Acompanham: *Manual do Sistema* (`docs/MANUAL_DO_SISTEMA.md`), *Treinamento Completo* (`docs/TREINAMENTO.md`), `SETUP.md` (instalação), `ESTRUTURA_BANCO.md` (tabelas) e `INTEGRACOES.md` (APIs externas). Nenhuma senha ou chave está escrita aqui: a seção 9 lista os **nomes** das credenciais; os **valores** são entregues por canal separado.

---

## 1. Resumo da entrega

| Item | Situação em 15/09/2026 |
|---|---|
| Sistema em produção | no ar em https://lyoncopos.online (Discloud) |
| Código-fonte | repositório `coposlyon/ERP-Lyon`, branch `main`, histórico completo desde 10/06/2026 (mais de 830 commits) |
| Banco de dados | Supabase (Postgres), 117 tabelas, migrações aplicadas até a **125** |
| Módulos | 14 grupos de menu, mais de 100 telas, 73 arquivos de rotas de API (seção 2) |
| Portais públicos | catálogo personalizado, loja de lisos, portal do cliente, cadastro de cliente/fornecedor/transportadora, admissão, portal do fornecedor, ponto |
| Documentação | manual, treinamento completo por módulo, esta documentação, setup, estrutura do banco, integrações |
| Backup redundante | automático diário + manual, com verificação e script de restauração (seção 6) |
| Acessos | relação completa na seção 9 |

---

## 2. Inventário do que foi desenvolvido

| Grupo | Telas / recursos entregues |
|---|---|
| **Dashboard** | vendas do dia e do mês, pedidos abertos, a receber, contas vencidas, comparativo anual, teto de faturamento |
| **Comercial** | Pedidos de Venda (novo pedido completo, parcelas, arte, documento, histórico, régua de 28 status), Orçamentos (PNG, WhatsApp, e-mail, conversão), Dashboard do Vendedor (metas, faixas, comissão, carteira, ranking, ofertas por WhatsApp), Área do Vendedor, Plano de Metas, Lyon Prime (estrelas e selo de confiança), Cupons |
| **Financeiro** | Pagamentos da Loja (PIX), Central de Contas, Contas a Receber/Pagar (conferir/confirmar/desfazer, cobrança PIX e WhatsApp, histórico), Fluxo de Caixa, DRE, Malote de Pagamentos, Config. Financeira (plano de contas, bancos, centros de custo) |
| **Fiscal / Contábil** | NF-e (emissão, DANFE, XML, cancelamento, manifesto — via emissor Focus NFe), Contábil (empresas e limite anual, bancos, conciliação, DRE mensal/trimestral/anual, margem consolidada, tributário, malote com registro de envio, exportação para o contador em Excel/CSV) |
| **Designer** | fila de impressão do vegetal com confirmação dupla |
| **Produção** | fila de revelação, pintura, borda, metalização, produção, qualidade, foto e embalagem; serigrafia (telas, gravações, perdas de matriz); Devoluções e Trocas |
| **Logística** | etapas de coleta/retirada, trânsito e entrega; expedição (aviso ao cliente, volumes, Total Express); transportadoras com prazo em dias úteis; caixas e regras de frete |
| **Cadastros** | Produtos (fotos, variações, edição em massa, importação, catálogo do produto, adicionais), sub-produtos/cores/bordas, Clientes (crédito, Google Contatos, marketing), Aprovações de Cadastro, Fornecedores (portal do fornecedor) |
| **Engenharia de Custos** | **Maquinários** e **Computadores e TI** (cadastro, produção e desgaste, manutenção e checklist, peças e componentes, depreciação e reposição, histórico, custo mensal no rateio), Insumos e Materiais, Despesas Fixas, Despesas Variáveis, Formação de Preço por categoria, Tabela de Preços; telas de análise (rentabilidade, rateio por categoria/pedido, simulador de metas, histórico de rateios) disponíveis por endereço |
| **Relatórios** | vendas, rentabilidade por pedido, mais vendidos, curva ABC, comissões, clientes, orçamentos, lançamentos, posição de estoque; Previsão de Demanda |
| **Recursos Humanos** | Painel RH, Colaboradores (cadastro em passos, link de admissão sem login, permissões por tela), Estrutura da Empresa, Bater Ponto, Jornada/Ponto, Ocorrências, Férias/Afastamentos, Folha e Benefícios, Documentos, eSocial/FGTS, Admissões, Desligamentos, Conformidade; portais do colaborador, do gestor e do contador |
| **Estoque e Compras** | saldo, movimentos, perdas, contagem, estoque negativo, solicitação de reposição ao fornecedor por link, compras e importação de NF-e de entrada |
| **Comunicação** | chat da empresa, mural de atividades, agenda com feriados |
| **Sites** | sites públicos e editor da loja (topo, seções, promoções, blocos, textos, rodapé, redes) |
| **Configurações** | Geral (empresa, site, e-mail, pagamento, transportadora, serigrafia, crédito, fiscal), Permissões por setor, Feriados, Catálogo, Usuários, Auditoria, **Backup** |
| **Público** | `/personalizados` (catálogo), `/loja`, `/acompanhar` (portal do cliente: linha do tempo, aprovação de arte, comprovante, fotos, 2ª via, retirada), `/cadastro`, `/cadastro-fornecedor`, `/cadastro-transportadora`, `/admissao/:token`, `/fornecedor/:token`, `/marcacao` |

---

## 3. Correspondência com o contrato

| Cláusula | O que pede | Onde está |
|---|---|---|
| 1ª — Objeto | ERP em nuvem | https://lyoncopos.online (Discloud + Supabase) |
| 1ª | análise, programação, implantação | sistema em produção; decisões registradas nas mensagens de commit |
| 1ª | treinamento | `docs/TREINAMENTO.md` (partes 0 a 17: passo a passo e checklists por módulo, rotinas e plano de encontros) |
| 1ª | documentação técnica | este documento, `SETUP.md`, `ESTRUTURA_BANCO.md`, `INTEGRACOES.md`, comentários no código |
| 1ª | banco de dados | Supabase; esquema em `migrations/` (seção 5) |
| 1ª | integrações e APIs | API REST em `/api/*` (73 arquivos de rotas); integrações da seção 8 |
| 1ª | código-fonte integral | repositório `coposlyon/ERP-Lyon` (seção 4) |
| 2ª — Escopo | portal do cliente | `/acompanhar` |
| 2ª | rastreamento de pedidos | régua de 28 status, portal do cliente, código de rastreio, Total Express |
| 2ª | integração bancária | contas bancárias, conciliação, cobrança e confirmação PIX, boleto/CNAB e gateway PIX com código pronto dependente de credenciais do banco (seção 8) |
| 2ª | engenharia de custos | grupo Engenharia de Custos (seção 2) |
| 2ª | logística | grupo Logística (seção 2) |
| 2ª | controladoria | Contábil / Fiscal, DRE, margem consolidada, malote e exportação para o contador |
| 2ª | RH | grupo Recursos Humanos e portais |
| 2ª | marketplaces | canais próprios de venda on-line: catálogo personalizado `/personalizados` e loja `/loja`, integrados ao pedido, estoque e financeiro |
| 7ª — Entrega do código | repositórios, documentação, credenciais, scripts, banco | seções 4, 5, 7 e 9 |
| 11ª — Segurança | backups redundantes, trilhas de auditoria, controle de acessos, recuperação de desastre | seção 6 |

---

## 4. Arquitetura e código-fonte

```
navegador ──► Discloud (Node 18+, porta 8080) ──► Supabase (Postgres + Storage + Auth)
              ├─ backend/  Express — API em /api/*
              └─ backend/public/  build do frontend (React 18 + Vite), servido pelo mesmo processo
```

| Camada | Tecnologia | Onde |
|---|---|---|
| Frontend | React 18, Vite, TanStack Query, Tailwind (tema claro/escuro) | `frontend/` → build em `backend/public/` |
| Backend | Node.js, Express, `@supabase/supabase-js`, `pg` | `backend/src/` |
| Banco | Postgres (Supabase), projeto `abtbkajjtuetactzsaou`, região `sa-east-1` | Supabase |
| Arquivos | Supabase Storage — bucket público (imagens), privados (`DOCUMENTOS` para comprovantes/artes/documentos, `BACKUPS` para backups) | Supabase |
| Autenticação | Supabase Auth (e-mail + senha); papel, setor e permissões em `USUARIOS` | Supabase |
| Hospedagem | Discloud, deploy automático a cada push na `main` | GitHub → Discloud |
| Domínio | `lyoncopos.online` | registrador da contratante |

**Multiempresa por coluna:** toda tabela de negócio tem `tenant_id`; o middleware resolve a empresa do usuário e todas as consultas filtram por ela.

**Repositório:** https://github.com/coposlyon/ERP-Lyon — branch `main`. Cada commit diz o que mudou e por quê; `git log` é a trilha completa de alterações.

```
backend/
  src/app.js                 servidor; migrações automáticas e agendamentos (Total Express, backup) na subida
  src/routes/*.js            uma rota por módulo (sales, financial, production, maquinas, backups…)
  src/lib/atencao.js         catálogo dos 28 status, módulos e fases
  src/lib/fluxoPedido.js     quem move o quê e requisitos por etapa
  src/lib/rateioLib.js       despesas fixas, rateio por unidade, ficha de custo
  src/lib/maquinas.js        depreciação, desgaste, manutenção e custo mensal das máquinas
  src/lib/backup.js          backup redundante, retenção, verificação, agendamento
  scripts/migrate.js         aplica migrações
  scripts/restaurar-backup.js  restaura um backup (conferir / simular / restaurar)
  scripts/gerar-estrutura-banco.js  regenera ESTRUTURA_BANCO.md
  public/                    build do frontend (commitado)
frontend/
  src/pages/<Modulo>/        telas; src/lib/menu.js registra telas e permissões
  src/components/Fluxo/      fila de etapas (Designer, Produção, Logística)
migrations/NNN_*.sql         esquema do banco, em ordem, com o porquê de cada mudança
python/                      geração de relatórios e NF-e auxiliares
docs/                        manual, treinamento, esta documentação
```

---

## 5. Banco de dados e migrações

- **Esquema:** `migrations/NNN_*.sql`, numeradas. Estado: aplicadas até a **125** (`123_maquinarios`, `124_maquina_contato_fornecedor`, `125_backups` são as mais recentes).
- **Aplicação:** automática na subida do servidor (`AUTO_MIGRATE`, com lock para não rodar em duplicidade) ou `node backend/scripts/migrate.js` (`--dry` só lista). O controle fica em `_MIGRATIONS`; números repetidos são denunciados no log e em `/api/health`.
- **Documentação das tabelas:** `ESTRUTURA_BANCO.md` (117 tabelas, gerado do próprio banco em 15/09/2026; regenere com `node backend/scripts/gerar-estrutura-banco.js`).
- **Conexão fora do app:** pooler do Supabase (`aws-1-sa-east-1.pooler.supabase.com:5432`, usuário `postgres.<projeto>`); o host direto `db.<projeto>.supabase.co` é só IPv6.

---

## 6. Segurança da informação (Cláusula 11ª)

| Exigência | Como está implementado |
|---|---|
| **Backups redundantes** | (1) backup diário automático do Postgres pelo Supabase; (2) **backup do próprio ERP**, independente do banco: a cada 24 h e sob demanda em *Configurações → Backup*, todas as tabelas da empresa (e as tabelas-filhas) em JSON compactado no bucket privado `BACKUPS` do Storage, com **SHA-256** registrado em `BACKUPS`, retenção de 30 diários + 1 por mês por 12 meses; (3) download do arquivo para guarda externa. Primeiro backup de produção gerado e verificado em 15/09/2026 (110 tabelas, 1.965 registros). |
| **Trilhas de auditoria** | tabela `AUDITORIA` (quem, o quê, quando, qual registro, detalhes) alimentada pelas rotas de escrita; `production_log` de cada pedido; histórico de cada conta a receber; `MAQUINA_EVENTOS` por máquina; downloads de backup auditados. Registros são cancelados/desativados, não apagados. |
| **Controle de acessos** | Supabase Auth; papéis (administrador restrito a usuários, auditoria e backup); permissões por setor e por tela; validação de módulo em cada rota no servidor (`requireModules`/`requireRole`); senha para ações sensíveis e senha dupla nas etapas de fábrica; chaves de serviço só no servidor; arquivos sensíveis em bucket privado com link temporário. |
| **Recuperação de desastre** | código no GitHub; banco restaurável pelo painel do Supabase **ou** pelo backup do ERP com `backend/scripts/restaurar-backup.js` (`--conferir`, `--simular` em transação desfeita, `--restaurar` sem duplicar); app recriável no Discloud a partir do repositório + variáveis. Procedimentos na seção 7. |
| **LGPD** | dados pessoais só nos cadastros; portal do cliente exige documento + data de nascimento; comprovantes, artes e documentos de RH em bucket privado; `.env` fora do repositório. |

---

## 7. Procedimentos de operação

**Deploy:** `git push origin main` → o Discloud reconstrói e reinicia. O servidor ouve na porta **8080** no Discloud. Variável de ambiente nova só vale após novo deploy.

**Build do frontend:** `cd frontend && npm run build` gera `backend/public/`, que é commitado (o Discloud não roda o build).

**Logs:** painel do Discloud (stdout). Erros aparecem como `[modulo/rota] mensagem`; backups como `[backup] …`.

**Backup manual do banco inteiro (Postgres)**
```bash
pg_dump "$DATABASE_URL" --no-owner --format=custom --file=lyon_AAAAMMDD.dump
```

**Restaurar o banco inteiro**
```bash
pg_restore --no-owner --dbname="$DATABASE_URL" lyon_AAAAMMDD.dump
```

**Restaurar a partir do backup do ERP**
1. *Configurações → Backup → Baixar* (arquivo `.json.gz`).
2. Banco novo: coloque a conexão em `DATABASE_URL` (`backend/.env`) e rode `node backend/scripts/migrate.js`.
3. `node backend/scripts/restaurar-backup.js arquivo.json.gz --conferir` — confira o SHA-256 com o da tela.
4. `… --simular` — restauração completa numa transação desfeita; lista o que entraria e o que falharia.
5. `… --restaurar` — grava. Registros existentes são mantidos; repetir não duplica.

**Recriar o app do zero**
1. Discloud → novo app, conectado ao GitHub `coposlyon/ERP-Lyon`, branch `main`.
2. Variáveis da seção 9.
3. Deploy: a subida aplica migrações pendentes e liga os agendamentos.
4. DNS do domínio apontando para o Discloud.

**Dar acesso a um novo desenvolvedor:** colaborador no GitHub; membro do projeto no Supabase; membro do app no Discloud; ele segue o `SETUP.md` com `.env` próprio.

**Rotina técnica mensal:** conferir uso de banco e storage no Supabase; baixar o backup do mês e guardar fora da nuvem; conferir em *Contábil → Alertas* o limite do Simples e a validade do certificado digital.

---

## 8. Integrações e o que depende da contratante

Integrações com **código pronto**, ativadas colando as credenciais da própria Lyon nas variáveis de ambiente (ou em *Configurações → Geral*) e fazendo um deploy. Enquanto não houver credencial, a tela mostra "não configurado" e o restante do sistema funciona normalmente.

| Integração | Depende de | Variáveis / local |
|---|---|---|
| NF-e | certificado digital A1 e conta no emissor Focus NFe | *Fiscal / NF-e* (tokens de homologação e produção) |
| Boleto / CNAB | contrato de cobrança com o banco | `BOLETO_*` |
| PIX com gateway | conta no gateway; hoje a Lyon opera **PIX manual Nubank** por decisão própria | `MP_*` / *Configurações → Pagamento* |
| Total Express | liberação do IP do servidor pela Total Express | *Configurações → Transportadora* |
| Braspress / Melhor Envio | contas nas transportadoras | ver `INTEGRACOES.md` |
| WhatsApp Business (API oficial) | conta Meta Business verificada; hoje o envio abre o WhatsApp com a mensagem pronta | `WHATSAPP_*` |
| Meta / Instagram, e-mail transacional | contas da Lyon | `FB_*`, `IG_*`, `RESEND_*` ou SMTP em *Configurações → E-mail* |
| Consulta de crédito (Serasa/SPC) | contrato com o provedor | *Configurações → Crédito* |
| eSocial | transmissor e certificado | *RH → eSocial / FGTS* |
| Leiaute específico do contador | definição do escritório contábil | exportação atual em Excel/CSV genérico |

---

## 9. Acessos e credenciais (nomes)

Os valores são entregues à Lyon Copos por canal separado, nunca neste arquivo nem no repositório.

**Contas administrativas**
- GitHub — `coposlyon` (dono do repositório `ERP-Lyon`)
- Supabase — organização e projeto `abtbkajjtuetactzsaou`
- Discloud — conta dona do app `lyoncopos.online`
- Registrador do domínio `lyoncopos.online`
- Google Cloud — projeto do OAuth (Google Contatos)
- Usuário **Administrador** do ERP

**Variáveis de ambiente em produção**
`NODE_ENV` `PORT` `FRONTEND_URL` `SUPABASE_URL` `SUPABASE_ANON_KEY` `SUPABASE_SERVICE_KEY` `DATABASE_URL` `GROQ_API_KEY` `GOOGLE_CLIENT_ID` `GOOGLE_CLIENT_SECRET` `GOOGLE_REFRESH_TOKEN`

Opcionais documentadas em `backend/.env.example`, entre elas `AUTO_MIGRATE`, `BACKUP_AUTOMATICO` (`false` desliga o backup diário), `BACKUP_STORAGE_BUCKET` (padrão `BACKUPS`) e as das integrações da seção 8.

---

## 10. Registro da entrega

Em 15/09/2026 ficam à disposição da Lyon Copos:

1. o sistema em produção em https://lyoncopos.online;
2. o código-fonte completo e o histórico no repositório `coposlyon/ERP-Lyon`;
3. o banco de dados com o esquema em `migrations/` e a estrutura em `ESTRUTURA_BANCO.md`;
4. o backup redundante em funcionamento e o script de restauração;
5. a documentação: este documento, o *Manual do Sistema*, o *Treinamento Completo*, `SETUP.md` e `INTEGRACOES.md`;
6. a relação de acessos e credenciais da seção 9, com os valores por canal separado.

Com esses itens, a Lyon Copos detém o controle integral do sistema — código, banco, hospedagem, domínio e integrações — e qualquer desenvolvedor pode operá-lo e evoluí-lo a partir desta documentação e do histórico do repositório.
