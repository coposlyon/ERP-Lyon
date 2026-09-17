// ════════════════════════════════════════════════════════════
// CONTÁBIL / FISCAL — centro de inteligência financeira do ERP.
// Consolida Vendas, Compras, Financeiro, Bancos, Estoque e Fiscal
// em tempo real: dashboard, multiempresa (CNPJs), monitoramento
// tributário, simulador de faturamento, DRE, conciliação e alertas.
// Regra de auditoria: nada é apagado — só cancelado/desativado.
// ════════════════════════════════════════════════════════════
const express = require('express');
const router = express.Router();
const supabase = require('../config/supabase');
const { audit } = require('../lib/audit');
const { uploadPrivado, linkAssinado } = require('../lib/storage');
const { getConfig, productCostMap, fixedOverview } = require('../lib/rateioLib');

const r2 = v => Math.round((Number(v) || 0) * 100) / 100;
const missing043 = err => /CONTABIL_EMPRESAS|billing_company_id|42P01|42703|schema cache/i.test(err?.message || '');
const err043 = res => res.status(400).json({
  error: 'Rode a migração 043_contabil.sql no Supabase (SQL Editor) para usar o módulo Contábil/Fiscal.',
});

const isMonth = s => /^\d{4}-\d{2}$/.test(s || '');
function monthRange(month) {
  const [y, m] = month.split('-').map(Number);
  const start = `${month}-01`;
  const end = new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 10);
  return { start, end };
}
const todayISO = () => new Date().toISOString().slice(0, 10);

// ── Empresas + faturamento do ano ─────────────────────────
async function companiesWithRevenue(tenantId, year) {
  const { data: companies, error } = await supabase.from('CONTABIL_EMPRESAS')
    .select('*').eq('tenant_id', tenantId).eq('is_active', true)
    .order('is_default', { ascending: false }).order('razao_social');
  if (error) throw error;

  const { data: sales } = await supabase.from('VENDAS')
    .select('total, billing_company_id, created_at')
    .eq('tenant_id', tenantId).neq('status', 'cancelled')
    .gte('created_at', `${year}-01-01`).lt('created_at', `${year + 1}-01-01`)
    .limit(20000);

  const byCompany = new Map();
  let unassigned = 0;
  for (const s of (sales || [])) {
    const v = Number(s.total) || 0;
    if (s.billing_company_id) byCompany.set(s.billing_company_id, (byCompany.get(s.billing_company_id) || 0) + v);
    else unassigned += v;
  }

  const now = new Date();
  const monthsElapsed = now.getFullYear() === year ? now.getMonth() + 1 : 12;
  return (companies || []).map(c => {
    // Vendas sem empresa definida contam para a empresa padrão
    const faturado = (byCompany.get(c.id) || 0) + (c.is_default ? unassigned : 0);
    const limit = Number(c.annual_limit) || 0;
    const pct = limit > 0 ? (faturado / limit) * 100 : 0;
    return {
      ...c,
      faturado: r2(faturado),
      restante: r2(Math.max(0, limit - faturado)),
      pct: Math.round(pct * 100) / 100,
      projecao: r2(monthsElapsed > 0 ? (faturado / monthsElapsed) * 12 : 0),
    };
  });
}

// Alíquota usada nas projeções: da empresa padrão (fallback: config do rateio)
async function defaultAliquota(tenantId, companies) {
  const def = (companies || []).find(c => c.is_default) || (companies || [])[0];
  if (def && Number(def.aliquota) > 0) return Number(def.aliquota);
  const cfg = await getConfig(tenantId);
  return Number(cfg.tax_pct) || 0;
}

// Custo dos itens vendidos num intervalo (ficha de precificação → cadastro)
async function periodCosts(tenantId, start, end) {
  const ov = await fixedOverview(tenantId);
  const costs = await productCostMap(tenantId, ov.overhead_unit, ov.tax_pct_default);
  const { data: sales } = await supabase.from('VENDAS')
    .select('id, total, created_at, VENDA_ITENS(product_id, quantity)')
    .eq('tenant_id', tenantId).neq('status', 'cancelled')
    .gte('created_at', start).lt('created_at', end)
    .limit(5000);
  const ids = [...new Set((sales || []).flatMap(s => (s.VENDA_ITENS || []).map(i => i.product_id)).filter(Boolean))];
  let priceMap = {};
  if (ids.length) {
    const { data } = await supabase.from('PRODUTOS').select('id, cost_price').eq('tenant_id', tenantId).in('id', ids);
    priceMap = Object.fromEntries((data || []).map(p => [p.id, p.cost_price]));
  }
  let custo = 0;
  const byMonth = new Map(); // custo por mês (p/ dividir períodos)
  for (const s of (sales || [])) {
    let c = 0;
    for (const it of (s.VENDA_ITENS || [])) {
      c += costs.get(it.product_id, priceMap[it.product_id]).cost_unit * (Number(it.quantity) || 0);
    }
    custo += c;
    const mk = String(s.created_at).slice(0, 7);
    byMonth.set(mk, (byMonth.get(mk) || 0) + c);
  }
  return { total: r2(custo), byMonth };
}

// Despesas do intervalo (contas a pagar que não são compra de mercadoria)
async function periodExpenses(tenantId, start, end) {
  const { data } = await supabase.from('LANCAMENTOS')
    .select('amount, reference_type, due_date')
    .eq('tenant_id', tenantId).eq('type', 'payable')
    .neq('status', 'cancelled')
    .gte('due_date', start).lt('due_date', end)
    .limit(10000);
  return r2((data || [])
    .filter(l => l.reference_type !== 'purchase')
    .reduce((s, l) => s + (Number(l.amount) || 0), 0));
}

// ════════════ EMPRESAS (multiempresa) ═════════════════════
router.get('/companies', async (req, res) => {
  try {
    const year = new Date().getFullYear();
    const companies = await companiesWithRevenue(req.tenantId, year);
    // Bancos vinculados
    let accounts = [];
    try {
      const { data } = await supabase.from('CONTAS_FINANCEIRAS')
        .select('id, name, bank_name, balance, company_id, is_active')
        .eq('tenant_id', req.tenantId).eq('is_active', true);
      accounts = data || [];
    } catch { /* colunas 043 pendentes */ }
    res.json(companies.map(c => ({ ...c, accounts: accounts.filter(a => a.company_id === c.id) })));
  } catch (err) {
    if (missing043(err)) return err043(res);
    console.error('[contabil/companies]', err.message);
    res.status(500).json({ error: 'Erro ao listar as empresas' });
  }
});

const COMPANY_FIELDS = ['razao_social', 'nome_fantasia', 'cnpj', 'inscricao_estadual', 'inscricao_municipal', 'regime', 'annual_limit', 'aliquota', 'cert_expiry', 'is_default', 'notes'];
function pickCompany(body) {
  const out = {};
  for (const k of COMPANY_FIELDS) if (body[k] !== undefined) out[k] = body[k];
  if (out.razao_social !== undefined) out.razao_social = String(out.razao_social || '').trim();
  if (out.annual_limit !== undefined) out.annual_limit = Math.max(0, Number(out.annual_limit) || 0);
  if (out.aliquota !== undefined) out.aliquota = Math.min(Math.max(Number(out.aliquota) || 0, 0), 95);
  if (out.cert_expiry === '') out.cert_expiry = null;
  for (const k of ['inscricao_estadual', 'inscricao_municipal']) {
    if (out[k] !== undefined) out[k] = String(out[k] || '').trim() || null;
  }
  if (out.regime !== undefined && !['mei', 'simples', 'presumido', 'real'].includes(out.regime)) out.regime = 'simples';
  return out;
}

/**
 * IE e IM chegaram na migração 126. Até ela rodar, o banco recusa as
 * duas colunas — e a empresa não pode deixar de salvar por isso: tenta
 * com elas e, se o banco não as conhece, salva o resto.
 */
async function semInscricoesSeFaltar(body, gravar) {
  const r = await gravar(body);
  if (!r.error || !/inscricao_(estadual|municipal)/i.test(r.error.message || '')) return r;
  const { inscricao_estadual, inscricao_municipal, ...resto } = body;
  return gravar(resto);
}

router.post('/companies', async (req, res) => {
  const body = pickCompany(req.body);
  if (!body.razao_social) return res.status(400).json({ error: 'Informe a razão social' });
  try {
    if (body.is_default) {
      await supabase.from('CONTABIL_EMPRESAS').update({ is_default: false }).eq('tenant_id', req.tenantId);
    }
    const { data, error } = await semInscricoesSeFaltar(body, b => supabase.from('CONTABIL_EMPRESAS')
      .insert({ ...b, tenant_id: req.tenantId }).select().single());
    if (error) throw error;
    audit(req, 'create', 'contabil_company', data.id, { razao_social: data.razao_social, cnpj: data.cnpj });
    res.status(201).json(data);
  } catch (err) {
    if (missing043(err)) return err043(res);
    console.error('[contabil/companies POST]', err.message);
    res.status(500).json({ error: 'Erro ao cadastrar a empresa' });
  }
});

router.put('/companies/:id', async (req, res) => {
  const body = pickCompany(req.body);
  try {
    if (body.is_default) {
      await supabase.from('CONTABIL_EMPRESAS').update({ is_default: false }).eq('tenant_id', req.tenantId);
    }
    const { data, error } = await semInscricoesSeFaltar(body, b => supabase.from('CONTABIL_EMPRESAS')
      .update({ ...b, updated_at: new Date().toISOString() })
      .eq('id', req.params.id).eq('tenant_id', req.tenantId).select().single());
    if (error) throw error;
    audit(req, 'update', 'contabil_company', data.id, body);
    res.json(data);
  } catch (err) {
    if (missing043(err)) return err043(res);
    console.error('[contabil/companies PUT]', err.message);
    res.status(500).json({ error: 'Erro ao atualizar a empresa' });
  }
});

// ── Certidões da empresa (migração 126) ────────────────────
//
// CND Federal, Estadual, Municipal, FGTS, Trabalhista... com emissão,
// validade e o arquivo. O arquivo fica no bucket privado e só abre por
// link assinado, que expira: certidão traz a situação fiscal do CNPJ.
const TIPOS_CERTIDAO = ['federal', 'estadual', 'municipal', 'fgts', 'trabalhista', 'outra'];
const faltou126 = err => /CONTABIL_CERTIDOES|42P01|schema cache/i.test(err?.message || '');
const err126 = res => res.status(400).json({
  error: 'Rode a migração 126_empresa_ie_certidoes.sql no Supabase para usar as certidões.',
  migration_needed: true,
});

router.get('/companies/:id/certidoes', async (req, res) => {
  try {
    const { data, error } = await supabase.from('CONTABIL_CERTIDOES')
      .select('*').eq('tenant_id', req.tenantId).eq('company_id', req.params.id)
      .order('validade', { ascending: true, nullsFirst: false });
    if (error) throw error;
    const hoje = todayISO();
    const lista = await Promise.all((data || []).map(async c => ({
      ...c,
      link: await linkAssinado(c.arquivo, 600),
      situacao: !c.validade ? 'sem_validade' : c.validade < hoje ? 'vencida'
        : (new Date(c.validade) - new Date(hoje)) / 86400000 <= 15 ? 'vencendo' : 'valida',
    })));
    res.json(lista);
  } catch (err) {
    if (faltou126(err)) return err126(res);
    res.status(500).json({ error: 'Erro ao carregar as certidões' });
  }
});

router.post('/companies/:id/certidoes', async (req, res) => {
  const b = req.body || {};
  const tipo = TIPOS_CERTIDAO.includes(b.tipo) ? b.tipo : null;
  if (!tipo) return res.status(400).json({ error: 'Escolha o tipo da certidão' });
  if (!b.arquivo) return res.status(400).json({ error: 'Anexe o arquivo da certidão' });
  if (!/^data:(application\/pdf|image\/(png|jpe?g|webp));base64,/.test(b.arquivo)) {
    return res.status(400).json({ error: 'A certidão precisa ser PDF ou imagem (PNG, JPG)' });
  }
  const data = v => (/^\d{4}-\d{2}-\d{2}$/.test(v || '') ? v : null);
  try {
    const { data: emp, error: e1 } = await supabase.from('CONTABIL_EMPRESAS')
      .select('id').eq('id', req.params.id).eq('tenant_id', req.tenantId).maybeSingle();
    if (e1) throw e1;
    if (!emp) return res.status(404).json({ error: 'Empresa não encontrada' });

    const caminho = await uploadPrivado(b.arquivo, `certidoes/${req.tenantId}`);
    if (!caminho) return res.status(500).json({ error: 'Não foi possível guardar o arquivo' });

    const { data: row, error } = await supabase.from('CONTABIL_CERTIDOES').insert({
      tenant_id: req.tenantId, company_id: emp.id, tipo,
      descricao: String(b.descricao || '').trim().slice(0, 120) || null,
      numero: String(b.numero || '').trim().slice(0, 80) || null,
      emissao: data(b.emissao), validade: data(b.validade),
      arquivo: caminho, arquivo_nome: String(b.arquivo_nome || '').slice(0, 200) || null,
      observacao: String(b.observacao || '').trim() || null,
      created_by: req.user?.id || null,
    }).select().single();
    if (error) throw error;
    audit(req, 'create', 'contabil_certidao', row.id, { company_id: emp.id, tipo, validade: row.validade });
    res.status(201).json(row);
  } catch (err) {
    if (faltou126(err)) return err126(res);
    console.error('[contabil/certidoes POST]', err.message);
    res.status(500).json({ error: 'Erro ao salvar a certidão' });
  }
});

router.delete('/certidoes/:id', async (req, res) => {
  try {
    const { data, error } = await supabase.from('CONTABIL_CERTIDOES')
      .delete().eq('id', req.params.id).eq('tenant_id', req.tenantId)
      .select('id, tipo, company_id, validade').maybeSingle();
    if (error) throw error;
    if (!data) return res.status(404).json({ error: 'Certidão não encontrada' });
    // O arquivo fica no bucket: quem apagou por engano ainda tem a trilha.
    audit(req, 'delete', 'contabil_certidao', data.id, data);
    res.json({ success: true });
  } catch (err) {
    if (faltou126(err)) return err126(res);
    res.status(500).json({ error: 'Erro ao apagar a certidão' });
  }
});

// Auditoria: empresa nunca é apagada — apenas desativada
router.delete('/companies/:id', async (req, res) => {
  try {
    const { data, error } = await supabase.from('CONTABIL_EMPRESAS')
      .update({ is_active: false, is_default: false, updated_at: new Date().toISOString() })
      .eq('id', req.params.id).eq('tenant_id', req.tenantId).select('id, razao_social').single();
    if (error) throw error;
    audit(req, 'delete', 'contabil_company', data.id, { razao_social: data.razao_social, soft: true });
    res.json({ success: true });
  } catch (err) {
    if (missing043(err)) return err043(res);
    res.status(500).json({ error: 'Erro ao desativar a empresa' });
  }
});

// ════════════ BANCOS / CONTAS ═════════════════════════════
router.get('/accounts', async (req, res) => {
  try {
    const { data, error } = await supabase.from('CONTAS_FINANCEIRAS')
      .select('*, CONTABIL_EMPRESAS(id, razao_social, nome_fantasia)')
      .eq('tenant_id', req.tenantId)
      .order('is_active', { ascending: false }).order('name');
    if (error) throw error;
    res.json(data || []);
  } catch (err) {
    // sem a migração 043 o join falha → devolve sem o vínculo
    try {
      const { data } = await supabase.from('CONTAS_FINANCEIRAS')
        .select('*').eq('tenant_id', req.tenantId).order('name');
      return res.json(data || []);
    } catch { /* segue para o erro */ }
    console.error('[contabil/accounts]', err.message);
    res.status(500).json({ error: 'Erro ao listar as contas bancárias' });
  }
});

const ACCOUNT_FIELDS = ['name', 'type', 'balance', 'company_id', 'bank_name', 'agency', 'account_number', 'pix_key'];
function pickAccount(body) {
  const out = {};
  for (const k of ACCOUNT_FIELDS) if (body[k] !== undefined) out[k] = body[k];
  if (out.name !== undefined) out.name = String(out.name || '').trim();
  if (out.balance !== undefined) out.balance = Number(out.balance) || 0;
  if (out.company_id === '') out.company_id = null;
  if (out.type !== undefined && !['checking', 'savings', 'cash', 'other'].includes(out.type)) out.type = 'checking';
  return out;
}

router.post('/accounts', async (req, res) => {
  const body = pickAccount(req.body);
  if (!body.name) return res.status(400).json({ error: 'Informe o nome da conta (ex.: Nubank Lyon)' });
  try {
    const { data, error } = await supabase.from('CONTAS_FINANCEIRAS')
      .insert({ ...body, tenant_id: req.tenantId }).select().single();
    if (error) throw error;
    audit(req, 'create', 'bank_account', data.id, { name: data.name, bank: data.bank_name });
    res.status(201).json(data);
  } catch (err) {
    if (missing043(err)) return err043(res);
    console.error('[contabil/accounts POST]', err.message);
    res.status(500).json({ error: 'Erro ao cadastrar a conta' });
  }
});

router.put('/accounts/:id', async (req, res) => {
  const body = pickAccount(req.body);
  if (req.body.is_active !== undefined) body.is_active = !!req.body.is_active;
  try {
    const { data, error } = await supabase.from('CONTAS_FINANCEIRAS')
      .update(body).eq('id', req.params.id).eq('tenant_id', req.tenantId).select().single();
    if (error) throw error;
    audit(req, 'update', 'bank_account', data.id, body);
    res.json(data);
  } catch (err) {
    if (missing043(err)) return err043(res);
    res.status(500).json({ error: 'Erro ao atualizar a conta' });
  }
});

router.delete('/accounts/:id', async (req, res) => {
  try {
    const { data, error } = await supabase.from('CONTAS_FINANCEIRAS')
      .update({ is_active: false }).eq('id', req.params.id).eq('tenant_id', req.tenantId)
      .select('id, name').single();
    if (error) throw error;
    audit(req, 'delete', 'bank_account', data.id, { name: data.name, soft: true });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao desativar a conta' });
  }
});

// ════════════ SIMULADOR DE FATURAMENTO ════════════════════
// Antes de faturar: mostra o impacto da venda no limite da empresa.
router.get('/simulate', async (req, res) => {
  const amount = Math.max(0, Number(req.query.amount) || 0);
  try {
    const year = new Date().getFullYear();
    const companies = await companiesWithRevenue(req.tenantId, year);
    const company = companies.find(c => c.id === req.query.company_id) || companies.find(c => c.is_default) || companies[0];
    if (!company) return res.status(404).json({ error: 'Nenhuma empresa cadastrada no Contábil' });

    const after = company.faturado + amount;
    const limit = Number(company.annual_limit) || 0;
    const pctAfter = limit > 0 ? (after / limit) * 100 : 0;
    const aliquota = Number(company.aliquota) || 0;
    res.json({
      company: { id: company.id, razao_social: company.razao_social, regime: company.regime },
      faturado_atual: company.faturado,
      apos_venda: r2(after),
      imposto_estimado: r2(amount * aliquota / 100),
      limite: limit,
      restante_apos: r2(Math.max(0, limit - after)),
      pct_atual: company.pct,
      pct_apos: Math.round(pctAfter * 100) / 100,
      exceeds: limit > 0 && after > limit,
      warning: limit > 0 && pctAfter >= 70,
    });
  } catch (err) {
    if (missing043(err)) return err043(res);
    console.error('[contabil/simulate]', err.message);
    res.status(500).json({ error: 'Erro ao simular o faturamento' });
  }
});

// ════════════ O TETO DE FATURAMENTO ═══════════════════════
//
// POR QUE ISTO EXISTE. O Simples Nacional tem limite anual. Passar dele
// não dá multa na hora — dá desenquadramento no ano seguinte, com o
// imposto recalculado por cima de tudo que foi faturado. Quando alguém
// percebe, já faturou, já entregou e já gastou o dinheiro.
//
// O AVISO NÃO BASTAVA. Já existia um `confirm()` no fechamento da venda
// dizendo "isto ultrapassa o limite, continuar?". Quem está com o
// cliente na frente clica em continuar — é o que se faz com uma caixa
// que atrapalha. O aviso protege quem já ia parar sozinho.
//
// POR ISSO O BLOQUEIO É UMA CHAVE, e não o padrão. Ligada, a venda que
// estoura o teto é RECUSADA pelo servidor, e não pela tela: a tela é o
// lugar onde o "continuar mesmo assim" mora.
//
// E É POR ISSO QUE ELE PRECISA SER BEM EXPLICADO. Ligar isto significa
// que um dia o sistema vai parar de vender — de propósito. Se nesse dia
// não houver um segundo CNPJ com espaço, ele para e pronto: não há
// senha de gerente que passe por cima, porque a decisão de estourar o
// Simples não é de quem está no balcão.
const CHAVE_TETO = 'bloquear_venda_no_teto';

async function lerTeto(tenantId) {
  try {
    const { data } = await supabase.from('EMPRESAS')
      .select('settings').eq('id', tenantId).maybeSingle();
    return !!data?.settings?.fiscal?.[CHAVE_TETO];
  } catch {
    // Sem conseguir ler a configuração, NÃO se bloqueia. Uma leitura
    // falha travando a venda de todo mundo é pior do que um teto que
    // deixa passar — o teto tem um ano para ser corrigido, a venda
    // perdida acontece agora.
    return false;
  }
}

/**
 * A situação de cada CNPJ diante do teto.
 *
 * Devolve TODOS, e não só o que está estourando: a pergunta que a tela
 * precisa responder é "para onde eu mando a próxima venda", e isso só
 * se responde vendo quanto cabe em cada um.
 */
router.get('/teto', async (req, res) => {
  try {
    const year = new Date().getFullYear();
    const companies = await companiesWithRevenue(req.tenantId, year);
    const bloqueando = await lerTeto(req.tenantId);

    const empresas = companies.map(c => {
      const limite = Number(c.annual_limit) || 0;
      const faturado = Number(c.faturado) || 0;
      return {
        id: c.id,
        razao_social: c.razao_social,
        nome_fantasia: c.nome_fantasia || null,
        cnpj: c.cnpj || null,
        regime: c.regime,
        is_default: !!c.is_default,
        faturado: r2(faturado),
        limite,
        // Sem limite cadastrado NÃO é limite infinito: é limite não
        // informado, e a tela precisa dizer isso em vez de desenhar uma
        // barra vazia que parece folga.
        tem_limite: limite > 0,
        restante: limite > 0 ? r2(Math.max(0, limite - faturado)) : null,
        pct: limite > 0 ? Math.round((faturado / limite) * 10000) / 100 : null,
        estourado: limite > 0 && faturado >= limite,
      };
    });

    const comEspaco = empresas.filter(e => !e.tem_limite || !e.estourado);
    res.json({
      ano: year,
      bloqueando,
      empresas,
      // "Vai parar" é o que a tela precisa gritar ANTES de acontecer:
      // bloqueio ligado, e nenhum CNPJ com espaço sobrando.
      sem_saida: bloqueando && comEspaco.length === 0,
      com_espaco: comEspaco.length,
    });
  } catch (err) {
    if (missing043(err)) return err043(res);
    console.error('[contabil/teto]', err.message);
    res.status(500).json({ error: 'Erro ao ler o teto de faturamento' });
  }
});

/** Liga ou desliga o bloqueio. */
router.put('/teto', async (req, res) => {
  try {
    const { data } = await supabase.from('EMPRESAS')
      .select('settings').eq('id', req.tenantId).maybeSingle();
    const settings = data?.settings || {};
    settings.fiscal = { ...(settings.fiscal || {}), [CHAVE_TETO]: !!req.body?.[CHAVE_TETO] };

    const { error } = await supabase.from('EMPRESAS')
      .update({ settings }).eq('id', req.tenantId);
    if (error) throw error;

    audit(req, 'update', 'fiscal', req.tenantId, { [CHAVE_TETO]: settings.fiscal[CHAVE_TETO] });
    res.json({ [CHAVE_TETO]: settings.fiscal[CHAVE_TETO] });
  } catch (err) {
    console.error('[contabil/teto PUT]', err.message);
    res.status(500).json({ error: 'Não foi possível salvar' });
  }
});

/**
 * ESTA VENDA PODE SAIR POR ESTE CNPJ?
 *
 * Chamada pela criação da venda. Devolve `{ ok: true }` quando pode, e
 * quando não pode devolve JUNTO os CNPJs que ainda têm espaço — porque
 * "não pode" sem "então por onde?" é um beco.
 *
 * Não bloqueia quando o bloqueio está desligado, quando a empresa não
 * tem limite cadastrado, ou quando o Contábil não está configurado. As
 * três são a mesma decisão: na dúvida, a venda passa.
 */
async function podeFaturar(tenantId, companyId, valor) {
  try {
    if (!await lerTeto(tenantId)) return { ok: true, bloqueando: false };

    const year = new Date().getFullYear();
    const companies = await companiesWithRevenue(tenantId, year);
    const alvo = companies.find(c => c.id === companyId)
      || companies.find(c => c.is_default) || companies[0];
    if (!alvo) return { ok: true, bloqueando: true };

    const limite = Number(alvo.annual_limit) || 0;
    if (limite <= 0) return { ok: true, bloqueando: true };

    const depois = (Number(alvo.faturado) || 0) + (Number(valor) || 0);
    if (depois <= limite) return { ok: true, bloqueando: true };

    // Quem ainda tem espaço PARA ESTA VENDA — não "quem não estourou".
    // Um CNPJ com R$ 200 de folga não recebe uma venda de R$ 5.000, e
    // oferecê-lo seria mandar a pessoa tentar de novo para levar o
    // mesmo não.
    const alternativas = companies
      .filter(c => c.id !== alvo.id)
      .map(c => ({
        id: c.id, razao_social: c.razao_social, cnpj: c.cnpj || null,
        restante: (Number(c.annual_limit) || 0) > 0
          ? r2(Math.max(0, Number(c.annual_limit) - Number(c.faturado || 0)))
          : null,
      }))
      .filter(c => c.restante === null || c.restante >= Number(valor));

    return {
      ok: false, bloqueando: true,
      empresa: alvo.razao_social,
      faturado: r2(Number(alvo.faturado) || 0),
      limite, depois: r2(depois),
      excedente: r2(depois - limite),
      alternativas,
    };
  } catch {
    // Falha na checagem não pode virar venda recusada.
    return { ok: true, bloqueando: false };
  }
}

// ════════════ VISÃO GERAL (dashboard) ═════════════════════
router.get('/overview', async (req, res) => {
  const month = isMonth(req.query.month) ? req.query.month : new Date().toISOString().slice(0, 7);
  const year = Number(month.slice(0, 4));
  const { start, end } = monthRange(month);
  const prevMonth = new Date(Date.UTC(year, Number(month.slice(5, 7)) - 2, 1)).toISOString().slice(0, 7);
  const { start: prevStart } = monthRange(prevMonth);
  try {
    const companies = await companiesWithRevenue(req.tenantId, year).catch(() => []);
    const aliquota = await defaultAliquota(req.tenantId, companies);

    // Vendas do ano (agrega dia/mês/ano + mês anterior em JS)
    const { data: sales } = await supabase.from('VENDAS')
      .select('total, created_at')
      .eq('tenant_id', req.tenantId).neq('status', 'cancelled')
      .gte('created_at', `${year}-01-01`).lt('created_at', `${year + 1}-01-01`)
      .limit(20000);
    const today = todayISO();
    let fatDia = 0, fatMes = 0, fatAno = 0, pedidosMes = 0, fatPrev = 0, pedidosPrev = 0;
    for (const s of (sales || [])) {
      const v = Number(s.total) || 0;
      const d = String(s.created_at).slice(0, 10);
      const m = d.slice(0, 7);
      fatAno += v;
      if (d === today) fatDia += v;
      if (m === month) { fatMes += v; pedidosMes++; }
      if (m === prevMonth) { fatPrev += v; pedidosPrev++; }
    }

    // Custos e despesas do mês (e do anterior, p/ comparativo do lucro)
    const [{ total: custosMes, byMonth: custosByMonth }, despesasMes, despesasPrev] = await Promise.all([
      periodCosts(req.tenantId, prevStart, end),
      periodExpenses(req.tenantId, start, end),
      periodExpenses(req.tenantId, prevStart, start),
    ]);
    const custosDoMes = custosByMonth.get(month) || 0;
    const custosPrev = custosByMonth.get(prevMonth) || 0;

    const impostosMes = fatMes * aliquota / 100;
    const impostosPrev = fatPrev * aliquota / 100;
    const lucroMes = fatMes - impostosMes - custosDoMes - despesasMes;
    const lucroPrev = fatPrev - impostosPrev - custosPrev - despesasPrev;

    // Financeiro: a receber / a pagar / saldo bancário
    const { data: lanc } = await supabase.from('LANCAMENTOS')
      .select('type, amount, paid_amount, status')
      .eq('tenant_id', req.tenantId).in('status', ['pending', 'partial', 'overdue'])
      .limit(10000);
    let receber = 0, receberQtd = 0, pagar = 0, pagarQtd = 0;
    for (const l of (lanc || [])) {
      const rest = Math.max(0, (Number(l.amount) || 0) - (Number(l.paid_amount) || 0));
      if (l.type === 'receivable') { receber += rest; receberQtd++; }
      else { pagar += rest; pagarQtd++; }
    }

    let saldoBancario = 0;
    try {
      const { data: accs } = await supabase.from('CONTAS_FINANCEIRAS')
        .select('balance').eq('tenant_id', req.tenantId).eq('is_active', true);
      saldoBancario = (accs || []).reduce((s, a) => s + (Number(a.balance) || 0), 0);
    } catch { /* sem contas */ }

    // Estoque financeiro (quantidade × custo)
    let estoqueFin = 0;
    try {
      const { data: prods } = await supabase.from('PRODUTOS')
        .select('current_stock, cost_price').eq('tenant_id', req.tenantId).eq('is_active', true).limit(5000);
      estoqueFin = (prods || []).reduce((s, p) => s + Math.max(0, Number(p.current_stock) || 0) * (Number(p.cost_price) || 0), 0);
    } catch { /* ignora */ }

    // Fluxo de caixa dos últimos 6 meses (pagamentos efetivados)
    const sixAgo = new Date(Date.UTC(year, Number(month.slice(5, 7)) - 6, 1)).toISOString().slice(0, 10);
    const { data: paid } = await supabase.from('LANCAMENTOS')
      .select('type, paid_amount, paid_date')
      .eq('tenant_id', req.tenantId).in('status', ['paid', 'partial'])
      .gte('paid_date', sixAgo).lte('paid_date', end)
      .limit(10000);
    const fluxo = new Map();
    for (const l of (paid || [])) {
      if (!l.paid_date) continue;
      const mk = String(l.paid_date).slice(0, 7);
      const cur = fluxo.get(mk) || { entradas: 0, saidas: 0 };
      if (l.type === 'receivable') cur.entradas += Number(l.paid_amount) || 0;
      else cur.saidas += Number(l.paid_amount) || 0;
      fluxo.set(mk, cur);
    }
    const fluxoMeses = [...fluxo.entries()].sort((a, b) => a[0].localeCompare(b[0]))
      .map(([mk, v]) => ({ month: mk, entradas: r2(v.entradas), saidas: r2(v.saidas), saldo: r2(v.entradas - v.saidas) }));

    // Vencimentos próximos
    const { data: upcoming } = await supabase.from('LANCAMENTOS')
      .select('id, type, description, amount, paid_amount, due_date, CLIENTES(name), FORNECEDORES(name)')
      .eq('tenant_id', req.tenantId).in('status', ['pending', 'partial'])
      .gte('due_date', today).order('due_date').limit(6);

    const pctChange = (cur, prev) => prev > 0 ? Math.round(((cur - prev) / prev) * 1000) / 10 : null;

    res.json({
      month, aliquota,
      kpis: {
        faturamento_dia: r2(fatDia),
        faturamento_mes: r2(fatMes),
        faturamento_ano: r2(fatAno),
        receita_liquida: r2(fatMes - impostosMes),
        lucro_estimado: r2(lucroMes),
        impostos_projetados: r2(impostosMes),
        saldo_bancario: r2(saldoBancario),
        contas_receber: r2(receber), contas_receber_qtd: receberQtd,
        contas_pagar: r2(pagar), contas_pagar_qtd: pagarQtd,
        estoque_financeiro: r2(estoqueFin),
        ticket_medio: r2(pedidosMes > 0 ? fatMes / pedidosMes : 0),
        pedidos_mes: pedidosMes,
        vs: {
          faturamento: pctChange(fatMes, fatPrev),
          receita: pctChange(fatMes - impostosMes, fatPrev - impostosPrev),
          lucro: pctChange(lucroMes, lucroPrev),
          impostos: pctChange(impostosMes, impostosPrev),
          ticket: pctChange(pedidosMes > 0 ? fatMes / pedidosMes : 0, pedidosPrev > 0 ? fatPrev / pedidosPrev : 0),
          pedidos: pctChange(pedidosMes, pedidosPrev),
        },
      },
      dre: {
        receita_bruta: r2(fatMes),
        impostos: r2(impostosMes),
        custos: r2(custosDoMes),
        despesas: r2(despesasMes),
        lucro: r2(lucroMes),
      },
      fluxo: fluxoMeses,
      upcoming: (upcoming || []).map(u => ({
        id: u.id, type: u.type, description: u.description,
        who: u.CLIENTES?.name || u.FORNECEDORES?.name || null,
        amount: r2((Number(u.amount) || 0) - (Number(u.paid_amount) || 0)),
        due_date: u.due_date,
      })),
      companies,
    });
  } catch (err) {
    console.error('[contabil/overview]', err.message);
    res.status(500).json({ error: 'Erro ao carregar a visão geral' });
  }
});

// ════════════ DRE (mensal / trimestral / anual) ════════════
router.get('/dre', async (req, res) => {
  const g = ['month', 'quarter', 'year'].includes(req.query.granularity) ? req.query.granularity : 'month';
  const month = isMonth(req.query.date) ? req.query.date : new Date().toISOString().slice(0, 7);
  const year = Number(month.slice(0, 4));
  const m = Number(month.slice(5, 7));
  let start, end, label;
  if (g === 'year') {
    start = `${year}-01-01`; end = `${year + 1}-01-01`; label = String(year);
  } else if (g === 'quarter') {
    const q = Math.floor((m - 1) / 3);
    start = new Date(Date.UTC(year, q * 3, 1)).toISOString().slice(0, 10);
    end = new Date(Date.UTC(year, q * 3 + 3, 1)).toISOString().slice(0, 10);
    label = `${q + 1}º trimestre / ${year}`;
  } else {
    ({ start, end } = monthRange(month)); label = month;
  }
  try {
    const companies = await companiesWithRevenue(req.tenantId, year).catch(() => []);
    const aliquota = await defaultAliquota(req.tenantId, companies);

    const { data: sales } = await supabase.from('VENDAS')
      .select('total').eq('tenant_id', req.tenantId).neq('status', 'cancelled')
      .gte('created_at', start).lt('created_at', end).limit(20000);
    const receita = (sales || []).reduce((s, v) => s + (Number(v.total) || 0), 0);

    const [{ total: custos }, despesas] = await Promise.all([
      periodCosts(req.tenantId, start, end),
      periodExpenses(req.tenantId, start, end),
    ]);
    const impostos = receita * aliquota / 100;

    res.json({
      granularity: g, label, start, end, aliquota,
      receita_bruta: r2(receita),
      impostos: r2(impostos),
      custos: r2(custos),
      despesas: r2(despesas),
      lucro: r2(receita - impostos - custos - despesas),
      margem_pct: receita > 0 ? Math.round(((receita - impostos - custos - despesas) / receita) * 1000) / 10 : 0,
    });
  } catch (err) {
    console.error('[contabil/dre]', err.message);
    res.status(500).json({ error: 'Erro ao gerar a DRE' });
  }
});

// ════════════ CONCILIAÇÃO (Banco × Pedido × NF) ═══════════
async function reconciliationRows(tenantId, month) {
  const { start, end } = monthRange(month);
  const { data: sales } = await supabase.from('VENDAS')
    .select('id, number, total, status, created_at, CLIENTES(name)')
    .eq('tenant_id', tenantId).neq('status', 'cancelled')
    .gte('created_at', start).lt('created_at', end)
    .order('created_at', { ascending: false }).limit(500);
  const ids = (sales || []).map(s => s.id);
  let lanc = [], nfs = [];
  if (ids.length) {
    const [{ data: l }, nf] = await Promise.all([
      supabase.from('LANCAMENTOS')
        .select('reference_id, amount, paid_amount, status')
        .eq('tenant_id', tenantId).eq('reference_type', 'sale')
        .neq('status', 'cancelled').in('reference_id', ids).limit(5000),
      supabase.from('NOTAS_FISCAIS').select('sale_id, status').in('sale_id', ids).limit(1000)
        .then(r => r, () => ({ data: [] })),
    ]);
    lanc = l || []; nfs = nf.data || [];
  }
  const lancBySale = new Map();
  for (const l of lanc) {
    const cur = lancBySale.get(l.reference_id) || { lancado: 0, recebido: 0 };
    cur.lancado += Number(l.amount) || 0;
    cur.recebido += Number(l.paid_amount) || 0;
    lancBySale.set(l.reference_id, cur);
  }
  const nfBySale = new Map();
  for (const n of nfs) if (!nfBySale.has(n.sale_id) || n.status === 'authorized') nfBySale.set(n.sale_id, n.status);

  return (sales || []).map(s => {
    const total = Number(s.total) || 0;
    const l = lancBySale.get(s.id) || { lancado: 0, recebido: 0 };
    let status = 'sem_lancamento';
    if (l.lancado > 0) {
      if (Math.abs(l.lancado - total) > 0.01) status = 'divergente';
      else if (l.recebido >= total - 0.01) status = 'conciliado';
      else if (l.recebido > 0) status = 'parcial';
      else status = 'pendente';
    } else if (total === 0) status = 'conciliado';
    return {
      id: s.id, number: s.number, date: s.created_at,
      customer: s.CLIENTES?.name || null,
      total: r2(total), lancado: r2(l.lancado), recebido: r2(l.recebido),
      diferenca: r2(l.lancado > 0 ? l.recebido - total : 0),
      nf_status: nfBySale.get(s.id) || null,
      status,
    };
  });
}

router.get('/reconciliation', async (req, res) => {
  const month = isMonth(req.query.month) ? req.query.month : new Date().toISOString().slice(0, 7);
  try {
    const rows = await reconciliationRows(req.tenantId, month);
    const sum = k => rows.filter(x => x.status === k).length;
    res.json({
      month, rows,
      summary: {
        conciliados: sum('conciliado'), parciais: sum('parcial'),
        pendentes: sum('pendente'), divergentes: sum('divergente'),
        sem_lancamento: sum('sem_lancamento'),
      },
    });
  } catch (err) {
    console.error('[contabil/reconciliation]', err.message);
    res.status(500).json({ error: 'Erro na conciliação' });
  }
});

// ════════════ ALERTAS E AVISOS ═════════════════════════════
router.get('/alerts', async (req, res) => {
  const alerts = [];
  const push = (severity, title, text) => alerts.push({ severity, title, text });
  const today = todayISO();
  try {
    // Limite tributário (70/80/90/95/100)
    try {
      const companies = await companiesWithRevenue(req.tenantId, new Date().getFullYear());
      for (const c of companies) {
        const levels = [100, 95, 90, 80, 70];
        const lvl = levels.find(x => c.pct >= x);
        if (lvl) {
          push(lvl >= 95 ? 'urgente' : lvl >= 90 ? 'atencao' : 'info',
            `Limite do ${c.regime === 'simples' ? 'Simples Nacional' : 'regime tributário'}`,
            `${c.razao_social}: ${c.pct.toFixed(2).replace('.', ',')}% do limite anual (${lvl}%+ atingido)`);
        } else if (c.pct > 0) {
          push('info', 'Limite do Simples Nacional',
            `${c.razao_social}: você atingiu ${c.pct.toFixed(2).replace('.', ',')}% do limite anual`);
        }
        // Certificado digital
        if (c.cert_expiry) {
          const dias = Math.ceil((new Date(c.cert_expiry) - new Date(today)) / 86400000);
          if (dias <= 0) push('urgente', 'Certificado Digital', `${c.razao_social}: certificado VENCIDO`);
          else if (dias <= 30) push(dias <= 7 ? 'urgente' : 'info', 'Certificado Digital', `${c.razao_social}: vence em ${dias} dia(s)`);
        }
      }
    } catch { /* migração 043 pendente */ }

    // Imposto a vencer (contas a pagar com cara de tributo nos próximos 10 dias)
    const in10 = new Date(Date.now() + 10 * 86400000).toISOString().slice(0, 10);
    const { data: taxes } = await supabase.from('LANCAMENTOS')
      .select('description, due_date, amount')
      .eq('tenant_id', req.tenantId).eq('type', 'payable')
      .in('status', ['pending', 'partial'])
      .gte('due_date', today).lte('due_date', in10).limit(200);
    for (const t of (taxes || [])) {
      if (/imposto|das\b|darf|inss|fgts|tribut|simples/i.test(t.description || '')) {
        const dias = Math.ceil((new Date(t.due_date) - new Date(today)) / 86400000);
        push('urgente', 'Imposto a Vencer', `${t.description} vence em ${dias} dia(s)`);
      }
    }

    // Estoque baixo
    try {
      const { data: low } = await supabase.from('PRODUTOS')
        .select('id, current_stock, min_stock')
        .eq('tenant_id', req.tenantId).eq('is_active', true)
        .gt('min_stock', 0).limit(5000);
      const n = (low || []).filter(p => Number(p.current_stock) <= Number(p.min_stock)).length;
      if (n > 0) push('atencao', 'Estoque Baixo', `${n} produto(s) no estoque mínimo ou abaixo`);
    } catch { /* ignora */ }

    // Clientes inadimplentes (a receber vencido)
    const { data: overdue } = await supabase.from('LANCAMENTOS')
      .select('amount, paid_amount')
      .eq('tenant_id', req.tenantId).eq('type', 'receivable')
      .in('status', ['pending', 'partial', 'overdue'])
      .lt('due_date', today).limit(2000);
    if ((overdue || []).length) {
      const totalV = overdue.reduce((s, l) => s + Math.max(0, (Number(l.amount) || 0) - (Number(l.paid_amount) || 0)), 0);
      push('atencao', 'Clientes Inadimplentes', `${overdue.length} título(s) vencido(s) — ${new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(totalV)} a receber`);
    }

    // Divergência bancária (conciliação do mês)
    try {
      const rows = await reconciliationRows(req.tenantId, new Date().toISOString().slice(0, 7));
      const div = rows.filter(x => x.status === 'divergente').length;
      if (div > 0) push('urgente', 'Divergência Bancária', `${div} pedido(s) com valor lançado diferente do pedido`);
      const pend = rows.filter(x => x.status === 'pendente' || x.status === 'parcial').length;
      if (pend > 0) push('info', 'Conciliação Bancária', `${pend} lançamento(s) não conciliado(s) neste mês`);
    } catch { /* ignora */ }

    // NF-e pendentes
    try {
      const { data: nfs } = await supabase.from('NOTAS_FISCAIS')
        .select('id').eq('tenant_id', req.tenantId).in('status', ['pending', 'processing', 'error']).limit(100);
      if ((nfs || []).length) push('atencao', 'NFe Pendentes', `${nfs.length} nota(s) fiscal(is) pendente(s)`);
    } catch { /* ignora */ }

    const order = { urgente: 0, atencao: 1, info: 2 };
    alerts.sort((a, b) => order[a.severity] - order[b.severity]);
    res.json(alerts);
  } catch (err) {
    console.error('[contabil/alerts]', err.message);
    res.status(500).json({ error: 'Erro ao gerar os alertas' });
  }
});

module.exports = router;
// A checagem do teto é usada pela criação da venda (routes/sales.js).
module.exports.podeFaturar = podeFaturar;
