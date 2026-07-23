# Integrações ($) — como ativar

Todas as integrações funcionam **plugando uma variável de ambiente** no servidor
(no Discloud: painel do app → Variáveis de ambiente). Sem a variável, o recurso
mostra uma mensagem clara de "não configurado" — nada quebra.

## 1. PIX automático (Mercado Pago)
- **Onde usar:** Financeiro → conta a receber → botão **PIX** (gera QR + copia-e-cola).
  A baixa é automática quando o cliente paga.
- **Variáveis:**
  - `MP_ACCESS_TOKEN` — Access Token de produção do Mercado Pago
    (mercadopago.com.br → Seu negócio → Configurações → Credenciais).
  - `MP_WEBHOOK_URL` — `https://SEU-DOMINIO/api/webhooks/mercadopago`
    (cadastre essa mesma URL em "Webhooks/Notificações" no painel do Mercado Pago, evento *payments*).

## 2. WhatsApp (Meta Cloud API)
- **Onde usar:** Orçamentos → ícone do WhatsApp (envia o orçamento ao cliente).
- **Variáveis:**
  - `WHATSAPP_TOKEN` — token de acesso da API do WhatsApp (Meta for Developers → seu app → WhatsApp → API Setup).
  - `WHATSAPP_PHONE_ID` — Phone Number ID do número.
- **Obs.:** mensagens livres funcionam dentro da janela de 24h; envios proativos
  (ex.: cobrança) exigem **template aprovado** na Meta.

## 3. E-mail transacional (Resend)
- **Onde usar:** Orçamentos → ícone de e-mail (envia o orçamento por e-mail).
- **Variáveis:**
  - `RESEND_API_KEY` — chave da API (resend.com → API Keys).
  - `MAIL_FROM` — remetente verificado, ex.: `Lyon Copos <pedidos@seudominio.com>`.

## 4. Importar NF-e de entrada (XML)
- **Não precisa de credencial.** Compras → **Importar NF-e (XML)** → escolha o
  arquivo XML do fornecedor → confere o preview → confirma. O sistema cria o
  fornecedor e os produtos que faltarem, dá entrada no estoque e atualiza o
  custo médio (compra transacional). Requer a migração **010**.

## 5. IA (Claude / Anthropic)
- **Onde usar:**
  - **Assistente de gestão** — botão flutuante roxo (canto inferior direito do ERP).
    Responde perguntas sobre o negócio ("quanto vendi esse mês?", "o que está
    acabando?") usando **somente os dados reais** da empresa.
  - **Sugerir com IA** no Estúdio 3D (ERP e loja) — descreva a marca/evento e a IA
    sugere 3 paletas de cores + acabamento, aplicáveis com um clique.
- **Variáveis:**
  - `ANTHROPIC_API_KEY` — chave da API (console.anthropic.com → API Keys).
  - `ANTHROPIC_MODEL` — opcional; modelo a usar (padrão `claude-sonnet-4-6`).
- **Obs.:** sem a chave, os recursos de IA mostram "IA não configurada" — nada quebra.

## 6. Frete por CEP (Melhor Envio)
- **Onde usa:** loja (`/loja`) → carrinho → "Calcular frete" (cliente digita o CEP
  e escolhe a opção; o valor entra no total estimado e vai junto no pedido).
- **Variáveis:**
  - `MELHORENVIO_TOKEN` — token da API do Melhor Envio
    (melhorenvio.com.br → Configurações → Tokens / Integrações).
  - `STORE_ORIGIN_CEP` — CEP de origem (de onde sai a encomenda). Se vazio, tenta
    usar o CEP do endereço da empresa.
  - `MELHORENVIO_BASE` — opcional; use `https://sandbox.melhorenvio.com.br` para testes.
- **Obs.:** sem o token, o cálculo mostra "Frete não configurado" — nada quebra.
  As dimensões/peso usados vêm do cadastro do produto (altura/largura/compr. em mm,
  peso em g); sem isso, usa um padrão de copo.

## 7. Marketing — Instagram e Facebook (Meta Graph API)
- **Onde usa:** módulo **Marketing** → escreve a mensagem/legenda, anexa imagem e
  escolhe os canais (WhatsApp / Instagram / Facebook). WhatsApp dispara para a
  audiência filtrada; Instagram/Facebook publicam um post.
- **Variáveis:**
  - `FB_PAGE_ID` — ID da Página do Facebook.
  - `FB_PAGE_TOKEN` — token de acesso da Página (Meta for Developers → seu app →
    Graph API → Page Access Token; serve para Facebook **e** Instagram).
  - `IG_USER_ID` — ID da conta Instagram **Business** vinculada à Página.
- **Pré-requisitos:** conta Instagram Business conectada a uma Página do Facebook;
  app na Meta com as permissões `pages_manage_posts`, `pages_read_engagement`,
  `instagram_basic`, `instagram_content_publish`.
- **Importante:** o Instagram exige **imagem com URL pública** — o bucket do
  Supabase Storage (`STORAGE_BUCKET`) precisa ser **público** para a Meta baixar a imagem.
- **WhatsApp em massa:** usa as mesmas variáveis do item 2. Envios proativos
  (fora da janela de 24h) podem exigir **template aprovado** na Meta.
- **Redes sociais na loja (SEM token — recomendado):** em Configurações → **Site**
  → *Redes sociais na loja*:
  - **Facebook:** cole a **URL da Página** → a loja mostra o feed pelo **plugin
    oficial** do Facebook (atualiza sozinho, sem token).
  - **Instagram:** gere um **widget grátis** em snapwidget.com ou lightwidget.com
    (conecta seu Instagram lá), copie o código e cole no campo → a loja exibe suas
    fotos. Quem cuida do token é o serviço do widget, não o ERP.
  Esses campos são salvos em `EMPRESAS.settings.site` (`facebook_page_url`,
  `instagram_embed`). Se ambos ficarem vazios, cai no feed via API (abaixo) e,
  sem nada configurado, a seção não aparece.
- **Feed do Instagram via API (alternativa):** com `IG_USER_ID` + `FB_PAGE_TOKEN`
  configurados, a loja mostra as **últimas postagens** automaticamente (permissão
  `instagram_basic`, cache de ~10 min). Só é usado quando o widget acima está vazio.

## 8. Transportadora BrasPress (cotação + rastreio)
- **Onde usa:**
  - **Cotação:** loja (`/loja`) → carrinho → "Calcular frete". A opção **BrasPress**
    aparece junto das demais (com o mesmo acréscimo % do frete).
  - **Rastreio:** ERP → Vendas → abrir a venda → aba **Transportadores** →
    "Rastrear na BrasPress" (informe o **nº da Nota Fiscal**).
- **Como ligar:** Configurações → **Transportadora** → bloco *BrasPress* → marque a
  caixa e preencha usuário, senha e CNPJ do contrato. (Alternativa: variáveis de
  ambiente abaixo — os campos da tela têm prioridade.)
- **Variáveis (fallback do painel):**
  - `BRASPRESS_USER` — usuário da API (ex.: `40899894000118_PRD`).
  - `BRASPRESS_PASSWORD` — senha da API.
  - `BRASPRESS_CNPJ` — CNPJ do contrato (remetente / pagador do frete).
  - `BRASPRESS_CNPJ_DEST` — opcional; CNPJ do destinatário usado na cotação da loja
    quando o cliente é consumidor (sem CNPJ). Se vazio, usa o CNPJ do contrato.
  - `BRASPRESS_MODAL` — opcional; `R` rodoviário (padrão) ou `A` aéreo.
  - `BRASPRESS_TIPO_FRETE` — opcional; `1` CIF (padrão) ou `2` FOB.
  - `BRASPRESS_BASE_URL` — opcional; padrão `https://api.braspress.com`.
- **Obs.:** a BrasPress exige **CNPJ do destinatário** na cotação; para consumidor
  final a loja usa o `BRASPRESS_CNPJ_DEST` (ou o CNPJ do contrato). O valor da
  cotação depende de CEP de origem/destino, peso, volumes e cubagem — não do
  destinatário em si. Sem as credenciais, a BrasPress simplesmente não aparece — nada quebra.

## 9. Transportadora J&T Express (cotação + envio + rastreio)
- **Onde usa:**
  - **Cotação:** loja (`/loja`) → carrinho → "Calcular frete". A opção **J&T Express**
    aparece junto das demais (com o mesmo acréscimo % do frete). Também é a primeira
    tentativa do `POST /api/shipping/quote`, que cai na tabela por UF se a J&T falhar.
  - **Envio/etiqueta/rastreio:** ERP → Vendas → abrir a venda → aba **Transportadores**.
- **Como ligar:** Configurações → **Transportadora** → marque a caixa da J&T e preencha
  conta da API, código de cliente, senha e chave privada. (Alternativa: variáveis
  `JT_*` — os campos da tela têm prioridade.)
- **Variáveis (fallback do painel):**
  - `JT_API_ACCOUNT`, `JT_PRIVATE_KEY`, `JT_CUSTOMER_CODE`, `JT_PASSWORD` — credenciais do contrato.
  - `JT_BASE_URL` — opcional; padrão `https://openapi.jtjms-br.com`
    (homologação: `https://demoopenapi.jtjms-br.com`).
  - `JT_GOODS_TYPE` — opcional; tipo de mercadoria na cotação (padrão `bm000001`).
  - `JT_PRODUCT_TYPE` — opcional; produto na cotação (padrão `EZ`, Economy).
- **Obs.:** a cotação (`spmComCost/getComCostAndTime`) envia só o **CEP de destino** —
  a origem vem do contrato do `customerCode`. Em **homologação a API devolve `cost: 0`**;
  nesse caso a cotação é descartada e o sistema usa a tabela por UF. Sem as credenciais,
  a J&T simplesmente não aparece — nada quebra.

## 10. eSocial (RH → governo)

- **Onde usa:** RH → **eSocial**. Cadastro do empregador, rubricas, dados dos
  colaboradores e a fila de eventos (enviar / consultar / reenviar).
- **Como funciona:** igual à NF-e, o ERP **não** guarda o certificado nem assina
  XML. Quem faz isso é um **gateway** (TecnoSpeed, RESocial, L2MAKER...). O ERP
  monta o evento no leiaute do governo e manda JSON. Trocar de gateway = mexer
  só em `PROVIDERS`, em `backend/src/lib/esocial.js`.
- **Requer a migração `046_esocial.sql`.**
- **Configuração:** fica no banco (`CONFIG_ESOCIAL`), não em variável de ambiente,
  porque é por empresa. Preencher em RH → eSocial → Configuração:
  - `provider` — `tecnospeed` | `resocial` | `l2maker` | `custom`
  - `provider_base_url` — só para `custom` (ou para sobrescrever a base padrão)
  - `ambiente` — `restrita` (produção restrita, para testes) ou `producao`
  - `provider_token_restrita` / `provider_token_producao` — token do gateway
  - `nr_insc`, `classif_trib`, `nat_jur`, `ini_valid` (AAAA-MM) — dados do S-1000
  - `nm_ctt`, `cpf_ctt`, `fone_ctt`, `email_ctt` — contato do empregador
  - `cnae_preponderante`, `aliq_rat`, `fap` — dados do S-1005
- **Eventos suportados:** S-1000 (empregador), S-1005 (estabelecimento),
  S-1010 (rubricas), S-2200 (admissão), S-1200 (remuneração), S-2299 (desligamento).
- **Ordem obrigatória:** o governo só aceita eventos periódicos depois que o
  **S-1000 está aceito**. Depois: S-1005 → S-1010 → S-2200 → S-1200.
  `GET /api/esocial/status` mostra o que falta.
- **É assíncrono:** enviar devolve **protocolo**, não aprovação. Só depois de
  `POST /api/esocial/eventos/:id/consultar` é que vem o **recibo** (ou a rejeição).
  Nenhum evento é marcado como aceito sem recibo.
- **Conferir antes de mandar:** `POST /api/esocial/eventos` com `dry_run: true`
  devolve o payload montado **sem transmitir** — use para validar o evento com a
  contabilidade antes do envio real.
- **Validação local:** o sistema barra o evento antes de enviar (CPF, CBO,
  categoria, matrícula, endereço, rubricas da folha). Ser rejeitado pelo governo
  custa caro; barrar aqui é de graça.
- **Atenção:** os caminhos REST em `PROVIDERS` (`lib/esocial.js`) seguem o formato
  documentado dos gateways, mas **precisam ser conferidos com a doc do fornecedor
  contratado** antes da homologação.
- **Sem token, nada quebra:** as telas mostram "eSocial não configurado".

## 11. Erros em produção (Sentry) — opcional
- `SENTRY_DSN` — DSN do projeto no sentry.io. Com isso, todo erro de servidor é
  reportado automaticamente.

## Outras variáveis úteis
- `STORE_TENANT_ID` — tenant que a loja pública (`/loja`) atende (padrão já é o da Lyon).
- `STORAGE_BUCKET` — bucket do Supabase Storage para previews/anexos (padrão `DOCUMENTOS`).
