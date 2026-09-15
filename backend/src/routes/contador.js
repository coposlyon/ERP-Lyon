// ════════════════════════════════════════════════════════════
// CONTADOR — o que sai do ERP para a contabilidade.
//
//   /exportacao   tudo de um período, em abas (lançamentos, notas,
//                 vendas, compras, folha, resumo) — o front vira Excel
//   /malote       as despesas de um mês reunidas e agrupadas: o
//                 "malote de pagamentos" que vai para o contador
//   /malote/enviar registra o envio (foto do momento, quem, para quem)
//   /margem       a margem consolidada mês a mês, do ano inteiro
//
// Nada aqui é digitado: são leituras dos módulos de origem (Vendas,
// Compras, Financeiro, Fiscal, RH, Formação de Preço). O contador da
// Lyon não passou um leiaute próprio; a exportação é a genérica — cada
// aba é uma planilha com uma linha por registro e cabeçalho em
// português. Quando vier um leiaute (Domínio, Alterdata…), é só mapear
// colunas em cima destas.
// ════════════════════════════════════════════════════════════
const express = require('express');
const router = express.Router();
const supabase = require('../config/supabase');
const { audit } = require('../lib/audit');
const { getConfig, productCostMap, fixedOverview } = require('../lib/rateioLib');

const r2 = v => Math.round((Number(v) || 0) * 100) / 100;
const isMonth = s => /^\d{4}-\d{2}$/.test(s || '');
const isDate = s => /^\d{4}-\d{2}-\d{2}$/.test(s || '');
const hoje = () => new Date().toISOString().slice(0, 10);

function mesRange(mes) {
  const [y, m] = mes.split('-').map(Number);
  return { start: `${mes}-01`, end: new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 10) };
}

/** Período da query: `de`/`ate` (datas) ou `mes` (YYYY-MM). `ate` é inclusivo. */
function periodo(q) {
  if (isDate(q.de) && isDate(q.ate)) {
    const fim = new Date(q.ate + 'T00:00:00Z'); fim.setUTCDate(fim.getUTCDate() + 1);
    return { de: q.de, ate: q.ate, start: q.de, end: fim.toISOString().slice(0, 10) };
  }
  const mes = isMonth(q.mes) ? q.mes : hoje().slice(0, 7);
  const { start, end } = mesRange(mes);
  const fim = new Date(end + 'T00:00:00Z'); fim.setUTCDate(fim.getUTCDate() - 1);
  return { de: start, ate: fim.toISOString().slice(0, 10), start, end, mes };
}

/** Mapa id → linha, de uma tabela, só para os ids pedidos. Sem FK, sem join. */
async function mapaPorId(tabela, ids, campos) {
  const lista = [...new Set((ids || []).filter(Boolean))];
  if (!lista.length) return new Map();
  const out = new Map();
  for (let i = 0; i < lista.length; i += 500) {
    const { data } = await supabase.from(tabela).select(campos).in('id', lista.slice(i, i + 500));
    for (const r of data || []) out.set(r.id, r);
  }
  return out;
}

async function empresaPadrao(tenantId) {
  const { data } = await supabase.from('CONTABIL_EMPRESAS')
    .select('razao_social, nome_fantasia, cnpj, regime, aliquota, annual_limit, is_default')
    .eq('tenant_id', tenantId).eq('is_active', true)
    .order('is_default', { ascending: false }).limit(1).maybeSingle();
  return data || null;
}

async function aliquotaPadrao(tenantId, empresa) {
  if (empresa && Number(empresa.aliquota) > 0) return Number(empresa.aliquota);
  const cfg = await getConfig(tenantId).catch(() => ({}));
  return Number(cfg.tax_pct) || 0;
}

const STATUS_LANC = { pending: 'Pendente', paid: 'Pago', partial: 'Parcial', cancelled: 'Cancelado', overdue: 'Vencido' };
const ORIGEM = {
  sale: 'Venda', purchase: 'Compra', fixed_expense: 'Despesa fixa', payroll: 'Folha',
  store: 'Loja on-line', manual: 'Manual', pdv: 'PDV',
};
const statusDaConta = l => {
  if (l.status === 'paid') return 'Pago';
  if (l.status === 'cancelled') return 'Cancelado';
  if (l.due_date && l.due_date < hoje()) return 'Vencido';
  return STATUS_LANC[l.status] || l.status || '';
};

/**
 * Lê os lançamentos de um intervalo com tudo que o contador pergunta:
 * quem, de onde veio, que conta contábil, que centro de custo, que
 * documento, quando venceu, quando pagou, por qual banco, comprovante.
 */
async function lancamentosDoPeriodo(tenantId, start, end, filtro = {}) {
  let q = supabase.from('LANCAMENTOS').select('*')
    .eq('tenant_id', tenantId).neq('status', 'cancelled')
    .order('due_date').limit(20000);
  if (filtro.type) q = q.eq('type', filtro.type);
  if (filtro.criterio === 'competencia') {
    // Competência do mês OU (sem competência e vencimento no mês)
    q = q.or(`competence_month.eq.${start},and(competence_month.is.null,due_date.gte.${start},due_date.lt.${end})`);
  } else {
    q = q.gte('due_date', start).lt('due_date', end);
  }
  const { data, error } = await q;
  if (error) throw error;
  const lanc = data || [];

  const [clientes, fornecedores, contas, centros, plano, vendas, compras, fixas] = await Promise.all([
    mapaPorId('CLIENTES', lanc.map(l => l.customer_id), 'id, name, cpf_cnpj'),
    mapaPorId('FORNECEDORES', lanc.map(l => l.supplier_id), 'id, name, cnpj'),
    mapaPorId('CONTAS_FINANCEIRAS', lanc.map(l => l.account_id), 'id, name, bank_name'),
    mapaPorId('CENTROS_CUSTO', lanc.map(l => l.cost_center_id), 'id, code, name'),
    mapaPorId('PLANO_CONTAS', lanc.map(l => l.chart_account_id), 'id, code, name, type'),
    mapaPorId('VENDAS', lanc.filter(l => l.reference_type === 'sale').map(l => l.reference_id), 'id, number'),
    mapaPorId('COMPRAS', lanc.filter(l => l.reference_type === 'purchase').map(l => l.reference_id), 'id, number, invoice_number'),
    mapaPorId('DESPESAS_FIXAS', lanc.map(l => l.fixed_expense_id), 'id, name, category, cost_center'),
  ]);

  return lanc.map(l => {
    const cli = clientes.get(l.customer_id), forn = fornecedores.get(l.supplier_id);
    const conta = contas.get(l.account_id), cc = centros.get(l.cost_center_id);
    const pc = plano.get(l.chart_account_id), fx = fixas.get(l.fixed_expense_id);
    let origem = ORIGEM[l.reference_type] || (l.reference_type || 'Manual');
    if (l.reference_type === 'sale' && vendas.get(l.reference_id)) origem = `Venda PV-${String(vendas.get(l.reference_id).number).padStart(4, '0')}`;
    if (l.reference_type === 'purchase' && compras.get(l.reference_id)) origem = `Compra nº ${compras.get(l.reference_id).number}`;
    if (l.reference_type === 'fixed_expense' && fx) origem = `Despesa fixa: ${fx.name}`;
    const parceiro = cli?.name || forn?.name || '';
    const categoria = pc ? `${pc.code} ${pc.name}` : (fx?.category || '');
    return {
      id: l.id,
      tipo: l.type === 'receivable' ? 'Receber' : 'Pagar',
      descricao: l.description || '',
      origem,
      documento: l.document_number || compras.get(l.reference_id)?.invoice_number || '',
      parceiro,
      cpf_cnpj: cli?.cpf_cnpj || forn?.cnpj || '',
      categoria,
      grupo: categoria || fx?.category || ORIGEM[l.reference_type] || 'Outros',
      centro_custo: cc ? `${cc.code ? cc.code + ' ' : ''}${cc.name}` : (fx?.cost_center || ''),
      competencia: l.competence_month ? String(l.competence_month).slice(0, 7) : (l.due_date ? String(l.due_date).slice(0, 7) : ''),
      vencimento: l.due_date || '',
      valor: r2(l.amount),
      status: statusDaConta(l),
      pago_em: l.paid_date || (l.paid_at ? String(l.paid_at).slice(0, 10) : ''),
      valor_pago: r2(l.paid_amount),
      forma_pagamento: l.payment_method || '',
      conta: conta ? `${conta.name}${conta.bank_name ? ' (' + conta.bank_name + ')' : ''}` : '',
      parcela: l.installment_number && l.installment_total ? `${l.installment_number}/${l.installment_total}` : '',
      comprovante: l.receipt_url || '',
      boleto: l.boleto_url || '',
      observacao: l.notes || '',
    };
  });
}

// ════════════ EXPORTAÇÃO PARA O CONTADOR ══════════════════
router.get('/exportacao', async (req, res) => {
  const p = periodo(req.query);
  const t = req.tenantId;
  try {
    const empresa = await empresaPadrao(t);
    const aliquota = await aliquotaPadrao(t, empresa);

    const [lancamentos, nfRes, vRes, cRes, folhaRes, empresasMap] = await Promise.all([
      lancamentosDoPeriodo(t, p.start, p.end),
      supabase.from('NOTAS_FISCAIS').select('*').eq('tenant_id', t)
        .gte('created_at', p.start).lt('created_at', p.end).order('created_at').limit(5000),
      supabase.from('VENDAS')
        .select('id, number, created_at, total, freight, discount, status, payment_method, source, billing_company_id, customer_id, CLIENTES(name, cpf_cnpj)')
        .eq('tenant_id', t).gte('created_at', p.start).lt('created_at', p.end).order('number').limit(20000),
      supabase.from('COMPRAS')
        .select('id, number, created_at, total, freight, status, invoice_number, invoice_key, FORNECEDORES(name, cnpj)')
        .eq('tenant_id', t).gte('created_at', p.start).lt('created_at', p.end).order('number').limit(5000),
      supabase.from('RH_SALARIOS').select('*').eq('tenant_id', t)
        .gte('reference_month', p.start).lt('reference_month', p.end).limit(2000)
        .then(r => r, () => ({ data: [] })),
      supabase.from('CONTABIL_EMPRESAS').select('id, razao_social').eq('tenant_id', t)
        .then(r => new Map((r.data || []).map(e => [e.id, e.razao_social]))),
    ]);

    const nfs = nfRes.data || [];
    const vendasIds = nfs.map(n => n.sale_id);
    const vendasNF = await mapaPorId('VENDAS', vendasIds, 'id, number');
    const notas_fiscais = nfs.map(n => ({
      numero: n.numero || n.number || '',
      serie: n.serie || n.series || '',
      tipo: n.tipo || n.type || '',
      ambiente: n.ambiente || '',
      status: n.status || '',
      chave: n.chave || n.key || '',
      emitida_em: (n.authorized_at || n.issued_at || n.created_at || '').slice(0, 10),
      destinatario: n.destinatario || '',
      pedido: vendasNF.get(n.sale_id) ? `PV-${String(vendasNF.get(n.sale_id).number).padStart(4, '0')}` : '',
      total: r2(n.total),
      protocolo: n.protocol || '',
      danfe: n.danfe_url || n.pdf_url || '',
      xml: n.xml_url || '',
      cancelada_em: n.cancelled_at ? String(n.cancelled_at).slice(0, 10) : '',
      motivo: n.motivo || n.cancel_reason || '',
    }));

    const vendas = (vRes.data || []).map(v => ({
      pedido: `PV-${String(v.number).padStart(4, '0')}`,
      data: String(v.created_at).slice(0, 10),
      cliente: v.CLIENTES?.name || '',
      cpf_cnpj: v.CLIENTES?.cpf_cnpj || '',
      total: r2(v.total),
      frete: r2(v.freight),
      desconto: r2(v.discount),
      status: v.status || '',
      forma_pagamento: v.payment_method || '',
      canal: v.source || '',
      empresa_faturadora: empresasMap.get(v.billing_company_id) || (empresa?.razao_social || ''),
    }));

    const compras = (cRes.data || []).map(c => ({
      compra: c.number,
      data: String(c.created_at).slice(0, 10),
      fornecedor: c.FORNECEDORES?.name || '',
      cnpj: c.FORNECEDORES?.cnpj || '',
      total: r2(c.total),
      frete: r2(c.freight),
      status: c.status || '',
      nota_fiscal: c.invoice_number || '',
      chave: c.invoice_key || '',
    }));

    const folhaRows = folhaRes.data || [];
    const pessoas = await mapaPorId('CLIENTES', folhaRows.map(f => f.employee_id), 'id, name, cpf_cnpj');
    const folha = folhaRows.map(f => ({
      colaborador: pessoas.get(f.employee_id)?.name || '',
      cpf: pessoas.get(f.employee_id)?.cpf_cnpj || '',
      competencia: String(f.reference_month || '').slice(0, 7),
      tipo: f.kind || 'salario',
      salario_base: r2(f.base_salary),
      adicionais: r2((Number(f.bonus) || 0) + (Number(f.overtime_pay) || 0) + (Number(f.other_additions) || 0)),
      bruto: r2(f.gross_salary),
      inss: r2(f.inss_deduction),
      irrf: r2(f.irrf_deduction),
      outros_descontos: r2(f.other_deductions),
      fgts: r2(f.fgts_value),
      liquido: r2(f.net_salary),
      status: f.status || '',
      pago_em: f.payment_date || '',
    }));

    // Resumo — o fechamento do período em uma página
    const soma = (arr, f) => r2(arr.reduce((s, x) => s + (f(x) || 0), 0));
    const receber = lancamentos.filter(l => l.tipo === 'Receber');
    const pagar = lancamentos.filter(l => l.tipo === 'Pagar');
    const vendasValidas = vendas.filter(v => v.status !== 'cancelled');
    const faturamento = soma(vendasValidas, v => v.total);
    const porGrupo = new Map();
    for (const l of pagar) porGrupo.set(l.grupo, r2((porGrupo.get(l.grupo) || 0) + l.valor));
    const resumo = [
      { linha: 'Faturamento (pedidos não cancelados)', valor: faturamento },
      { linha: 'Pedidos no período', valor: vendasValidas.length },
      { linha: 'Notas fiscais autorizadas', valor: notas_fiscais.filter(n => n.status === 'authorized').length },
      { linha: 'Total em notas autorizadas', valor: soma(notas_fiscais.filter(n => n.status === 'authorized'), n => n.total) },
      { linha: 'Contas a receber (lançado)', valor: soma(receber, l => l.valor) },
      { linha: 'Contas a receber (recebido)', valor: soma(receber, l => l.valor_pago) },
      { linha: 'Contas a pagar (lançado)', valor: soma(pagar, l => l.valor) },
      { linha: 'Contas a pagar (pago)', valor: soma(pagar, l => l.valor_pago) },
      ...[...porGrupo.entries()].sort((a, b) => b[1] - a[1]).map(([g, v]) => ({ linha: `  despesas — ${g}`, valor: v })),
      { linha: 'Compras de mercadoria', valor: soma(compras.filter(c => c.status !== 'cancelled'), c => c.total) },
      { linha: 'Folha (bruto)', valor: soma(folha, f => f.bruto) },
      { linha: 'Folha (líquido)', valor: soma(folha, f => f.liquido) },
      { linha: `Impostos projetados (${String(aliquota).replace('.', ',')}% sobre o faturamento)`, valor: r2(faturamento * aliquota / 100) },
    ];

    res.json({
      periodo: { de: p.de, ate: p.ate, mes: p.mes || null },
      gerado_em: new Date().toISOString(),
      empresa: empresa ? { razao_social: empresa.razao_social, cnpj: empresa.cnpj, regime: empresa.regime, aliquota } : null,
      abas: { resumo, lancamentos, notas_fiscais, vendas, compras, folha },
      contagem: {
        lancamentos: lancamentos.length, notas_fiscais: notas_fiscais.length,
        vendas: vendas.length, compras: compras.length, folha: folha.length,
      },
    });
  } catch (err) {
    console.error('[contador/exportacao]', err.message);
    res.status(500).json({ error: 'Erro ao montar a exportação' });
  }
});

// ════════════ MALOTE DE PAGAMENTOS ════════════════════════
/**
 * As despesas de um mês, reunidas. Entram:
 *   - contas a pagar do mês (competência, ou vencimento quando não há
 *     competência) — compras, despesas fixas, folha, manuais
 *   - despesas fixas ativas que AINDA NÃO viraram conta no mês (previstas)
 *   - a projeção do imposto (DAS) sobre o faturamento do mês
 * Tudo agrupado por conta contábil / categoria, com status, comprovante
 * e o total do que já foi pago e do que falta.
 */
async function montarMalote(tenantId, mes) {
  const { start, end } = mesRange(mes);
  const empresa = await empresaPadrao(tenantId);
  const aliquota = await aliquotaPadrao(tenantId, empresa);

  const [contas, fixasRes, vendasRes] = await Promise.all([
    lancamentosDoPeriodo(tenantId, start, end, { type: 'payable', criterio: 'competencia' }),
    supabase.from('DESPESAS_FIXAS').select('id, name, amount, due_day, category, cost_center, supplier_id, periodicity, start_month, end_month')
      .eq('tenant_id', tenantId).eq('is_active', true).limit(2000).then(r => r, () => ({ data: [] })),
    supabase.from('VENDAS').select('total').eq('tenant_id', tenantId).neq('status', 'cancelled')
      .gte('created_at', start).lt('created_at', end).limit(20000),
  ]);

  // Fixas previstas e ainda sem lançamento no mês
  const { data: geradas } = await supabase.from('LANCAMENTOS').select('fixed_expense_id')
    .eq('tenant_id', tenantId).eq('competence_month', start).not('fixed_expense_id', 'is', null)
    .then(r => r, () => ({ data: [] }));
  const jaGeradas = new Set((geradas || []).map(g => g.fixed_expense_id));
  const fornecedores = await mapaPorId('FORNECEDORES', (fixasRes.data || []).map(f => f.supplier_id), 'id, name');
  const previstas = (fixasRes.data || [])
    .filter(f => !jaGeradas.has(f.id))
    .filter(f => (!f.start_month || String(f.start_month).slice(0, 7) <= mes) && (!f.end_month || String(f.end_month).slice(0, 7) >= mes))
    .filter(f => !f.periodicity || f.periodicity === 'monthly' || f.periodicity === 'mensal')
    .map(f => ({
      id: `prev-${f.id}`,
      tipo: 'Pagar', descricao: f.name, origem: 'Despesa fixa (prevista — ainda não lançada)',
      documento: '', parceiro: fornecedores.get(f.supplier_id)?.name || '', cpf_cnpj: '',
      categoria: f.category || '', grupo: f.category || 'Despesas fixas', centro_custo: f.cost_center || '',
      competencia: mes, vencimento: `${mes}-${String(f.due_day || 1).padStart(2, '0')}`,
      valor: r2(f.amount), status: 'Previsto', pago_em: '', valor_pago: 0, forma_pagamento: '', conta: '',
      parcela: '', comprovante: '', boleto: '', observacao: '', previsto: true,
    }));

  const faturamento = r2((vendasRes.data || []).reduce((s, v) => s + (Number(v.total) || 0), 0));
  const temImpostoLancado = contas.some(l => /impost|das\b|simples/i.test(`${l.categoria} ${l.descricao}`));
  const imposto = {
    id: 'das-projecao',
    tipo: 'Pagar',
    descricao: `${empresa?.regime === 'simples' ? 'DAS — Simples Nacional' : 'Impostos'} (projeção ${String(aliquota).replace('.', ',')}% sobre ${faturamento.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })})`,
    origem: 'Fiscal (projeção)', documento: '', parceiro: 'Receita Federal', cpf_cnpj: '',
    categoria: '2.8 Impostos e Taxas', grupo: 'Impostos', centro_custo: '',
    competencia: mes, vencimento: proximoDia20(mes), valor: r2(faturamento * aliquota / 100),
    status: temImpostoLancado ? 'Lançado (ver acima)' : 'Projetado', pago_em: '', valor_pago: 0,
    forma_pagamento: '', conta: '', parcela: '', comprovante: '', boleto: '', observacao: '', projetado: true,
  };

  const itens = [...contas, ...previstas, ...(imposto.valor > 0 && !temImpostoLancado ? [imposto] : [])];

  // Agrupamento
  const grupos = new Map();
  for (const it of itens) {
    const g = grupos.get(it.grupo) || { grupo: it.grupo, itens: [], total: 0, pago: 0, pendente: 0, previsto: 0 };
    g.itens.push(it);
    if (it.previsto || it.projetado) g.previsto = r2(g.previsto + it.valor);
    else { g.total = r2(g.total + it.valor); g.pago = r2(g.pago + it.valor_pago); g.pendente = r2(g.pendente + Math.max(0, it.valor - it.valor_pago)); }
    grupos.set(it.grupo, g);
  }
  const porGrupo = [...grupos.values()].sort((a, b) => (b.total + b.previsto) - (a.total + a.previsto));

  const reais = itens.filter(i => !i.previsto && !i.projetado);
  const soma = f => r2(reais.reduce((s, i) => s + (f(i) || 0), 0));
  const resumo = {
    mes, faturamento, aliquota,
    lancado: soma(i => i.valor),
    pago: soma(i => i.valor_pago),
    pendente: soma(i => Math.max(0, i.valor - i.valor_pago)),
    vencido: soma(i => (i.status === 'Vencido' ? Math.max(0, i.valor - i.valor_pago) : 0)),
    previsto: r2(itens.filter(i => i.previsto).reduce((s, i) => s + i.valor, 0)),
    imposto_projetado: temImpostoLancado ? 0 : imposto.valor,
    total_do_mes: r2(soma(i => i.valor) + itens.filter(i => i.previsto || i.projetado).reduce((s, i) => s + i.valor, 0)),
    contas: reais.length,
    com_comprovante: reais.filter(i => i.comprovante).length,
    sem_comprovante: reais.filter(i => i.status === 'Pago' && !i.comprovante).length,
  };

  return { empresa, resumo, por_grupo: porGrupo, itens };
}

function proximoDia20(mes) {
  const [y, m] = mes.split('-').map(Number);
  return new Date(Date.UTC(y, m, 20)).toISOString().slice(0, 10); // DAS vence dia 20 do mês seguinte
}

router.get('/malote', async (req, res) => {
  const mes = isMonth(req.query.mes) ? req.query.mes : hoje().slice(0, 7);
  try {
    const malote = await montarMalote(req.tenantId, mes);
    const { data: envios } = await supabase.from('MALOTES_CONTADOR')
      .select('id, enviado_em, enviado_por, destinatario, observacao, resumo')
      .eq('tenant_id', req.tenantId).eq('competencia', `${mes}-01`)
      .order('enviado_em', { ascending: false }).limit(20)
      .then(r => r, () => ({ data: [] }));
    res.json({ ...malote, envios: envios || [], gerado_em: new Date().toISOString() });
  } catch (err) {
    console.error('[contador/malote]', err.message);
    res.status(500).json({ error: 'Erro ao montar o malote' });
  }
});

router.post('/malote/enviar', async (req, res) => {
  const mes = isMonth(req.body?.mes) ? req.body.mes : null;
  if (!mes) return res.status(400).json({ error: 'Informe o mês (YYYY-MM)' });
  try {
    const malote = await montarMalote(req.tenantId, mes);
    const registro = {
      tenant_id: req.tenantId,
      competencia: `${mes}-01`,
      enviado_por: req.userProfile?.name || req.user?.email || null,
      user_id: req.user?.id || null,
      destinatario: String(req.body.destinatario || '').trim() || null,
      observacao: String(req.body.observacao || '').trim() || null,
      resumo: malote.resumo,
      itens: malote.itens,
    };
    const { data, error } = await supabase.from('MALOTES_CONTADOR').insert(registro).select().single();
    if (error) throw error;
    audit(req, 'create', 'malote_contador', data.id, { mes, destinatario: registro.destinatario, total: malote.resumo.total_do_mes, contas: malote.resumo.contas });
    res.status(201).json({ ok: true, envio: data });
  } catch (err) {
    console.error('[contador/malote/enviar]', err.message);
    res.status(500).json({ error: /MALOTES_CONTADOR/.test(err.message) ? 'Rode a migração 122 (malote do contador).' : 'Erro ao registrar o envio' });
  }
});

router.get('/malote/historico', async (req, res) => {
  const ano = /^\d{4}$/.test(req.query.ano || '') ? req.query.ano : hoje().slice(0, 4);
  try {
    const { data, error } = await supabase.from('MALOTES_CONTADOR')
      .select('id, competencia, enviado_em, enviado_por, destinatario, observacao, resumo')
      .eq('tenant_id', req.tenantId).gte('competencia', `${ano}-01-01`).lt('competencia', `${Number(ano) + 1}-01-01`)
      .order('competencia', { ascending: false }).order('enviado_em', { ascending: false }).limit(200);
    if (error) throw error;
    res.json({ ano, envios: data || [] });
  } catch (err) {
    res.json({ ano, envios: [] });
  }
});

router.get('/malote/:id', async (req, res) => {
  try {
    const { data, error } = await supabase.from('MALOTES_CONTADOR').select('*')
      .eq('tenant_id', req.tenantId).eq('id', req.params.id).maybeSingle();
    if (error) throw error;
    if (!data) return res.status(404).json({ error: 'Envio não encontrado' });
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: 'Erro ao abrir o envio' });
  }
});

// ════════════ MARGEM CONSOLIDADA ══════════════════════════
/**
 * A margem de lucro do ano, mês a mês, e consolidada.
 *   receita   pedidos não cancelados (data do pedido)
 *   impostos  alíquota da empresa padrão sobre a receita
 *   custos    custo dos itens vendidos (ficha de precificação, ou custo
 *             do cadastro + overhead) — o CMV
 *   despesas  contas a pagar do mês que não são compra de mercadoria
 *             (a mercadoria já está no custo do item)
 *   lucro     receita − impostos − custos − despesas
 * A mesma conta da DRE — só que o ano inteiro de uma vez, por empresa
 * faturadora e por canal, para ver a tendência sem clicar mês a mês.
 */
router.get('/margem', async (req, res) => {
  const ano = /^\d{4}$/.test(req.query.ano || '') ? Number(req.query.ano) : new Date().getFullYear();
  const t = req.tenantId;
  try {
    const start = `${ano}-01-01`, end = `${ano + 1}-01-01`;
    const [empresa, ov, cfg, empresasRes, vendasRes, despRes] = await Promise.all([
      empresaPadrao(t),
      fixedOverview(t).catch(() => ({ overhead_unit: 0, tax_pct_default: 0 })),
      getConfig(t).catch(() => ({})),
      supabase.from('CONTABIL_EMPRESAS').select('id, razao_social, is_default').eq('tenant_id', t),
      supabase.from('VENDAS')
        .select('id, total, created_at, source, billing_company_id, VENDA_ITENS(product_id, quantity)')
        .eq('tenant_id', t).neq('status', 'cancelled').gte('created_at', start).lt('created_at', end).limit(20000),
      supabase.from('LANCAMENTOS').select('amount, reference_type, due_date, competence_month')
        .eq('tenant_id', t).eq('type', 'payable').neq('status', 'cancelled')
        .gte('due_date', start).lt('due_date', end).limit(20000),
    ]);
    const aliquota = await aliquotaPadrao(t, empresa);
    const metaMargem = Number(cfg.margin_pct) || 30;
    const custos = await productCostMap(t, ov.overhead_unit, ov.tax_pct_default);
    const vendas = vendasRes.data || [];
    const ids = [...new Set(vendas.flatMap(v => (v.VENDA_ITENS || []).map(i => i.product_id)).filter(Boolean))];
    const precos = await mapaPorId('PRODUTOS', ids, 'id, cost_price');

    const empresas = new Map((empresasRes.data || []).map(e => [e.id, e.razao_social]));
    const padrao = (empresasRes.data || []).find(e => e.is_default);

    const mesVazio = () => ({ receita: 0, impostos: 0, custos: 0, despesas: 0, pedidos: 0 });
    const meses = Array.from({ length: 12 }, (_, i) => ({ mes: `${ano}-${String(i + 1).padStart(2, '0')}`, ...mesVazio() }));
    const porEmpresa = new Map(), porCanal = new Map();
    const acum = (map, key, label, receita, custo) => {
      const g = map.get(key) || { key, label, receita: 0, custos: 0, pedidos: 0 };
      g.receita += receita; g.custos += custo; g.pedidos += 1; map.set(key, g);
    };

    for (const v of vendas) {
      const mi = Number(String(v.created_at).slice(5, 7)) - 1;
      const receita = Number(v.total) || 0;
      let custo = 0;
      for (const it of v.VENDA_ITENS || []) {
        custo += custos.get(it.product_id, precos.get(it.product_id)?.cost_price).cost_unit * (Number(it.quantity) || 0);
      }
      meses[mi].receita += receita; meses[mi].custos += custo; meses[mi].pedidos += 1;
      const empId = v.billing_company_id || padrao?.id || 'sem';
      acum(porEmpresa, empId, empresas.get(empId) || 'Sem empresa definida', receita, custo);
      acum(porCanal, v.source || 'erp', rotuloCanal(v.source), receita, custo);
    }
    for (const d of despRes.data || []) {
      if (d.reference_type === 'purchase') continue;
      const mi = Number(String(d.due_date).slice(5, 7)) - 1;
      meses[mi].despesas += Number(d.amount) || 0;
    }

    const mesAtual = hoje().slice(0, 7);
    const fechar = m => {
      m.impostos = m.receita * aliquota / 100;
      m.lucro = m.receita - m.impostos - m.custos - m.despesas;
      m.margem_pct = m.receita > 0 ? Math.round((m.lucro / m.receita) * 1000) / 10 : 0;
      m.margem_bruta_pct = m.receita > 0 ? Math.round(((m.receita - m.custos) / m.receita) * 1000) / 10 : 0;
      for (const k of ['receita', 'impostos', 'custos', 'despesas', 'lucro']) m[k] = r2(m[k]);
      return m;
    };
    const serie = meses.map(m => ({ ...fechar(m), futuro: m.mes > mesAtual, abaixo_meta: m.receita > 0 && m.margem_pct < metaMargem }));
    const total = fechar(serie.reduce((a, m) => ({
      receita: a.receita + m.receita, impostos: 0, custos: a.custos + m.custos, despesas: a.despesas + m.despesas, pedidos: a.pedidos + m.pedidos,
    }), mesVazio()));
    const comMovimento = serie.filter(m => m.receita > 0);
    const melhor = comMovimento.length ? comMovimento.reduce((a, b) => (b.margem_pct > a.margem_pct ? b : a)) : null;
    const pior = comMovimento.length ? comMovimento.reduce((a, b) => (b.margem_pct < a.margem_pct ? b : a)) : null;

    const dimensao = map => [...map.values()].map(g => {
      const impostos = g.receita * aliquota / 100;
      const lucroBruto = g.receita - g.custos - impostos;
      return {
        key: g.key, label: g.label, pedidos: g.pedidos, receita: r2(g.receita), custos: r2(g.custos), impostos: r2(impostos),
        lucro_bruto: r2(lucroBruto),
        margem_pct: g.receita > 0 ? Math.round((lucroBruto / g.receita) * 1000) / 10 : 0,
        participacao_pct: total.receita > 0 ? Math.round((g.receita / total.receita) * 1000) / 10 : 0,
      };
    }).sort((a, b) => b.receita - a.receita);

    res.json({
      ano, aliquota, meta_margem_pct: metaMargem,
      empresa: empresa ? { razao_social: empresa.razao_social, regime: empresa.regime } : null,
      meses: serie,
      total: { ...total, meses_com_movimento: comMovimento.length, media_mensal_lucro: r2(comMovimento.length ? total.lucro / comMovimento.length : 0) },
      melhor_mes: melhor ? { mes: melhor.mes, margem_pct: melhor.margem_pct, lucro: melhor.lucro } : null,
      pior_mes: pior ? { mes: pior.mes, margem_pct: pior.margem_pct, lucro: pior.lucro } : null,
      por_empresa: dimensao(porEmpresa),
      por_canal: dimensao(porCanal),
      // as despesas fixas não se dividem por empresa/canal — por isso
      // essas duas dimensões mostram margem BRUTA (após custo e imposto)
      origens: [
        { label: 'Receita', origem: 'Vendas — pedidos não cancelados, pela data do pedido' },
        { label: 'Custos (CMV)', origem: 'Formação de Preço — ficha do produto, ou custo do cadastro + rateio' },
        { label: 'Despesas', origem: 'Financeiro — contas a pagar do mês, exceto compra de mercadoria' },
        { label: 'Impostos', origem: `Contábil — alíquota ${String(aliquota).replace('.', ',')}% da empresa padrão` },
      ],
      gerado_em: new Date().toISOString(),
    });
  } catch (err) {
    console.error('[contador/margem]', err.message);
    res.status(500).json({ error: 'Erro ao calcular a margem consolidada' });
  }
});

function rotuloCanal(s) {
  return ({ store: 'Loja on-line', loja: 'Loja on-line', catalogo: 'Catálogo', pdv: 'PDV', vendedor: 'Área do vendedor', manual: 'ERP (pedido manual)', erp: 'ERP (balcão)' })[s] || (s || 'ERP (balcão)');
}

module.exports = router;
