// ============================================================
// O COMPROVANTE DE PAGAMENTO, PARCELA A PARCELA.
//
// "Liberar pagamento" era um botao que dizia "confia em mim": alguem do
// financeiro afirmava que o dinheiro entrou e o pedido andava. Servia
// enquanto o pagamento era um so. Nao serve para o que a Lyon faz:
//
//   entrada + saldo    dois pagamentos, em datas diferentes
//   boleto 30/60/90    tres boletos e tres comprovantes
//
// Agora cada PARCELA recebe o seu comprovante, a maquina le a imagem e
// o financeiro confere. O botao de liberar continua existindo — mas como
// a excecao (o dinheiro caiu e ninguem tem o papel), e nao como a regra.
//
// A LEITURA SUGERE, A PESSOA DECIDE, O SISTEMA DIVIDE.
//
// A maquina le data, hora e valor da imagem e PRE-PREENCHE o valor pago.
// Quem anexa confirma esse numero. Se o confirmado for menor que a
// parcela, o sistema abre sozinho a linha do saldo — e essa e a mecanica
// da entrada de 50%: nao existe "meio pago", existem duas parcelas.
//
// A divisao nunca sai de um palpite da maquina. Se a leitura errar o
// valor e ninguem corrigir, o erro entra como divergencia para a
// conciliacao olhar — nao como uma parcela nova inventada.
//
// O QUE A LEITURA NAO FAZ: dizer se o comprovante e verdadeiro. Ela le
// pixels. Um PDF forjado com valor e data certos passa por ela intacto,
// e e por isso que existe `receipt_status` e a conferencia de sexta.
// ============================================================
const supabase = require('../config/supabase');
const { askClaude, extractJSON } = require('./ai');
const { uploadPrivado, linkAssinado } = require('./storage');
// O código do pedido tem um formato só — ver lib/pedidoCodigo.js.
const { codigoPedido } = require('./pedidoCodigo');

const centavos = v => Math.round((Number(v) || 0) * 100);
const doisDecimais = v => Math.round((Number(v) || 0) * 100) / 100;
// Para o texto que fica na observacao da parcela — quem le a linha
// precisa ver "R$ 150,00", e nao 150.
const brl = v => (Number(v) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

const tabelaAusente = err =>
  /42P01|PGRST(002|205)|does not exist|schema cache|column/i.test(`${err?.code || ''} ${err?.message || ''}`);

/** Os campos da parcela que a tela precisa. */
const CAMPOS = `id, description, amount, paid_amount, due_date, paid_date, status,
                installment, total_installments, payment_method, document_number,
                receipt_url, receipt_read, receipt_status, receipt_at, receipt_by, boleto_url,
                receipt_amount, paid_by, paid_at, reference_id, customer_id, notes`;

/**
 * AS PARCELAS DESTE PEDIDO.
 *
 * Pedido a prazo ja nasce com uma linha por parcela em LANCAMENTOS. O
 * pedido a vista nao nasce com nenhuma — e por isso esta funcao devolve
 * uma PARCELA VIRTUAL com o total: a tela precisa de uma linha para
 * anexar o comprovante, e inventar a linha no banco antes de alguem
 * pagar encheria o contas a receber de cobrancas que nunca existiram.
 *
 * A virtual vira linha de verdade no primeiro anexo (`garantirParcela`).
 */
async function parcelasDaVenda(tenantId, venda) {
  const { data, error } = await supabase.from('LANCAMENTOS')
    .select(CAMPOS)
    .eq('tenant_id', tenantId)
    .eq('reference_type', 'sale').eq('reference_id', venda.id)
    .order('installment', { ascending: true, nullsFirst: true })
    .order('due_date', { ascending: true });

  if (error && !tabelaAusente(error)) throw error;
  const linhas = error ? [] : (data || []);

  if (linhas.length) return linhas.map(enriquecer);

  return [{
    id: null,                    // virtual: ainda nao existe no banco
    virtual: true,
    description: codigoPedido(venda.number),
    amount: doisDecimais(venda.total),
    paid_amount: 0,
    due_date: null,
    status: 'pending',
    installment: 1, total_installments: 1,
    receipt_url: null, receipt_read: null, receipt_status: null,
    falta: doisDecimais(venda.total),
    rotulo: 'Pagamento do pedido',
  }];
}

/** O que a tela mostra sem ter que recalcular nada. */
function enriquecer(l) {
  const falta = doisDecimais((Number(l.amount) || 0) - (Number(l.paid_amount) || 0));
  const n = l.total_installments || 1;
  return {
    ...l,
    falta: falta > 0 ? falta : 0,
    quitada: falta <= 0.005,
    rotulo: n > 1 ? `Parcela ${l.installment || 1}/${n}` : 'Pagamento do pedido',
  };
}

/**
 * A parcela existe no banco — cria a virtual se for o caso.
 *
 * So acontece no momento do anexo: quem anexa comprovante esta dizendo
 * que pagou, e ai a cobranca passa a ter razao de existir no contas a
 * receber.
 */
async function garantirParcela(tenantId, venda, req) {
  const { data, error } = await supabase.from('LANCAMENTOS').insert({
    tenant_id: tenantId,
    user_id: req?.user?.id || null,
    description: codigoPedido(venda.number),
    document_number: codigoPedido(venda.number),
    type: 'receivable',
    amount: doisDecimais(venda.total),
    paid_amount: 0,
    due_date: new Date().toISOString().split('T')[0],
    status: 'pending',
    customer_id: venda.customer_id || null,
    payment_method: venda.payment_method || null,
    installment: 1, total_installments: 1,
    reference_type: 'sale', reference_id: venda.id,
  }).select(CAMPOS).single();
  if (error) throw error;
  return data;
}

/**
 * A LEITURA DA IMAGEM.
 *
 * Passa o comprovante para a Claude e pede tres numeros: data, hora e
 * valor. O modelo e passado explicito (e nao pelo ANTHROPIC_MODEL geral)
 * porque este e o unico lugar do sistema onde um erro de leitura vira
 * dinheiro dado como recebido — vale o modelo mais capaz.
 *
 * NULO EM VEZ DE CHUTE. O prompt manda devolver null no campo que nao
 * estiver legivel. Um valor inventado com cara de certo e pior que um
 * campo vazio: o vazio a pessoa preenche, o inventado ela confere por
 * cima e aprova.
 *
 * `{ ok: false }` quando a IA nao esta configurada ou falhou. O anexo
 * acontece do mesmo jeito — a leitura e ajuda, nao porteiro.
 */
async function lerComprovante(dataUrl) {
  const m = String(dataUrl || '').match(/^data:(image\/[a-z+]+);base64,(.+)$/i);
  if (!m) return { ok: false, motivo: 'so_imagem' };   // PDF nao passa por aqui

  const r = await askClaude({
    model: process.env.ANTHROPIC_MODEL_OCR || 'claude-opus-5',
    max_tokens: 700,
    system: 'Voce le comprovantes de pagamento brasileiros (Pix, TED, DOC, boleto). '
          + 'Responde SOMENTE com JSON, sem texto em volta.',
    messages: [{
      role: 'user',
      content: [
        { type: 'image', source: { type: 'base64', media_type: m[1], data: m[2] } },
        { type: 'text', text: [
          'Extraia deste comprovante:',
          '{"data":"AAAA-MM-DD","hora":"HH:MM","valor":000.00,"banco":"nome","pagador":"nome","destinatario":"nome","tipo":"pix|ted|boleto|deposito|outro","obs":"o que estiver ilegivel"}',
          '',
          'REGRAS:',
          '- campo que voce nao conseguir ler com certeza: null. Nunca invente.',
          '- valor: numero, ponto decimal, sem R$ e sem separador de milhar.',
          '- se a imagem nao for um comprovante de pagamento, devolva {"nao_e_comprovante":true}.',
        ].join('\n') },
      ],
    }],
  });

  if (!r.ok) return { ok: false, motivo: r.error };
  const j = extractJSON(r.text);
  if (!j) return { ok: false, motivo: 'resposta_ilegivel' };
  if (j.nao_e_comprovante) return { ok: false, motivo: 'nao_e_comprovante' };

  return {
    ok: true,
    data: j.data || null,
    hora: j.hora || null,
    valor: j.valor == null ? null : doisDecimais(j.valor),
    banco: j.banco || null,
    pagador: j.pagador || null,
    destinatario: j.destinatario || null,
    tipo: j.tipo || null,
    obs: j.obs || null,
  };
}

/**
 * ANEXA O COMPROVANTE NUMA PARCELA.
 *
 * @param valorInformado  o que a PESSOA confirmou ter pago. Sem ele, vale
 *                        o que a leitura achou; sem os dois, vale a
 *                        parcela inteira.
 *
 * Devolve o que gravou e, quando o pagamento foi parcial, a parcela nova
 * do saldo.
 */
async function anexarComprovante(tenantId, venda, parcelaId, { arquivo, valor, req }) {
  let parcela;
  if (parcelaId) {
    const { data, error } = await supabase.from('LANCAMENTOS').select(CAMPOS)
      .eq('tenant_id', tenantId).eq('id', parcelaId).maybeSingle();
    if (error) throw error;
    if (!data) return { erro: 'Parcela nao encontrada' };
    parcela = data;
  } else {
    parcela = await garantirParcela(tenantId, venda, req);
  }

  const caminho = await uploadPrivado(arquivo, 'comprovantes');
  if (!caminho) return { erro: 'Nao consegui guardar o arquivo. Tente de novo.' };

  const leitura = await lerComprovante(arquivo);

  // A ordem da verdade: o que a pessoa confirmou, depois o que a maquina
  // leu, depois a parcela inteira. Nunca o contrario.
  const declarado = valor != null && valor !== ''
    ? doisDecimais(valor)
    : (leitura.ok && leitura.valor != null ? leitura.valor : doisDecimais(parcela.amount));

  // Divergente quando a MAQUINA leu um valor diferente do declarado.
  // Nao trava: entra assim mesmo, marcado, e o financeiro olha.
  const divergente = leitura.ok && leitura.valor != null
    && centavos(leitura.valor) !== centavos(declarado);

  /**
   * ANEXAR NAO PAGA — e esta e a mudanca.
   *
   * Antes esta funcao gravava `paid_amount` na hora: o vendedor subia o
   * print e a parcela aparecia PAGA no Financeiro, sem ninguem do
   * financeiro ter aberto o extrato. O print de uma transferencia
   * AGENDADA, o comprovante de outro pedido e o valor digitado errado
   * entravam todos como dinheiro na conta.
   *
   * O que entra aqui e uma AFIRMACAO com valor declarado. O dinheiro so
   * muda de coluna em `confirmarPagamento`, que e do financeiro.
   */
  const patch = {
    receipt_url: caminho,
    receipt_read: leitura.ok ? leitura : { erro: leitura.motivo },
    receipt_status: divergente ? 'divergente' : 'pendente',
    receipt_at: new Date().toISOString(),
    receipt_by: req?.user?.name || req?.user?.email || 'Usuario',
    receipt_amount: declarado,
  };

  const { data: salva, error } = await supabase.from('LANCAMENTOS')
    .update(patch).eq('id', parcela.id).eq('tenant_id', tenantId).select(CAMPOS).single();
  if (error) throw error;

  return {
    ok: true,
    parcela: enriquecer(salva),
    // Nada de saldo aqui: quebrar a parcela em duas e consequencia do
    // dinheiro que ENTROU, e ainda nao entrou nada.
    saldo: null,
    leitura,
    divergente,
    declarado,
    aguardando_financeiro: true,
  };
}

/**
 * O FINANCEIRO CONFIRMA — e o dinheiro entra.
 *
 * Este e o unico lugar em que o `paid_amount` de uma parcela de pedido
 * muda. Ele faz tres coisas que antes ninguem fazia:
 *
 * 1. EXIGE A CONFERENCIA. Sem o comprovante marcado como conferido nao
 *    confirma — a nao ser que quem confirma diga explicitamente que
 *    esta recebendo SEM comprovante (dinheiro no balcao), o que fica
 *    registrado como tal.
 *
 * 2. ESPALHA O QUE SOBRA NAS PARCELAS SEGUINTES. Pagou 350 numa parcela
 *    de 200 de um pedido em 2x? A primeira fecha e 150 abatem na
 *    segunda, que fica devendo 50. Antes o excedente ficava parado numa
 *    parcela "paga a mais" e a segunda continuava inteira — o cliente
 *    pagava e o sistema continuava cobrando.
 *
 * 3. GUARDA QUEM CONFIRMOU. `paid_by`/`paid_at`, separados de
 *    `receipt_by`/`receipt_at`: "quem olhou a imagem" e "quem disse que
 *    o dinheiro entrou" sao duas perguntas diferentes.
 */
async function confirmarPagamento(tenantId, parcelaId, { valor, sem_comprovante, req } = {}) {
  const { data: parcela, error } = await supabase.from('LANCAMENTOS').select(CAMPOS)
    .eq('tenant_id', tenantId).eq('id', parcelaId).maybeSingle();
  if (error) throw error;
  if (!parcela) return { erro: 'Parcela nao encontrada' };

  const temComprovante = !!parcela.receipt_url;
  if (temComprovante && parcela.receipt_status !== 'conferido') {
    return { erro: 'Confira o comprovante antes de confirmar o pagamento.', code: 'FALTA_CONFERIR' };
  }
  if (!temComprovante && !sem_comprovante) {
    return {
      erro: 'Esta parcela nao tem comprovante anexado.',
      code: 'SEM_COMPROVANTE',
      dica: 'Se o pagamento foi em dinheiro no balcao, confirme marcando "sem comprovante".',
    };
  }

  const jaLancado = doisDecimais(parcela.paid_amount);
  const semConfirmacao = jaLancado > 0 && !parcela.paid_at;

  const pago = doisDecimais(
    valor != null && valor !== '' ? valor
      : (parcela.receipt_amount != null ? doisDecimais(parcela.receipt_amount) - jaLancado
        : doisDecimais(parcela.amount) - jaLancado),
  );

  /**
   * CONFIRMAR TAMBEM E RATIFICAR — e sem isto a linha ficava presa.
   *
   * A parcela paga pelo fluxo antigo ja tem `paid_amount` e nao tem
   * confirmacao. Conferir o comprovante dela nao levava a lugar nenhum:
   * "confirmar" exigia um valor maior que zero, e nao havia nada a
   * acrescentar — o dinheiro ja estava lancado, faltava alguem assumi-lo.
   *
   * Agora confirmar com valor zero (ou negativo, quando o lancado passa
   * do total) e um ato legitimo: NAO mexe no valor, so assina. Quem
   * confirmou e quando passam a existir, e a conta sai da fila.
   */
  const soRatifica = pago <= 0.005 && semConfirmacao;
  if (!(pago > 0) && !soRatifica) return { erro: 'Informe o valor recebido.' };

  const agora = new Date().toISOString();
  const hoje = agora.split('T')[0];
  const quem = req?.userProfile?.name || req?.user?.name || req?.user?.email || 'Financeiro';

  // As parcelas irmas, para onde o excedente escorre. So as do MESMO
  // pedido: dinheiro de um pedido nao abate a divida de outro.
  let irmas = [];
  if (parcela.reference_id) {
    const { data } = await supabase.from('LANCAMENTOS').select(CAMPOS)
      .eq('tenant_id', tenantId).eq('reference_type', 'sale')
      .eq('reference_id', parcela.reference_id).neq('id', parcela.id)
      .order('installment');
    irmas = (data || []).filter(x => doisDecimais(x.amount) - doisDecimais(x.paid_amount) > 0.005);
  }

  const aplicados = [];
  let restante = soRatifica ? 0 : pago;

  // 1) A parcela que recebeu o comprovante vem primeiro.
  const cabeNela = Math.max(0, doisDecimais(parcela.amount) - doisDecimais(parcela.paid_amount));
  const naParcela = doisDecimais(Math.min(restante, cabeNela));
  restante = doisDecimais(restante - naParcela);
  const pagoNaParcela = doisDecimais(doisDecimais(parcela.paid_amount) + naParcela);
  const quitou = centavos(pagoNaParcela) >= centavos(doisDecimais(parcela.amount));

  const { data: salva, error: e1 } = await supabase.from('LANCAMENTOS').update({
    paid_amount: pagoNaParcela,
    status: quitou ? 'paid' : 'partial',
    paid_date: quitou ? (parcela.receipt_read?.data || hoje) : parcela.paid_date,
    paid_by: quem,
    paid_at: agora,
    ...(sem_comprovante && !temComprovante ? { receipt_status: 'sem_comprovante' } : {}),
  }).eq('id', parcela.id).eq('tenant_id', tenantId).select(CAMPOS).single();
  if (e1) throw e1;
  aplicados.push({ id: parcela.id, parcela: parcela.installment, valor: naParcela, quitou });

  // 2) O que sobrou escorre para as seguintes, na ordem das parcelas.
  for (const irma of irmas) {
    if (restante <= 0.005) break;
    const cabe = Math.max(0, doisDecimais(irma.amount) - doisDecimais(irma.paid_amount));
    const aplica = doisDecimais(Math.min(restante, cabe));
    if (aplica <= 0.005) continue;
    const novoPago = doisDecimais(doisDecimais(irma.paid_amount) + aplica);
    const fechou = centavos(novoPago) >= centavos(doisDecimais(irma.amount));
    await supabase.from('LANCAMENTOS').update({
      paid_amount: novoPago,
      status: fechou ? 'paid' : 'partial',
      paid_date: fechou ? hoje : irma.paid_date,
      paid_by: quem,
      paid_at: agora,
      notes: [irma.notes, 'Abatido de ' + brl(aplica) + ' pelo comprovante da parcela '
        + (parcela.installment || 1) + '.'].filter(Boolean).join(' ').slice(0, 500),
    }).eq('id', irma.id).eq('tenant_id', tenantId);
    restante = doisDecimais(restante - aplica);
    aplicados.push({ id: irma.id, parcela: irma.installment, valor: aplica, quitou: fechou });
  }

  /**
   * PAGOU MENOS QUE A PARCELA? Abre a linha do saldo.
   *
   * E aqui que a entrada de 50% vira duas parcelas sem ninguem cadastrar
   * nada: quem pagou 500 de 1000 ja sai desta chamada com a segunda
   * linha esperando o proximo comprovante.
   */
  let saldo = null;
  const falta = doisDecimais(doisDecimais(parcela.amount) - pagoNaParcela);
  if (falta > 0.005) {
    const total = (parcela.total_installments || 1) + 1;
    const { data: nova, error: erroNova } = await supabase.from('LANCAMENTOS').insert({
      tenant_id: tenantId,
      user_id: req?.user?.id || null,
      description: (parcela.description || 'Parcela') + ' — saldo',
      document_number: parcela.document_number || null,
      type: 'receivable',
      amount: falta,
      paid_amount: 0,
      due_date: parcela.due_date || hoje,
      status: 'pending',
      customer_id: parcela.customer_id || null,
      payment_method: parcela.payment_method || null,
      installment: total, total_installments: total,
      reference_type: 'sale', reference_id: parcela.reference_id || null,
    }).select(CAMPOS).single();
    if (erroNova) throw erroNova;
    saldo = nova;

    // A parcela que gerou o saldo passa a valer o que foi pago nela: sem
    // isso o pedido somaria 1.500 (1.000 + 500) no contas a receber.
    await supabase.from('LANCAMENTOS').update({
      amount: pagoNaParcela, total_installments: total,
      status: 'paid', paid_date: hoje,
    }).eq('id', parcela.id).eq('tenant_id', tenantId);
  }

  return {
    ok: true,
    parcela: enriquecer(saldo
      ? { ...salva, amount: pagoNaParcela, status: 'paid' }
      : salva),
    saldo: saldo ? enriquecer(saldo) : null,
    aplicados,
    // O que sobrou depois de cobrir tudo do pedido. Nao vira lancamento
    // negativo: credito com o cliente se acerta na devolucao ou no
    // proximo pedido, e inventar uma linha aqui sujaria o contas a
    // receber com algo que ninguem cobra.
    sobra: restante > 0.005 ? restante : 0,
    // Ratificacao: nada de novo entrou, o financeiro assumiu o que ja
    // estava lancado. A tela diz isso em vez de anunciar um recebimento
    // que nao aconteceu agora.
    ratificado: soRatifica,
    valor_ratificado: soRatifica ? jaLancado : 0,
    confirmado_por: quem,
    confirmado_em: agora,
  };
}

/** O link temporario para ver o comprovante (o arquivo e privado). */
const linkDoComprovante = caminho => linkAssinado(caminho, 600);

/**
 * A CONFERENCIA — o que a pessoa decidiu sobre um comprovante.
 *
 * Separada do anexo de proposito: anexar e um ato do comercial ou do
 * cliente; conferir e do financeiro, e acontece depois, olhando.
 */
async function conferir(tenantId, parcelaId, { status, nota, req }) {
  if (!['conferido', 'divergente', 'recusado', 'pendente'].includes(status)) {
    return { erro: 'Situacao invalida' };
  }
  const { data, error } = await supabase.from('LANCAMENTOS').update({
    receipt_status: status,
    receipt_by: req?.user?.name || req?.user?.email || 'Usuario',
    receipt_at: new Date().toISOString(),
    ...(nota ? { notes: String(nota).slice(0, 500) } : {}),
  }).eq('tenant_id', tenantId).eq('id', parcelaId).select(CAMPOS).single();
  if (error) throw error;
  return { ok: true, parcela: enriquecer(data) };
}

/**
 * O PEDIDO ESTA PAGO? — a soma dos comprovantes cobre o total?
 *
 * E esta resposta que libera a etapa de Pagamento no fluxo. Ela mora
 * AQUI, e nao na rota, porque duas telas diferentes montam a ficha do
 * pedido — o painel do fluxo e a tela de detalhe do pedido — e cada
 * uma carrega a venda do seu jeito. Quando o calculo ficou dentro de
 * uma delas, a outra abriu com o requisito eternamente por cumprir:
 * comprovante anexado, quitado na tela, e "Confirmar o pagamento"
 * apagado do mesmo jeito.
 *
 * Erro de leitura devolve `false`: a etapa fica parada, que e melhor
 * do que dar por pago o que ninguem conseguiu conferir.
 */
async function estaQuitada(tenantId, venda) {
  try {
    const parcelas = await parcelasDaVenda(tenantId, venda);
    if (!parcelas.length) return false;
    const aberto = parcelas.reduce((soma, x) => soma + (Number(x.falta) || 0), 0);
    return aberto <= 0.005;
  } catch {
    return false;
  }
}

/**
 * O FINANCEIRO OLHOU E DISSE QUE ESTÁ CERTO?
 *
 * `estaQuitada` responde outra pergunta: se o VALOR está coberto. As
 * duas foram a mesma coisa por um tempo, e não são — quem anexa o
 * comprovante é o comercial ou o próprio cliente, e anexar é uma
 * AFIRMAÇÃO ("paguei"), não uma conferência. O print de uma
 * transferência agendada, o comprovante de outro pedido e o valor
 * digitado errado passam todos por anexo; nenhum deles passa por
 * alguém do financeiro abrindo o extrato.
 *
 * Enquanto a etapa de Pagamento se contentava com o anexo, a fábrica
 * começava a produzir em cima de uma afirmação. Agora ela espera a
 * conferência — que é o ato que o `conferir()` acima já registrava
 * (com quem conferiu e quando) e que ninguém estava obrigado a fazer.
 *
 * Parcela de valor zero não conta: ela não tem o que conferir.
 */
async function estaConferida(tenantId, venda) {
  try {
    const parcelas = await parcelasDaVenda(tenantId, venda);
    const comValor = parcelas.filter(p => (Number(p.amount) || 0) > 0.005);
    if (!comValor.length) return false;
    const aberto = comValor.reduce((soma, x) => soma + (Number(x.falta) || 0), 0);
    if (aberto > 0.005) return false;
    return comValor.every(p => p.receipt_status === 'conferido');
  } catch {
    return false;
  }
}

module.exports = {
  parcelasDaVenda, anexarComprovante, confirmarPagamento, lerComprovante, conferir,
  linkDoComprovante, enriquecer, estaQuitada, estaConferida,
};
