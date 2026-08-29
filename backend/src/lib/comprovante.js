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

const centavos = v => Math.round((Number(v) || 0) * 100);
const doisDecimais = v => Math.round((Number(v) || 0) * 100) / 100;

const tabelaAusente = err =>
  /42P01|PGRST(002|205)|does not exist|schema cache|column/i.test(`${err?.code || ''} ${err?.message || ''}`);

/** Os campos da parcela que a tela precisa. */
const CAMPOS = `id, description, amount, paid_amount, due_date, paid_date, status,
                installment, total_installments, payment_method, document_number,
                receipt_url, receipt_read, receipt_status, receipt_at, receipt_by, boleto_url`;

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
    description: `Venda #${venda.number}`,
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
    description: `Venda #${venda.number}`,
    document_number: `Venda #${venda.number}`,
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
  const pago = valor != null && valor !== ''
    ? doisDecimais(valor)
    : (leitura.ok && leitura.valor != null ? leitura.valor : doisDecimais(parcela.amount));

  const esperado = doisDecimais(parcela.amount);
  const jaPago = doisDecimais(parcela.paid_amount);
  const totalPago = doisDecimais(jaPago + pago);
  const quitou = centavos(totalPago) >= centavos(esperado);

  // Divergente quando a MAQUINA leu um valor diferente do confirmado.
  // Nao trava: entra assim mesmo e a conciliacao de sexta olha.
  const divergente = leitura.ok && leitura.valor != null
    && centavos(leitura.valor) !== centavos(pago);

  const patch = {
    receipt_url: caminho,
    receipt_read: leitura.ok ? leitura : { erro: leitura.motivo },
    receipt_status: divergente ? 'divergente' : 'pendente',
    receipt_at: new Date().toISOString(),
    receipt_by: req?.user?.name || req?.user?.email || 'Usuario',
    paid_amount: totalPago,
    status: quitou ? 'paid' : 'partial',
    paid_date: quitou ? (leitura.data || new Date().toISOString().split('T')[0]) : parcela.paid_date,
  };

  const { data: salva, error } = await supabase.from('LANCAMENTOS')
    .update(patch).eq('id', parcela.id).eq('tenant_id', tenantId).select(CAMPOS).single();
  if (error) throw error;

  // PAGOU MENOS QUE A PARCELA? Abre a linha do saldo.
  //
  // E aqui que a entrada de 50% vira duas parcelas sem ninguem cadastrar
  // nada: quem pagou 500 de 1000 ja sai desta chamada com a segunda
  // linha esperando o comprovante do resto.
  let saldo = null;
  const falta = doisDecimais(esperado - totalPago);
  if (falta > 0.005) {
    const total = (parcela.total_installments || 1) + 1;
    const { data: nova, error: erroNova } = await supabase.from('LANCAMENTOS').insert({
      tenant_id: tenantId,
      user_id: req?.user?.id || null,
      description: `${parcela.description || `Venda #${venda.number}`} — saldo`,
      document_number: parcela.document_number || `Venda #${venda.number}`,
      type: 'receivable',
      amount: falta,
      paid_amount: 0,
      due_date: parcela.due_date || new Date().toISOString().split('T')[0],
      status: 'pending',
      customer_id: venda.customer_id || null,
      payment_method: venda.payment_method || null,
      installment: total, total_installments: total,
      reference_type: 'sale', reference_id: venda.id,
    }).select(CAMPOS).single();
    if (erroNova) throw erroNova;
    saldo = nova;

    // A parcela que gerou o saldo passa a valer o que foi pago nela: sem
    // isso o pedido somaria 1.500 (1.000 + 500) no contas a receber.
    //
    // E, valendo o que foi pago, ela esta QUITADA — nao 'partial'. O
    // 'partial' de um minuto atras era verdade sobre a divida antiga, de
    // 1.000; depois da divisao essa divida nao existe mais. Deixa-lo
    // ficaria com uma parcela eternamente "paga pela metade" que nunca
    // mais recebe nada, porque o resto virou outra linha.
    await supabase.from('LANCAMENTOS')
      .update({
        amount: totalPago, total_installments: total,
        status: 'paid',
        paid_date: patch.paid_date || new Date().toISOString().split('T')[0],
      })
      .eq('id', parcela.id).eq('tenant_id', tenantId);
  }

  return {
    ok: true,
    parcela: enriquecer(saldo
      ? { ...salva, amount: totalPago, status: 'paid', total_installments: salva.total_installments + 1 }
      : salva),
    saldo: saldo ? enriquecer(saldo) : null,
    leitura,
    divergente,
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

module.exports = {
  parcelasDaVenda, anexarComprovante, lerComprovante, conferir,
  linkDoComprovante, enriquecer,
};
