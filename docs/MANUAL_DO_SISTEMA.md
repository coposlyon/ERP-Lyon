# ERP Lyon Copos — Manual do Sistema

**Versão:** setembro/2026 · **Endereço:** https://lyoncopos.online

Este manual é para quem usa o sistema no dia a dia: vendedor, financeiro, designer, fábrica, logística, RH e gestão. Cada capítulo diz **o que a tela faz, quem usa e o que acontece quando você clica**. O capítulo 2 é o mais importante — ele explica o caminho de um pedido do início ao fim, e todos os outros módulos giram em torno dele.

---

## 1. Entrando no sistema

1. Abra https://lyoncopos.online e informe **e-mail e senha**.
2. O que você vê no menu depende do **setor** cadastrado em *Configurações → Permissões por setor* e das telas liberadas no seu cadastro de colaborador. Quem não vê uma tela não tem acesso a ela — não é erro.
3. O **sino** no alto avisa o que está esperando você (comprovante para conferir, solicitação para aprovar, pedido travado por prazo).
4. **Tema claro/escuro** e o tamanho da tela ficam no menu do usuário (canto inferior esquerdo).
5. Ficou sem acesso? Só um **Administrador** libera (Configurações → Usuários / Permissões).

---

## 2. O caminho do pedido — os 28 status

Todo pedido percorre a **mesma régua de 28 status**, e cada faixa pertence a um módulo. O número é global: "o pedido está no 16" quer dizer a mesma coisa para o vendedor, para a fábrica e para o cliente no portal.

| Nº | Status | Módulo dono | Quem move |
|---|---|---|---|
| 1 | Pedido realizado | Financeiro | automático, ao salvar o pedido |
| 2 | Aguardando financeiro | Financeiro | — |
| 3 | Pagamento confirmado | Financeiro | Financeiro, ao confirmar a conta a receber |
| 4 | Aguardando estoque | Pedido de Venda | automático (baixa de estoque) |
| 5 | Estoque confirmado | Pedido de Venda | automático |
| 6 | Aguardando anexo da arte | Pedido de Venda | vendedor ou cliente (portal) anexa a arte |
| 7 | Arte anexada e aprovada | Pedido de Venda | cliente aprova no portal / vendedor registra |
| 8 | Aguardando impressão de vegetal | Designer | — |
| 9 | Vegetal impresso | Designer | Designer (Iniciar → Finalizar) |
| 10 | Aguardando revelação | Produção | — |
| 11 | Revelação finalizada | Produção | Fábrica (informa nº da matriz) |
| 12 | Aguardando pintura | Produção | — |
| 13 | Pintura finalizada | Produção | Fábrica |
| 14 | Aguardando aplicação de borda | Produção | — |
| 15 | Borda finalizada | Produção | Fábrica |
| 16 | Aguardando produção | Produção | — |
| 17 | Produção finalizada | Produção | Fábrica (informa a máquina) |
| 18 | Aguardando controle de qualidade | Produção | — |
| 19 | Controle de qualidade finalizado | Produção | Fábrica (aprovado / reprovado + avariadas) |
| 20 | Aguardando foto | Produção | — |
| 21 | Foto enviada | Produção | Fábrica (fotos conferidas) |
| 22 | Aguardando embalagem | Produção | — |
| 23 | Embalagem finalizada | Produção | Fábrica (checklist + houve perda?) |
| 24 | Aguardando coleta / retirada | Logística | — |
| 25 | Coleta realizada | Logística | Logística (volumes, etiqueta, motorista) ou retirada no balcão |
| 26 | Em trânsito | Logística | Logística (código de rastreio) |
| 27 | Aguardando entrega | Logística | — |
| 28 | Pedido entregue | Logística | Logística (recebido por / íntegro) |

**Regras que valem para toda a régua**

- **Status que não se aplica** ao pedido (ex.: copo liso não tem arte, vegetal nem revelação) aparece riscado e é pulado sozinho.
- **Cada passo fica no histórico** com data, hora e quem fez. Nada é apagado.
- **Confirmação dupla:** nos módulos Designer, Produção e Logística, avançar uma etapa exige a **senha do usuário duas vezes**. É proposital — evita clique errado no chão de fábrica.
- **Perda** não é registrada por status: ao finalizar a embalagem o sistema pergunta **"houve alguma perda?"**. Se sim, informa quantas — e o pedido segue com a quantidade que o cliente comprou (a fábrica repõe). O cliente nunca vê perda.
- **Prazo:** o pedido calcula sozinho a data-limite de saída = *data do evento − dias úteis da transportadora − 2 dias de margem*. Se chegar a 24h do limite e o pedido ainda não passou da embalagem, abre um **alerta vermelho** na ficha do pedido e no sino.
- **Onde vejo tudo isso?** No pedido, clique no **olho 👁️** — a ficha mostra a régua inteira, o histórico, as fotos, a contagem (vendido / perdido / a produzir) e o prazo.

---

## 3. Comercial

### 3.1 Pedidos de Venda (`/sales`)
- **Novo pedido:** cliente → itens (produto, quantidade, personalização) → frete/transportadora → data do evento → forma de pagamento (à vista / parcelas) → salvar. O pedido nasce no status 1 e gera as **contas a receber** automaticamente.
- **Parcelas:** parcela que vence hoje exige **comprovante** (o vendedor ou o cliente anexa; o financeiro confere). Parcelas de 30/60 dias **não pedem comprovante** — o sistema só gera as contas para o financeiro cobrar no vencimento.
- **Arte:** anexe o arquivo no pedido ou mande o link do portal para o cliente anexar e aprovar.
- **Olho 👁️:** ficha completa do pedido (item 2).
- **Documentos:** orçamento, pedido em PDF, link do portal do cliente.

### 3.2 Dashboard do Vendedor (`/vendedor`)
Metas do mês, pedidos por status, comissão prevista, ranking. A **Área do vendedor** (layout enxuto) mostra só o que o vendedor precisa: pedidos, catálogo para enviar, agenda e comunicação com o gerente.

### 3.3 Lyon Prime (`/lyon-prime`)
Programa de fidelidade: pontos por compra, faixas e benefícios. Configurável pelo administrador.

### 3.4 Catálogo e Loja (o "marketplace" da Lyon)
- **/catalogo** — copos personalizados: o cliente monta o pedido (modelo, cor, quantidade, arte), vê o preço pela faixa de quantidade e fecha. Vira um pedido de venda normal, origem *catálogo*.
- **/loja** — copos lisos, venda direta com pagamento **PIX (Nubank)**; o financeiro confirma o recebimento em *Pagamentos da Loja*.
- **Portal do cliente** (`/acompanhar/…`): o cliente acompanha os 28 status, aprova a arte, anexa comprovante, vê as fotos do produto pronto, baixa a 2ª via da nota e **confirma a retirada** com CPF + data de nascimento (declaração eletrônica).

---

## 4. Financeiro

### 4.1 Contas a Receber / Pagar (`/financial`)
- **Receber:** cada parcela de pedido é uma linha. Fluxo: *comprovante anexado → Conferir → Confirmar*. **Qualquer um dos três botões que marque a conta como paga faz o pedido andar** para o status 3 (e daí para estoque/arte, se já estiverem prontos). Se um pedido aparecer preso em "aguardando financeiro" com a conta já paga, basta **abrir o pedido** — ele se corrige sozinho.
- **Histórico** (botão em cada conta): de onde a conta veio, quem anexou, quem conferiu, quem confirmou, quem desfez.
- **Pagar:** despesas fixas geradas por mês, compras, folha, manuais. Anexe o comprovante ao pagar — o malote do contador conta quem está sem.
- **Fluxo de Caixa** e **DRE / Resultado**: visão do mês.
- **Malote de Pagamentos** (aba): item 6.2.

### 4.2 Central de Contas (`/contas`)
O mês inteiro numa tela: o que vence, o que atrasou, despesas fixas que ainda não viraram conta (botão *Gerar*).

### 4.3 Pagamentos da Loja (`/store-payments`)
Pedidos da loja on-line aguardando confirmação do PIX. Confirmar libera o pedido.

### 4.4 Config. Financeira (`/financial-config`)
Contas bancárias, plano de contas, centros de custo, formas de pagamento.

### 4.5 Fiscal / NF-e (`/fiscal`)
Emissão e consulta de notas (quando o certificado digital e o emissor estiverem configurados), DANFE e XML. A 2ª via fica disponível no portal do cliente.

---

## 5. Designer, Produção e Logística (as filas de etapas)

As três telas funcionam do mesmo jeito:

1. **Fila** — os pedidos que estão na sua faixa de status, com prazo e alerta.
2. Clique no pedido → aparece **a régua só do seu módulo** (Designer 8–9, Produção 10–23, Logística 24–28) com o balão aceso onde o pedido está.
3. **Iniciar** → o status vira "em andamento". **Finalizar** → preenche o que a etapa pede (matriz, máquina, resultado da qualidade, fotos, checklist, volumes, rastreio…) e confirma com **senha duas vezes**.
4. O pedido some da sua fila e aparece na do próximo módulo.

**Designer (`/designer`)** — imprime o vegetal a partir da arte aprovada.

**Produção (`/production`)** — revelação (nº da matriz; matriz perdida gera reposição), pintura, borda, produção (máquina), qualidade (aprovado/reprovado, avariadas), foto (obrigatória, vai para o portal do cliente), embalagem (checklist + "houve perda?"). Ao finalizar a embalagem de um pedido **para retirada**, o cliente recebe aviso automático.

**Logística (`/logistics`)** — abas *Etapas* (coleta, trânsito, entrega), *Expedição* (avisar cliente, declaração de conteúdo, etiqueta, NF) e *Transportadoras* (prazo em dias úteis por transportadora — é ele que alimenta o cálculo de prazo do pedido). Retirada no balcão: quem retirou, documento conferido, conferiu na frente.

**Devoluções (`/returns`)** — registro de devolução/troca com motivo e reflexo no estoque.

---

## 6. Contábil / Fiscal (`/contabil`)

### 6.1 Visão Geral, Empresas, Bancos, Conciliação, DRE, Tributário
- **Empresas:** CNPJs, regime (Simples/MEI/Presumido/Real), **limite anual** e alíquota. O sistema avisa em 70/80/90/95/100 % do limite e quando o certificado digital está para vencer.
- **Conciliação:** Pedido × Contas a Receber × NF-e, mês a mês — mostra divergências.
- **DRE:** mensal, trimestral ou anual; PDF e Excel.
- **Tributário:** simulador de faturamento e projeção de imposto.

### 6.2 Malote de Pagamentos (também em Financeiro)
Todas as despesas do mês reunidas para o contador, agrupadas por conta contábil/categoria:
- contas a pagar do mês (compras, despesas fixas, folha, manuais) com situação, data de pagamento, banco e **comprovante** (📎 abre o arquivo; ⚠️ = pago sem comprovante);
- despesas fixas **ainda não lançadas** (previstas);
- **projeção do DAS** (alíquota × faturamento do mês).
Botões: **PDF**, **Excel** e **Registrar envio ao contador** — grava quem enviou, quando, para quem, e uma **foto** das contas naquele momento. O histórico do ano mostra todos os envios; reenvio com correção aparece como novo envio.

### 6.3 Margem Consolidada
O ano inteiro, mês a mês: receita, impostos, custo dos produtos (CMV, da Formação de Preço), despesas, lucro, margem bruta e líquida. Total do ano, melhor e pior mês, **por empresa faturadora** e **por canal** (ERP, catálogo, loja). Meses abaixo da meta de margem ficam destacados. Excel.

### 6.4 Exportação para o Contador
Escolha **mês** ou **período** → **Excel completo com 6 abas** (Resumo, Lançamentos, Notas fiscais, Vendas, Compras, Folha) ou **CSV por aba**. Cabeçalhos em português; links de comprovante, DANFE e XML abrem direto. É o leiaute genérico — se o escritório contábil usar um sistema específico (Domínio, Alterdata…), estas colunas são a base do mapeamento.

---

## 7. Engenharia de Custos

- **Formação de Preço** — ficha por produto: insumos, mão de obra, overhead, impostos → preço mínimo / ideal / premium, com faixas por quantidade.
- **Despesas Fixas / Variáveis** — o que entra no rateio (folha administrativa vem do RH sozinha).
- **Rateio por Categoria / por Pedido** — quanto de custo fixo cada linha e cada pedido carregam.
- **Painel de Rentabilidade** — margem por produto, vendedor, cliente, região e canal; ponto de equilíbrio; produtos abaixo da meta com preço sugerido (**só sugere — não altera preço sozinho**).
- **Simulador de Metas** e **Histórico de Rateios** (fotos mensais).

---

## 8. Cadastros

- **Produtos** — código, categoria, custo, preço, estoque mínimo, unidade, tipo de tinta, gabaritos de personalização.
- **Clientes** — PF/PJ, contatos (sincroniza com Google Contatos), limite de crédito, prazo de boleto, selo de confiança, histórico de compras, bloqueio. **Aprovações de Cadastro**: cadastros feitos pelo portal esperam um administrador aprovar.
- **Fornecedores** — dados, documentos, portal do fornecedor.

---

## 9. Estoque, Compras e Relatórios

- **Estoque** — saldo por produto, movimentos (entrada, saída, ajuste, devolução), a baixa do pedido acontece sozinha no status 4→5.
- **Compras** — pedido de compra ao fornecedor, entrada de nota, gera contas a pagar.
- **Relatórios** — vendas, produtos, clientes, financeiro; **Previsão de Demanda** por histórico.

---

## 10. Recursos Humanos

Painel RH · Colaboradores (admissão digital pelo link de convite, documentos, permissões por tela) · Estrutura da Empresa (departamentos, cargos) · **Bater Ponto** (`/marcacao`, para todos) · Jornada/Ponto · Ocorrências · Férias/Afastamentos (fluxo de aprovação) · **Folha e Benefícios** (fechamento mensal — alimenta o rateio e a exportação do contador) · Documentos · eSocial/FGTS · Admissões · Desligamentos · Conformidade.

---

## 11. Comunicação e Agenda

**Comunicação** — mural do que aconteceu no sistema (por módulo) e sala de conversa da empresa; o vendedor fala com o gerente por aqui. **Agenda** — compromissos e lembretes, com os feriados de *Configurações → Feriados* (os mesmos que o cálculo de prazo usa).

---

## 12. Configurações (Administrador)

- **Geral** — dados da empresa, logo, política de pagamento (confirma sozinho ou exige financeiro), integrações (WhatsApp, Google, Total Express, PIX).
- **Permissões por setor** — o que cada setor vê e faz; permissão por tela no cadastro do colaborador.
- **Feriados** — nacionais e da empresa.
- **Catálogo** — produtos, faixas de preço e gabaritos do catálogo público.
- **Usuários** — criar, desativar, redefinir senha, setor.
- **Auditoria** — quem fez o quê, quando, em que registro. Nada é apagado do sistema: cancelado/desativado fica visível aqui.
- **Sites** — os sites públicos da Lyon (institucional, catálogo, loja) e seus editores.

---

## 13. Perguntas frequentes

**O pedido está parado em "aguardando financeiro" mas a conta já está paga.** Abra o pedido (olho) — ele se corrige na hora. Isso vale para qualquer forma de dar baixa: Pagar, Conferir ou Confirmar.

**Não aparece o botão para avançar a etapa.** Ou o pedido está em outro módulo (veja o caminho completo na ficha), ou falta um requisito — a ficha diz qual ("Falta: …").

**Pedi a senha e deu erro.** É a **sua** senha de login, digitada duas vezes iguais.

**Por que a data-limite é 21 e não 23?** A ficha mostra a conta: evento − dias úteis da transportadora − 2 de margem, pulando fins de semana e feriados.

**Como mando o mês para o contador?** *Contábil → Exportação p/ Contador → Excel completo* e *Malote de Pagamentos → Registrar envio*. Os dois ficam gravados.

**Cadastrei uma despesa fixa e ela não aparece no mês.** Vá em *Central de Contas* e clique *Gerar* (ou espere a geração automática do dia 1º). Enquanto isso ela aparece no malote como "prevista".
