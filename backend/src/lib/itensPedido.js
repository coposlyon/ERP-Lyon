// ============================================================
// O que foi contratado em cada item do pedido.
//
// As colunas que a tela mostra — Linha, Cor do Produto, Categoria,
// Acessório, Cor da Personalização — não existem como campos: foram
// gravadas no JSON de personalização quando o item foi lançado no PDV.
// Aqui elas voltam a ser colunas.
//
// Este arquivo existe porque a mesma derivação estava escrita DUAS
// VEZES, com resultados diferentes: a tela do vendedor devolvia sempre
// as mesmas colunas fixas (e "Cor da boca: —" num copo tradicional), e
// a tela do cliente já montava campos por categoria. Duas contas para a
// mesma pergunta é uma que vai ficar errada — e nesse caso já estava.
// Uma informação, um lugar.
// ============================================================

/** Capacidade lida do nome do produto ("TAÇA GIN 600 ML" → "600 ml"). */
function capacidade(nome) {
  const m = String(nome || '').match(/(\d{2,4})\s*ML\b/i);
  return m ? `${m[1]} ml` : null;
}

/**
 * As características que foram realmente compradas.
 *
 * Os campos mudam com a categoria: um copo tradicional tem uma cor, um
 * degradê tem cor de base e de boca, um jateado tem a cor do jateado.
 * Mostrar "Cor da boca: —" num produto tradicional é ruído que faz
 * quem lê achar que faltou combinar alguma coisa — por isso o que não
 * se aplica simplesmente não aparece.
 *
 * A fonte é o JSON de personalização gravado no lançamento do item.
 */
/**
 * A LINHA DA TINTA — PS, PP — do item.
 *
 * TRÊS FONTES, NESTA ORDEM, e a terceira é a que faltava.
 *
 * 1. `Tinta` na personalização, quando o PDV gravou.
 * 2. `ink_type` no cadastro do produto.
 * 3. O SUFIXO DA COR ESCOLHIDA.
 *
 * A terceira existe porque a segunda tem buraco: 63 dos 97 produtos
 * ativos estão com `ink_type` vazio, e para eles a coluna Linha saía
 * "—" mesmo com a tinta escolhida dizendo qual é. Na mesma tela, dois
 * copos com "PRETO - PS" na cor mostravam PS num e traço no outro — a
 * diferença não era o pedido, era o cadastro de um deles estar
 * incompleto.
 *
 * As tintas da casa se chamam "PRETO - PS", "BRANCO": o que vem depois
 * do travessão É a linha. Sem travessão não se inventa nada — "BRANCO"
 * continua sem linha, que é a verdade, em vez de virar "BRANCO".
 *
 * Isto não conserta o cadastro, e não é para consertar: quem preencher
 * `ink_type` volta a mandar pela fonte 2, que é a certa. Isto impede a
 * tela de mentir enquanto o cadastro não é preenchido.
 */
function linhaDaTinta(c, item) {
  if (c['Tinta']) return c['Tinta'];
  if (item.PRODUTOS?.ink_type) return item.PRODUTOS.ink_type;
  const cor = String(c['Cor da personalização'] || '');
  const m = cor.match(/[-–—]\s*([A-Za-z]{2,4})\s*$/);
  return m ? m[1].toUpperCase() : null;
}

/**
 * EM QUE PÉ ESTÁ A ARTE DESTE ITEM.
 *
 * Quatro estados, e a diferença entre eles é QUEM mandou o desenho:
 *
 *   sem_arte            ninguém mandou nada. A produção não começa.
 *   aguardando_cliente  a LOJA mandou. O cliente precisa ver e dizer
 *                       se é aquilo mesmo antes de virar tela e copo.
 *   aprovada            o desenho está combinado. Daqui não se troca
 *                       mais sozinho — só falando com um atendente.
 *   reprovada           o cliente disse que não é. A loja manda outra.
 *
 * A ARTE QUE O PRÓPRIO CLIENTE MANDA NASCE APROVADA, e não é atalho:
 * pedir que ele confirme o arquivo que ele acabou de escolher é
 * perguntar duas vezes a mesma coisa. O aviso de que a personalização
 * começa e não volta atrás é dado ANTES do envio, na tela — que é onde
 * ele ainda pode desistir.
 *
 * A APROVAÇÃO MORA DENTRO DA ARTE, e é de propósito: trocar o desenho
 * substitui o objeto inteiro, então arte nova nasce sem aprovação
 * nenhuma. Guardá-la fora seria a porta para um pedido ficar com a
 * aprovação do desenho velho colada no desenho novo.
 */
function estadoDaArte(c = {}) {
  const anexo = c.arte_cliente || null;
  const montada = !!(c.arte?.projeto_id || c.projeto_arte);

  // Sem arquivo anexado: ou não há arte, ou ela foi MONTADA no editor
  // pelo próprio cliente — e essa é dele, não há o que confirmar.
  if (!anexo) {
    return montada
      ? { estado: 'aprovada', por: 'cliente', aprovada_em: c.arte?.enviada_em || null, reprovada_em: null, motivo: null }
      : { estado: 'sem_arte', por: null, aprovada_em: null, reprovada_em: null, motivo: null };
  }

  const por = anexo.por || null;
  const base = { por, aprovada_em: anexo.aprovada_em || null,
                 reprovada_em: anexo.reprovada_em || null, motivo: anexo.motivo || null };

  if (anexo.reprovada_em) return { ...base, estado: 'reprovada' };
  if (anexo.aprovada_em) return { ...base, estado: 'aprovada' };
  // Sem decisão registrada: só espera o cliente o que veio da LOJA.
  // Anexo antigo do próprio cliente (de antes desta regra) continua
  // valendo como combinado — não é para o pedido de ontem acordar hoje
  // pedindo uma confirmação que ninguém sabia que existia.
  return por === 'cliente'
    ? { ...base, estado: 'aprovada', aprovada_em: anexo.enviada_em || null }
    : { ...base, estado: 'aguardando_cliente' };
}

function caracteristicasDoItem(item) {
  const c = item.customization || {};
  const arte = estadoDaArte(c);
  const nome = item.PRODUTOS?.name || item.product_name || 'Produto';

  // "Cor degradê: AZUL/ROSA" → { tipo: 'Cor degradê', valor: 'AZUL/ROSA' }
  const acabamentos = String(c['Acabamentos'] || '')
    .split(',').map(s => s.trim()).filter(Boolean)
    .map(a => {
      const [tipo, ...resto] = a.split(':');
      return { tipo: tipo.trim(), valor: resto.join(':').trim() || null };
    });

  const achar = re => acabamentos.find(a => re.test(a.tipo));
  const degrade = achar(/degrad/i);
  const bicolor = achar(/bicolor/i);
  const jateado = achar(/jatead/i);

  // "Com borda: PRATA" → cor da borda; "Sem borda" → não mostra nada
  const bordaBruta = String(c['Borda'] || '');
  const temBorda = /com borda/i.test(bordaBruta);
  const corBorda = temBorda ? (bordaBruta.split(':')[1] || '').trim() || null : null;

  // A categoria é o acabamento contratado; sem nenhum, é o tradicional.
  const categoria = degrade ? 'Degradê'
                  : bicolor ? 'Bicolor'
                  : jateado ? 'Jateado'
                  : acabamentos[0]?.tipo || 'Tradicional';

  // Cada categoria monta a própria lista. Campo sem valor fica de fora.
  const campos = [];
  const push = (rotulo, valor) => { if (valor) campos.push({ rotulo, valor }); };

  if (degrade || bicolor) {
    const par = (degrade || bicolor).valor || '';
    const [base, boca] = par.split('/').map(s => s.trim());
    push('Cor base', base || c['Variação']);
    push('Cor da boca', boca);
  } else if (jateado) {
    push('Cor do jateado', jateado.valor || c['Variação']);
  } else {
    push('Cor do produto', c['Variação']);
  }

  if (corBorda) push('Cor da borda', corBorda);
  push('Cor da personalização', c['Cor da personalização']);

  // Acabamentos extras que não viraram categoria nem borda
  acabamentos
    .filter(a => a !== degrade && a !== bicolor && a !== jateado)
    .forEach(a => push(a.tipo, a.valor || 'sim'));

  /**
   * ESTE ITEM TEM PERSONALIZAÇÃO?
   *
   * É a pergunta que decide se o pedido passa pela serigrafia — arte,
   * vegetal, revelação — ou se é copo liso, que sai do estoque para a
   * embalagem sem nada gravado.
   *
   * As duas portas de entrada escrevem diferente, e as duas contam:
   *   PDV        grava "Cor da personalização" na personalização do item
   *   catálogo   grava `impressao` (o processo) e o `design` com a arte
   *
   * Na dúvida a resposta é NÃO. Um liso marcado como personalizado por
   * engano fica parado esperando uma arte que não existe; um
   * personalizado marcado como liso pula a revelação e alguém percebe na
   * hora de gravar — o segundo erro é barulhento, o primeiro é mudo.
   */
  const desenho = c.design || {};
  const temPersonalizacao = !!(
    c['Cor da personalização']
    || c.impressao
    || c.preview
    || desenho.impressao
    || desenho.arte
    || desenho.tipo_pedido === 'personalizado'
  );

  return {
    codigo: c['Código'] || item.PRODUTOS?.code || null,
    produto: nome,
    capacidade: capacidade(nome),
    linha: linhaDaTinta(c, item),
    categoria,
    campos,
    // Sinalizadores de processo: quem decide se a etapa de borda e a de
    // pintura entram na linha do tempo é o que foi contratado no item,
    // não um palpite sobre o produto.
    tem_borda: temBorda,
    tem_pintura: !!(degrade || bicolor || jateado),
    tem_personalizacao: temPersonalizacao,
    // A ARTE QUE A CLIENTE VAI MONTAR DEPOIS DE PAGAR.
    //
    // `personalizar` é a intenção que ela marcou no catálogo;
    // `arte_pronta` diz se ela já montou. Os dois juntos são o que
    // decide, na tela do pedido, entre "Monte sua arte" e "Arte
    // recebida" — e o `modelo` é por onde o editor abre no copo certo.
    id: item.id,
    personalizar: !!c.personalizar,
    /**
     * DUAS PORTAS PARA A MESMA ARTE, e as duas contam como pronta.
     *
     * Uma parte das clientes MONTA a arte no editor (nomes, datas,
     * frases); a outra chega com o arquivo do designer dela na mão e só
     * quer ANEXAR. Aceitar só a primeira mandava a segunda para o
     * WhatsApp do vendedor — e de lá o arquivo entrava no pedido à mão,
     * quando entrava.
     */
    arte_pronta: !!(c.arte?.projeto_id || c.projeto_arte || c.arte_cliente?.url),
    /**
     * A ARTE ANEXADA POR ESTE ITEM.
     *
     * Fica no item, e não na venda (`artwork_url`), porque um pedido tem
     * mais de uma: cem copos de um jeito e cem de outro são dois itens
     * com dois desenhos. Enquanto ela morava só na venda, o segundo
     * arquivo enviado apagava o primeiro.
     */
    arte_anexada: c.arte_cliente?.url || null,
    arte_anexada_em: c.arte_cliente?.enviada_em || null,
    // O estado da arte, aberto em campos: a tela do cliente decide entre
    // "confirmar" e "trocar" com ele, e a do vendedor mostra que o
    // pedido está esperando o cliente e não a fábrica.
    arte_estado: arte.estado,
    arte_por: arte.por,
    arte_aprovada_em: arte.aprovada_em,
    arte_reprovada_em: arte.reprovada_em,
    arte_reprovada_motivo: arte.motivo,
    modelo_chave: c.modelo || null,
    acessorio: corBorda ? `Borda ${corBorda}` : (temBorda ? 'Borda' : null),
    quantidade: Number(item.quantity) || 0,
    valor_unitario: Number(item.unit_price) || 0,
    valor_total: Number(item.total) || 0,
  };
}

/**
 * Que etapas condicionais este pedido percorre.
 *
 * Borda só existe se algum item foi contratado com borda; pintura só se
 * algum acabamento pinta o copo (degradê, bicolor, jateado). Um pedido
 * tradicional sem borda não passa por nenhuma das duas, e mostrar as
 * duas apagadas na linha do tempo faria o cliente e o vendedor
 * esperarem por uma etapa que nunca vai acontecer.
 */
function etapasDosItens(itens) {
  const lista = (itens || []).map(i => (i.tem_borda === undefined ? caracteristicasDoItem(i) : i));
  return {
    borda:   lista.some(i => i.tem_borda),
    pintura: lista.some(i => i.tem_pintura),
    // UM ITEM PERSONALIZADO BASTA. Pedido misto (dez lisos e cem
    // gravados) passa pela serigrafia inteira — o que decide é existir
    // algo para gravar, não a proporção.
    personalizado: lista.some(i => i.tem_personalizacao),
  };
}

/**
 * A ARTE DO PEDIDO INTEIRO, contada por item.
 *
 * O pedido tem UMA etapa de arte e pode ter várias artes. Quem decide
 * se essa etapa está cumprida não é "existe algum arquivo" — é NÃO
 * SOBRAR NENHUMA ESPERANDO o cliente e NENHUMA REPROVADA. Produzir com
 * uma arte que o cliente ainda não viu (ou que ele recusou) é retrabalho
 * garantido, e retrabalho de serigrafia se mede em milheiro de copo.
 */
function resumoDaArte(itens) {
  const lista = (itens || []).map(i => (i.arte_estado === undefined ? caracteristicasDoItem(i) : i))
    .filter(i => i.tem_personalizacao);
  return {
    total:      lista.length,
    aguardando: lista.filter(i => i.arte_estado === 'aguardando_cliente').length,
    reprovadas: lista.filter(i => i.arte_estado === 'reprovada').length,
    sem_arte:   lista.filter(i => i.arte_estado === 'sem_arte').length,
    aprovadas:  lista.filter(i => i.arte_estado === 'aprovada').length,
  };
}

/**
 * A CONTA DA FÁBRICA: VENDIDO + PERDIDO = A PRODUZIR.
 *
 * "Não existe perda para o cliente." Pediu 200, recebe 200 — se
 * quebrarem 50 no caminho, a fábrica faz 250. A perda é custo nosso, e
 * nunca uma entrega menor: quem compra 200 copos para uma festa de 200
 * pessoas não tem o que fazer com 195.
 *
 * Mora aqui, e não na rota da produção, porque duas telas fazem esta
 * pergunta: a da fábrica (quanto ainda tenho de produzir) e a do pedido
 * de venda (quanto se perdeu neste pedido). Duas contas do mesmo número
 * são dois números.
 *
 * Só o `finish` conta. O `start` de uma etapa não tem perda, e um
 * registro avulso lançado duas vezes viraria perda dobrada.
 */
function contaDaProducao(log, itens, rotulos = {}) {
  const vendido = (itens || []).reduce((s, i) => s + (Number(i.quantity) || 0), 0);
  const porEtapa = {};
  let perdido = 0;
  for (const e of (Array.isArray(log) ? log : [])) {
    if (e.action !== 'finish') continue;
    const q = Number(e.perda || e.avariadas || 0);
    if (!q) continue;
    porEtapa[e.stage] = (porEtapa[e.stage] || 0) + q;
    perdido += q;
  }
  return {
    vendido,
    perdido,
    a_produzir: vendido + perdido,
    por_etapa: Object.entries(porEtapa).map(([etapa, unidades]) => ({
      etapa, label: rotulos[etapa] || etapa, unidades,
    })),
  };
}

module.exports = {
  capacidade, caracteristicasDoItem, etapasDosItens, estadoDaArte, resumoDaArte,
  contaDaProducao,
};
