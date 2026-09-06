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
function caracteristicasDoItem(item) {
  const c = item.customization || {};
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
    linha: c['Tinta'] || item.PRODUTOS?.ink_type || null,
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

module.exports = { capacidade, caracteristicasDoItem, etapasDosItens };
