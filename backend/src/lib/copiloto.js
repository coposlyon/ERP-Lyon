// ============================================================
// O COPILOTO DO SISTEMA.
//
// Ele responde dúvida sobre COMO USAR o ERP — "como faço um cadastro",
// "como funciona a precificação", "por que meu pedido não avança" — e
// lê print de tela quando a pessoa não sabe descrever o que está vendo.
//
// NÃO CONFUNDIR com o /ai/assistant, que é outra coisa e continua de
// pé: aquele responde sobre os NÚMEROS da empresa (quanto vendi, o que
// está acabando) consultando o banco. Este aqui responde sobre o
// SISTEMA. Perguntas diferentes, contextos diferentes.
//
// AS TELAS VÊM DO NAVEGADOR, NÃO DAQUI.
//
// A lista de telas que o copiloto pode abrir é mandada pelo front a
// cada pergunta, montada a partir do menu que aquele usuário
// realmente enxerga (lib/menu.js já filtra por permissão de módulo).
// Três motivos:
//
//   1. não fica velha — menu novo aparece aqui sozinho;
//   2. o copiloto não oferece tela que a pessoa não pode abrir, o que
//      seria mandar o vendedor bater numa porta trancada;
//   3. o caminho é VALIDADO contra essa lista antes de virar botão.
//      Modelo de linguagem inventa URL com naturalidade; aqui, um
//      caminho que não está na lista simplesmente não vira botão.
// ============================================================

const { askGroq, conteudoDoUsuario } = require('./groq');

// Quantas trocas de mensagem o copiloto lembra. Passar disso encarece
// cada pergunta sem melhorar a resposta — e a conversa de suporte
// raramente depende do que foi dito quinze mensagens atrás.
const MAX_HISTORICO = 8;

// ── O que ele sabe sobre a Lyon ─────────────────────────────
//
// Só o que NÃO dá para deduzir do menu: as regras de negócio e a ordem
// das coisas. Nome de tela e caminho vêm da lista que o front manda.
const COMO_FUNCIONA = `
FÁBRICA. A Lyon Copos produz copos e canecas acrílicas, lisos e
personalizados. O mesmo produto aparece em duas vitrines: a LOJA vende
o liso, sem alteração; o CATÁLOGO vende o personalizado, com acabamento
e arte escolhidos pelo cliente.

O PEDIDO DE VENDA passa por etapas, e cada uma tem um requisito para
liberar a seguinte. A ordem completa é:

  Pedido Realizado > Aguardando Pagamento > Estoque > Arte > Vegetal >
  Revelação > (Pintura) > (Borda) > Produção > Controle de Qualidade >
  Embalagem > Foto > Coleta > (Em Trânsito) > Entregue

Pintura e Borda só entram quando algum item do pedido pede — degradê,
bicolor e jateado puxam pintura; "Com borda" puxa borda. Em Trânsito só
existe quando é entrega; pedido de retirada pula direto para Entregue.

O QUE TRAVA CADA ETAPA:
- Aguardando Pagamento: precisa do comprovante anexado e conferido, ou
  da liberação manual pelo Financeiro. Quando o pagamento cai pelo
  gateway, a liberação é automática.
- Arte: precisa da arte anexada e aprovada.
- Foto: precisa da foto do lote pronto.
- Coleta e Em Trânsito: precisam dos dados de quem levou.

QUEM PODE MOVER O QUÊ. Cada etapa pertence a uma área (Financeiro,
Estoque, Arte, Produção, Logística) e só quem tem aquele módulo
liberado move a etapa. Gerente e administrador passam por cima disso.
Voltar etapa é só gerente, e exige motivo escrito.

PREÇO. O preço de venda não é digitado no chute: sai da Engenharia de
Custos. Insumos alimentam o custo, as despesas fixas e variáveis são
rateadas por produto ou por pedido, e a Formação de Preço aplica a
margem em cima disso. A Análise de Produtos mostra o que dá lucro.
Tabelas de Preço guardam preço por cliente ou por faixa de quantidade.

CADASTRO DE CLIENTE. Pessoa física ou jurídica, com CPF/CNPJ, contato e
endereço. O cliente também pode se cadastrar sozinho pelo site, e aí o
cadastro cai em Aprovações de Cadastro para alguém conferir antes de
virar cliente de verdade.
`.trim();

/**
 * A instrução de sistema.
 *
 * @param telas  [{ label, path }] — o menu real do usuário
 * @param ctx    { tela_atual, nome, cargo }
 */
function instrucao(telas, ctx = {}) {
  // O GRUPO VAI JUNTO porque a resposta cita o caminho do menu. Sem
  // ele o modelo chuta o grupo: mandou "Cadastros > Formação de Preço"
  // quando a tela mora em "Engenharia de Custos". O usuário procura
  // onde foi mandado, não acha, e a explicação inteira perde o valor.
  const lista = telas
    .map(t => `- ${t.grupo ? `${t.grupo} > ` : ''}${t.label} → ${t.path}`)
    .join('\n');

  return `Você é o assistente do ERP da Lyon Copos Acrílicos. Ajuda quem
está usando o sistema agora, no meio do trabalho.

COMO RESPONDER
- Português do Brasil, direto, sem enrolação e sem saudação comprida.
- TEXTO PURO. Nada de markdown: sem **negrito**, sem ## título, sem
  \`código\`. A resposta é mostrada crua, e o asterisco aparece na tela.
- Explique clicando: "Cadastros > Clientes > botão Novo Cliente".
- Quando a pessoa pedir um passo a passo, numere os passos.
- Se a pergunta for sobre número da empresa (quanto vendi, quanto tenho
  a receber, o que está acabando no estoque), diga que para isso ela
  deve perguntar no painel de gestão — você não consulta o banco.
- Se você NÃO SOUBER, diga que não sabe e sugira quem procurar. Não
  invente nome de tela, de botão nem de campo.
- Se mandarem um print, leia o que está na tela e responda sobre aquilo.

ABRIR TELA
Quando a resposta for mais útil com a tela aberta, termine a mensagem
com um marcador em linha separada:

  [[ABRIR:/caminho]]

Use SOMENTE um caminho da lista abaixo, copiado exatamente. Um caminho
fora da lista é descartado e a pessoa fica sem o botão. Um marcador por
resposta, sempre na última linha, e nunca no meio do texto.

TELAS QUE ESTE USUÁRIO PODE ABRIR
${lista || '(nenhuma — não ofereça abrir tela)'}

${ctx.tela_atual ? `A pessoa está agora na tela: ${ctx.tela_atual}` : ''}

COMO O SISTEMA FUNCIONA
${COMO_FUNCIONA}`;
}

/**
 * Separa o texto do marcador de ação.
 *
 * O caminho é conferido contra as telas permitidas: modelo de
 * linguagem inventa URL com naturalidade, e um botão que leva a lugar
 * nenhum é pior do que nenhum botão.
 */
function separarAcao(texto, telas) {
  const m = /\[\[ABRIR:\s*([^\]\s]+)\s*\]\]/i.exec(texto || '');

  // Rede contra o markdown. A instrução pede texto puro e o modelo
  // obedece quase sempre — "quase" é o problema: o painel mostra a
  // resposta crua, então um ** que escapa vira asterisco na tela.
  const limpo = String(texto || '')
    .replace(/\[\[ABRIR:[^\]]*\]\]/gi, '')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/(^|\n)#{1,6}\s+/g, '$1')
    .trim();
  if (!m) return { resposta: limpo, acao: null };

  const path = m[1].trim();
  const tela = telas.find(t => t.path === path);
  if (!tela) {
    console.warn(`[copiloto] caminho inventado e descartado: ${path}`);
    return { resposta: limpo, acao: null };
  }
  return { resposta: limpo, acao: { tipo: 'navegar', path: tela.path, label: tela.label } };
}

/**
 * Responde uma pergunta.
 *
 * @param pergunta   texto do usuário
 * @param imagem     data URL de um print (opcional)
 * @param historico  [{ role: 'user'|'assistant', text }] das trocas anteriores
 * @param telas      [{ label, path }] permitidas
 * @param ctx        { tela_atual }
 */
async function responder({ pergunta, imagem, historico = [], telas = [], ctx = {} }) {
  const anteriores = (Array.isArray(historico) ? historico : [])
    .slice(-MAX_HISTORICO)
    .filter(h => h && h.text && (h.role === 'user' || h.role === 'assistant'))
    // O histórico vai só como texto: reenviar os prints de todas as
    // perguntas anteriores multiplicaria o tamanho de cada requisição.
    .map(h => ({ role: h.role, content: String(h.text).slice(0, 4000) }));

  const r = await askGroq({
    system: instrucao(telas, ctx),
    mensagens: [...anteriores, { role: 'user', content: conteudoDoUsuario(pergunta, imagem) }],
    max_tokens: 1200,
  });

  if (!r.ok) return { ok: false, error: r.error };
  return { ok: true, ...separarAcao(r.text, telas) };
}

module.exports = { responder, separarAcao, instrucao };
