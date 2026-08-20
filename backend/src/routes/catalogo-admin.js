// ============================================================
// O CADASTRO QUE ALIMENTA O CATÁLOGO.
//
// Toda regra que o cliente encontra no site nasce aqui: quais famílias
// existem, o que entra em cada uma, em que medida a arte pode ser feita,
// quanto vem numa caixa do liso, que ocasiões aparecem e que artes a
// Lyon oferece.
//
// A REGRA QUE ESTE ARQUIVO EXISTE PARA CUMPRIR. Nada do catálogo pode
// morar no código. Família nova, gabarito novo, ocasião nova ou pacote
// de artes novo tem que ser cadastro — nunca deploy. É o que separa um
// sistema que a empresa opera de um sistema que depende do programador.
//
// Cinco cadastros parecidos ficam num arquivo só de propósito: todos
// respondem à mesma pergunta ("o que o catálogo oferece?") e mudam
// juntos. Espalhar em cinco rotas seria cinco lugares para esquecer o
// tenant_id.
// ============================================================
const express = require('express');
const router = express.Router();
const supabase = require('../config/supabase');
const { slugify } = require('../lib/catalogo');
const { audit } = require('../lib/audit');

function fail(res, err, onde) {
  console.error(`[catalogo-admin${onde ? ':' + onde : ''}]`, err?.message || err);
  res.status(500).json({ error: err?.message || 'Erro interno' });
}

/** Só admin e gerente mexem no que o cliente vê. */
function exigirGestao(req, res, next) {
  const papel = req.userProfile?.role;
  if (papel === 'admin' || papel === 'manager') return next();
  return res.status(403).json({ error: 'Só o Administrativo altera o catálogo.' });
}

// Leitura é liberada a quem já tem o módulo (o vendedor precisa ver o
// que está no ar); escrita passa pelo guarda acima.
router.use(['/familias', '/gabaritos', '/embalagem', '/ocasioes', '/artes'], (req, res, next) => {
  if (req.method === 'GET') return next();
  return exigirGestao(req, res, next);
});

// ── Famílias ────────────────────────────────────────────────

router.get('/familias', async (req, res) => {
  try {
    const [famRes, itensRes] = await Promise.all([
      supabase.from('CATALOGO_FAMILIAS')
        .select('id, name, slug, descricao, icone, seq, is_active')
        .eq('tenant_id', req.tenantId).order('seq'),
      supabase.from('CATALOGO_FAMILIA_ITENS')
        .select('id, familia_id, category_id, product_id, seq')
        .eq('tenant_id', req.tenantId),
    ]);
    if (famRes.error) throw famRes.error;
    if (itensRes.error) throw itensRes.error;

    const porFamilia = {};
    for (const i of itensRes.data || []) (porFamilia[i.familia_id] = porFamilia[i.familia_id] || []).push(i);

    res.json((famRes.data || []).map(f => ({ ...f, itens: porFamilia[f.id] || [] })));
  } catch (err) { fail(res, err, 'familias'); }
});

router.post('/familias', async (req, res) => {
  const { name, slug, descricao, icone, seq, is_active, categorias, produtos } = req.body || {};
  if (!String(name || '').trim()) return res.status(400).json({ error: 'Informe o nome da família.' });
  try {
    const { data, error } = await supabase.from('CATALOGO_FAMILIAS').insert({
      tenant_id: req.tenantId,
      name: String(name).trim(),
      slug: slugify(slug || name),
      descricao: descricao || null,
      icone: icone || null,
      seq: Number(seq) || 100,
      is_active: is_active !== false,
    }).select('id, name, slug').single();
    if (error) throw error;

    await gravarItens(req.tenantId, data.id, categorias, produtos);
    audit(req, 'create', 'catalogo_familia', data.id, { name: data.name, slug: data.slug });
    res.status(201).json(data);
  } catch (err) { fail(res, err, 'familias:post'); }
});

router.put('/familias/:id', async (req, res) => {
  const { name, slug, descricao, icone, seq, is_active, categorias, produtos } = req.body || {};
  try {
    const patch = { updated_at: new Date().toISOString() };
    if (name !== undefined) patch.name = String(name).trim();
    if (slug !== undefined) patch.slug = slugify(slug || name);
    if (descricao !== undefined) patch.descricao = descricao || null;
    if (icone !== undefined) patch.icone = icone || null;
    if (seq !== undefined) patch.seq = Number(seq) || 100;
    if (is_active !== undefined) patch.is_active = !!is_active;

    const { data, error } = await supabase.from('CATALOGO_FAMILIAS')
      .update(patch).eq('tenant_id', req.tenantId).eq('id', req.params.id)
      .select('id, name, slug').single();
    if (error) throw error;

    // Só reescreve os vínculos quando a tela mandou a lista. Sem isso,
    // salvar só o nome apagaria tudo que está dentro da família.
    if (categorias !== undefined || produtos !== undefined) {
      await supabase.from('CATALOGO_FAMILIA_ITENS')
        .delete().eq('tenant_id', req.tenantId).eq('familia_id', req.params.id);
      await gravarItens(req.tenantId, req.params.id, categorias, produtos);
    }

    audit(req, 'update', 'catalogo_familia', req.params.id, { campos: Object.keys(patch) });
    res.json(data);
  } catch (err) { fail(res, err, 'familias:put'); }
});

router.delete('/familias/:id', async (req, res) => {
  try {
    const { error } = await supabase.from('CATALOGO_FAMILIAS')
      .delete().eq('tenant_id', req.tenantId).eq('id', req.params.id);
    if (error) throw error;
    audit(req, 'delete', 'catalogo_familia', req.params.id, null);
    res.json({ success: true });
  } catch (err) { fail(res, err, 'familias:delete'); }
});

async function gravarItens(tenantId, familiaId, categorias, produtos) {
  const linhas = [
    ...(categorias || []).map((c, i) => ({
      tenant_id: tenantId, familia_id: familiaId, category_id: c, seq: (i + 1) * 10,
    })),
    ...(produtos || []).map((p, i) => ({
      tenant_id: tenantId, familia_id: familiaId, product_id: p, seq: (i + 1) * 10,
    })),
  ];
  if (!linhas.length) return;
  const { error } = await supabase.from('CATALOGO_FAMILIA_ITENS').insert(linhas);
  if (error) throw error;
}

// ── Nome de vitrine da categoria ────────────────────────────
// "CANECA SLIM TRADICIONAL" é o nome de dentro; "Caneca Slim" é o que o
// cliente lê. Uma coluna, não um cadastro paralelo de categoria.
router.put('/categoria/:id/nome-catalogo', exigirGestao, async (req, res) => {
  try {
    const { error } = await supabase.from('CATEGORIAS')
      .update({ nome_catalogo: String(req.body?.nome_catalogo || '').trim() || null })
      .eq('tenant_id', req.tenantId).eq('id', req.params.id);
    if (error) throw error;
    res.json({ success: true });
  } catch (err) { fail(res, err, 'nome-catalogo'); }
});

// ── Gabaritos da arte ───────────────────────────────────────

router.get('/gabaritos', async (req, res) => {
  try {
    const { data, error } = await supabase.from('CATALOGO_GABARITOS')
      .select('id, category_id, product_id, altura_mm, largura_mm, margem_mm, permite_verso, observacao')
      .eq('tenant_id', req.tenantId);
    if (error) throw error;
    res.json(data || []);
  } catch (err) { fail(res, err, 'gabaritos'); }
});

router.post('/gabaritos', async (req, res) => {
  const erro = validarAlvo(req.body);
  if (erro) return res.status(400).json({ error: erro });
  const { altura_mm, largura_mm } = req.body || {};
  if (!(Number(altura_mm) > 0) || !(Number(largura_mm) > 0)) {
    return res.status(400).json({ error: 'Informe altura e largura em milímetros.' });
  }
  try {
    const { data, error } = await supabase.from('CATALOGO_GABARITOS').insert({
      tenant_id: req.tenantId,
      category_id: req.body.category_id || null,
      product_id: req.body.product_id || null,
      altura_mm: Number(altura_mm),
      largura_mm: Number(largura_mm),
      margem_mm: Number(req.body.margem_mm) || 2,
      permite_verso: req.body.permite_verso !== false,
      observacao: req.body.observacao || null,
    }).select('id').single();
    if (error) throw error;
    res.status(201).json(data);
  } catch (err) { fail(res, err, 'gabaritos:post'); }
});

router.put('/gabaritos/:id', async (req, res) => {
  try {
    const patch = { updated_at: new Date().toISOString() };
    for (const campo of ['altura_mm', 'largura_mm', 'margem_mm']) {
      if (req.body?.[campo] !== undefined) patch[campo] = Number(req.body[campo]);
    }
    if (req.body?.permite_verso !== undefined) patch.permite_verso = !!req.body.permite_verso;
    if (req.body?.observacao !== undefined) patch.observacao = req.body.observacao || null;

    const { error } = await supabase.from('CATALOGO_GABARITOS')
      .update(patch).eq('tenant_id', req.tenantId).eq('id', req.params.id);
    if (error) throw error;
    res.json({ success: true });
  } catch (err) { fail(res, err, 'gabaritos:put'); }
});

router.delete('/gabaritos/:id', async (req, res) => {
  try {
    const { error } = await supabase.from('CATALOGO_GABARITOS')
      .delete().eq('tenant_id', req.tenantId).eq('id', req.params.id);
    if (error) throw error;
    res.json({ success: true });
  } catch (err) { fail(res, err, 'gabaritos:delete'); }
});

// ── Regra de caixa do liso ──────────────────────────────────

router.get('/embalagem', async (req, res) => {
  try {
    const { data, error } = await supabase.from('CATALOGO_EMBALAGEM')
      .select('id, category_id, product_id, caixa_qtd, max_cores_caixa, min_caixas')
      .eq('tenant_id', req.tenantId);
    if (error) throw error;
    res.json(data || []);
  } catch (err) { fail(res, err, 'embalagem'); }
});

router.post('/embalagem', async (req, res) => {
  const erro = validarAlvo(req.body);
  if (erro) return res.status(400).json({ error: erro });
  try {
    const { data, error } = await supabase.from('CATALOGO_EMBALAGEM').insert({
      tenant_id: req.tenantId,
      category_id: req.body.category_id || null,
      product_id: req.body.product_id || null,
      caixa_qtd: Math.max(1, Number(req.body.caixa_qtd) || 100),
      max_cores_caixa: Math.max(1, Number(req.body.max_cores_caixa) || 4),
      min_caixas: Math.max(1, Number(req.body.min_caixas) || 1),
    }).select('id').single();
    if (error) throw error;
    res.status(201).json(data);
  } catch (err) { fail(res, err, 'embalagem:post'); }
});

router.put('/embalagem/:id', async (req, res) => {
  try {
    const patch = { updated_at: new Date().toISOString() };
    for (const campo of ['caixa_qtd', 'max_cores_caixa', 'min_caixas']) {
      if (req.body?.[campo] !== undefined) patch[campo] = Math.max(1, Number(req.body[campo]) || 1);
    }
    const { error } = await supabase.from('CATALOGO_EMBALAGEM')
      .update(patch).eq('tenant_id', req.tenantId).eq('id', req.params.id);
    if (error) throw error;
    res.json({ success: true });
  } catch (err) { fail(res, err, 'embalagem:put'); }
});

router.delete('/embalagem/:id', async (req, res) => {
  try {
    const { error } = await supabase.from('CATALOGO_EMBALAGEM')
      .delete().eq('tenant_id', req.tenantId).eq('id', req.params.id);
    if (error) throw error;
    res.json({ success: true });
  } catch (err) { fail(res, err, 'embalagem:delete'); }
});

/** Categoria OU produto — nunca os dois, nunca nenhum. */
function validarAlvo(corpo) {
  const temCat = !!corpo?.category_id, temProd = !!corpo?.product_id;
  if (temCat && temProd) return 'Escolha categoria OU produto, não os dois.';
  if (!temCat && !temProd) return 'Escolha a categoria ou o produto a que a regra se aplica.';
  return null;
}

// ── Ocasiões do evento ──────────────────────────────────────

router.get('/ocasioes', async (req, res) => {
  try {
    const { data, error } = await supabase.from('CATALOGO_OCASIOES')
      .select('id, name, slug, icone, seq, destaque, is_active')
      .eq('tenant_id', req.tenantId).order('seq');
    if (error) throw error;
    res.json(data || []);
  } catch (err) { fail(res, err, 'ocasioes'); }
});

router.post('/ocasioes', async (req, res) => {
  const { name } = req.body || {};
  if (!String(name || '').trim()) return res.status(400).json({ error: 'Informe o nome da ocasião.' });
  try {
    const { data, error } = await supabase.from('CATALOGO_OCASIOES').insert({
      tenant_id: req.tenantId,
      name: String(name).trim(),
      slug: slugify(req.body.slug || name),
      icone: req.body.icone || null,
      seq: Number(req.body.seq) || 100,
      destaque: !!req.body.destaque,
      is_active: req.body.is_active !== false,
    }).select('id, name, slug').single();
    if (error) throw error;
    res.status(201).json(data);
  } catch (err) { fail(res, err, 'ocasioes:post'); }
});

router.put('/ocasioes/:id', async (req, res) => {
  try {
    const patch = {};
    if (req.body?.name !== undefined) patch.name = String(req.body.name).trim();
    if (req.body?.slug !== undefined) patch.slug = slugify(req.body.slug || req.body.name);
    if (req.body?.icone !== undefined) patch.icone = req.body.icone || null;
    if (req.body?.seq !== undefined) patch.seq = Number(req.body.seq) || 100;
    if (req.body?.destaque !== undefined) patch.destaque = !!req.body.destaque;
    if (req.body?.is_active !== undefined) patch.is_active = !!req.body.is_active;

    const { error } = await supabase.from('CATALOGO_OCASIOES')
      .update(patch).eq('tenant_id', req.tenantId).eq('id', req.params.id);
    if (error) throw error;
    res.json({ success: true });
  } catch (err) { fail(res, err, 'ocasioes:put'); }
});

router.delete('/ocasioes/:id', async (req, res) => {
  try {
    const { error } = await supabase.from('CATALOGO_OCASIOES')
      .delete().eq('tenant_id', req.tenantId).eq('id', req.params.id);
    if (error) throw error;
    res.json({ success: true });
  } catch (err) { fail(res, err, 'ocasioes:delete'); }
});

// ── Banco de artes ──────────────────────────────────────────

router.get('/artes', async (req, res) => {
  try {
    let q = supabase.from('CATALOGO_ARTES')
      .select('id, codigo, name, ocasiao_id, thumb_url, elementos, fontes, familias, seq, is_active')
      .eq('tenant_id', req.tenantId).order('seq').limit(500);
    if (req.query.ocasiao) q = q.eq('ocasiao_id', req.query.ocasiao);
    const { data, error } = await q;
    if (error) throw error;
    res.json(data || []);
  } catch (err) { fail(res, err, 'artes'); }
});

router.get('/artes/:id', async (req, res) => {
  try {
    const { data, error } = await supabase.from('CATALOGO_ARTES')
      .select('*').eq('tenant_id', req.tenantId).eq('id', req.params.id).maybeSingle();
    if (error) throw error;
    if (!data) return res.status(404).json({ error: 'Arte não encontrada' });
    res.json(data);
  } catch (err) { fail(res, err, 'artes:get'); }
});

router.post('/artes', async (req, res) => {
  const { codigo, name } = req.body || {};
  if (!String(codigo || '').trim() || !String(name || '').trim()) {
    return res.status(400).json({ error: 'Informe o código e o nome da arte.' });
  }
  try {
    const { data, error } = await supabase.from('CATALOGO_ARTES').insert({
      tenant_id: req.tenantId,
      codigo: String(codigo).trim().toUpperCase(),
      name: String(name).trim(),
      ocasiao_id: req.body.ocasiao_id || null,
      svg: req.body.svg || null,
      thumb_url: req.body.thumb_url || null,
      elementos: Array.isArray(req.body.elementos) ? req.body.elementos : [],
      fontes: Array.isArray(req.body.fontes) ? req.body.fontes : [],
      familias: Array.isArray(req.body.familias) ? req.body.familias : [],
      seq: Number(req.body.seq) || 100,
      is_active: req.body.is_active !== false,
    }).select('id, codigo, name').single();
    if (error) throw error;
    res.status(201).json(data);
  } catch (err) { fail(res, err, 'artes:post'); }
});

router.put('/artes/:id', async (req, res) => {
  try {
    const patch = { updated_at: new Date().toISOString() };
    if (req.body?.codigo !== undefined) patch.codigo = String(req.body.codigo).trim().toUpperCase();
    if (req.body?.name !== undefined) patch.name = String(req.body.name).trim();
    if (req.body?.ocasiao_id !== undefined) patch.ocasiao_id = req.body.ocasiao_id || null;
    if (req.body?.svg !== undefined) patch.svg = req.body.svg || null;
    if (req.body?.thumb_url !== undefined) patch.thumb_url = req.body.thumb_url || null;
    for (const campo of ['elementos', 'fontes', 'familias']) {
      if (req.body?.[campo] !== undefined) {
        patch[campo] = Array.isArray(req.body[campo]) ? req.body[campo] : [];
      }
    }
    if (req.body?.seq !== undefined) patch.seq = Number(req.body.seq) || 100;
    if (req.body?.is_active !== undefined) patch.is_active = !!req.body.is_active;

    const { error } = await supabase.from('CATALOGO_ARTES')
      .update(patch).eq('tenant_id', req.tenantId).eq('id', req.params.id);
    if (error) throw error;
    res.json({ success: true });
  } catch (err) { fail(res, err, 'artes:put'); }
});

router.delete('/artes/:id', async (req, res) => {
  try {
    const { error } = await supabase.from('CATALOGO_ARTES')
      .delete().eq('tenant_id', req.tenantId).eq('id', req.params.id);
    if (error) throw error;
    res.json({ success: true });
  } catch (err) { fail(res, err, 'artes:delete'); }
});

module.exports = router;
