# ERP Lyon Copos — Treinamento Completo

**Passo a passo de todos os módulos** · versão setembro/2026 · https://lyoncopos.online

Este material ensina a operar o sistema inteiro, tela por tela. Cada módulo traz:

- **Para que serve** e **quem usa**;
- **Onde fica** no menu;
- **Passo a passo** de cada tarefa, na ordem em que os botões aparecem na tela;
- **Cuidados e erros comuns**;
- **Checklist — consegue fazer sozinho?**, para quem conduz o treinamento conferir.

O *Manual do Sistema* (`docs/MANUAL_DO_SISTEMA.md`) é a referência rápida. Este documento é o curso.

---

## Sumário

- Parte 0 — Antes de começar (ambiente de treino, convenções)
- Parte 1 — Primeiro acesso e navegação
- Parte 2 — O caminho do pedido (os 28 status)
- Parte 3 — Comercial
- Parte 4 — Financeiro, Fiscal e Contábil
- Parte 5 — Designer, Produção e Devoluções
- Parte 6 — Logística
- Parte 7 — Cadastros
- Parte 8 — Estoque e Compras
- Parte 9 — Engenharia de Custos
- Parte 10 — Relatórios e Previsão de Demanda
- Parte 11 — Recursos Humanos
- Parte 12 — Comunicação e Agenda
- Parte 13 — Sites, Catálogo, Loja e Portal do Cliente
- Parte 14 — Configurações e Administração (inclui Backup)
- Parte 15 — Rotinas diárias, semanais e mensais por setor
- Parte 16 — Plano de encontros de treinamento
- Parte 17 — Solução de problemas

---

# Parte 0 — Antes de começar

## 0.1 Ambiente de treino

O sistema de treino é o **mesmo** sistema de produção. Para não misturar treino com operação:

1. Cadastre (ou use) o cliente **"CLIENTE DE TESTE — NÃO FATURAR"**.
2. Em todo pedido de treino escreva **`[PEDIDO DE TESTE]`** no campo de observações.
3. Ao terminar o treino, um administrador **cancela** os pedidos de teste. O sistema não apaga registros: o histórico do treino fica visível em *Configurações → Auditoria*.
4. Não emita NF-e de pedido de teste. Se o módulo fiscal estiver em **Produção**, a nota vale de verdade.

## 0.2 Convenções deste documento

| Escrita | Significa |
|---|---|
| **Menu → Item** | caminho no menu lateral |
| **[Botão]** | botão da tela, com o texto que aparece nele |
| *Campo* | campo de formulário |
| 👁️ | ícone de olho — abre a ficha/detalhe |
| ⋮ | menu de mais ações da linha |
| ⚠️ | alerta do sistema |

## 0.3 Quem faz qual parte

| Setor | Partes obrigatórias | Partes recomendadas |
|---|---|---|
| Vendedores / atendimento | 1, 2, 3, 7.2, 13 | 12 |
| Financeiro | 1, 2, 4, 8.3 | 3.1, 9.4–9.6, 15 |
| Designer | 1, 2, 5.1–5.2 | 12 |
| Produção | 1, 2, 5, 9.1 | 8 |
| Logística | 1, 2, 6 | 8 |
| RH | 1, 11 | 14.2 |
| Engenharia de custos / gestão | 1, 2, 9, 10 | 4.7, 15 |
| Administrador do sistema | todas | — |

---

# Parte 1 — Primeiro acesso e navegação

## 1.1 Entrar no sistema

1. Abra **https://lyoncopos.online**.
2. Informe *E-mail* e *Senha* e clique em **[Entrar]**.
3. Primeira vez? A senha inicial é criada pelo administrador em *Configurações → Usuários*. Troque-a assim que entrar (menu do usuário, canto inferior esquerdo).
4. Esqueceu a senha: peça ao administrador **[Redefinir senha]** no seu usuário.

## 1.2 A tela principal

- **Menu lateral:** os grupos (Financeiro, Comercial, Designer, Produção…). Clique no grupo para abrir os itens. O ícone ☰ no topo recolhe o menu.
- **O que aparece no menu depende do seu setor.** Quem não vê uma tela não tem acesso a ela — não é defeito. Pedidos de acesso vão ao administrador (Parte 14.2).
- **Sino:** avisos que esperam por você (comprovante para conferir, cadastro para aprovar, pedido perto do prazo).
- **Menu do usuário** (canto inferior esquerdo): tema claro/escuro, dados, sair.

## 1.3 Padrões que se repetem em todas as telas

1. **Buscar:** caixa de busca no topo das listas; aceita código, nome ou parte do nome.
2. **Filtros:** botão **[Filtros]** ou selects acima da lista. **[Limpar filtros]** volta ao padrão.
3. **Paginação:** no rodapé da lista (*Itens por página*, setas).
4. **👁️** abre o detalhe; **lápis** edita; **lixeira** exclui (normalmente pede sua senha).
5. **Exportar:** listas principais têm **[Exportar]** (CSV/Excel) e impressão.
6. **Senha de confirmação:** ações sensíveis (excluir pedido, avançar etapa de fábrica, edição em massa) pedem a **sua senha de login** — é a assinatura eletrônica da ação.
7. **Nada some:** cancelar/desativar mantém o registro; tudo fica em *Auditoria*.

### Checklist — Parte 1
- [ ] Entrar e sair do sistema
- [ ] Encontrar no menu as telas do seu setor
- [ ] Usar busca, filtro e paginação em uma lista
- [ ] Trocar o tema claro/escuro
- [ ] Explicar por que uma tela não aparece para você

---

# Parte 2 — O caminho do pedido (os 28 status)

Todo pedido percorre a **mesma régua numerada**. O número é igual para vendedor, fábrica e cliente.

| Faixa | Módulo dono | Status |
|---|---|---|
| 1–3 | Financeiro | 1 Pedido realizado · 2 Aguardando financeiro · 3 Pagamento confirmado |
| 4–7 | Pedido de Venda | 4 Aguardando estoque · 5 Estoque confirmado · 6 Aguardando anexo da arte · 7 Arte anexada e aprovada |
| 8–9 | Designer | 8 Aguardando impressão de vegetal · 9 Vegetal impresso |
| 10–23 | Produção | 10/11 Revelação · 12/13 Pintura · 14/15 Borda · 16/17 Produção · 18/19 Qualidade · 20/21 Foto · 22/23 Embalagem |
| 24–28 | Logística | 24 Aguardando coleta/retirada · 25 Coleta realizada · 26 Em trânsito · 27 Aguardando entrega · 28 Pedido entregue |

## 2.1 Regras que valem para todos

1. **Status que não se aplica** (ex.: copo liso não tem arte, vegetal nem revelação) aparece **riscado** e é pulado sozinho.
2. **Avanço automático:** pagamento confirmado → estoque → arte andam sozinhos quando o requisito está cumprido.
3. **Confirmação dupla nas filas:** Designer, Produção e Logística avançam etapa com **[Iniciar]** e **[Finalizar]**, e finalizar pede a senha **duas vezes**.
4. **Prazo:** data-limite de saída = *data do evento − dias úteis da transportadora − 2 dias de margem*, pulando fins de semana e feriados. A 24 h do limite, se o pedido ainda não passou da embalagem, abre **alerta vermelho** na ficha e no sino.
5. **Perda:** informada ao finalizar etapas (qualidade, embalagem). O cliente recebe o que comprou; a perda vai para estoque e custos.
6. **Onde ver tudo:** no pedido, **👁️** → régua completa, histórico com data/hora/usuário, fotos, contagem (vendido/perdido/a produzir) e a conta do prazo.

## 2.2 Exercício guiado — acompanhar um pedido de teste de ponta a ponta

1. Vendedor cria o pedido de teste (3.1) com evento daqui a 15 dias e duas parcelas.
2. Financeiro confirma a parcela de hoje (4.3) → pedido vai para 3 e segue.
3. Vendedor anexa a arte ou o cliente aprova no portal (3.1.6 / 13.3) → status 7.
4. Designer imprime o vegetal (5.1) → 9.
5. Produção leva de 10 a 23 (5.2).
6. Logística leva de 24 a 28 (6.1).
7. Em cada passo, abra a ficha 👁️ e confira quem fez e quando.

### Checklist — Parte 2
- [ ] Dizer de que módulo é o status 16 e o status 25
- [ ] Explicar por que um status aparece riscado
- [ ] Achar na ficha quem avançou a última etapa
- [ ] Explicar a conta da data-limite de saída

---

# Parte 3 — Comercial

## 3.1 Pedidos de Venda

**Para que serve:** criar, acompanhar e editar pedidos. **Quem usa:** vendedores, atendimento, gerência. **Onde:** *Comercial → Pedidos de Venda* (vendedores com painel próprio: *Área do vendedor → Pedidos de Venda*).

### 3.1.1 Encontrar um pedido

1. Abra *Comercial → Pedidos de Venda*.
2. Na busca, digite o **código do cliente** (ex.: 0234), parte do nome ou o número do pedido.
3. Use *De* / *Até* para o período e os filtros de status. **[Limpar filtros]** volta tudo.
4. Na linha: **👁️ Abrir o pedido**, **lápis Editar o pedido** (pede senha), **lixeira Excluir pedido** (pede senha; na área do vendedor precisa de autorização do gerente).

### 3.1.2 Criar um pedido novo

1. Clique em **[Novo Pedido]** (ou atalho da área do vendedor). A tela *Novo Pedido de Venda* abre; **ESC** fecha.
2. **Cliente:** busque pelo nome, CPF/CNPJ ou código. A lista mostra *Últimos clientes cadastrados*. Sem cliente o pedido não salva ("O cliente é obrigatório para o pedido").
   - O ícone de informações mostra todos os dados do cliente; o do WhatsApp abre a conversa.
3. **Itens:** clique em **[ADICIONAR PRODUTO]**.
   1. Busque o produto (filtre por tipo e por ML/tamanho).
   2. Informe *Quantidade*, confira *Valor unitário* (vem da tabela de preço/faixa) e, se houver, *Desconto %* ou *Desconto R$*.
   3. Em *Personalização* escolha a tinta/impressão; em *Borda*, a borda (ou **[Cadastrar borda]**).
   4. **[Adicionar]** lança o item. O botão que *lança e mantém o card aberto* serve para lançar vários itens seguidos.
   5. Para corrigir: **Editar este item**; para tirar: **Tirar do pedido**.
   6. ⚠️ *Estoque negativo — vendido mais do que existe* avisa, mas não impede; a reposição aparece no Estoque.
4. **Entrega:** escolha transportadora ou **RETIRAR NO LOCAL**; informe *Valor do frete (R$)* quando houver.
5. **Datas:** *Data do evento* \*, *Data da saída* \* e *Previsão de entrega* \*. Confira o *Prazo de produção* e o *Prazo de entrega (dias úteis)* — eles alimentam o alerta de prazo.
6. **Origem da venda:** presencial, WhatsApp, catálogo etc. (usado nos relatórios por canal).
7. **Empresa Faturadora** e **Conta de Destino:** qual CNPJ fatura e em que banco o dinheiro entra. Se aparecer *Venda não pode sair por este CNPJ*, o CNPJ passou do limite anual — escolha outro.
8. **Pagamento:** *Condição de pagamento* (à vista, parcelado); *Entrada (hoje)*; *Valor PIX/dinheiro*. O **PIX copia e cola** pode ser copiado e enviado ao cliente.
9. Revise o **TOTAL** e salve. O pedido nasce no **status 1** e gera as **contas a receber** de cada parcela.

### 3.1.3 Parcelas e comprovante

1. Parcela que **vence hoje** exige comprovante; parcelas futuras (30/60 dias) **não pedem**.
2. Na ficha do pedido, bloco de parcelas: **anexar comprovante** (arquivo/foto) ou **ver comprovante**.
3. Quem **confere e confirma** é o Financeiro (4.3). O vendedor não confirma pagamento.

### 3.1.4 A ficha do pedido (👁️)

Blocos: *Cliente* (e **Ver a ficha completa do cliente**), *Dados do Pedido*, *Valores*, *Informações da Entrega*, *Prazos e Entrega*, *Arte*, *Documentos*, *Informações Importantes*.

1. **Régua:** o balão aceso é o status atual; passe o mouse para ver data e usuário.
2. **[Histórico]:** cada mudança com data, hora e quem fez.
3. **Documentos:** pedido em PDF (*Preto e branco* ou *Colorido*), link do portal do cliente, compartilhar.
4. **Informações Importantes → Acrescentar aviso:** recados que acompanham o pedido até a expedição.
5. **Editar:** botão de edição; alterações ficam no histórico.

### 3.1.5 Documento do pedido

1. Na ficha, **Documentos → Pedido de Venda — Documento**.
2. Confira *Dados do Cliente*, *Itens*, *Resumo Financeiro*, *Observação da Entrega* e *Arte do Pedido*.
3. Imprima ou salve em PDF pelo navegador.

### 3.1.6 Arte do pedido

1. Na ficha → *Arte* → **Anexar a arte deste item** (arquivo de imagem/PDF).
2. Ou envie ao cliente o **link do portal**: ele mesmo anexa e aprova (13.3).
3. **Trocar a arte deste item** depois de aprovada passa por autorização.
4. **Ver a arte deste pedido** abre a arte em tamanho grande.

### Cuidados — Pedidos
- Data do evento errada = prazo errado e alerta falso. Confira antes de salvar.
- Não crie um segundo pedido para "corrigir" o primeiro: edite o original.
- Pedido travado em "aguardando financeiro" com a conta paga: abra a ficha 👁️ — ele se corrige ao abrir.

### Checklist — 3.1
- [ ] Criar pedido com dois itens, transportadora e data do evento
- [ ] Criar pedido para retirada no local
- [ ] Anexar comprovante de uma parcela de hoje
- [ ] Anexar a arte e mandar o link do portal
- [ ] Ler o histórico e explicar de quem é a vez
- [ ] Gerar o PDF do pedido

## 3.2 Orçamentos

**Onde:** *Comercial* (atalho no pedido/cliente) ou `/quotes`. **Quem usa:** vendedores.

1. **[Novo Orçamento]** → mesma lógica do pedido: cliente, produtos/serviços, *Observações da Arte*, *Observações Gerais*.
2. Em *Status & Condições*: *Forma de Pagamento* (Pix, Dinheiro, Cartão, Transferência, Cheque, Boleto), *Válido até*, *Entrega (dias)*.
3. Salve. Na lista de orçamentos, por linha:
   1. **Baixar foto (PNG) do orçamento** — imagem pronta para WhatsApp;
   2. **Enviar por WhatsApp** / **Enviar por e-mail**;
   3. **Marcar como Enviado**;
   4. **Transferir para Pedido de Venda** (ou **[Converter em Venda]** dentro do orçamento).
4. Aprovado/Recusado: botões rápidos dentro do orçamento.

### Checklist — 3.2
- [ ] Criar um orçamento e baixar o PNG
- [ ] Marcar como enviado
- [ ] Converter o orçamento em pedido

## 3.3 Dashboard do Vendedor e Área do Vendedor

**Onde:** *Comercial → Dashboard do Vendedor* (gerência vê todos; vendedor vê o seu).

1. Escolha *Vendedor* e *Mês de referência*.
2. Leia: *Meta do mês*, *Vendido no mês*, *Atingimento*, *Faltam para a meta*, *Excedente*, *Comissão sobre excedente*, *Faixa atual*, *Bônus por ciclo*, *Progresso do ciclo*.
3. **Estados que mais compram:** clique no estado para ver as cidades.
4. **Carteira de clientes** → *Top compradores*; filtre por UF/produto; **Criar oferta** para os selecionados.
5. **Ranking de Produtos do Mês** → **Criar oferta** do produto líder.
6. **Criar oferta (WhatsApp):** escolha produto e condição, escreva a *Mensagem para WhatsApp* (negrito, itálico, lista, emoji), anexe a arte da galeria ou gere texto com IA, **Revisar antes de enviar**, e envie cliente a cliente. **Ver registro de cada envio** mostra o que foi mandado.

**Área do vendedor** (layout enxuto para quem só vende): *Dashboard*, *Pedidos de Venda*, *Site / Catálogo* (copiar link do catálogo personalizado e da loja de lisos, mensagens prontas), *Agenda*, *Comunicação* com o gerente e *Dados do vendedor*.

## 3.4 Plano de Metas (configuração do painel do vendedor)

**Onde:** *Comercial → Plano de Metas*. **Quem usa:** gerente/administrador.

1. **Faixas:** *Nome da faixa*, *Meta mensal (unidades)*, *Bônus do ciclo (R$)*, *Meses do ciclo*, *Comissão sobre excedente (%)*. Adicione/remova faixas e salve.
2. **Quem tem painel de vendedor:** marque os vendedores, *Nome da região*, *Grupo do plano de metas*, *Tamanho da carteira (Top N)*.
3. **Promoções:** *Produto*, *Título da oferta*, *Validade*, *Quantidade sugerida*, *Preço promocional* ou *Desconto (%)*, *Mensagem sugerida*, *Arte da promoção*. Salve; aparece para os vendedores em Criar oferta.
4. **Artes liberadas:** **Liberar nova arte** (nome, produto relacionado) — vira a galeria de artes do vendedor.

## 3.5 Lyon Prime

**O que é:** classificação dos clientes em **estrelas pelo faturamento dos últimos 12 meses**, com benefícios por nível e **Selo de Confiança**. **Onde:** *Comercial → Lyon Prime*.

1. Leia as *Regras do programa* no topo (níveis e benefícios).
2. A lista mostra cliente, nível (estrelas), faturamento 12 m, limite de crédito, selo e vendedor.
3. **[Recalcular estrelas]** refaz a classificação de todos (use depois de lançamentos antigos ou importação).
4. Clique no cliente para abrir o cadastro.

## 3.6 Cupons de desconto

**Onde:** `/coupons` (via Comercial). **Quem usa:** gerência/marketing.

1. **[Novo cupom]** → *Código* \*, *Tipo de desconto* (percentual ou valor), valor, *Pedido mínimo (R$)*, *Descrição*.
2. Limites: *Limite total de usos*, *Usos por cliente*, *Válido a partir de*, *Válido até*, *Exclusivo de um cliente (opcional)*.
3. Salve. Editar/Remover pela linha.

## 3.7 Pagamentos da Loja (PIX)

Ver 4.1 — é operada pelo Financeiro.

### Checklist — 3.3 a 3.6
- [ ] Ler meta, atingimento e comissão no dashboard
- [ ] Abrir a carteira e preparar uma oferta sem enviar
- [ ] (Gerente) criar uma faixa de meta e uma promoção
- [ ] Recalcular estrelas do Lyon Prime
- [ ] Criar um cupom com validade e limite de uso

---

# Parte 4 — Financeiro, Fiscal e Contábil

## 4.1 Pagamentos da Loja

**Para que serve:** conferir os pedidos da loja on-line pagos por **PIX (Nubank)** e liberar ou reprovar. **Onde:** *Financeiro → Pagamentos da Loja*.

1. Abra a tela; use as abas de situação e **[Atualizar]**.
2. Em cada pedido: **[Detalhes]** mostra *Pedido do site*, *Cliente*, *Telefone*, *E-mail*, *Data do evento*.
3. Confira no aplicativo do banco se o PIX entrou (valor e nome).
4. **[Confirmar pedido]** → o pedido vira venda e segue a régua. O sistema pergunta **Avisar o cliente no WhatsApp?**
5. Não caiu o PIX? **[Reprovar pedido]** — sai da fila e não vira venda.
6. **Copiar PIX** copia a chave/código para reenviar ao cliente.

## 4.2 Central de Contas

**Para que serve:** o mês inteiro numa tela — contas do mês e despesas fixas. **Onde:** *Financeiro → Central de Contas*.

**Aba Contas do Mês**
1. Navegue pelo mês; filtre *Todas / A pagar / A receber* e *Em aberto / Vencidas / Pagas*.
2. Por linha: pagar/receber (*Valor*, *Forma de Pagamento*, *Conta Bancária*), **Editar lançamento**, **Cancelar**.
3. O aviso de **despesas fixas não geradas** mostra o que ainda não virou conta: clique em **[Gerar]**.

**Aba Despesas Fixas**
1. Nova despesa: *Nome da despesa* \*, *Valor mensal (R$)* \*, *Dia do vencimento* \*, *Fornecedor*, *Plano de Contas*, *Centro de Custo*, *Termina em (opcional)*, *Observações*.
2. **Editar**, **Desativar** (sai do mês e do rateio; histórico fica), **Reativar**.

## 4.3 Contas a Receber / Pagar

**Onde:** *Financeiro → Contas a Receber/Pagar*. Abas: **Contas a Receber**, **Contas a Pagar**, **Fluxo de Caixa**, **DRE / Resultado**, **Malote de Pagamentos**.

### 4.3.1 Receber uma parcela de pedido

1. Aba **Contas a Receber**; filtre por período (*De/Até*), status ou cliente.
2. Linha com comprovante anexado → **Conferir o comprovante** (abre o arquivo).
3. Bateu com o extrato → **Confirmar o pagamento**: informe *Valor total recebido*, *Forma de Pagamento*, *Conta Bancária* e *Observação (fica no histórico)*.
4. O pedido **anda sozinho** para o status 3 (e segue para estoque/arte). Se não andar, a ficha do pedido diz o que falta ("Falta: …").
5. Errou? **Desfazer o pagamento** — pede *Motivo (fica na auditoria)*.
6. **Histórico da conta:** de onde veio, quem anexou, conferiu, confirmou e desfez.

### 4.3.2 Cobrar

1. Na conta em aberto: **Gerar cobrança PIX** (valor e *Chave Pix copia e cola*).
2. **Cobrar pelo WhatsApp (Pix + mensagem)**: edite a *Mensagem que vai para o cliente* e envie.

### 4.3.3 Lançar uma conta manual

1. **[Novo]** na aba a pagar ou a receber.
2. *Descrição* \*, *Valor (R$)* \*, *Vencimento* \*, *Parcelas*, *Nº Documento*, *Cliente* ou *Fornecedor*, *Plano de Contas*, *Centro de Custo*.
3. Salve. Para pagar: **Registrar Pagamento** (*Valor a Pagar*, *Forma*, *Conta Bancária*) e **anexe o comprovante** — o malote do contador cobra quem está sem.

### 4.3.4 Fluxo de Caixa e DRE

1. **Fluxo de Caixa:** *Entradas × Saídas*, *Saldo inicial (bancos)*, *Saldo Projetado*, *Vencidos em aberto*. Navegue com *Mês anterior / Próximo mês*.
2. **DRE / Resultado:** *Receitas Realizadas*, *Despesas Realizadas*, *Resultado* do período.

## 4.4 Config. Financeira

**Onde:** *Financeiro → Config. Financeira*. **Quem usa:** administrador financeiro. Faça antes de começar a lançar.

1. **Plano de Contas:** *Código* \*, *Tipo* \* (receita/despesa), *Nome* \*, *Conta Pai* (para agrupar).
2. **Contas Bancárias:** *Nome da conta* \*, *Tipo*, *Banco*, *Agência*, *Conta*, *Saldo inicial (R$)*.
3. **Centros de Custo:** *Código*, *Nome*.

## 4.5 Fiscal / NF-e

**Onde:** *Financeiro → Fiscal / NF-e*. **Pré-requisito:** certificado digital A1 e token do emissor (Focus NFe) cadastrados — são credenciais da própria Lyon.

**Configurar (uma vez)**
1. Dados do emitente: *CNPJ*, *Razão Social*, *IE*, *Regime Tributário* (Simples Nacional / Regime Normal), endereço completo com *Código IBGE do Município*.
2. Padrões: *Natureza da Operação*, *NCM Padrão*, *CFOP Dentro/Fora do Estado*, *CSOSN*, *CST PIS/COFINS*.
3. *Token Focus NFe — Homologação* e *— Produção*. Escolha **Homologação (teste)** para treinar e **Produção** para valer.

**Emitir**
1. **Emitir NF-e — escolha a venda** → selecione o pedido → confira itens e impostos → emitir.
2. **Atualizar status** até autorizar. Baixe **DANFE (PDF)** e **XML**. A 2ª via aparece no portal do cliente.
3. **Cancelar NF-e:** exige *Justificativa (mínimo 15 caracteres)* e o prazo legal.
4. Notas de entrada: **Baixar o XML da nota** / **Manifestar nota**.

## 4.6 Contábil / Fiscal

**Onde:** *Financeiro → Contábil / Fiscal*. Abas: **Visão Geral, Empresas, Bancos, Conciliação, DRE, Margem Consolidada, Tributário, Malote de Pagamentos, Exportação p/ Contador**.

1. **Visão Geral:** *Faturamento × Limite (Anual)*, *Alertas e Avisos* (limite do Simples em 70/80/90/95/100 %, certificado vencendo), DRE e fluxo do mês, relatórios rápidos.
2. **Empresas:** para cada CNPJ — *Razão Social*, *Nome Fantasia*, *CNPJ*, *Regime Tributário*, *Alíquota efetiva (%)*, *Limite anual (R$)*, *Certificado digital — vencimento*. É daqui que o pedido sabe se o CNPJ ainda pode faturar.
3. **Bancos:** *Nome da conta*, *Banco*, *Empresa vinculada*, *Tipo*, *Agência*, *Conta*, *Chave PIX*, *Saldo atual*.
4. **Conciliação:** Pedido × Contas a Receber × NF-e, mês a mês; diverge = investigar.
5. **DRE:** *Mensal / Trimestral / Anual*, PDF e Excel.
6. **Margem Consolidada:** *Receita × custos × lucro, mês a mês* — Receita, Impostos, Custos (CMV), Despesas, Lucro bruto, Margem bruta/líquida; por empresa e por canal.
7. **Tributário:** simulador de faturamento e projeção de imposto.

### 4.6.1 Malote de Pagamentos (fechamento para o contador)

1. Aba **Malote de Pagamentos** (também em Contas a Receber/Pagar).
2. Escolha o mês. Confira as contas agrupadas: situação, vencimento, pagamento, 📎 (comprovante anexado) e ⚠️ (*Pago sem comprovante anexado*).
3. Corrija os ⚠️ anexando os comprovantes em Contas a Pagar.
4. **🖨️ Imprimir / PDF** ou Excel.
5. **Registrar envio**: *Para quem (contador / escritório / e-mail)* e *Observação*. Fica a **foto do momento** (*Malote enviado — foto do momento*) e o histórico *Envios ao contador* do ano.

### 4.6.2 Exportação p/ Contador

1. Aba **Exportação p/ Contador** → **Mês** ou **Período** (*De/Até*).
2. **Excel completo** (6 abas: Resumo, Lançamentos, Notas fiscais, Vendas, Compras, Folha) ou **CSV por aba**.
3. Envie ao escritório. Se o escritório usar leiaute próprio (Domínio, Alterdata), as colunas deste arquivo são a base do mapeamento.

### Cuidados — Financeiro
- Confirmar pagamento sem conferir o extrato libera produção de pedido não pago.
- Conta paga sem comprovante aparece no malote com ⚠️.
- Não desative despesa fixa só porque foi paga: pagar é em Contas a Pagar; desativar tira do rateio.

### Checklist — Parte 4
- [ ] Confirmar e reprovar um pagamento da loja
- [ ] Conferir e confirmar uma parcela e ver o pedido andar
- [ ] Desfazer um pagamento com motivo
- [ ] Gerar as despesas fixas do mês e pagar uma com comprovante
- [ ] Emitir uma NF-e em homologação e baixar DANFE/XML
- [ ] Ler o limite anual de cada CNPJ
- [ ] Registrar o envio do malote e exportar o Excel do contador

---

# Parte 5 — Designer, Produção e Devoluções

As telas **Designer**, **Produção** e **Logística** são a mesma "fila de etapas". Aprenda uma e as outras ficam fáceis.

## 5.0 Como funciona a fila (vale para 5.1, 5.2 e 6.1)

1. Abra a tela do seu módulo. A **fila** mostra só os pedidos que estão na sua faixa de status, com *Nº pedido*, *Cliente*, *Data do pedido*, *Data do evento*, *Data de saída*, *Prazo máx. entrega*, *Sair até p/ o evento*, *Transportadora*, *Cidade/UF*, *Status*, *Vendedor*.
2. Filtre por *Saída de / até* e procure por nº do pedido ou nome do cliente → **[Filtrar]**.
3. Clique no pedido. Aparece o **prazo** e a **régua do módulo**, com o balão aceso na etapa atual.
4. **[Iniciar]** a etapa → o pedido fica "em processo" (a régua mostra que alguém está com a mão nele).
5. **[Finalizar]** → preencha o formulário da etapa (campos com \* são obrigatórios).
6. Confirme com **sua senha duas vezes**. Fica registrado quem finalizou e quando.
7. O pedido sai da sua fila e entra na do próximo módulo. O **Caminho completo do pedido** (na mesma tela) mostra os 28 status em blocos, com o seu módulo destacado.
8. Pedido **sem personalização** não passa pela serigrafia: a tela avisa e ele segue pela tela do pedido de venda.

## 5.1 Designer — Impressão do vegetal (status 8–9)

**Onde:** *Designer → Impressão do vegetal*.

1. Selecione o pedido em "Aguardando impressão de vegetal".
2. Confira a **arte aprovada** pelo cliente.
3. **[Iniciar]** → imprima o vegetal.
4. **[Finalizar]** → *Impressora / equipamento*, **O vegetal foi conferido com a arte aprovada pelo cliente?** (obrigatório), *Quantos vegetais foram impressos*.
5. Senha duas vezes. Pedido vai para Produção (status 10).

## 5.2 Produção — Ordens de Produção (status 10–23)

**Onde:** *Produção → Ordens de Produção*. Embaixo do título aparecem os status 10 a 21 da régua.

Para cada etapa: **[Iniciar]** → trabalho → **[Finalizar]** com os campos abaixo → senha duas vezes.

| Etapa | Campos ao finalizar |
|---|---|
| **Revelação** (10→11) | *Número da matriz* \* · *Foi informado o número correto da matriz?* \* · *A matriz foi perdida? (velou, queimou, não revelou)* · *O que houve com a matriz* |
| **Pintura** (12→13) | *Perdeu alguma unidade nesta etapa?* |
| **Borda** (14→15) | *Perdeu alguma unidade nesta etapa?* |
| **Metalização** (dentro da produção, não avança a régua) | *Perdeu alguma unidade nesta etapa?* |
| **Produção** (16→17) | ao **iniciar**: *Número da máquina* \* (código de Maquinários, ex.: **M001**) · ao finalizar: perda |
| **Controle de qualidade** (18→19) | *Resultado da conferência* \* (Aprovado/Reprovado) · *Unidades avariadas* |
| **Foto** (20→21) | anexar **uma foto por arte** · *Todas as fotos foram anexadas?* \* |
| **Embalagem** (22→23) | *Colou a etiqueta de FRÁGIL?* \* · *A caixa está identificada?* \* · *Conferiu se o pedido está correto com a etiqueta?* \* · perda |

**O que o sistema faz sozinho**
1. **Revelação** soma +1 gravação na vida da matriz; **matriz perdida** baixa os insumos e registra a perda da tela (painel Serigrafia).
2. **Perda informada** sai do estoque e entra em perdas de produção.
3. **Produção finalizada** lança o lote na **máquina** informada: quantidade, horas (do início ao fim) e operador entram em *Engenharia de Custos → Maquinários → Produção e Desgaste* (9.1).
4. **Qualidade reprovada** registra a conferência e **mantém** o pedido na qualidade, para refazer.
5. **Foto** vai para o portal do cliente.
6. **Embalagem** de pedido **para retirada** avisa o cliente que está pronto (mensagem pronta no WhatsApp).

**Painel Serigrafia — Telas / Matrizes** (embaixo da fila)
- *Telas (durabilidade)*: cada quadro com nº de gravações e recuperações.
- *Perdas recentes* com o custo total. A perda de matriz é informada ao finalizar a revelação.

### Cuidados — Produção
- Digite o **código da máquina igual ao cadastro** (M001). Número diferente não alimenta o desgaste da máquina.
- Reprovar na qualidade não é "voltar status": o pedido fica aguardando nova conferência.
- A foto é o que o cliente vê. Foto ruim gera reclamação antes do pedido sair.

## 5.3 Devoluções e Trocas

**Onde:** *Produção → Devoluções*.

1. **[Nova Devolução / Troca]** → *Tipo* (Devolução ou Troca), *Pedido original (opcional)*, *Motivo* \*.
2. *Itens devolvidos* \*: *Produto*, *Qtd*, *Vlr Unit.*, *Estado*.
3. *Observações* → salvar. Situação: **Pendentes → Aprovadas → Processadas**.
4. Processar reflete no estoque.

### Checklist — Parte 5
- [ ] Iniciar e finalizar uma etapa com senha dupla
- [ ] Finalizar revelação informando matriz (e simular matriz perdida em teste)
- [ ] Iniciar a produção com o código da máquina e ver o lote em Maquinários
- [ ] Reprovar na qualidade e explicar o que acontece
- [ ] Anexar as fotos e vê-las no portal do cliente
- [ ] Finalizar a embalagem com o checklist
- [ ] Registrar uma devolução

---

# Parte 6 — Logística

**Onde:** *Logística → Transportadoras*. Abas: **Etapas**, **Expedição**, **Transportadoras**, **Caixas e frete**.

## 6.1 Etapas (status 24–28)

Mesma fila da 5.0.

| Etapa | Campos ao finalizar |
|---|---|
| **Coleta** (entrega por transportadora) | *Volumes entregues à transportadora* \* · *Conferiu a etiqueta de cada volume com o pedido?* \* · *Nome do motorista / conferente* |
| **Retirada** (cliente busca) | *Quem retirou* \* · *Conferiu o documento com foto de quem retirou?* \* · *A mercadoria foi aberta e conferida na frente do cliente?* \* |
| **Em trânsito** | *Código de rastreio* · *Previsão de entrega (dd/mm)* |
| **Entrega** | *Recebido por* \* · *A mercadoria chegou íntegra, sem avaria?* \* · *Ocorrência na entrega* |

A coleta exige transportadora definida no pedido; sem ela o sistema recusa e diz o motivo.

## 6.2 Expedição

1. Pedidos prontos para sair: **mensagem pronta** para avisar o cliente (**Copiar texto** / WhatsApp).
2. *Volumes* e *Peso total (kg)* para etiqueta e declaração de conteúdo.
3. **Total Express:** **Enviar coletas à Total Express** e **Buscar agora os status novos na Total Express** (depende da liberação de IP pela Total Express).
4. *Histórico da logística* mostra tudo o que foi registrado.

## 6.3 Transportadoras

1. **Nova transportadora**: *CNPJ* \*, *IE* \*, *Razão Social* \*, *Nome Fantasia* \*, *Responsável* \*, *E-mail* \*, *Telefone* \*, *WhatsApp* \*, endereço completo, *Horários de Coleta*.
2. **Prazo em dias úteis** por transportadora — é ele que calcula a data-limite de saída dos pedidos.
3. Documentos: *Quem está anexando* \*, *CPF* \*, *Cargo* \* (contrato comercial, tabela de preços).
4. Linha: **Ficha da transportadora**, **Editar**, **Consultar score / crédito**, **Excluir**.
5. Transportadora pode se cadastrar sozinha pelo link público `/cadastro-transportadora`; o cadastro espera aprovação (14.6).

## 6.4 Caixas e frete

1. **Caixas:** *Nome*, *Largura/Altura/Comprimento (cm)*, *Peso da caixa cheia (kg)*, *Valor da caixa (R$)*.
2. **Regras por produto:** *Categoria*, *Tamanho*, *Caixa padrão*, *Unidades por caixa*, *Caixa menor* e *Até quantas unidades* vão nela.
3. **Regras gerais de cobrança:** *Acréscimo sobre o frete (%)* *quando a ocupação passar de (%)*.
4. **Simular:** *Quantidade*, *CEP de destino*, *Valor da nota* → caixas usadas, peso cubado e frete.

### Checklist — Parte 6
- [ ] Finalizar uma coleta com volumes e conferência
- [ ] Finalizar uma retirada no balcão
- [ ] Informar código de rastreio e finalizar a entrega
- [ ] Cadastrar uma transportadora com prazo em dias úteis
- [ ] Cadastrar uma caixa e uma regra por produto e simular o frete

---

# Parte 7 — Cadastros

## 7.1 Produtos

**Onde:** *Cadastros → Produtos*. A tela tem seções (produtos, sub-produtos/itens, cores, bordas, catálogo).

### 7.1.1 Cadastrar um produto
1. **[Novo Produto]**.
2. *Nome do Produto* \*, *ID (código do produto)*, *EAN / Código de Barras*, *Categoria de produto* \*, *Fornecedor*.
3. *Custo de Compra (R$)*, *Preço de venda (R$)*, *Estoque atual (un.)*, *Tabela de Precificação*.
4. Medidas: *Altura*, *Peso*, *Espessura*, *Circunferência da base/boca*, *Comprimento*, *Largura* (usadas no frete e no gabarito).
5. Fiscal: *NCM*, *CST / CSOSN*, *CFOP*. *Linha / material do copo*.
6. Foto: arquivo ou **Colar imagem copiada** (Ctrl+V).
7. Visibilidade: *Ativo no sistema*, *Exibir no catálogo personalizado*, *Exibir no site de produtos lisos*.
8. **[Criar]**.

### 7.1.2 Manter a lista
1. Filtre por *categoria*, *cor* e *tamanho*; **[Buscar]**; **[Limpar filtros]**.
2. Foto na linha: **Adicionar foto (arquivo ou Ctrl+V)**, **Ver foto ampliada**, **Gerar fotos a partir de uma foto modelo** (cria as fotos das variações).
3. **Editar**, ativar/desativar, **Apagar produto**.
4. **Edição em massa:** marque produtos → altere custo, tipo de tinta, adicionais, dados fiscais → **Confirmar edição em massa** (pede senha). **Apagar os produtos selecionados** também exige senha.
5. **Importar produtos (Excel ou lista)** e **Importar estoque (planilha)**.
6. **Variações:** *Nome da variação*, foto; **Copiar a lista**.
7. **Catálogo do produto:** *O que o cliente pode escolher* (acabamentos, cores, processos), *Tipo de impressão*, *Caixa do pedido liso*, *Gabarito da arte*; **Definir só para este produto** cria exceção à regra da categoria.
8. **Adicionais do produto:** tampa, canudo etc. — **Adicionar adicional** e **Aplicar** a vários.

### 7.1.3 Sub-produtos, cores e bordas (Itens)
1. *Tipo*, *Nome* \*, *Cor*, *Categoria* \*, *Unidade de medida*, *Qtd. da embalagem*, *Preço pago (R$)*, *Observações*, *Cor aproximada*.
2. **Enviar fotos em massa** para as cores.
3. O preço de venda por categoria é definido na **Formação de Preço** (9.6).

## 7.2 Clientes

**Onde:** *Cadastros → Clientes*.

1. **[Novo]** → PF/PJ: nome, *Nome Fantasia*, CPF/CNPJ, *Inscrição Estadual*, *Data de Nascimento*, *E-mail*, *Telefone / WhatsApp*, *Instagram*, *Limite de Crédito (R$)*, *Vendedor responsável*, *Prazo de boleto (dias)*, *Avaliação do cliente* (estrelas), *Observação*, endereço (*CEP* preenche rua/bairro/cidade).
2. CPF/CNPJ já cadastrado → o sistema avisa e oferece **Abrir perfil para conferir**.
3. Filtre por estado (*Filtrar por estado*) e pelos atalhos de filtro; **[Buscar]**.
4. Linha: **Ver detalhes**, **Editar**, **Consultar score / crédito** (SPC/Serasa, quando configurado), **Abrir Instagram**, **Excluir cliente** (pede senha).
5. **Sincronizar com Google Contatos** envia os clientes para a agenda do Google da empresa.
6. **Marketing:** filtra por avaliação e monta mensagem/e-mail (*Assunto*, *Mensagem*, **Abrir no meu app de e-mail**).
7. **Ficha do cliente:** abas de cadastro, documentos (remover), histórico de compras; **Editar Cliente**; **Consulta SPC / Serasa**.

## 7.3 Aprovações de Cadastro

**Onde:** *Cadastros → Aprovações de Cadastro* (administrador).

1. Cadastros e **pedidos de alteração** feitos pelos links públicos (cliente, fornecedor, transportadora) caem aqui.
2. Abra o pedido: *O que muda* mostra antes × depois e os anexos.
3. Aprovar grava no cadastro. **Rejeitar apaga os arquivos enviados.**

## 7.4 Fornecedores

**Onde:** *Cadastros → Fornecedores*.

1. **[Novo Fornecedor]** → *CNPJ* \*, *IE* \*, *Razão Social* \*, *Nome Fantasia* \*, *Contato / Responsável* \*, *Telefone* \*, *E-mail* \*, endereço completo.
2. Documentos: *Quem está anexando* \*, *CPF* \*, *Cargo* \*.
3. Linha: **Ficha do fornecedor**, **Abrir no WhatsApp**, **Ligar**, **Enviar e-mail**, **Consultar score / crédito**, **Editar**, **Excluir**.
4. **Portal do fornecedor:** o fornecedor recebe um link (ex.: na solicitação de reposição, 8.2) e responde por ele, entrando com *CNPJ* e *Telefone cadastrado*.

### Checklist — Parte 7
- [ ] Cadastrar um produto com foto, medidas e dados fiscais
- [ ] Fazer uma edição em massa de custo em 2 produtos de teste
- [ ] Cadastrar um cliente PJ pelo CEP
- [ ] Aprovar (ou rejeitar) um pedido de alteração de cadastro
- [ ] Cadastrar um fornecedor e abrir a ficha

---

# Parte 8 — Estoque e Compras

## 8.1 Estoque

**Onde:** *Estoque → Estoque*.

1. **Indicadores:** *Produtos ativos*, *Custo total estoque*, *Entradas / Saídas / Perdas (30 dias)*.
2. Filtre por *categoria*, *cor*, *capacidade* e *tamanho*.
3. A baixa do pedido é **automática** no status 4→5. Não baixe pedido à mão.
4. **Movimentações:** *Data/Hora*, produto, referência, usuário.
5. **Registrar Perda de Estoque:** *Produto*, *Quantidade perdida* \*, *Motivo da perda* \*, *Observação*.
6. **Contagem:** informe o *Contado*; o sistema mostra a *Diferença* e grava o ajuste com *Motivo / observação*.
7. **Estoque negativo:** lista o que foi vendido acima do saldo, com o fornecedor.

## 8.2 Solicitação de reposição ao fornecedor

1. Em Estoque: **Solicitar Reposição — Selecione o Fornecedor** (só aparece fornecedor com telefone).
2. Ajuste as quantidades (**Mudar as quantidades ou tirar itens**).
3. Envie: **abre o WhatsApp do fornecedor com o recado e o link prontos** (o link é o portal do fornecedor) — ou **Copiar**.
4. A solicitação fica em *Reposição já solicitada — aguardando recebimento*. Cancelar derruba o link do fornecedor.
5. Chegou a mercadoria: **Atualizar Estoque — Confirmar Recebimento** (confira o *número de controle*: ✅ correto / ⚠️ incorreto).

## 8.3 Compras

**Onde:** *Estoque* (ou Financeiro) → *Compras*.

1. **Nova Compra** → fornecedor, produtos, quantidades, custos, desconto, frete, observações → salvar.
2. Ao salvar, os itens **entram no estoque na hora** (movimento de entrada com a referência da compra).
3. **Importar NF-e de entrada:** envie o XML da nota do fornecedor; o sistema mostra a prévia, cadastra fornecedor e produtos que ainda não existem e lança a compra.
4. **A compra não cria conta a pagar sozinha:** lance o pagamento em *Financeiro → Contas a Receber/Pagar → [Novo]* (4.3.3), com o fornecedor e o nº do documento, e anexe o comprovante ao pagar.

### Checklist — Parte 8
- [ ] Ler o custo total do estoque e as perdas de 30 dias
- [ ] Registrar uma perda de estoque
- [ ] Montar uma solicitação de reposição (sem enviar)
- [ ] Lançar uma compra, ver a entrada no estoque e lançar a conta a pagar dela

---

# Parte 9 — Engenharia de Custos

**Onde:** grupo *Engenharia de Custos*: **Maquinários, Computadores e TI, Insumos e Materiais, Despesas Fixas, Despesas Variáveis, Formação de Preço, Tabela de Preços**.

**A lógica do grupo, na ordem da conta:** o que a empresa **tem** (máquinas e computadores) e o que ela **gasta** (insumos, despesas fixas e variáveis) viram o **custo por unidade**, e a Formação de Preço transforma isso no **preço de venda**.

## 9.1 Maquinários

**Para que serve:** controlar cada máquina da produção — cadastro, produção e desgaste, manutenção, peças, depreciação e reposição, histórico — e levar o custo mensal dela para o preço. **Quem usa:** gestão da produção, engenharia de custos.

### 9.1.1 A tela

1. **Indicadores:** *Total de máquinas*, *Em operação*, *Em manutenção*, *Inativas* (clique para filtrar a lista) e *Custo mensal para rateio* (depreciação + manutenção; passe o mouse para ver a divisão e o valor contábil).
2. Faixa vermelha **"N máquinas com revisão ou checklist vencido"** — clique para filtrar só as com alerta.
3. **Lista de Maquinários:** *Código, Máquina/Item, Tipo, Setor, Status, Fornecedor, Data de aquisição, Vida útil, Produção acumulada, Próxima revisão* (vermelha se vencida), *Depreciação mensal*. Busca, **[Filtros]** (status, tipo, setor, só com alerta), **[Exportar]** (CSV filtrado, CSV de todos, imprimir/PDF), paginação.
4. **Ações da linha:** 👁️ abre; ⋮ → *Editar cadastro, Registrar parada, Registrar retomada, Inativar/Reativar, Excluir*.
5. **Mais Ações** (topo): exportar, imprimir, **Ver no rateio (Despesas Fixas)**, ir para Computadores e TI.
6. Embaixo, a máquina selecionada em abas: **Cadastro · Produção e Desgaste · Manutenção · Peças e Componentes · Depreciação e Reposição · Histórico**. **^** recolhe o painel.

### 9.1.2 Cadastrar uma máquina

1. **[+ Novo Maquinário]**. O painel abre na aba *Cadastro* com o próximo código (M001, M002…); as outras abas liberam depois de salvar.
2. Preencha: *Código interno* \*, *Nome do item* \*, *Tipo de maquinário* \* (Impressora, Pintura, Acabamento, Gravação, Limpeza…), *Marca*, *Nº de série*, *Modelo*.
3. *Setor* \*, *Data de aquisição* \*, *Valor de aquisição (R$)* \*, *Vida útil em anos* \*, *Vida útil em unidades produzidas* (mede o desgaste pela produção), *Valor residual (R$)* (quanto vale no fim da vida útil).
4. *Fornecedor* — escolha da lista (preenche telefone e e-mail) ou digite; *Telefone* e *E-mail do fornecedor*.
5. *Status*, *Localização*, *Responsável*, *Nota fiscal*, *Garantia até*, *Observações*.
6. *Rateio — Entra no custo mensal*: desmarque só se a máquina não deve pesar no preço (ex.: equipamento parado para venda).
7. **[Salvar]**. O cadastro entra no Histórico.

### 9.1.3 Produção e Desgaste

1. **Indicadores:** *Produção acumulada*, *Produção no ano*, *Média por hora*, *Horas de operação*, *Vida útil em unidades*, *% de desgaste atual* (barra), *Progresso até a revisão* (barra), *Última medição* (com eficiência), *Próxima revisão por produção* (com custo por unidade).
2. **Observação** automática: "Desgaste dentro do planejado", "Próximo da revisão", "Revisão vencida", "Vida útil esgotada".
3. **A produção entra sozinha:** quando a etapa **Produção** de um pedido é finalizada (5.2) com o código desta máquina, o lote aparece aqui com origem *Pedido*.
4. **Lançar produção à mão** (lotes fora do ERP): *Data*, *Produto produzido*, *Quantidade* \*, *Perdas*, *Horas trabalhadas*, *Operador* → **[Lançar produção]**.
5. **Últimas produções:** *Eficiência* (produzidas ÷ produzidas + perdas) e *Desgaste gerado* por lote; lixeira exclui um lançamento errado.
6. **Parâmetros de desgaste** (preencha na implantação): *Capacidade (un/hora)*, *Vida útil (unidades)*, *Revisar a cada (un)*, *Produção anterior ao sistema* e *Horas anteriores ao sistema* (o que a máquina já tinha rodado) → **[Salvar parâmetros]**.

### 9.1.4 Manutenção

1. Topo: *Última revisão*, *Próxima*, *Situação* (Em dia / Próxima / Vencida) e *Manutenção no custo mensal* (média realizada de 12 meses ou, sem histórico, o previsto no checklist).
2. **Registrar revisão:** *Tipo de revisão* (Preventiva/Preditiva/Corretiva), *Periodicidade* (a próxima data se calcula sozinha), *Data da revisão*, *Próxima revisão*, *Produção para revisão* (unidades entre revisões), *Status* (Concluída/Agendada/Pendente), *Responsável* \*, *Fornecedor de manutenção*, *Custo previsto*, *Custo realizado*, *Tempo de parada (horas)*, *Observações* → **[Registrar revisão]**.
   - **Concluída** grava o custo no histórico, move última/próxima revisão, **zera o contador de produção da revisão** e, se a máquina estava *Em manutenção*, volta para *Em operação*.
   - **Agendada/Pendente** só marca a próxima data.
3. **Checklist de manutenção:** **[Adicionar item]** → *Item* (Limpeza geral, Lubrificação, Troca de mangueira…), *Periodicidade*, *Última execução*, *Responsável*, *Custo previsto* → salvar (a próxima execução se calcula).
4. Status do item: **Em dia**, **Próximo** (até 7 dias), **Vencido**.
5. **[Marcar como executado]** → *Data*, *Custo*, *Responsável*, *Tempo de parada*, *Observação* → **[Confirmar]**. A próxima execução anda pela periodicidade e o custo entra no histórico e no rateio.
6. Lápis edita o item; lixeira exclui.

### 9.1.5 Peças e Componentes

1. **Cadastrar peça:** *Código da peça* \* (PC001…), *Nome da peça* \*, *Categoria* \* (Pneumático, Elétrico, Eletrônico, Mecânico, Hidráulico, Consumível…), *Fabricante*, *Fornecedor*, *Telefone do fornecedor*, *Valor unitário* \*, *Quantidade em estoque* \*, *Estoque mínimo* \*, *Vida útil estimada*, *Última troca* (a próxima se calcula), *Próxima troca*, *Observações*, **Compatibilidade** (marque as máquinas em que a peça serve) → **[Adicionar peça]**. **[Limpar]** zera o formulário.
2. A lista mostra as peças **compatíveis com esta máquina**; *Mostrar todas* lista o cadastro inteiro.
3. Status: **Em estoque**, **Estoque baixo** (≤ mínimo), **Sem estoque**, **Troca vencida**.
4. **Registrar troca** (ícone de setas): *Data*, *Quantidade*, *Responsável*, *Observação* → **[Registrar troca]**. O estoque da peça baixa, a próxima troca anda pela vida útil e o custo (valor × quantidade) entra no histórico como *Troca de peça*. Sem estoque, o sistema pergunta se registra mesmo assim.
5. Lápis edita (o botão vira **[Salvar peça]**); lixeira exclui.

### 9.1.6 Depreciação e Reposição

1. Campos: *Valor de aquisição*, *Valor residual*, *Vida útil em anos*, *Vida útil em unidades*; calculados: **Depreciação mensal** = (aquisição − residual) ÷ meses de vida útil, e **Depreciação acumulada** (desde a aquisição).
2. Reposição: *Reserva para reposição* (quanto já está guardado), *Meta de reposição* (preço da máquina nova), *Valor de venda estimado usado*; calculados: **Reserva mensal sugerida** (quanto guardar por mês até a troca) e **Projeção de troca** (pelo fim da vida útil ou pelo ritmo de produção — o que vier antes).
3. **[Salvar]**. Mudança de valor ou vida útil fica no histórico (*Alteração*).
4. **Registrar aporte:** informe o valor → soma na reserva e registra no histórico.
5. **Resumo financeiro:** *Aquisição inicial, Revisões acumuladas, Peças trocadas, Valor investido total, Depreciação acumulada, Valor contábil atual, Custo mensal no rateio*. Quadro lateral: *Saldo reservado*, *Valor previsto para nova máquina*, *Venda estimada da usada* e **Diferença a complementar** (vermelha se falta dinheiro).

### 9.1.7 Histórico

1. Filtros: *Período — de / até*, *Tipo de evento* (Cadastro, Revisão, Manutenção, Troca de peça, Parada, Retomada, Marco de produção, Status, Reserva, Alteração), *Responsável*, *Status* → **[Limpar filtros]**.
2. **[Exportar]** baixa o histórico filtrado em CSV.
3. **[Novo evento]** → *Parada* (a máquina vai para *Em manutenção*), *Retomada* (volta para *Em operação*), *Manutenção avulsa*, *Anotação / marco*: *Data*, *Responsável*, *Descrição*, *Custo*, *Horas parada*, *Produção impactada*.
4. Linha: 👁️ vê o evento completo; ⋮ → *Marcar como concluído*, *Cancelar evento* (o custo sai das contas), *Excluir*.
5. A cada 100 mil unidades acumuladas o sistema grava um **Marco de produção** sozinho.

### 9.1.8 Como a máquina chega no preço

1. Cada máquina ativa com *Entra no custo mensal* vira uma **linha calculada em Despesas Fixas** (origem *Maquinários*, somente leitura, com o link **abrir equipamento**).
2. O total das despesas fixas ÷ produção mensal = **rateio por unidade**, que entra na Formação de Preço (9.6).
3. Depreciação **não** vira conta a pagar nem entra no malote do contador — é custo, não boleto.

### Cuidados — Maquinários
- Sem *Vida útil em unidades* o desgaste é medido pelo tempo.
- Preencha *Produção anterior ao sistema* das máquinas antigas, senão o desgaste começa do zero.
- O código digitado na etapa Produção precisa ser **igual** ao do cadastro.
- Prefira **Inativar** a **Excluir**: excluir apaga produção, checklist e histórico da máquina.

### Checklist — 9.1
- [ ] Cadastrar uma máquina completa e achar a linha dela em Despesas Fixas
- [ ] Preencher os parâmetros de desgaste e lançar uma produção manual
- [ ] Registrar uma revisão concluída com custo
- [ ] Criar um item de checklist e marcar como executado
- [ ] Cadastrar uma peça compatível e registrar uma troca
- [ ] Ler a reserva mensal sugerida e a diferença a complementar
- [ ] Registrar uma parada e uma retomada e filtrar o histórico

## 9.2 Computadores e TI

**Mesma tela e mesmas regras da 9.1**, para computadores, notebooks, monitores, impressoras, servidores, rede, celulares, nobreaks e licenças. Diferenças:

1. Códigos **T001, T002…**; botão **[+ Novo Equipamento]**.
2. **Não há aba Produção e Desgaste**: o desgaste é pelo tempo de uso.
3. A coluna da lista mostra o **Valor contábil** no lugar da produção acumulada.
4. O custo mensal entra no rateio como categoria *Tecnologia*.

Rotina recomendada: cadastrar todos os equipamentos com valor e data de compra, montar um checklist simples (limpeza, atualização, backup local) e registrar trocas de peça (SSD, memória, bateria).

## 9.3 Insumos e Materiais

**Para que serve:** catálogo dos materiais (tinta, solvente, emulsão, tela, vegetal, fita, embalagem…) com custo por unidade e por peça. **Onde:** *Engenharia de Custos → Insumos e Materiais*.

1. **Novo insumo:** *Categoria*, *Nome do insumo* \*, *Unidade base* (ml, l, g, kg, m, m², un, folha), *Embalagem* (quantidade) e *Valor pago (R$)*.
2. *Como entra no custo do produto*: **Por consumo** (ml/g por peça) ou **Por vida útil** (nº de impressões/usos).
3. *Mínimo* (abaixo disso entra no alerta de reposição), *Origem do custo* (Manual, Compra, NF-e), *Observações* → salvar.
4. A lista mostra *Custo/unidade* e *Custo/peça*, estoque e variação de preço.
5. Por insumo:
   1. **Fornecedores:** vários fornecedores com *Preço*, *Prazo (dias)*, embalagem e o padrão;
   2. **Histórico de preço;**
   3. **Movimentar o estoque deste insumo:** entrada, saída e ajuste, com *Quem / observação*; **Extrato** e *Saldo atual*;
   4. **Editar** / **Excluir**.
6. **Categorias:** crie e **apague categorias** conforme a operação.

## 9.4 Despesas Fixas

**Para que serve:** tudo o que a empresa paga todo mês independentemente de vender — e o **rateio por unidade** que isso gera. **Onde:** *Engenharia de Custos → Despesas Fixas*.

1. **Indicadores:** *Total de Despesas Fixas (Mês)*, *Custo por Unidade Produzida*, *Participação no Custo Total*, *Próximos Vencimentos*. A produção mensal usada no rateio vem, nesta ordem, da meta de produção, da produção do mês ou da média de vendas de 90 dias.
2. **Nova despesa:** *Despesa* \*, *Descrição*, *Categoria* (ou nova categoria), *Centro de Custo*, *Origem do lançamento*, *Periodicidade* (Mensal/Anual — a anual é dividida por 12), *Dia de vencimento*, *Mês de vencimento* (anual) → salvar.
3. **Linhas automáticas:** *RH* (salários da administração, vêm do cadastro do colaborador) e *Maquinários* (depreciação + manutenção, vêm de 9.1/9.2). Não se editam aqui — use o link da linha.
4. Linha manual: **Editar**, **Excluir**, status ativo/inativo.
5. **Simular variação:** *Nova despesa mensal (R$)* e *Produção simulada (un/mês)* → **[Analisar impacto]** mostra o novo custo por unidade antes de assumir o gasto.

## 9.5 Despesas Variáveis

**Para que serve:** o que cresce com a venda. **Onde:** *Engenharia de Custos → Despesas Variáveis*.

1. **Indicadores:** *Total Mão de Obra (Produção)*, *Total Comissões (Mês)*, *Taxas Bancárias (Média)*, *Taxas Marketplace (Média)*, *Fretes de Compra (Mês)*.
2. **Mão de Obra da Produção:** vem de *RH → Colaboradores* (setor produção), não se digita.
3. **Comissões de Vendas:** por vendedor sobre *Vendas Entregues*. *Comissão padrão de vendedor (%)* vale para quem não tem % no RH.
4. **Taxas por operadora e parcelas:** *PIX (%)*, *Boleto (R$ por emissão)*, *Cartão Débito*, *Crédito à vista*, *Parcelado*, *Antecipação*, *Link de Pagamento*.
5. **Taxas de Marketplace / outros canais:** *Site Próprio*, *Shopee*, *Mercado Livre*, *Amazon* (%).
6. **Fretes de Compra** (vêm das compras) e **Custos Variáveis Extras** / **Marketing Variável** (lançamentos avulsos).
7. **Importante:** impostos não são configurados aqui — vêm do Fiscal/Contábil.

## 9.6 Formação de Preço

**Para que serve:** calcular o preço de venda **por categoria** e aplicá-lo a todos os itens dela. **Onde:** *Engenharia de Custos → Formação de Preço*.

1. **Qual categoria?** O seletor traz, em grupos:
   - **Produtos** — todas as categorias (subcategoria aparece como "PAI › FILHA"), inclusive as sem produto;
   - **Sub-produtos** — Tampas, Canudos…;
   - **Cadastro** — Cores, Bordas, Tintas, Embalagens, Outros itens;
   - **Insumos** — as categorias de insumo (a ficha fica como custo de referência; insumo não tem preço de venda).
2. **Quanto custa fazer um copo?** (preencha o que existir; em branco não entra):
   1. *O copo cru, por peça* \* (obrigatório);
   2. *Quantas peças neste lote* — tela, tinta e frete são divididos por ela;
   3. *Tela / clichê* — *custo* e *rende* (peças);
   4. *Tinta gasta no lote*;
   5. *Embalagem* — *preço da caixa* e *cabem*;
   6. *Frete da compra* — *valor* e *peças compradas*;
   7. *Custos fixos (rateio)* — vem sozinho de Despesas Fixas (**ver o rateio →**).
3. **Quanto entra de imposto e quanto você quer ganhar?** *Imposto (%)* e *Margem (%)*. A margem é **sobre o preço de venda**, não sobre o custo (a tela mostra o exemplo).
4. **Quanto o preço cai quando o pedido é grande?** (só produtos) *Mínimo do pedido (un)* e faixas *A partir de* → *Cada peça sai a*. **Como fica no catálogo** mostra o resultado. Faixa repetida ou abaixo do mínimo bloqueia aplicar.
5. Painel **O preço** (à direita): custo por peça, preço mínimo, ideal e premium.
6. **[Salvar ficha]** guarda a conta da categoria.
7. **Aplicar na categoria:** **[Ver o que vai mudar]** mostra item a item o preço de/para → confirme. Produtos recebem preço de tabela e faixas; sub-produtos, cores e bordas recebem o preço por peça. **O preço nunca muda sem este clique.**
8. **Imprimir** gera o relatório da ficha.

## 9.7 Tabela de Preços

**Para que serve:** tabelas comerciais com desconto (Atacado, Revenda…). **Onde:** *Engenharia de Custos → Tabela de Preços*.

1. **[Nova Tabela]** → *Nome da Tabela* \*, *Desconto Geral (%)* (aplica em todos os produtos), *Tabela ativa* → **[Salvar]**.
2. Expanda a tabela para ver os itens com preço próprio e quantidade mínima.
3. Editar / excluir pela linha.

### Checklist — 9.2 a 9.7
- [ ] Cadastrar um computador e ver o custo em Tecnologia
- [ ] Cadastrar um insumo por consumo e movimentar o estoque dele
- [ ] Cadastrar uma despesa fixa anual e simular o impacto de uma nova despesa
- [ ] Explicar de onde vêm mão de obra e comissão nas despesas variáveis
- [ ] Montar a ficha de uma categoria, ver o que muda e aplicar em teste
- [ ] Criar uma tabela de preços com desconto geral

---

# Parte 10 — Relatórios e Previsão de Demanda

## 10.1 Relatórios

**Onde:** *Relatórios → Relatórios*. Escolha o relatório e o período (*De / Até*):

| Relatório | Serve para |
|---|---|
| Detalhamento de Vendas | cada venda do período com valores |
| Rentabilidade por Pedido | lucro e margem de cada pedido |
| Produtos Mais Vendidos | ranking por quantidade/valor |
| Curva ABC de Produtos | quais produtos fazem 80 % do faturamento |
| Comissões de Vendedores | base do pagamento de comissão |
| Clientes que Mais Compraram | ranking de clientes |
| Orçamentos | enviados, aprovados, convertidos |
| Lançamentos por Data | financeiro do período |
| Posição de Estoque | saldo e valor do estoque |

Exporte/imprima pelo botão do relatório.

## 10.2 Previsão de Demanda

**Onde:** *Relatórios → Previsão de Demanda*. Mostra por produto *Média/mês*, *Tendência*, *Previsão próx. mês*, *Estoque* e **Sugestão de compra**. Precisa de histórico de vendas; sem ele aparece "Sem histórico de vendas suficiente".

### Checklist — Parte 10
- [ ] Tirar a Curva ABC do trimestre
- [ ] Tirar o relatório de comissões do mês
- [ ] Ler a sugestão de compra de um produto

---

# Parte 11 — Recursos Humanos

**Onde:** grupo *Recursos Humanos*. Todas as telas de RH puxam do mesmo cadastro de colaborador.

## 11.1 Painel RH
Visão do dia e do mês: colaboradores ativos, admissões e documentos pendentes, afastamentos, férias, folha do mês, eventos eSocial, ocorrências, evolução do quadro, admissões × desligamentos, **pendências automáticas**, próximos vencimentos, monitor do dia (marcações, atrasos, faltas, justificativas) e **Checklist do mês**. Comece o dia por aqui.

## 11.2 Colaboradores

1. *Recursos Humanos → Colaboradores* → **Buscar** → **Abrir cadastro**.
2. **Novo colaborador (pelo RH):** o cadastro é em passos — identificação (nome, CPF, RG, nascimento, estado civil, filiação, CNH), cônjuge e filhos, contato e endereço, dados bancários (*Banco*, *Agência*, *Conta*, *Tipo*, *Chave PIX*), contrato (cargo, departamento, salário, jornada), **Documentação** (anexos e foto facial pela câmera) e **Acesso e permissões** → **[Salvar e Próximo]** a cada passo.
3. **Link de admissão (o próprio colaborador preenche, sem login):** *Link de admissão* → *Para quem é o link* e *O link vale por* → envie. Situação: *Aguardando a pessoa → Pronto* (ou *Expirado*). A ficha chega para o RH conferir.
4. **Acesso e permissões** (no cadastro): *Perfil de acesso*, *Telas que esta pessoa enxerga* (**Marcar todas / Desmarcar todas**) e *Módulos liberados no servidor*. Tela escondida tira o caminho; para cortar o direito, tire o módulo também.
5. Salário e setor do colaborador alimentam sozinhos: Despesas Fixas (administração), Despesas Variáveis (produção), comissões e folha.

## 11.3 Estrutura da Empresa
Departamentos, cargos (com CBO), centros de custo, escalas e jornadas (*Entrada / saída*, *Tolerância*), gestores e organograma. Monte antes de cadastrar colaboradores. **Corrigir agora** aparece quando falta algo.

## 11.4 Bater Ponto
*Recursos Humanos → Bater Ponto* (qualquer colaborador). Abra, confira o horário e clique **[Registrar]**. As batidas do dia aparecem embaixo.

## 11.5 Jornada / Ponto
*Presentes hoje*, *Atrasos*, *Faltas*, *Intervalos em aberto*, *Justificativas*, *Horas extras*, marcações do dia, presença da semana, regras de jornada e **Fechamento do dia**.

## 11.6 Ocorrências
Atrasos, faltas e advertências (*Abertas, Em análise, Justificadas, Advertências, Reincidentes, Críticas*). Filtre por tipo, status e período (7/30/90 dias); **Detalhes** / **Ver documento**. As ocorrências de ponto nascem sozinhas.

## 11.7 Férias / Afastamentos
1. **Nova solicitação** → *Férias* (*Colaborador* \*, *Início* \*, *Fim* \*, *Dias vendidos*) ou *Afastamento* (*Motivo* \*, *CID*, *Observações*).
2. **Fila de aprovações** → **Aprovar** / **Recusar**.
3. Acompanhe *Saldo de férias*, *Saldos a vencer*, *Retornos previstos*, *Exames de retorno*.

## 11.8 Folha e Benefícios
1. Escolha a *Competência*.
2. Por colaborador: *Base*, *Comissão*, *Extras*, *Faltas*, *Proventos*, *Descontos*, *Líquido a receber*; encargos (FGTS, RAT + terceiros) e provisões.
3. *De onde veio cada número* explica cada valor; **Antes de fechar, confira** traz o checklist do fechamento.
4. A folha alimenta o rateio e a exportação do contador.

## 11.9 Documentos
Documentos válidos, pendentes, vencendo (30 dias), vencidos, aguardando assinatura; **prontuário por colaborador**, políticas internas, próximos vencimentos, exames de retorno.

## 11.10 eSocial / FGTS
Eventos exigidos na competência (*Enviados, Pendentes, Prontos, Bloqueados, Rejeitados*), *FGTS a recolher*, histórico com protocolo. Transmissão depende do transmissor/certificado configurado ("Sem transmissor configurado").

## 11.11 Admissões
Funil de contratação: **Registrar candidato (captação)** → *Nome do candidato*, *Admissão prevista* → acompanhe *Etapa atual*, documentos e avisos até *Concluídas no mês*.

## 11.12 Desligamentos
**Desligamento** → *Colaborador*, *Tipo*, *Data da saída*, *Aviso prévio*, *Saldo do FGTS (opcional)*. A tela mostra **o que este desligamento exige** (documentos, verbas, *Líquido da rescisão*) e acompanha até *Acessos revogados*.

## 11.13 Conformidade Trabalhista
Pendências legais consolidadas (documentos, exames, férias vencendo, jornada).

## 11.14 Portais
- **Portal do Colaborador** (`/portal/eu`): minhas batidas, saldo do mês, férias (solicitar), holerites, benefícios, prontuário, solicitações, dados pessoais e **Pedir correção cadastral**, justificar ocorrência, pedido de demissão.
- **Portal do Gestor** (`/portal/gestor`): o que aguarda decisão (aprovar/recusar com motivo), equipe, ocorrências, faltas.
- **Portal do Contador** (`/portal/contador`): competências fechadas, folha, encargos, eventos eSocial, rescisões.

### Checklist — Parte 11
- [ ] Criar e enviar um link de admissão
- [ ] Liberar telas e módulos de um colaborador
- [ ] Bater o ponto e ver a marcação na Jornada
- [ ] Lançar e aprovar férias
- [ ] Conferir a folha da competência com "de onde veio cada número"
- [ ] Registrar um desligamento de teste e ler o que ele exige

---

# Parte 12 — Comunicação e Agenda

## 12.1 Comunicação
**Onde:** *Comunicação → Comunicação*.
1. **Chat:** sala da empresa. Escreva e envie; **Responder**, **Editar**, **Remover** a sua mensagem.
2. **Atividades:** mural do que aconteceu no sistema (*Andamento dos pedidos*, *Cadastros e ajustes*…), filtrável.
3. O vendedor fala com o gerente pela *Área do vendedor → Comunicação* (escolhe o destinatário e envia).

## 12.2 Agenda
**Onde:** *Comunicação → Agenda*.
1. Navegue o mês (*Mês anterior / Próximo mês*); **Marcar neste dia**.
2. Compromisso: *O quê*, *Tipo*, data/hora e *Término*, *Onde*, *Quem mais participa*, *Anotações*.
3. Feriados de *Configurações → Feriados* aparecem na agenda (os mesmos do cálculo de prazo e do ponto).
4. Agenda do vendedor: *Atrasados, Hoje, Próximos, Concluídos*; **Remover**; ver concluídos.

---

# Parte 13 — Sites, Catálogo, Loja e Portal do Cliente

## 13.1 Sites
**Onde:** *Sites → Todos os sites*. Lista *Sites públicos* e *Telas internas* com **Ver e editar**, **Copiar o endereço**, **Abrir em outra aba**.
- No detalhe: prévia (**Recarregar a prévia**), dados da empresa e o **card final** que a pessoa vê ao terminar (*Título do card final*, *Mensagem exibida no card*, *WhatsApp do botão "Voltar ao WhatsApp"*).
- **Editor da loja** (*Configurações → Geral → Site → Editar site*): *Topo (Hero)*, *Seções*, *Promoções*, *Blocos*, *Textos*, *Rodapé*, *Redes*.

## 13.2 Catálogo personalizado e Loja de lisos (o marketplace da Lyon)
- **Catálogo** (`/personalizados`): o cliente escolhe modelo, cor, quantidade e personalização, vê o preço pela faixa de quantidade e fecha. Vira **pedido de venda** normal com origem *catálogo*.
- **Loja** (`/loja`): copos lisos, pagamento **PIX (Nubank)**; o pedido espera o Financeiro em *Pagamentos da Loja* (4.1).
- **Como o vendedor envia:** *Área do vendedor → Site / Catálogo* → copiar link ou mensagem pronta.
- **O que aparece no catálogo:** *Cadastros → Produtos* (Exibir no catálogo / no site de lisos) e *Configurações → Catálogo* (família, categorias, ocasiões, vetor SVG, fontes liberadas, campos editáveis, gabarito, caixa do liso, preços por faixa).

## 13.3 Portal do Cliente (acompanhar pedido)
Endereço: `/acompanhar` (o vendedor envia o link do pedido).
1. O cliente entra com os dados pedidos (CPF e *Data de nascimento*).
2. Vê *Dados do Pedido*, *Valores*, *Prazos e Entrega*, *Itens*, **Linha do Tempo do Pedido** e histórico.
3. **Arte:** *Enviar esta arte?* → *Confirmar a arte?* ou *Reprovar a arte?*.
4. **Comprovante** de pagamento (quando pedido).
5. **Fotos do seu pedido pronto** (etapa Foto).
6. **Documentos** (2ª via da nota) e *Informações da Entrega*.
7. Retirada: **Quem vai retirar o pedido?** (*Nome completo*, *CPF*) — declaração eletrônica.
8. *Contato / Dúvidas*: atendimento por IA ou humanizado.

## 13.4 Links públicos de cadastro
- `/cadastro` — cliente se cadastra ou confirma dados; **Pedir alteração do cadastro** com anexos.
- `/cadastro-fornecedor` e `/cadastro-transportadora` — com documentos e *O que mudou?*.
- Tudo cai em **Aprovações de Cadastro** (7.3).

---

# Parte 14 — Configurações e Administração

## 14.1 Geral
**Onde:** *Configurações → Geral*. Abas:
1. **Empresa:** *Nome da Empresa* \*, *Nome do Sistema*, *CNPJ*, *Telefone*, *E-mail*, *URL do Logotipo*, endereço.
2. **Site** e **Cadastro (site):** editor da loja; card final do cadastro (*Mensagem exibida no card*, *WhatsApp do botão*); **Alterar caminho do cadastro**.
3. **E-mail:** *Servidor SMTP*, *Porta*, *Usuário*, *Senha (ou senha de app)*, *Nome/E-mail do remetente*.
4. **Pagamento:** condições (desconto/juros), **Recebimento por PIX** (*Chave PIX*, *Nome do recebedor*), política de confirmação.
5. **Transportadora:** *Frete por estado*, *Frete grátis acima de*, *Valor/Prazo padrão*, *CEP de origem*; **Total Express — coleta e rastreio (webservice)** (*Usuário*, *Senha*, *CNPJ pagador do frete*, *URL base da API*).
6. **Serigrafia:** *Gravação de matriz (telas)* — medidas, *Produto no estoque (baixa)*, *Trocar a tela após (recuperações)*.
7. **Crédito:** *Consulta de crédito (Serasa / SPC)* — provedor e credenciais.
8. **Usuários** e **Fiscal / NF-e:** atalhos das telas próprias.

## 14.2 Permissões por setor
1. **[Novo setor]** → *Nome do setor*, *Apelido curto*.
2. Marque as telas/módulos do setor.
3. Associe usuários ao *Setor*. Exceções por pessoa: no cadastro do colaborador (11.2). **Excluir setor** só sem usuários.

## 14.3 Feriados
*Data*, *Nome do feriado*, *Tipo* (nacional/empresa). Dias marcados não contam como falta no ponto e são pulados no prazo dos pedidos.

## 14.4 Catálogo
Monta o catálogo público: famílias e *Categorias desta família*, *Ocasião*, *Vetor (SVG)* e *Prévia*, *Fontes liberadas*, *Campos que o cliente pode editar*, *Gabarito da arte*, *Caixa do pedido liso* e **Preços por faixa** (*Valor por unidade (piso)*, *Acabamentos*, *Tipos de impressão*).

## 14.5 Usuários
1. **Novo usuário:** *Nome* \*, *E-mail* \*, *Senha* \*, *Papel* \* → "Acesso criado".
2. **Editar**, desativar, **Redefinir senha** (*Nova senha — mín. 6 caracteres*).

## 14.6 Aprovações de Cadastro
Ver 7.3.

## 14.7 Auditoria
Quem fez o quê, quando e em qual registro. Filtros: *Entidade*, *Ação* (criação, alteração, exclusão, status, senha, acesso, pagamento…), *De/Até*, *Usuário*. Use para responder "quem mexeu nisso?".

## 14.8 Backup e Recuperação
**Onde:** *Configurações → Backup* (administrador).

**O que é:** uma **segunda cópia** completa dos dados da empresa, feita pelo próprio ERP e guardada **fora do banco** (Supabase Storage, bucket privado). Complementa o backup diário do Supabase.

1. **Indicadores:** *Último backup* (vermelho se passou de 26 h), *Backup automático* (ligado: verifica de hora em hora e gera a cada 24 h), *Tamanho do último* (registros e tabelas), *Retenção* (30 diários + 1 por mês por 12 meses).
2. **[Gerar backup agora]** → aguarde "Backup concluído: N registros em N tabelas". Use antes de mudanças grandes (importação, edição em massa).
3. **Lista:** data, origem (Automático/Manual), status, tabelas, registros, tamanho, **SHA-256** (impressão digital do arquivo), quem gerou. A seta abre os registros por tabela.
4. **[Baixar]** → baixa o arquivo `.json.gz` (link de 10 min; o download fica na Auditoria). **Guarde uma cópia por mês fora da nuvem** (HD externo ou outra conta).
5. **[Verificar]** → baixa o arquivo de novo, confere o SHA-256 e se todas as linhas abrem: "Íntegro" ou o motivo da falha.
6. **Restaurar (recuperação de desastre)** — técnico, pelo script (instruções também na própria tela):
   1. banco novo → `DATABASE_URL` no `backend/.env`;
   2. `node backend/scripts/migrate.js` (cria as tabelas);
   3. `node backend/scripts/restaurar-backup.js arquivo.json.gz --conferir` (o SHA-256 deve bater com a tela);
   4. `… --simular` (restaura dentro de uma transação e desfaz — mostra o que entraria e o que falharia);
   5. `… --restaurar`. Registros que já existem são mantidos; rodar duas vezes não duplica.

### Checklist — Parte 14
- [ ] Criar um setor e liberar telas
- [ ] Criar um usuário e redefinir a senha dele
- [ ] Cadastrar um feriado da empresa
- [ ] Achar na Auditoria quem alterou um pedido
- [ ] Gerar, verificar e baixar um backup

---

# Parte 15 — Rotinas por setor

## 15.1 Diária

| Setor | Rotina |
|---|---|
| Vendedores | Sino e Agenda → pedidos com arte pendente → responder clientes → conferir prazos dos seus pedidos |
| Financeiro | Pagamentos da Loja → conferir/confirmar comprovantes → contas vencendo hoje → cobrar vencidas |
| Designer | Fila "aguardando vegetal" do mais urgente para o menos |
| Produção | Fila por *Sair até p/ o evento* → registrar cada etapa na hora em que acontece → checklist das máquinas do dia |
| Logística | Expedição → avisar clientes → coletas → rastreios → confirmar entregas |
| RH | Painel RH → ocorrências do dia → aprovações |
| Administrador | Sino → Aprovações de Cadastro → *Backup*: último backup com menos de 26 h |

## 15.2 Semanal
- Gestão: Dashboard, Dashboard do Vendedor, pedidos perto do prazo.
- Produção: *Maquinários* filtrado por alerta → revisões e checklist vencidos; peças em estoque baixo.
- Estoque: estoque negativo e solicitações de reposição.

## 15.3 Mensal (fechamento)
1. **Dia 1:** Central de Contas → **[Gerar]** despesas fixas do mês.
2. RH: fechar a folha da competência; eSocial.
3. Financeiro: todas as contas pagas **com comprovante**; conciliação no Contábil.
4. Contábil: **Malote de Pagamentos → Registrar envio** e **Exportação p/ Contador → Excel completo**.
5. Engenharia de custos: conferir *Custo mensal para rateio* de Maquinários e Computadores; revisar Formação de Preço das categorias com custo alterado.
6. Gestão: Margem Consolidada do mês, Curva ABC, comissões.
7. Administrador: **baixar o backup do mês** e guardar fora da nuvem; conferir *Alertas* (limite do Simples, certificado digital).

---

# Parte 16 — Plano de encontros de treinamento

| Encontro | Público | Duração | Partes | Exercício |
|---|---|---|---|---|
| 1 | Todos | 45 min | 1, 2 | Seguir o pedido de teste pela ficha |
| 2 | Comercial | 90 min | 3, 7.2, 13 | Pedido de teste com 2 parcelas, arte pelo portal, orçamento convertido |
| 3 | Financeiro | 120 min | 4, 8.3 | Confirmar a parcela do encontro 2, gerar fixas, pagar com comprovante, malote e exportação |
| 4 | Designer e Produção | 90 min | 5, 9.1.3–9.1.5 | Levar o pedido de 8 a 23 com máquina M001; reprovar 3 na qualidade |
| 5 | Logística | 60 min | 6 | Coleta, trânsito e entrega do pedido de teste; simular frete |
| 6 | Cadastros e Estoque | 60 min | 7, 8 | Produto com foto, cliente PJ, perda de estoque, reposição |
| 7 | Engenharia de Custos | 120 min | 9 | Cadastrar 2 máquinas reais, 1 computador, ficha de uma categoria |
| 8 | RH | 90 min | 11 | Link de admissão, permissões, férias, folha |
| 9 | Gestão e Administração | 90 min | 10, 12, 14, 15 | Relatórios, permissões, auditoria, backup |

Ao final de cada encontro, quem conduz passa o **checklist** da parte. Item não marcado volta para o próximo encontro.

---

# Parte 17 — Solução de problemas

| Situação | O que fazer |
|---|---|
| Não vejo uma tela | O setor não tem acesso. Administrador libera em *Permissões por setor* ou no cadastro do colaborador. |
| Pedido parado em "aguardando financeiro" com a conta paga | Abra a ficha 👁️ do pedido — ele se corrige ao abrir. |
| Não aparece o botão para avançar a etapa | O pedido está em outro módulo (veja *Caminho completo*) ou falta requisito ("Falta: …"). |
| A senha da etapa deu erro | É a **sua** senha de login, digitada duas vezes iguais. |
| Data-limite parece errada | Confira data do evento, transportadora (dias úteis) e feriados; a ficha mostra a conta. |
| "Venda não pode sair por este CNPJ" | O CNPJ passou do limite anual (*Contábil → Empresas*); escolha outra empresa faturadora. |
| Coleta recusada | O pedido está sem transportadora; defina no pedido. |
| Lote da produção não apareceu na máquina | O código digitado ao iniciar a etapa não bate com o cadastro (use M001). |
| Despesa fixa não aparece no mês | *Central de Contas → [Gerar]*; até lá ela aparece no malote como prevista. |
| Linha "Maquinários" em Despesas Fixas não edita | É calculada. Clique em **abrir equipamento** e altere valores/vida útil lá. |
| ⚠️ no malote | Conta paga sem comprovante: anexe em Contas a Pagar. |
| Último backup em vermelho | Clique em **[Gerar backup agora]**; se falhar, a mensagem de erro aparece na lista. |
| Esqueci a senha | Administrador → *Usuários* → **Redefinir senha**. |
