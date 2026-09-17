// ============================================================
// LOGÍSTICA → CAIXAS E FRETE
//
// O cadastro que a Lyon vai ajustar ao longo do ano: as caixas físicas,
// a regra de cada produto (caixa padrão, unidades, caixa menor) e as
// regras gerais de cobrança. Mais o simulador, que é como se confere um
// ajuste antes de ele valer para o cliente.
//
// Ler é de quem usa logística; mudar é de gerente ou administrador —
// cada número aqui muda o frete de todo pedido, no site e no ERP.
// ============================================================
const express = require('express');
const router = express.Router();
const supabase = require('../config/supabase');
const { audit } = require('../lib/audit');
const L = require('../lib/logisticaCaixas');

const podeEditar = req => ['admin', 'manager'].includes(req.userProfile?.role);
function barrar(req, res) {
  if (podeEditar(req)) return false;
  res.status(403).json({ error: 'Só gerente ou administrador altera as regras de caixa e frete.' });
  return true;
}
const numero = v => (v === '' || v === null || v === undefined ? null : Number(v));
const texto = v => (v === null || v === undefined ? null : String(v).trim() || null);

// ── tudo o que a tela precisa ───────────────────────────────
router.get('/', async (req, res) => {
  try {
    const [emp, caixas, regras, cats, prods] = await Promise.all([
      supabase.from('EMPRESAS').select('settings').eq('id', req.tenantId).maybeSingle(),
      supabase.from('LOGISTICA_CAIXAS').select('*').eq('tenant_id', req.tenantId).order('nome'),
      supabase.from('LOGISTICA_REGRAS').select('*').eq('tenant_id', req.tenantId),
      supabase.from('CATEGORIAS').select('id, name').eq('tenant_id', req.tenantId).order('name'),
      supabase.from('PRODUTOS').select('category_id, name').eq('tenant_id', req.tenantId).eq('is_active', true),
    ]);
    if (caixas.error || regras.error) return res.json({ migracao_pendente: true });

    // As categorias com produto, e os tamanhos que existem em cada uma.
    const porCategoria = new Map();
    for (const p of prods.data || []) {
      if (!p.category_id) continue;
      if (!porCategoria.has(p.category_id)) porCategoria.set(p.category_id, { produtos: 0, capacidades: new Set() });
      const c = porCategoria.get(p.category_id);
      c.produtos++;
      const cap = L.capacidadeDoNome(p.name);
      if (cap) c.capacidades.add(cap);
    }
    const categorias = (cats.data || [])
      .filter(c => porCategoria.has(c.id))
      .map(c => ({ id: c.id, name: c.name, produtos: porCategoria.get(c.id).produtos,
        capacidades: [...porCategoria.get(c.id).capacidades].sort((a, b) => a - b) }));

    res.json({
      config: L.configLogistica(emp.data?.settings),
      tex_enabled: !!emp.data?.settings?.frete?.tex_enabled,
      pode_editar: podeEditar(req),
      caixas: caixas.data || [],
      regras: regras.data || [],
      categorias,
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── regras gerais ───────────────────────────────────────────
router.put('/config', async (req, res) => {
  if (barrar(req, res)) return;
  try {
    const { data: emp, error: e1 } = await supabase.from('EMPRESAS').select('settings').eq('id', req.tenantId).single();
    if (e1) throw e1;
    const settings = emp.settings || {};
    const b = req.body || {};
    const logistica = {
      ...(settings.logistica || {}),
      ...(b.acrescimo_pct !== undefined ? { acrescimo_pct: Math.max(0, Number(b.acrescimo_pct) || 0) } : {}),
      ...(b.ocupacao_limite_pct !== undefined ? { ocupacao_limite_pct: Math.min(100, Math.max(0, Number(b.ocupacao_limite_pct) || 0)) } : {}),
      ...(b.cobrar_caixa !== undefined ? { cobrar_caixa: !!b.cobrar_caixa } : {}),
      ...(b.unidades_padrao !== undefined ? { unidades_padrao: Math.max(1, Math.floor(Number(b.unidades_padrao) || 0)) } : {}),
    };
    const frete = { ...(settings.frete || {}), ...(b.tex_enabled !== undefined ? { tex_enabled: !!b.tex_enabled } : {}) };
    const { error } = await supabase.from('EMPRESAS')
      .update({ settings: { ...settings, logistica, frete } }).eq('id', req.tenantId);
    if (error) throw error;
    audit(req, 'update', 'logistica-config', req.tenantId, { logistica, tex_enabled: frete.tex_enabled });
    res.json({ config: L.configLogistica({ logistica }), tex_enabled: !!frete.tex_enabled });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── caixas ──────────────────────────────────────────────────
function camposCaixa(b) {
  return {
    nome: texto(b.nome),
    largura_cm: numero(b.largura_cm),
    altura_cm: numero(b.altura_cm),
    comprimento_cm: numero(b.comprimento_cm),
    peso_cheia_kg: numero(b.peso_cheia_kg),
    valor: numero(b.valor) ?? 0,
    ativo: b.ativo !== false,
    observacao: texto(b.observacao),
  };
}
function validarCaixa(c) {
  if (!c.nome) return 'Dê um nome à caixa.';
  if (!(c.largura_cm > 0 && c.altura_cm > 0 && c.comprimento_cm > 0)) return 'Informe largura, altura e comprimento em centímetros.';
  if (c.peso_cheia_kg !== null && !(c.peso_cheia_kg > 0)) return 'O peso da caixa cheia precisa ser maior que zero.';
  return null;
}
const erroDuplicado = e => (/duplicate|unique/i.test(e?.message || '') ? 'Já existe um cadastro igual.' : null);

router.post('/caixas', async (req, res) => {
  if (barrar(req, res)) return;
  const c = camposCaixa(req.body || {});
  const invalido = validarCaixa(c);
  if (invalido) return res.status(400).json({ error: invalido });
  try {
    const { data, error } = await supabase.from('LOGISTICA_CAIXAS').insert({ ...c, tenant_id: req.tenantId }).select().single();
    if (error) return res.status(erroDuplicado(error) ? 409 : 500).json({ error: erroDuplicado(error) || error.message });
    audit(req, 'create', 'logistica-caixa', data.id, { nome: data.nome });
    res.status(201).json(data);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/caixas/:id', async (req, res) => {
  if (barrar(req, res)) return;
  const c = camposCaixa(req.body || {});
  const invalido = validarCaixa(c);
  if (invalido) return res.status(400).json({ error: invalido });
  try {
    const { data, error } = await supabase.from('LOGISTICA_CAIXAS')
      .update({ ...c, updated_at: new Date().toISOString() })
      .eq('id', req.params.id).eq('tenant_id', req.tenantId).select().single();
    if (error) return res.status(erroDuplicado(error) ? 409 : 500).json({ error: erroDuplicado(error) || error.message });
    audit(req, 'update', 'logistica-caixa', data.id, c);
    res.json(data);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/caixas/:id', async (req, res) => {
  if (barrar(req, res)) return;
  try {
    const { error } = await supabase.from('LOGISTICA_CAIXAS').delete().eq('id', req.params.id).eq('tenant_id', req.tenantId);
    if (error) throw error;
    audit(req, 'delete', 'logistica-caixa', req.params.id, null);
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── regras por produto ──────────────────────────────────────
function camposRegra(b) {
  return {
    category_id: b.category_id || null,
    capacidade_ml: numero(b.capacidade_ml),
    caixa_id: b.caixa_id || null,
    unidades_por_caixa: numero(b.unidades_por_caixa),
    caixa_pequena_id: b.caixa_pequena_id || null,
    unidades_caixa_pequena: numero(b.unidades_caixa_pequena),
    ativo: b.ativo !== false,
    observacao: texto(b.observacao),
  };
}
function validarRegra(r) {
  if (!r.category_id) return 'Escolha a categoria.';
  if (r.unidades_por_caixa !== null && !(r.unidades_por_caixa > 0)) return 'Unidades por caixa precisa ser maior que zero.';
  if (r.caixa_pequena_id && !(r.unidades_caixa_pequena > 0)) return 'Diga até quantas unidades vão na caixa menor.';
  return null;
}

router.post('/regras', async (req, res) => {
  if (barrar(req, res)) return;
  const r = camposRegra(req.body || {});
  const invalido = validarRegra(r);
  if (invalido) return res.status(400).json({ error: invalido });
  try {
    const { data, error } = await supabase.from('LOGISTICA_REGRAS').insert({ ...r, tenant_id: req.tenantId }).select().single();
    if (error) return res.status(erroDuplicado(error) ? 409 : 500).json({ error: erroDuplicado(error) ? 'Já existe regra para essa categoria e tamanho.' : error.message });
    audit(req, 'create', 'logistica-regra', data.id, r);
    res.status(201).json(data);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/regras/:id', async (req, res) => {
  if (barrar(req, res)) return;
  const r = camposRegra(req.body || {});
  const invalido = validarRegra(r);
  if (invalido) return res.status(400).json({ error: invalido });
  try {
    const { data, error } = await supabase.from('LOGISTICA_REGRAS')
      .update({ ...r, updated_at: new Date().toISOString() })
      .eq('id', req.params.id).eq('tenant_id', req.tenantId).select().single();
    if (error) return res.status(erroDuplicado(error) ? 409 : 500).json({ error: erroDuplicado(error) ? 'Já existe regra para essa categoria e tamanho.' : error.message });
    audit(req, 'update', 'logistica-regra', data.id, r);
    res.json(data);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/regras/:id', async (req, res) => {
  if (barrar(req, res)) return;
  try {
    const { error } = await supabase.from('LOGISTICA_REGRAS').delete().eq('id', req.params.id).eq('tenant_id', req.tenantId);
    if (error) throw error;
    audit(req, 'delete', 'logistica-regra', req.params.id, null);
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── simulador ───────────────────────────────────────────────
//
// Um produto de verdade daquela categoria e tamanho, na quantidade
// pedida, passando pela MESMA conta do site e do pedido. A Total Express
// entra mesmo desligada: é justamente antes de ligar que se simula.
router.post('/simular', async (req, res) => {
  const { category_id, capacidade_ml, quantidade, cep, valor_nota } = req.body || {};
  if (!category_id || !(Number(quantidade) > 0)) {
    return res.status(400).json({ error: 'Escolha a categoria e a quantidade.' });
  }
  try {
    const { data: prods } = await supabase.from('PRODUTOS').select('id, name')
      .eq('tenant_id', req.tenantId).eq('category_id', category_id).eq('is_active', true);
    const produto = (prods || []).find(p => !capacidade_ml || L.capacidadeDoNome(p.name) === Number(capacidade_ml));
    if (!produto) return res.status(404).json({ error: 'Nenhum produto ativo nessa categoria e tamanho.' });

    const itens = [{ product_id: produto.id, quantity: Number(quantidade) }];
    const envio = await L.medirComCaixas(req.tenantId, itens);

    let frete = null;
    const cepLimpo = String(cep || '').replace(/\D/g, '');
    if (cepLimpo.length === 8) {
      const { cotar, ufFromCep } = require('../lib/shipping');
      frete = await cotar(req.tenantId, {
        uf: ufFromCep(cepLimpo), cep: cepLimpo, itens,
        subtotal: Number(valor_nota) || 0, valor_nota: Number(valor_nota) || 0,
        forcar_total_express: true,
      });
    }
    res.json({ produto: produto.name, envio, frete });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
