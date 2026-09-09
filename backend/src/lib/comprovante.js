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

  /**
   * O NUMERO QUE ENTRA AQUI E O TOTAL RECEBIDO NESTA CONTA — e nao um
   * acrescimo ao que ja estava lancado.
   *
   * "Quanto entrou a mais" obriga quem confirma a fazer uma subtracao de
   * cabeca antes de digitar, olhando um comprovante que traz o valor
   * CHEIO. E a conta errada e sempre para o mesmo lado: lanca-se de novo
   * o que ja estava lancado, e a parcela fecha com o dobro.
   *
   * Aqui o campo e o valor do comprovante, tal como ele esta escrito. O
   * que passar do valor DESTA conta escorre para as parcelas seguintes
   * do mesmo pedido — que e o que acontece de verdade quando o cliente
   * paga 350 de uma parcela de 200.
   */
  const pago = doisDecimais(
    valor != null && valor !== '' ? valor
      : (parcela.receipt_amount != null ? parcela.receipt_amount
        : (jaLancado > 0 ? jaLancado : doisDecimais(parcela.amount))),
  );
  if (!(pago > 0)) return { erro: 'Informe o valor total recebido.' };

  // Confirmar sem mudar o valor: a linha ja tinha esse dinheiro lancado
  // e o que faltava era alguem assumi-lo. A tela diz isso de outro
  // jeito ("assina esse valor"), e o retorno precisa distinguir os dois.
  const soRatifica = centavos(pago) === centavos(jaLancado) && !parcela.paid_at;

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

  // 1) A parcela que recebeu o comprovante vem primeiro. Ela passa a
  //    VALER o que foi recebido (ate o valor dela) — nao soma, substitui:
  //    o campo e o total, e confirmar duas vezes tem de dar no mesmo.
  const pagoNaParcela = doisDecimais(Math.min(pago, doisDecimais(parcela.amount)));
  let restante = doisDecimais(pago - pagoNaParcela);
  const naParcela = doisDecimais(pagoNaParcela - jaLancado);
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
  aplicados.push({ id: parcela.id, parcela: parcela.installment, valor: pagoNaParcela, quitou });

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
    total_recebido: pago,
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
 * O QUE ESTE PEDIDO DEVE HOJE — e nao o que ele deve no total.
 *
 * A ETAPA DE PAGAMENTO TRAVAVA A VENDA A PRAZO INTEIRA. Ela perguntava
 * se TODAS as parcelas estavam quitadas: num pedido em 2x com
 * vencimentos em outubro e novembro, a fabrica so podia comecar depois
 * da ultima parcela cair — dois meses depois de o cliente comprar.
 *
 * A pergunta certa e outra: o cliente esta em dia com o que JA venceu?
 * Parcela com vencimento la na frente nao e pendencia, e o combinado.
 *
 * Parcela sem vencimento e a do pedido a vista: ela e devida agora.
 */
function devidasAgora(parcelas, hoje = new Date().toISOString().slice(0, 10)) {
  return parcelas.filter(p => {
    const venc = p.due_date ? String(p.due_date).slice(0, 10) : null;
    return !venc || venc <= hoje;
  });
}

/**
 * O dinheiro que ja deveria ter entrado, entrou?
 *
 * Sem nada vencido, a resposta e SIM — nao ha o que cobrar hoje. E o
 * caso da venda a prazo pura: o pedido anda, e o contas a receber
 * continua marcando as parcelas para os meses seguintes.
 */
async function estaQuitada(tenantId, venda) {
  try {
    const parcelas = await parcelasDaVenda(tenantId, venda);
    if (!parcelas.length) return false;
    const agora = devidasAgora(parcelas);
    if (!agora.length) return true;            // nada vencido: nada a cobrar hoje
    const aberto = agora.reduce((soma, x) => soma + (Number(x.falta) || 0), 0);
    return aberto <= 0.005;
  } catch {
    return false;
  }
}

/**
 * O FINANCEIRO OLHOU E DISSE QUE ESTA CERTO?
 *
 * `estaQuitada` responde outra pergunta: se o VALOR esta coberto. As
 * duas foram a mesma coisa por um tempo, e nao sao — quem anexa o
 * comprovante e o comercial ou o proprio cliente, e anexar e uma
 * AFIRMACAO ("paguei"), nao uma conferencia. O print de uma
 * transferencia agendada, o comprovante de outro pedido e o valor
 * digitado errado passam todos por anexo; nenhum deles passa por alguem
 * do financeiro abrindo o extrato.
 *
 * Vale so para o que e devido HOJE, pelo mesmo motivo da funcao acima:
 * ninguem confere o comprovante de uma parcela que vence mes que vem.
 *
 * Parcela de valor zero nao conta: ela nao tem o que conferir.
 */
async function estaConferida(tenantId, venda) {
  try {
    const parcelas = await parcelasDaVenda(tenantId, venda);
    const agora = devidasAgora(parcelas).filter(p => (Number(p.amount) || 0) > 0.005);
    if (!agora.length) return true;            // nada vencido: nada a conferir
    const aberto = agora.reduce((soma, x) => soma + (Number(x.falta) || 0), 0);
    if (aberto > 0.005) return false;
    return agora.every(p => p.receipt_status === 'conferido' && !!p.paid_at);
  } catch {
    return false;
  }
}

/** O resumo que a ficha de fluxo mostra: o que vence hoje, e o que vem depois. */
async function situacaoDoPagamento(tenantId, venda) {
  try {
    const parcelas = await parcelasDaVenda(tenantId, venda);
    const hoje = new Date().toISOString().slice(0, 10);
    const agora = devidasAgora(parcelas, hoje);
    const futuras = parcelas.filter(p => !agora.includes(p));
    const doisDec = v => Math.round((Number(v) || 0) * 100) / 100;
    return {
      vencido_aberto: doisDec(agora.reduce((s, x) => s + (Number(x.falta) || 0), 0)),
      a_vencer: doisDec(futuras.reduce((s, x) => s + (Number(x.falta) || 0), 0)),
      parcelas_a_vencer: futuras.length,
      proximo_vencimento: futuras.map(p => p.due_date).filter(Boolean).sort()[0] || null,
    };
  } catch {
    return { vencido_aberto: 0, a_vencer: 0, parcelas_a_vencer: 0, proximo_vencimento: null };
  }
}

module.exports = {
  parcelasDaVenda, anexarComprovante, confirmarPagamento, lerComprovante, conferir,
  linkDoComprovante, enriquecer, estaQuitada, estaConferida, situacaoDoPagamento,
};
