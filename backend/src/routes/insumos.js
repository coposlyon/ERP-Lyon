const express = require('express');
const router = express.Router();
const supabase = require('../config/supabase');
const { audit } = require('../lib/audit');

// ════════════════════════════════════════════════════════════
// ENGENHARIA DE CUSTOS — INSUMOS
// Catálogo central de materiais. Custo por unidade base e custo
// por peça (por consumo ou por vida útil) são calculados aqui —
// fonte única para o Processo de Produção e a Formação de Preço.
// ════════════════════════════════════════════════════════════

const r6 = v => Math.round((Number(v) || 0) * 1e6) / 1e6;
const r4 = v => Math.round((Number(v) || 0) * 1e4) / 1e4;

// ── Categorias do insumo ────────────────────────────────────
// Ficam em EMPRESAS.settings.insumo_categories (por empresa). Enquanto
// ninguém mexer, valem as padrão. A lista salva é a lista inteira — é
// assim que apagar uma categoria funciona.
const CATEGORIAS_PADRAO = ['Tintas', 'Solventes', 'Thinner', 'Emulsão', 'Telas / Poliéster', 'Vegetal', 'Recuperador', 'Fita', 'Embalagem', 'Caixa', 'Rótulo', 'Outros'];

async function lerSettings(tenantId) {
  const { data, error } = await supabase.from('EMPRESAS').select('settings').eq('id', tenantId).single();
  if (error) throw error;
  return (data && data.settings) || {};
}

router.get('/categorias', async (req, res) => {
  try {
    const settings = await lerSettings(req.tenantId);
    const list = settings.insumo_categories;
    res.json(Array.isArray(list) && list.length ? list : CATEGORIAS_PADRAO);
  } catch (err) {
    // Sem a coluna settings (ou empresa sem registro), devolve o padrão.
    res.json(CATEGORIAS_PADRAO);
  }
});

router.put('/categorias', async (req, res) => {
  const list = Array.isArray(req.body?.categories) ? req.body.categories : null;
  if (!list) return res.status(400).json({ error: 'Envie a lista de categorias' });
  // limpa, tira repetido (sem diferenciar maiúscula) e limita o tamanho
  const seen = new Set();
  const clean = [];
  for (const raw of list) {
    const c = String(raw || '').trim().slice(0, 60);
    if (!c) continue;
    const k = c.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    clean.push(c);
    if (clean.length >= 100) break;
  }
  if (!clean.length) return res.status(400).json({ error: 'Deixe ao menos uma categoria' });
  try {
    const settings = await lerSettings(req.tenantId);
    const { error } = await supabase.from('EMPRESAS')
      .update({ settings: { ...settings, insumo_categories: clean } })
      .eq('id', req.tenantId);
    if (error) throw error;
    res.json(clean);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Enriqumece um insumo com os custos derivados
function withCost(i) {
  const qty = Number(i.package_qty) || 0;
  const price = Number(i.package_price) || 0;
  const unitCost = qty > 0 ? price / qty : 0; // R$ por base_unit
  let costPerPiece = 0;
  if (i.cost_method === 'vida_util') {
    const life = Number(i.lifespan) || 0;
    costPerPiece = life > 0 ? price / life : 0;
  } else {
    costPerPiece = unitCost * (Number(i.consumption) || 0);
  }
  return { ...i, unit_cost: r6(unitCost), cost_per_piece: r6(costPerPiece) };
}

function missing(err) {
  const m = err?.message || '';
  // PostgREST devolve "Could not find the 'x' column ... schema cache" quando
  // a COLUNA não existe, e 42P01 quando a TABELA não existe.
  return /INSUMOS|does not exist|42P01|relation .* does not exist|schema cache|PGRST204/i.test(m);
}
/** Mandar rodar a 050 quando o que falta é a 092 manda a pessoa ao lugar errado. */
function migErr(res, err) {
  if (/current_stock|INSUMO_MOVIMENTOS/i.test(err?.message || '')) {
    return res.status(400).json({
      error: 'Estoque de insumos não habilitado: rode a migração 092_insumo_estoque_proprio.sql no Supabase.',
      code: 'MIGRATION_092',
    });
  }
  return res.status(400).json({ error: 'Recurso não habilitado: rode a migração 050_insumos.sql no Supabase.', code: 'MIGRATION_050' });
}

const COST_SOURCES = ['manual', 'compra', 'nfe'];
const clean = body => {
  const out = {};
  const str = (k, max) => { if (body[k] !== undefined) out[k] = body[k] == null ? null : String(body[k]).trim().slice(0, max) || null; };
  str('category', 80); str('name', 160); str('supplier_name', 160); str('notes', 4000);
  if (body.supplier_id !== undefined) out.supplier_id = body.supplier_id || null;
  if (body.product_id !== undefined) out.product_id = body.product_id || null;
  if (body.base_unit !== undefined) out.base_unit = String(body.base_unit || 'ml').trim().slice(0, 12) || 'ml';
  if (body.package_qty !== undefined) out.package_qty = Math.max(Number(body.package_qty) || 0, 0);
  if (body.package_price !== undefined) out.package_price = Math.max(Number(body.package_price) || 0, 0);
  if (body.cost_method !== undefined) out.cost_method = body.cost_method === 'vida_util' ? 'vida_util' : 'consumo';
  if (body.consumption !== undefined) out.consumption = Math.max(Number(body.consumption) || 0, 0);
  if (body.lifespan !== undefined) out.lifespan = Math.max(Number(body.lifespan) || 0, 0);
  if (body.min_stock !== undefined) out.min_stock = Math.max(Number(body.min_stock) || 0, 0);
  if (body.cost_source !== undefined) out.cost_source = COST_SOURCES.includes(body.cost_source) ? body.cost_source : 'manual';
  if (body.is_active !== undefined) out.is_active = !!body.is_active;
  return out;
};

// Grava um ponto no histórico de preço (silencioso se a 053 faltar)
async function logPreco(tenantId, insumo, extra = {}) {
  try {
    const qty = Number(insumo.package_qty) || 0;
    await supabase.from('INSUMO_PRECOS').insert({
      tenant_id: tenantId,
      insumo_id: insumo.id,
      supplier_id: insumo.supplier_id || null,
      supplier_name: insumo.supplier_name || null,
      package_qty: qty,
      package_price: Number(insumo.package_price) || 0,
      unit_cost: qty > 0 ? (Number(insumo.package_price) || 0) / qty : 0,
      source: extra.source || insumo.cost_source || 'manual',
      reference: extra.reference || null,
      user_name: extra.user_name || null,
    });
  } catch { /* migração 053 pendente */ }
}

// O SALDO É DO INSUMO.
//
// Ele vinha do `current_stock` do PRODUTO vinculado, para não existirem
// duas fontes de verdade. A razão era boa e a conclusão era errada:
// tinta, verniz e lâmina não são produto de venda, quase nenhum insumo
// tinha vínculo, e quase todos mostravam um traço na coluna Estoque —
// sem lugar nenhum onde digitar a quantidade. A fonte de verdade do
// insumo é o insumo (ver migração 092, que copiou os saldos herdados).
//
// A ÚLTIMA COMPRA continua vindo do produto vinculado quando ele existe:
// aquilo é PREÇO, e preço de compra realmente mora em COMPRAS.
async function enrichEstoque(tenantId, rows) {
  const comEstoque = rows.map(i => ({ ...i, stock: Number(i.current_stock) || 0 }));
  const ids = [...new Set(rows.map(i => i.product_id).filter(Boolean))];
  if (!ids.length) return comEstoque.map(i => ({ ...i, last_purchase: null }));

  // Última compra de cada produto (preço real pago)
  let lastBuy = {};
  try {
    const { data } = await supabase.from('COMPRA_ITENS')
      .select('product_id, quantity, unit_price, total, COMPRAS(number, created_at, status)')
      .eq('tenant_id', tenantId).in('product_id', ids)
      .order('created_at', { ascending: false }).limit(500);
    for (const it of data || []) {
      if (!it.product_id || lastBuy[it.product_id]) continue;
      lastBuy[it.product_id] = {
        unit_price: Number(it.unit_price) || 0,
        quantity: Number(it.quantity) || 0,
        number: it.COMPRAS?.number || null,
        date: it.COMPRAS?.created_at || null,
      };
    }
  } catch { /* sem compras */ }

  return comEstoque.map(i => ({
    ...i,
    last_purchase: i.product_id ? (lastBuy[i.product_id] || null) : null,
  }));
}

// ── O MOTOR DO ESTOQUE ────────────────────────────────────
//
// Todo movimento passa por aqui, e é aqui que o saldo muda. Não existe
// caminho que escreva `current_stock` direto: saldo que muda sem deixar
// movimento é saldo que ninguém consegue explicar depois.
//
// `quantity` chega SEMPRE positiva, na unidade base do insumo. O tipo é
// quem soma ou subtrai — e 'ajuste' não soma nem subtrai: ele DEFINE o
// saldo, porque ajuste é o resultado de alguém ter contado.
const TIPOS_MOV = ['entrada', 'saida', 'ajuste'];

async function movimentar(tenantId, insumoId, mov, user) {
  const { data: insumo, error: e1 } = await supabase.from('INSUMOS')
    .select('id, current_stock, base_unit')
    .eq('id', insumoId).eq('tenant_id', tenantId).single();
  if (e1) throw e1;

  const atual = Number(insumo.current_stock) || 0;
  const qtd = Math.max(Number(mov.quantity) || 0, 0);
  const saldo = mov.tipo === 'entrada' ? atual + qtd
              : mov.tipo === 'saida'   ? atual - qtd
              : qtd;

  // Saldo negativo é sempre erro de digitação de quem deu baixa, e
  // gravá-lo faz o alerta de reposição mentir para sempre.
  if (saldo < 0) {
    const err = new Error(`Saldo insuficiente: há ${atual} ${insumo.base_unit} em estoque.`);
    err.semSaldo = true;
    throw err;
  }

  const { error: e2 } = await supabase.from('INSUMOS')
    .update({ current_stock: saldo, updated_at: new Date().toISOString() })
    .eq('id', insumoId).eq('tenant_id', tenantId);
  if (e2) throw e2;

  const { data, error: e3 } = await supabase.from('INSUMO_MOVIMENTOS').insert({
    tenant_id: tenantId,
    insumo_id: insumoId,
    tipo: mov.tipo,
    quantity: qtd,
    saldo_apos: saldo,
    unit_cost: mov.unit_cost != null ? Number(mov.unit_cost) : null,
    total: mov.total != null ? Number(mov.total) : null,
    reference: mov.reference ? String(mov.reference).slice(0, 80) : null,
    notes: mov.notes ? String(mov.notes).slice(0, 4000) : null,
    user_name: user || null,
  }).select().single();
  if (e3) throw e3;

  return { movimento: data, saldo };
}

// Marca reposição quando o saldo bate no mínimo
const withAlert = i => ({
  ...i,
  precisa_repor: Number(i.min_stock) > 0 && Number(i.stock) <= Number(i.min_stock),
});

// GET /insumos?category=&search=&all=1
router.get('/', async (req, res) => {
  try {
    let q = supabase.from('INSUMOS')
      .select('*, FORNECEDORES(name)')
      .eq('tenant_id', req.tenantId)
      .order('category').order('name');
    if (!req.query.all) q = q.eq('is_active', true);
    if (req.query.category) q = q.eq('category', req.query.category);
    const { data, error } = await q;
    if (error) throw error;
    let rows = (data || []).map(withCost).map(i => ({ ...i, supplier: i.FORNECEDORES?.name || i.supplier_name || null }));

    // Nº de fornecedores cadastrados por insumo
    try {
      const { data: forn } = await supabase.from('INSUMO_FORNECEDORES')
        .select('insumo_id').eq('tenant_id', req.tenantId);
      const cont = {};
      for (const f of forn || []) cont[f.insumo_id] = (cont[f.insumo_id] || 0) + 1;
      rows = rows.map(i => ({ ...i, fornecedores_count: cont[i.id] || 0 }));
    } catch { /* migração 053 pendente */ }

    rows = (await enrichEstoque(req.tenantId, rows)).map(withAlert);

    if (req.query.search) {
      const s = String(req.query.search).toLowerCase();
      rows = rows.filter(i => (i.name || '').toLowerCase().includes(s) || (i.category || '').toLowerCase().includes(s));
    }
    if (req.query.repor) rows = rows.filter(i => i.precisa_repor);
    res.json(rows);
  } catch (err) {
    if (missing(err)) return migErr(res, err);
    console.error('[insumos/list]', err.message);
    res.status(500).json({ error: 'Erro ao listar insumos' });
  }
});

// ── Fornecedores do insumo ────────────────────────────────
router.get('/:id/fornecedores', async (req, res) => {
  try {
    const { data, error } = await supabase.from('INSUMO_FORNECEDORES')
      .select('*, FORNECEDORES(name)')
      .eq('tenant_id', req.tenantId).eq('insumo_id', req.params.id)
      .order('is_default', { ascending: false }).order('package_price');
    if (error) throw error;
    res.json((data || []).map(f => ({
      ...f,
      supplier: f.FORNECEDORES?.name || f.supplier_name || '—',
      unit_cost: Number(f.package_qty) > 0 ? r6(Number(f.package_price) / Number(f.package_qty)) : 0,
    })));
  } catch (err) {
    if (missing(err)) return migErr(res, err);
    res.status(500).json({ error: 'Erro ao listar fornecedores do insumo' });
  }
});

router.post('/:id/fornecedores', async (req, res) => {
  const b = req.body || {};
  const qty = Number(b.package_qty) || 0;
  if (!(qty > 0)) return res.status(400).json({ error: 'Informe a quantidade da embalagem' });
  try {
    const row = {
      tenant_id: req.tenantId, insumo_id: req.params.id,
      supplier_id: b.supplier_id || null,
      supplier_name: b.supplier_id ? null : (String(b.supplier_name || '').trim() || null),
      package_qty: qty,
      package_price: Math.max(Number(b.package_price) || 0, 0),
      lead_time_days: b.lead_time_days ? parseInt(b.lead_time_days) : null,
      is_default: !!b.is_default,
      notes: String(b.notes || '').trim() || null,
    };
    if (row.is_default) {
      await supabase.from('INSUMO_FORNECEDORES').update({ is_default: false })
        .eq('tenant_id', req.tenantId).eq('insumo_id', req.params.id);
    }
    const { data, error } = await supabase.from('INSUMO_FORNECEDORES').insert(row).select().single();
    if (error) throw error;

    // Fornecedor padrão passa a definir o custo do insumo (e vira histórico)
    if (row.is_default) {
      const { data: ins } = await supabase.from('INSUMOS')
        .update({ package_qty: row.package_qty, package_price: row.package_price, cost_source: 'manual', updated_at: new Date().toISOString() })
        .eq('id', req.params.id).eq('tenant_id', req.tenantId).select().single();
      if (ins) await logPreco(req.tenantId, { ...ins, supplier_name: row.supplier_name }, {
        source: 'manual', user_name: req.user?.name || req.user?.email || null,
      });
    }
    audit(req, 'create', 'insumo_fornecedor', data.id, { insumo: req.params.id });
    res.status(201).json(data);
  } catch (err) {
    if (missing(err)) return migErr(res, err);
    console.error('[insumos/fornecedor]', err.message);
    res.status(500).json({ error: 'Erro ao salvar fornecedor' });
  }
});

router.delete('/:id/fornecedores/:fid', async (req, res) => {
  try {
    await supabase.from('INSUMO_FORNECEDORES').delete()
      .eq('id', req.params.fid).eq('tenant_id', req.tenantId);
    res.json({ success: true });
  } catch (err) {
    if (missing(err)) return migErr(res, err);
    res.status(500).json({ error: 'Erro ao remover fornecedor' });
  }
});

// ── Histórico de preço ────────────────────────────────────
router.get('/:id/precos', async (req, res) => {
  try {
    const { data, error } = await supabase.from('INSUMO_PRECOS')
      .select('*').eq('tenant_id', req.tenantId).eq('insumo_id', req.params.id)
      .order('created_at', { ascending: false }).limit(100);
    if (error) throw error;
    const rows = data || [];
    // variação entre pontos consecutivos
    const out = rows.map((p, i) => {
      const ant = rows[i + 1];
      const varia = ant && Number(ant.unit_cost) > 0
        ? ((Number(p.unit_cost) - Number(ant.unit_cost)) / Number(ant.unit_cost)) * 100 : null;
      return { ...p, variacao_pct: varia == null ? null : Math.round(varia * 10) / 10 };
    });
    res.json(out);
  } catch (err) {
    if (missing(err)) return migErr(res, err);
    res.status(500).json({ error: 'Erro ao carregar o histórico de preço' });
  }
});

// ── Estoque: extrato e movimentos ─────────────────────────
router.get('/:id/movimentos', async (req, res) => {
  try {
    const { data, error } = await supabase.from('INSUMO_MOVIMENTOS')
      .select('*').eq('tenant_id', req.tenantId).eq('insumo_id', req.params.id)
      .order('created_at', { ascending: false }).limit(100);
    if (error) throw error;
    res.json(data || []);
  } catch (err) {
    if (missing(err)) return migErr(res, err);
    console.error('[insumos/movimentos]', err.message);
    res.status(500).json({ error: 'Erro ao carregar o extrato do insumo' });
  }
});

router.post('/:id/movimentos', async (req, res) => {
  const b = req.body || {};
  const tipo = TIPOS_MOV.includes(b.tipo) ? b.tipo : null;
  if (!tipo) return res.status(400).json({ error: 'Tipo de movimento inválido' });

  const qtd = Number(b.quantity);
  if (!Number.isFinite(qtd) || qtd < 0) return res.status(400).json({ error: 'Informe a quantidade' });
  // Entrada e saída de zero não são movimento nenhum; ajuste para zero é.
  if (qtd === 0 && tipo !== 'ajuste') return res.status(400).json({ error: 'A quantidade tem que ser maior que zero' });

  try {
    const r = await movimentar(req.tenantId, req.params.id, {
      tipo, quantity: qtd,
      unit_cost: b.unit_cost, total: b.total,
      reference: b.reference, notes: b.notes,
    }, req.user?.name || req.user?.email || null);
    audit(req, 'update', 'insumo_estoque', req.params.id, { tipo, quantity: qtd, saldo: r.saldo });
    res.status(201).json(r);
  } catch (err) {
    if (err.semSaldo) return res.status(400).json({ error: err.message });
    if (missing(err)) return migErr(res, err);
    console.error('[insumos/movimentar]', err.message);
    res.status(500).json({ error: 'Erro ao movimentar o estoque' });
  }
});

// ── Alertas de reposição ──────────────────────────────────
router.get('/alertas/reposicao', async (req, res) => {
  try {
    const { data } = await supabase.from('INSUMOS').select('*')
      .eq('tenant_id', req.tenantId).eq('is_active', true);
    const rows = (await enrichEstoque(req.tenantId, (data || []).map(withCost))).map(withAlert);
    res.json(rows.filter(i => i.precisa_repor));
  } catch (err) {
    if (missing(err)) return migErr(res, err);
    res.status(500).json({ error: 'Erro ao carregar alertas' });
  }
});

// POST /insumos
router.post('/', async (req, res) => {
  const c = clean(req.body);
  if (!c.category) return res.status(400).json({ error: 'Informe a categoria' });
  if (!c.name) return res.status(400).json({ error: 'Informe o nome do insumo' });
  if (!(c.package_qty > 0)) return res.status(400).json({ error: 'O volume/quantidade da embalagem deve ser maior que zero' });
  try {
    // O SALDO INICIAL entra pelo motor de movimento, e não como coluna
    // no insert: o primeiro número do estoque merece a mesma linha de
    // extrato que todos os outros. Insumo nasce zerado e recebe um
    // ajuste — que é exatamente o que ele é, alguém contando o que já
    // tem na prateleira.
    const saldoInicial = Math.max(Number(req.body?.current_stock) || 0, 0);
    const { data, error } = await supabase.from('INSUMOS')
      .insert({ tenant_id: req.tenantId, ...c, current_stock: 0 }).select('*, FORNECEDORES(name)').single();
    if (error) throw error;
    if (saldoInicial > 0) {
      try {
        await movimentar(req.tenantId, data.id, {
          tipo: 'ajuste', quantity: saldoInicial, notes: 'Saldo inicial do cadastro',
        }, req.user?.name || req.user?.email || null);
        data.current_stock = saldoInicial;
      } catch (e) {
        // Estoque é acessório ao cadastro: o insumo já existe e não pode
        // ser perdido porque a 092 ainda não rodou.
        console.error('[insumos/saldo-inicial]', e.message);
      }
    }
    await logPreco(req.tenantId, data, { user_name: req.user?.name || req.user?.email || null });
    audit(req, 'create', 'insumo', data.id, { name: c.name, category: c.category });
    res.status(201).json(withCost({ ...data, supplier: data.FORNECEDORES?.name || data.supplier_name || null }));
  } catch (err) {
    if (missing(err)) return migErr(res, err);
    console.error('[insumos/create]', err.message);
    res.status(500).json({ error: 'Erro ao salvar insumo' });
  }
});

// PUT /insumos/:id
router.put('/:id', async (req, res) => {
  const c = clean(req.body);
  c.updated_at = new Date().toISOString();
  try {
    // preço anterior, para só registrar histórico quando muda de fato
    const { data: antes } = await supabase.from('INSUMOS')
      .select('package_qty, package_price, current_stock').eq('id', req.params.id).eq('tenant_id', req.tenantId).maybeSingle();

    // MEXER NO SALDO PELO CADASTRO É UM AJUSTE, e vai para o extrato
    // como tal. Sem isto, editar o insumo seria o buraco por onde o
    // estoque muda sem deixar rastro — e o extrato deixaria de fechar.
    if (req.body?.current_stock !== undefined && antes) {
      const novo = Math.max(Number(req.body.current_stock) || 0, 0);
      if (novo !== (Number(antes.current_stock) || 0)) {
        try {
          await movimentar(req.tenantId, req.params.id, {
            tipo: 'ajuste', quantity: novo, notes: 'Ajuste pelo cadastro do insumo',
          }, req.user?.name || req.user?.email || null);
        } catch (e) { console.error('[insumos/ajuste]', e.message); }
      }
    }

    const { data, error } = await supabase.from('INSUMOS')
      .update(c).eq('id', req.params.id).eq('tenant_id', req.tenantId)
      .select('*, FORNECEDORES(name)').single();
    if (error) throw error;

    const mudouPreco = antes && (
      Number(antes.package_price) !== Number(data.package_price) ||
      Number(antes.package_qty) !== Number(data.package_qty));
    if (mudouPreco) {
      await logPreco(req.tenantId, data, { user_name: req.user?.name || req.user?.email || null });
    }
    audit(req, 'update', 'insumo', data.id, c);
    res.json(withCost({ ...data, supplier: data.FORNECEDORES?.name || data.supplier_name || null }));
  } catch (err) {
    if (missing(err)) return migErr(res, err);
    console.error('[insumos/update]', err.message);
    res.status(500).json({ error: 'Erro ao atualizar insumo' });
  }
});

// DELETE /insumos/:id (desativa)
router.delete('/:id', async (req, res) => {
  try {
    const { data, error } = await supabase.from('INSUMOS')
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq('id', req.params.id).eq('tenant_id', req.tenantId).select('id, name').single();
    if (error) throw error;
    audit(req, 'delete', 'insumo', data.id, { name: data.name });
    res.json({ success: true });
  } catch (err) {
    if (missing(err)) return migErr(res, err);
    console.error('[insumos/delete]', err.message);
    res.status(500).json({ error: 'Erro ao remover insumo' });
  }
});

module.exports = router;
