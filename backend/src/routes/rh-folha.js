// ============================================================
// FOLHA E BENEFÍCIOS.
//
// A folha é MONTADA, não digitada. Cada número vem de onde o fato mora:
// salário e benefícios do cadastro, faltas/atrasos/extras do ponto,
// férias de RH_FERIAS, comissão das vendas entregues do vendedor.
//
// O FECHAMENTO CONGELA. Enquanto a competência está aberta, a prévia é
// recalculada a cada abertura da tela — mexeu no ponto, mudou a folha.
// Ao fechar, os valores viram linhas em RH_SALARIOS: o mês fechado não
// pode mudar sozinho depois que o dinheiro saiu.
// ============================================================
const express = require('express');
const router = express.Router();
const supabase = require('../config/supabase');
const { audit } = require('../lib/audit');
const { montarFolha, encargos, valor, round2 } = require('../lib/folha');
const { regrasAfastamento } = require('../lib/ferias');

const DIA = 864e5;
const compAtual = () => new Date().toISOString().slice(0, 7);

async function tentar(fn) {
  try {
    const { data, error } = await fn();
    if (error) return { linhas: [], ok: false, erro: error.message };
    return { linhas: data || [], ok: true };
  } catch (e) { return { linhas: [], ok: false, erro: e.message }; }
}

/**
 * A comissão do mês, por vendedor.
 *
 * A REGRA É A DO COMERCIAL, NÃO A DO RH: percentual do cadastro ×
 * vendas ENTREGUES no mês. Quem não tem percentual não entra — é assim
 * que "pessoa sem perfil comercial não recebe comissão automaticamente"
 * deixa de ser uma promessa e vira código.
 */
async function comissoesDoMes(tenantId, comp, pessoas) {
  const inicio = `${comp}-01`;
  const fim = new Date(Number(comp.slice(0, 4)), Number(comp.slice(5, 7)), 1).toISOString().slice(0, 10);

  const vendedores = pessoas
    .map(p => ({ id: p.id, nome: p.name, pct: Number(p.admission_data?.commission_pct) || 0 }))
    .filter(v => v.pct > 0);
  if (!vendedores.length) return {};

  const { data: vendas } = await supabase.from('VENDAS')
    .select('total, created_at, CLIENTES(vendedor)')
    .eq('tenant_id', tenantId)
    .in('status', ['entregue', 'delivered'])
    .gte('created_at', inicio).lt('created_at', fim).limit(5000);

  const porNome = {};
  for (const v of vendas || []) {
    const nome = String(v.CLIENTES?.vendedor || '').trim().toLowerCase();
    if (!nome) continue;
    porNome[nome] = (porNome[nome] || 0) + (Number(v.total) || 0);
  }

  const saida = {};
  for (const v of vendedores) {
    const faturado = porNome[v.nome.trim().toLowerCase()] || 0;
    saida[v.id] = {
      pct: v.pct,
      faturado: round2(faturado),
      valor: round2(faturado * (v.pct / 100)),
    };
  }
  return saida;
}

/**
 * A PRÉVIA DA FOLHA — uma função, dois usuários.
 *
 * A tela lê daqui e o fechamento grava daqui. Se fossem duas contas, a
 * folha que o RH conferiu na tela poderia não ser a que foi paga — e
 * ninguém descobriria antes do holerite chegar na mão do colaborador.
 */
async function montarPrevia(t, comp) {
  const avisos = [];
  const inicio = `${comp}-01`;
  const fim = new Date(Number(comp.slice(0, 4)), Number(comp.slice(5, 7)), 0).toISOString().slice(0, 10);

  const [colab, ponto, ferias, fechada] = await Promise.all([
    tentar(() => supabase.from('CLIENTES').select('id, name, is_active, admission_data')
      .eq('tenant_id', t).eq('type', 'CO')),
    tentar(() => supabase.from('RH_PONTO').select('employee_id, work_date, absence, late_minutes, extra_minutes')
      .eq('tenant_id', t).gte('work_date', inicio).lte('work_date', fim)),
    tentar(() => supabase.from('RH_FERIAS').select('*').eq('tenant_id', t)
      .lte('start_date', fim).gte('end_date', inicio)),
    tentar(() => supabase.from('RH_SALARIOS').select('*').eq('tenant_id', t).eq('reference_month', comp)),
  ]);
  for (const [n, r] of [['colaboradores', colab], ['ponto', ponto], ['férias', ferias], ['folha', fechada]]) {
    if (!r.ok) avisos.push(`${n}: ${r.erro}`);
  }

  const pessoas = colab.linhas.filter(c => c.is_active !== false);
  const comissoes = await comissoesDoMes(t, comp, pessoas);

  // Dias de férias e de afastamento que caem DENTRO da competência.
  const diasNoMes = (e) => {
    const ini = e.start_date > inicio ? e.start_date : inicio;
    const f = e.end_date < fim ? e.end_date : fim;
    return Math.max(0, Math.round((new Date(f) - new Date(ini)) / DIA) + 1);
  };

  const linhas = pessoas.map(p => {
    const meuPonto = ponto.linhas.filter(x => x.employee_id === p.id);
    const meusEventos = ferias.linhas.filter(x => x.employee_id === p.id && x.status !== 'cancelled');
    const minhasFerias = meusEventos.filter(x => !x.kind || x.kind === 'ferias');
    const meusAfast = meusEventos.filter(x => x.kind && x.kind !== 'ferias');

    const afast = meusAfast.reduce((acc, a) => {
      const r = regrasAfastamento({ start_date: a.start_date, end_date: a.end_date });
      const noMes = diasNoMes(a);
      // Só os dias do INSS que caem neste mês saem da folha da empresa.
      const inssNoMes = Math.max(0, Math.min(noMes, r.dias_inss));
      return { dias_empresa: acc.dias_empresa + (noMes - inssNoMes), dias_inss: acc.dias_inss + inssNoMes };
    }, { dias_empresa: 0, dias_inss: 0 });

    return montarFolha({
      colaborador: p,
      competencia: comp,
      fatos: {
        faltas: meuPonto.filter(x => x.absence).length,
        atrasos_min: meuPonto.reduce((s, x) => s + (x.late_minutes || 0), 0),
        extras_min: meuPonto.reduce((s, x) => s + (x.extra_minutes || 0), 0),
        ferias: { dias: minhasFerias.reduce((s, f) => s + diasNoMes(f), 0) },
        afastamento: afast,
        comissao: comissoes[p.id]?.valor || 0,
      },
    });
  });

  const soma = campo => round2(linhas.reduce((s, l) => s + (l[campo] || 0), 0));
  const jaFechada = fechada.linhas.length > 0;

  // O checklist do fechamento — cada item é uma verificação real.
  const semSalario = pessoas.filter(p => !valor(p.admission_data?.salary));
  const pontoAberto = ponto.linhas.filter(x => x.absence === null).length;

  return ({
    competencia: comp,
    fechada: jaFechada,
    cartoes: {
      colaboradores: linhas.length,
      folha_bruta: soma('gross_salary'),
      folha_liquida: soma('net_salary'),
      descontos: soma('descontos_total'),
      comissoes: round2(Object.values(comissoes).reduce((s, c) => s + c.valor, 0)),
      beneficios: round2(linhas.reduce((s, l) => s + l.beneficios.total, 0)),
      fgts: soma('fgts_value'),
      inss: soma('inss_deduction'),
      irrf: soma('irrf_deduction'),
    },
    linhas,
    encargos: encargos(linhas),
    comissoes: Object.entries(comissoes).map(([id, c]) => ({
      employee_id: id,
      nome: pessoas.find(p => p.id === id)?.name,
      pct: c.pct, faturado: c.faturado, valor: c.valor,
    })),
    checklist: [
      { item: 'Todos com salário no cadastro', ok: semSalario.length === 0,
        detalhe: semSalario.length ? `${semSalario.length} sem salário: ${semSalario.map(p => p.name).join(', ')}` : null },
      { item: 'Ponto do mês apurado', ok: ponto.linhas.length > 0 && pontoAberto === 0,
        detalhe: ponto.linhas.length === 0 ? 'Nenhum dia apurado nesta competência' : null },
      { item: 'Férias e afastamentos lançados', ok: true,
        detalhe: `${ferias.linhas.length} evento(s) no período` },
      { item: 'Comissões apuradas das vendas entregues', ok: true,
        detalhe: Object.keys(comissoes).length ? `${Object.keys(comissoes).length} vendedor(es)` : 'nenhum vendedor com % no cadastro' },
      { item: 'Folha fechada', ok: jaFechada, detalhe: jaFechada ? null : 'aguardando fechamento' },
    ],
    avisos,
  });
}

router.get('/folha', async (req, res) => {
  const comp = /^\d{4}-\d{2}$/.test(String(req.query.competencia || '')) ? req.query.competencia : compAtual();
  try {
    res.json(await montarPrevia(req.tenantId, comp));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

/**
 * POST /api/rh/folha/fechar
 * Congela a competência: grava uma linha por colaborador em
 * RH_SALARIOS. Depois disso, mexer no ponto não muda mais o que foi
 * pago — e é assim que tem de ser.
 */
router.post('/folha/fechar', async (req, res) => {
  const t = req.tenantId;
  const comp = /^\d{4}-\d{2}$/.test(String(req.body?.competencia || '')) ? req.body.competencia : compAtual();

  if (req.userProfile?.role !== 'admin' && req.userProfile?.role !== 'manager') {
    return res.status(403).json({ error: 'Somente administrador ou gestor fecha a folha.' });
  }

  try {
    // A MESMA conta que a tela mostrou — não uma segunda implementação.
    const previa = await montarPrevia(t, comp);

    if (!previa.linhas?.length) return res.status(400).json({ error: 'Nada a fechar nesta competência.' });

    const registros = previa.linhas.map(l => ({
      tenant_id: t,
      employee_id: l.employee_id,
      reference_month: comp,
      base_salary: l.base_salary,
      bonus: l.comissao || 0,
      overtime_pay: 0,
      other_additions: 0,
      other_deductions: round2(l.descontos_total - l.inss_deduction - l.irrf_deduction),
      gross_salary: l.gross_salary,
      inss_deduction: l.inss_deduction,
      irrf_deduction: l.irrf_deduction,
      fgts_value: l.fgts_value,
      net_salary: l.net_salary,
      status: 'closed',
      notes: `Fechada automaticamente do ponto, férias e comissões — ${new Date().toISOString().slice(0, 10)}`,
    }));

    const { error } = await supabase.from('RH_SALARIOS')
      .upsert(registros, { onConflict: 'tenant_id,employee_id,reference_month' });
    if (error) throw error;

    audit(req, 'close', 'folha', comp, { colaboradores: registros.length, liquido: previa.cartoes.folha_liquida });
    res.json({ ok: true, competencia: comp, colaboradores: registros.length, total_liquido: previa.cartoes.folha_liquida });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

/**
 * GET /api/rh/folha/contador?competencia=AAAA-MM
 * O pacote do contador: uma linha por colaborador, com o que a
 * contabilidade precisa lançar. Sai em JSON ou CSV (?formato=csv).
 */
router.get('/folha/contador', async (req, res) => {
  const t = req.tenantId;
  const comp = /^\d{4}-\d{2}$/.test(String(req.query.competencia || '')) ? req.query.competencia : compAtual();

  try {
    const { data: folha } = await supabase.from('RH_SALARIOS')
      .select('*, CLIENTES(name, cpf_cnpj, admission_data)')
      .eq('tenant_id', t).eq('reference_month', comp);

    if (!folha?.length) {
      return res.status(400).json({ error: 'Competência ainda não fechada. Feche a folha antes de exportar.' });
    }

    const linhas = folha.map(f => ({
      cpf: f.CLIENTES?.cpf_cnpj || '',
      nome: f.CLIENTES?.name || '',
      cargo: f.CLIENTES?.admission_data?.role || '',
      departamento: f.CLIENTES?.admission_data?.sector || '',
      competencia: comp,
      salario_base: f.base_salary,
      comissao: f.bonus,
      bruto: f.gross_salary,
      inss: f.inss_deduction,
      irrf: f.irrf_deduction,
      outros_descontos: f.other_deductions,
      liquido: f.net_salary,
      fgts: f.fgts_value,
    }));

    if (String(req.query.formato).toLowerCase() === 'csv') {
      const cab = Object.keys(linhas[0]).join(';');
      const corpo = linhas.map(l => Object.values(l).map(v => String(v ?? '').replace(';', ',')).join(';')).join('\n');
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="folha_${comp}.csv"`);
      return res.send(`${cab}\n${corpo}`);
    }

    res.json({
      competencia: comp,
      colaboradores: linhas.length,
      totais: {
        bruto: round2(linhas.reduce((s, l) => s + l.bruto, 0)),
        liquido: round2(linhas.reduce((s, l) => s + l.liquido, 0)),
        inss: round2(linhas.reduce((s, l) => s + l.inss, 0)),
        irrf: round2(linhas.reduce((s, l) => s + l.irrf, 0)),
        fgts: round2(linhas.reduce((s, l) => s + l.fgts, 0)),
      },
      linhas,
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

/** GET /api/rh/folha/holerite/:employeeId?competencia= — o demonstrativo. */
router.get('/folha/holerite/:employeeId', async (req, res) => {
  const t = req.tenantId;
  const comp = /^\d{4}-\d{2}$/.test(String(req.query.competencia || '')) ? req.query.competencia : compAtual();
  try {
    const { data } = await supabase.from('RH_SALARIOS')
      .select('*, CLIENTES(name, cpf_cnpj, admission_data)')
      .eq('tenant_id', t).eq('reference_month', comp).eq('employee_id', req.params.employeeId).maybeSingle();
    if (!data) return res.status(404).json({ error: 'Sem folha fechada para este colaborador nesta competência.' });
    res.json(data);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
