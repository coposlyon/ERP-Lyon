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

## 8. Erros em produção (Sentry) — opcional
- `SENTRY_DSN` — DSN do projeto no sentry.io. Com isso, todo erro de servidor é
  reportado automaticamente.

## Outras variáveis úteis
- `STORE_TENANT_ID` — tenant que a loja pública (`/loja`) atende (padrão já é o da Lyon).
- `STORAGE_BUCKET` — bucket do Supabase Storage para previews/anexos (padrão `DOCUMENTOS`).
