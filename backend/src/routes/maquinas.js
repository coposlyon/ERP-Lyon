// ============================================================
// ENGENHARIA DE CUSTOS — MAQUINÁRIOS E COMPUTADORES/TI
//
// Uma rota só para os dois grupos (`grupo=maquinario|ti`): o que muda
// é o nome na tela e se a aba de produção aparece. As contas moram em
// lib/maquinas.js.
//
// Ordem das rotas importa: /pecas e /proximo-codigo vêm antes de /:id.
// ============================================================
const express = require('express');
const router = express.Router();
const supabase = require('../config/supabase');
const { audit } = require('../lib/audit');
const M = require('../lib/maquinas');

const GRUPOS = ['maquinario', 'ti'];
const STATUS = ['operacao', 'manutencao', 'inativa'];
const TIPOS_EVENTO = ['cadastro', 'revisao', 'manutencao', 'troca_peca', 'parada', 'retomada', 'marco', 'status', 'reserva', 'alteracao'];
const STATUS_EVENTO = ['concluido', 'pendente', 'agendado', 'cancelado'];
const PERIODICIDADES = Object.keys(M.DIAS_DA_PERIODICIDADE);

const n = v => {
  if (v === '' || v == null) return null;
  const x = typeof v === 'string' ? Number(v.replace(/\./g, '').replace(',', '.')) : Number(v);
  return Number.isFinite(x) ? x : null;
};
const txt = (v, max = 200) => (v == null || String(v).trim() === '' ? null : String(v).trim().slice(0, max));
const data = v => (/^\d{4}-\d{2}-\d{2}$/.test(String(v || '')) ? String(v) : null);
const erro = (res, err, ctx) => {
  console.error(`[maquinas/${ctx}]`, err.message);
  if (/duplicate key|23505/.test(err.message || '')) return res.status(409).json({ error: 'Já existe um cadastro com este código.' });
  if (/relation .*MAQUINA.* does not exist|42P01/.test(err.message || '')) return res.status(503).json({ error: 'Migração 123 (maquinários) ainda não aplicada.' });
  return res.status(500).json({ error: err.message || 'Erro inesperado' });
};

// ── Campos do cadastro ─────────────────────────────────────
const CAMPOS_TEXTO = ['nome', 'tipo', 'setor', 'fabricante', 'modelo', 'numero_serie', 'fornecedor_nome', 'fornecedor_telefone', 'fornecedor_email', 'localizacao', 'responsavel', 'nota_fiscal', 'observacoes'];
const CAMPOS_NUM = ['valor_aquisicao', 'valor_residual', 'vida_util_anos', 'vida_util_unidades', 'meta_reposicao', 'valor_venda_estimado',
  'reserva_reposicao', 'capacidade_hora', 'producao_inicial', 'horas_iniciais', 'intervalo_revisao_unidades', 'producao_ultima_revisao'];
const CAMPOS_NUM_OBRIGATORIOS = ['valor_aquisicao', 'valor_residual', 'vida_util_anos', 'meta_reposicao', 'valor_venda_estimado', 'reserva_reposicao', 'producao_inicial', 'horas_iniciais'];
const CAMPOS_DATA = ['data_aquisicao', 'garantia_ate', 'ultima_revisao', 'proxima_revisao'];

function corpoMaquina(b = {}, parcial = false) {
  const out = {};
  const tem = k => !parcial || b[k] !== undefined;
  if (tem('codigo') && b.codigo !== undefined) out.codigo = txt(b.codigo, 20)?.toUpperCase();
  for (const k of CAMPOS_TEXTO) if (tem(k) && b[k] !== undefined) out[k] = txt(b[k], k === 'observacoes' ? 4000 : 120);
  for (const k of CAMPOS_NUM) if (tem(k) && b[k] !== undefined) {
    const v = n(b[k]);
    out[k] = v == null && CAMPOS_NUM_OBRIGATORIOS.includes(k) ? 0 : v;
  }
  for (const k of CAMPOS_DATA) if (tem(k) && b[k] !== undefined) out[k] = data(b[k]);
  if (b.grupo !== undefined && GRUPOS.includes(b.grupo)) out.grupo = b.grupo;
  if (b.status !== undefined && STATUS.includes(b.status)) out.status = b.status;
  if (b.supplier_id !== undefined) out.supplier_id = b.supplier_id || null;
  if (b.entra_no_rateio !== undefined) out.entra_no_rateio = !!b.entra_no_rateio;
  if (out.vida_util_anos != null && out.vida_util_anos <= 0) out.vida_util_anos = 1;
  return out;
}

// ════════════════════════════════════════════════════════════
// PEÇAS E COMPONENTES
// ════════════════════════════════════════════════════════════
const CAMPOS_PECA_TXT = ['nome', 'categoria', 'fabricante', 'fornecedor_nome', 'fornecedor_telefone', 'observacao'];
const CAMPOS_PECA_NUM = ['valor_unitario', 'estoque', 'estoque_minimo', 'vida_util_meses'];

function corpoPeca(b = {}) {
  const out = {};
  if (b.codigo !== undefined) out.codigo = txt(b.codigo, 20)?.toUpperCase();
  for (const k of CAMPOS_PECA_TXT) if (b[k] !== undefined) out[k] = txt(b[k], k === 'observacao' ? 2000 : 120);
  for (const k of CAMPOS_PECA_NUM) if (b[k] !== undefined) out[k] = n(b[k]) ?? (k === 'vida_util_meses' ? null : 0);
  for (const k of ['ultima_troca', 'proxima_troca']) if (b[k] !== undefined) out[k] = data(b[k]);
  if (b.supplier_id !== undefined) out.supplier_id = b.supplier_id || null;
  if (b.maquinas !== undefined) out.maquinas = (Array.isArray(b.maquinas) ? b.maquinas : []).filter(Boolean);
  if (b.ativo !== undefined) out.ativo = !!b.ativo;
  // Última troca + vida útil = próxima troca, quando não veio digitada.
  if (out.ultima_troca && out.vida_util_meses && b.proxima_troca === undefined) {
    const d = new Date(`${out.ultima_troca}T12:00:00Z`);
    d.setUTCMonth(d.getUTCMonth() + Number(out.vida_util_meses));
    out.proxima_troca = d.toISOString().slice(0, 10);
  }
  return out;
}

const statusPeca = p => {
  const hoje = M.hojeISO();
  if (Number(p.estoque) <= 0) return 'sem_estoque';
  if (Number(p.estoque) <= Number(p.estoque_minimo)) return 'estoque_baixo';
  if (p.proxima_troca && p.proxima_troca < hoje) return 'troca_vencida';
  return 'em_estoque';
};

router.get('/pecas', async (req, res) => {
  try {
    let q = supabase.from('MAQUINA_PECAS').select('*').eq('tenant_id', req.tenantId).order('codigo');
    if (req.query.maquina_id) q = q.contains('maquinas', [req.query.maquina_id]);
    const { data: rows, error } = await q;
    if (error) throw error;
    res.json((rows || []).map(p => ({ ...p, situacao: statusPeca(p) })));
  } catch (err) { erro(res, err, 'pecas'); }
});

router.get('/pecas/proximo-codigo', async (req, res) => {
  try {
    const { data: rows } = await supabase.from('MAQUINA_PECAS').select('codigo').eq('tenant_id', req.tenantId);
    const maior = (rows || []).reduce((mx, r) => Math.max(mx, parseInt(String(r.codigo).replace(/\D/g, ''), 10) || 0), 0);
    res.json({ codigo: `PC${String(maior + 1).padStart(3, '0')}` });
  } catch (err) { erro(res, err, 'pecas/codigo'); }
});

router.post('/pecas', async (req, res) => {
  const corpo = corpoPeca(req.body);
  if (!corpo.codigo || !corpo.nome) return res.status(400).json({ error: 'Informe o código e o nome da peça.' });
  try {
    const { data: row, error } = await supabase.from('MAQUINA_PECAS')
      .insert({ ...corpo, tenant_id: req.tenantId }).select().single();
    if (error) throw error;
    audit(req, 'create', 'maquina_peca', row.id, { codigo: row.codigo, nome: row.nome });
    res.status(201).json(row);
  } catch (err) { erro(res, err, 'pecas/criar'); }
});

router.put('/pecas/:id', async (req, res) => {
  try {
    const { data: row, error } = await supabase.from('MAQUINA_PECAS')
      .update({ ...corpoPeca(req.body), updated_at: new Date().toISOString() })
      .eq('id', req.params.id).eq('tenant_id', req.tenantId).select().single();
    if (error) throw error;
    audit(req, 'update', 'maquina_peca', row.id, { codigo: row.codigo });
    res.json(row);
  } catch (err) { erro(res, err, 'pecas/editar'); }
});

router.delete('/pecas/:id', async (req, res) => {
  try {
    const { error } = await supabase.from('MAQUINA_PECAS').delete().eq('id', req.params.id).eq('tenant_id', req.tenantId);
    if (error) throw error;
    audit(req, 'delete', 'maquina_peca', req.params.id, {});
    res.json({ ok: true });
  } catch (err) { erro(res, err, 'pecas/excluir'); }
});

/**
 * TROCAR A PEÇA: sai do estoque, a data da troca anda, e o custo entra
 * no histórico da máquina — que é de onde sai o "peças trocadas" da
 * depreciação e a manutenção mensal do rateio.
 */
router.post('/pecas/:id/trocar', async (req, res) => {
  const { maquina_id, observacao, responsavel } = req.body || {};
  const quantidade = Math.max(1, Math.round(n(req.body?.quantidade) || 1));
  const quando = data(req.body?.data) || M.hojeISO();
  if (!maquina_id) return res.status(400).json({ error: 'Escolha a máquina em que a peça foi trocada.' });
  try {
    const { data: peca, error } = await supabase.from('MAQUINA_PECAS').select('*')
      .eq('id', req.params.id).eq('tenant_id', req.tenantId).single();
    if (error || !peca) return res.status(404).json({ error: 'Peça não encontrada' });
    if (Number(peca.estoque) < quantidade && !req.body?.forcar) {
      return res.status(409).json({ error: `Só há ${peca.estoque} em estoque.`, precisa_confirmar: true });
    }
    let proxima = peca.proxima_troca;
    if (peca.vida_util_meses) {
      const d = new Date(`${quando}T12:00:00Z`);
      d.setUTCMonth(d.getUTCMonth() + Number(peca.vida_util_meses));
      proxima = d.toISOString().slice(0, 10);
    }
    const maquinas = (peca.maquinas || []).includes(maquina_id) ? peca.maquinas : [...(peca.maquinas || []), maquina_id];
    const { data: atual, error: e2 } = await supabase.from('MAQUINA_PECAS').update({
      estoque: Math.max(0, Number(peca.estoque) - quantidade), ultima_troca: quando, proxima_troca: proxima,
      maquinas, updated_at: new Date().toISOString(),
    }).eq('id', peca.id).select().single();
    if (e2) throw e2;
    await M.registrarEvento(req, maquina_id, {
      data: quando, tipo: 'troca_peca', peca_id: peca.id, responsavel,
      fornecedor: peca.fornecedor_nome, custo: Number(peca.valor_unitario) * quantidade,
      descricao: `Troca de ${quantidade}× ${peca.codigo} ${peca.nome}${observacao ? ` — ${observacao}` : ''}`,
      detalhes: { quantidade, valor_unitario: peca.valor_unitario },
    });
    audit(req, 'update', 'maquina_peca', peca.id, { troca: quantidade, maquina_id });
    res.json({ ...atual, situacao: statusPeca(atual) });
  } catch (err) { erro(res, err, 'pecas/trocar'); }
});

// ════════════════════════════════════════════════════════════
// MÁQUINAS
// ════════════════════════════════════════════════════════════
router.get('/', async (req, res) => {
  const grupo = GRUPOS.includes(req.query.grupo) ? req.query.grupo : 'maquinario';
  try {
    const lista = await M.carregarComCalculo(req.tenantId, { grupo });
    const total = lista.length;
    const conta = s => lista.filter(m => m.status === s).length;
    res.json({
      itens: lista,
      resumo: {
        total, operacao: conta('operacao'), manutencao: conta('manutencao'), inativas: conta('inativa'),
        custo_mensal: Math.round(lista.filter(m => m.entra_no_rateio !== false).reduce((s, m) => s + m.calc.custo_mensal, 0) * 100) / 100,
        depreciacao_mensal: Math.round(lista.reduce((s, m) => s + (m.status !== 'inativa' ? m.calc.depreciacao_do_mes : 0), 0) * 100) / 100,
        manutencao_mensal: Math.round(lista.reduce((s, m) => s + (m.status !== 'inativa' ? m.calc.manutencao_mensal : 0), 0) * 100) / 100,
        valor_patrimonio: Math.round(lista.reduce((s, m) => s + (Number(m.valor_aquisicao) || 0), 0) * 100) / 100,
        valor_contabil: Math.round(lista.reduce((s, m) => s + m.calc.valor_contabil, 0) * 100) / 100,
        com_alerta: lista.filter(m => m.calc.alertas.some(a => a.nivel === 'erro')).length,
      },
    });
  } catch (err) { erro(res, err, 'listar'); }
});

router.get('/proximo-codigo', async (req, res) => {
  try {
    res.json({ codigo: await M.proximoCodigo(req.tenantId, req.query.grupo === 'ti' ? 'ti' : 'maquinario') });
  } catch (err) { erro(res, err, 'codigo'); }
});

router.get('/:id', async (req, res) => {
  try {
    const [maq] = await M.carregarComCalculo(req.tenantId, { id: req.params.id });
    if (!maq) return res.status(404).json({ error: 'Máquina não encontrada' });
    const [prod, chk, ev] = await Promise.all([
      supabase.from('MAQUINA_PRODUCOES').select('*').eq('maquina_id', maq.id).eq('tenant_id', req.tenantId)
        .order('data', { ascending: false }).order('created_at', { ascending: false }).limit(500),
      supabase.from('MAQUINA_MANUTENCOES').select('*').eq('maquina_id', maq.id).eq('tenant_id', req.tenantId)
        .order('proxima_execucao', { ascending: true, nullsFirst: false }),
      supabase.from('MAQUINA_EVENTOS').select('*').eq('maquina_id', maq.id).eq('tenant_id', req.tenantId)
        .order('data', { ascending: false }).order('created_at', { ascending: false }).limit(1000),
    ]);
    for (const r of [prod, chk, ev]) if (r.error) throw r.error;
    const hoje = M.hojeISO();
    res.json({
      ...maq,
      producoes: prod.data || [],
      checklist: (chk.data || []).map(c => ({ ...c, situacao: c.ativo === false ? 'inativo' : M.situacaoDaData(c.proxima_execucao, hoje) })),
      eventos: ev.data || [],
    });
  } catch (err) { erro(res, err, 'detalhe'); }
});

router.post('/', async (req, res) => {
  const corpo = corpoMaquina(req.body);
  corpo.grupo = GRUPOS.includes(req.body?.grupo) ? req.body.grupo : 'maquinario';
  if (!corpo.nome) return res.status(400).json({ error: 'Informe o nome da máquina.' });
  try {
    if (!corpo.codigo) corpo.codigo = await M.proximoCodigo(req.tenantId, corpo.grupo);
    const { data: row, error } = await supabase.from('MAQUINAS').insert({ ...corpo, tenant_id: req.tenantId }).select().single();
    if (error) throw error;
    await M.registrarEvento(req, row.id, {
      tipo: 'cadastro', data: M.hojeISO(), custo: 0,
      descricao: `${corpo.grupo === 'ti' ? 'Equipamento' : 'Máquina'} cadastrad${corpo.grupo === 'ti' ? 'o' : 'a'} no sistema`,
    });
    audit(req, 'create', 'maquina', row.id, { codigo: row.codigo, nome: row.nome });
    res.status(201).json(row);
  } catch (err) { erro(res, err, 'criar'); }
});

router.put('/:id', async (req, res) => {
  try {
    const { data: antes, error: e0 } = await supabase.from('MAQUINAS').select('*').eq('id', req.params.id).eq('tenant_id', req.tenantId).single();
    if (e0 || !antes) return res.status(404).json({ error: 'Máquina não encontrada' });
    const corpo = corpoMaquina(req.body, true);
    delete corpo.grupo;
    if (corpo.nome === null) return res.status(400).json({ error: 'O nome não pode ficar vazio.' });
    if (corpo.codigo === null) delete corpo.codigo;
    const { data: row, error } = await supabase.from('MAQUINAS')
      .update({ ...corpo, updated_at: new Date().toISOString() })
      .eq('id', antes.id).eq('tenant_id', req.tenantId).select().single();
    if (error) throw error;

    // O que importa para o custo fica no histórico: status, valores e vida útil.
    if (corpo.status && corpo.status !== antes.status) {
      const rotulo = { operacao: 'Em operação', manutencao: 'Em manutenção', inativa: 'Inativa' };
      await M.registrarEvento(req, antes.id, { tipo: 'status', descricao: `Status: ${rotulo[antes.status]} → ${rotulo[corpo.status]}` });
    }
    const mudou = ['valor_aquisicao', 'valor_residual', 'vida_util_anos', 'vida_util_unidades', 'meta_reposicao']
      .filter(k => corpo[k] !== undefined && Number(corpo[k] ?? 0) !== Number(antes[k] ?? 0));
    if (mudou.length) {
      await M.registrarEvento(req, antes.id, {
        tipo: 'alteracao',
        descricao: `Alterado: ${mudou.map(k => `${k.replace(/_/g, ' ')} ${antes[k] ?? '—'} → ${corpo[k] ?? '—'}`).join('; ')}`,
      });
    }
    audit(req, 'update', 'maquina', row.id, { campos: Object.keys(corpo) });
    res.json(row);
  } catch (err) { erro(res, err, 'editar'); }
});

router.delete('/:id', async (req, res) => {
  try {
    const { data: row } = await supabase.from('MAQUINAS').select('codigo, nome').eq('id', req.params.id).eq('tenant_id', req.tenantId).maybeSingle();
    if (!row) return res.status(404).json({ error: 'Máquina não encontrada' });
    const { error } = await supabase.from('MAQUINAS').delete().eq('id', req.params.id).eq('tenant_id', req.tenantId);
    if (error) throw error;
    // Peças deixam de apontar para ela.
    const { data: pecas } = await supabase.from('MAQUINA_PECAS').select('id, maquinas').eq('tenant_id', req.tenantId).contains('maquinas', [req.params.id]);
    for (const p of pecas || []) {
      await supabase.from('MAQUINA_PECAS').update({ maquinas: p.maquinas.filter(x => x !== req.params.id) }).eq('id', p.id);
    }
    audit(req, 'delete', 'maquina', req.params.id, row);
    res.json({ ok: true });
  } catch (err) { erro(res, err, 'excluir'); }
});

// ── Produção ───────────────────────────────────────────────
router.post('/:id/producoes', async (req, res) => {
  const b = req.body || {};
  const quantidade = n(b.quantidade);
  if (!(quantidade > 0)) return res.status(400).json({ error: 'Informe a quantidade produzida.' });
  try {
    const { data: row, error } = await supabase.from('MAQUINA_PRODUCOES').insert({
      tenant_id: req.tenantId, maquina_id: req.params.id,
      data: data(b.data) || M.hojeISO(), produto: txt(b.produto, 160), product_id: b.product_id || null,
      quantidade, perdas: n(b.perdas) || 0, horas: n(b.horas) || 0,
      operador: txt(b.operador, 80), observacao: txt(b.observacao, 1000), origem: 'manual',
    }).select().single();
    if (error) throw error;
    await marcoDeProducao(req, req.params.id);
    res.status(201).json(row);
  } catch (err) { erro(res, err, 'producao'); }
});

router.delete('/:id/producoes/:pid', async (req, res) => {
  try {
    const { error } = await supabase.from('MAQUINA_PRODUCOES').delete()
      .eq('id', req.params.pid).eq('maquina_id', req.params.id).eq('tenant_id', req.tenantId);
    if (error) throw error;
    res.json({ ok: true });
  } catch (err) { erro(res, err, 'producao/excluir'); }
});

/** A cada 100 mil unidades acumuladas, um marco no histórico. */
async function marcoDeProducao(req, maquinaId) {
  try {
    const [maq] = await M.carregarComCalculo(req.tenantId, { id: maquinaId });
    if (!maq) return;
    const acumulada = maq.calc.producao_acumulada;
    const marco = Math.floor(acumulada / 100000) * 100000;
    if (marco <= 0) return;
    const { data: ja } = await supabase.from('MAQUINA_EVENTOS').select('id')
      .eq('maquina_id', maquinaId).eq('tipo', 'marco').eq('producao_impactada', marco).maybeSingle();
    if (ja) return;
    await M.registrarEvento(req, maquinaId, {
      tipo: 'marco', responsavel: 'Sistema', producao_impactada: marco,
      descricao: `Atingiu ${marco.toLocaleString('pt-BR')} unidades produzidas`,
    });
  } catch { /* marco é informativo */ }
}

// ── Revisão (o formulário da aba Manutenção) ───────────────
router.post('/:id/revisoes', async (req, res) => {
  const b = req.body || {};
  const quando = data(b.ultima_revisao) || M.hojeISO();
  const status = STATUS_EVENTO.includes(b.status) ? b.status : 'concluido';
  try {
    const [maq] = await M.carregarComCalculo(req.tenantId, { id: req.params.id });
    if (!maq) return res.status(404).json({ error: 'Máquina não encontrada' });
    const periodicidade = PERIODICIDADES.includes(b.periodicidade) ? b.periodicidade : 'mensal';
    const proxima = data(b.proxima_revisao) || M.proximaData(quando, periodicidade);

    const ev = await M.registrarEvento(req, maq.id, {
      data: quando, tipo: 'revisao', status, responsavel: txt(b.responsavel, 80), fornecedor: txt(b.fornecedor, 120),
      custo: status === 'concluido' ? (n(b.custo_realizado) ?? 0) : 0,
      horas_parada: n(b.horas_parada), producao_impactada: n(b.producao_impactada),
      descricao: `Revisão ${b.tipo || 'preventiva'}${b.observacao ? ` — ${txt(b.observacao, 500)}` : ''}`,
      detalhes: { tipo: b.tipo || 'preventiva', periodicidade, custo_previsto: n(b.custo_previsto) ?? 0, proxima_revisao: proxima },
    });

    if (status === 'concluido') {
      const patch = { ultima_revisao: quando, proxima_revisao: proxima, updated_at: new Date().toISOString() };
      if (b.intervalo_revisao_unidades !== undefined) patch.intervalo_revisao_unidades = n(b.intervalo_revisao_unidades);
      patch.producao_ultima_revisao = maq.calc.producao_acumulada;
      if (maq.status === 'manutencao' && b.voltar_operacao !== false) patch.status = 'operacao';
      await supabase.from('MAQUINAS').update(patch).eq('id', maq.id);
    } else {
      await supabase.from('MAQUINAS').update({ proxima_revisao: proxima, updated_at: new Date().toISOString() }).eq('id', maq.id);
    }
    audit(req, 'update', 'maquina', maq.id, { revisao: status, custo: ev.custo });
    res.status(201).json(ev);
  } catch (err) { erro(res, err, 'revisao'); }
});

// ── Checklist de manutenção ────────────────────────────────
function corpoChecklist(b = {}) {
  const out = {};
  if (b.item !== undefined) out.item = txt(b.item, 120);
  if (b.tipo !== undefined) out.tipo = ['preventiva', 'preditiva', 'corretiva'].includes(b.tipo) ? b.tipo : 'preventiva';
  if (b.periodicidade !== undefined) out.periodicidade = PERIODICIDADES.includes(b.periodicidade) ? b.periodicidade : 'mensal';
  if (b.ultima_execucao !== undefined) out.ultima_execucao = data(b.ultima_execucao);
  if (b.proxima_execucao !== undefined) out.proxima_execucao = data(b.proxima_execucao);
  if (b.responsavel !== undefined) out.responsavel = txt(b.responsavel, 80);
  if (b.custo_previsto !== undefined) out.custo_previsto = n(b.custo_previsto) || 0;
  if (b.observacao !== undefined) out.observacao = txt(b.observacao, 1000);
  if (b.ativo !== undefined) out.ativo = !!b.ativo;
  if (!out.proxima_execucao && out.periodicidade && b.proxima_execucao === undefined) {
    out.proxima_execucao = M.proximaData(out.ultima_execucao, out.periodicidade);
  }
  return out;
}

router.post('/:id/manutencoes', async (req, res) => {
  const corpo = corpoChecklist({ periodicidade: 'mensal', ...req.body });
  if (!corpo.item) return res.status(400).json({ error: 'Descreva o item do checklist.' });
  try {
    const { data: row, error } = await supabase.from('MAQUINA_MANUTENCOES')
      .insert({ ...corpo, tenant_id: req.tenantId, maquina_id: req.params.id }).select().single();
    if (error) throw error;
    res.status(201).json(row);
  } catch (err) { erro(res, err, 'checklist/criar'); }
});

router.put('/:id/manutencoes/:mid', async (req, res) => {
  try {
    const { data: row, error } = await supabase.from('MAQUINA_MANUTENCOES')
      .update({ ...corpoChecklist(req.body), updated_at: new Date().toISOString() })
      .eq('id', req.params.mid).eq('maquina_id', req.params.id).eq('tenant_id', req.tenantId).select().single();
    if (error) throw error;
    res.json(row);
  } catch (err) { erro(res, err, 'checklist/editar'); }
});

router.delete('/:id/manutencoes/:mid', async (req, res) => {
  try {
    const { error } = await supabase.from('MAQUINA_MANUTENCOES').delete()
      .eq('id', req.params.mid).eq('maquina_id', req.params.id).eq('tenant_id', req.tenantId);
    if (error) throw error;
    res.json({ ok: true });
  } catch (err) { erro(res, err, 'checklist/excluir'); }
});

router.post('/:id/manutencoes/:mid/executar', async (req, res) => {
  const b = req.body || {};
  const quando = data(b.data) || M.hojeISO();
  try {
    const { data: item, error } = await supabase.from('MAQUINA_MANUTENCOES').select('*')
      .eq('id', req.params.mid).eq('maquina_id', req.params.id).eq('tenant_id', req.tenantId).single();
    if (error || !item) return res.status(404).json({ error: 'Item não encontrado' });
    const proxima = M.proximaData(quando, item.periodicidade);
    const { data: row, error: e2 } = await supabase.from('MAQUINA_MANUTENCOES')
      .update({ ultima_execucao: quando, proxima_execucao: proxima, updated_at: new Date().toISOString() })
      .eq('id', item.id).select().single();
    if (e2) throw e2;
    await M.registrarEvento(req, req.params.id, {
      data: quando, tipo: 'manutencao', manutencao_id: item.id,
      responsavel: txt(b.responsavel, 80) || item.responsavel,
      custo: n(b.custo) ?? Number(item.custo_previsto) ?? 0,
      horas_parada: n(b.horas_parada),
      descricao: `${item.item} (${item.periodicidade})${b.observacao ? ` — ${txt(b.observacao, 500)}` : ''}`,
    });
    res.json(row);
  } catch (err) { erro(res, err, 'checklist/executar'); }
});

// ── Eventos avulsos: parada, retomada, reserva, anotação ───
router.post('/:id/eventos', async (req, res) => {
  const b = req.body || {};
  const tipo = TIPOS_EVENTO.includes(b.tipo) ? b.tipo : null;
  if (!tipo) return res.status(400).json({ error: 'Tipo de evento inválido.' });
  try {
    const { data: maq } = await supabase.from('MAQUINAS').select('id, status, reserva_reposicao')
      .eq('id', req.params.id).eq('tenant_id', req.tenantId).maybeSingle();
    if (!maq) return res.status(404).json({ error: 'Máquina não encontrada' });
    const ev = await M.registrarEvento(req, maq.id, {
      data: data(b.data) || M.hojeISO(), tipo, descricao: txt(b.descricao, 1000),
      responsavel: txt(b.responsavel, 80), fornecedor: txt(b.fornecedor, 120),
      custo: n(b.custo) || 0, horas_parada: n(b.horas_parada), producao_impactada: n(b.producao_impactada),
      status: STATUS_EVENTO.includes(b.status) ? b.status : 'concluido',
    });
    const patch = {};
    if (tipo === 'parada' && maq.status === 'operacao') patch.status = 'manutencao';
    if (tipo === 'retomada' && maq.status === 'manutencao') patch.status = 'operacao';
    if (tipo === 'reserva') patch.reserva_reposicao = Math.max(0, (Number(maq.reserva_reposicao) || 0) + (n(b.valor) || 0));
    if (Object.keys(patch).length) await supabase.from('MAQUINAS').update({ ...patch, updated_at: new Date().toISOString() }).eq('id', maq.id);
    res.status(201).json(ev);
  } catch (err) { erro(res, err, 'evento'); }
});

router.put('/:id/eventos/:eid', async (req, res) => {
  const b = req.body || {};
  const patch = {};
  if (b.descricao !== undefined) patch.descricao = txt(b.descricao, 1000);
  if (b.custo !== undefined) patch.custo = n(b.custo) || 0;
  if (b.status !== undefined && STATUS_EVENTO.includes(b.status)) patch.status = b.status;
  if (b.data !== undefined && data(b.data)) patch.data = data(b.data);
  if (b.responsavel !== undefined) patch.responsavel = txt(b.responsavel, 80);
  try {
    const { data: row, error } = await supabase.from('MAQUINA_EVENTOS').update(patch)
      .eq('id', req.params.eid).eq('maquina_id', req.params.id).eq('tenant_id', req.tenantId).select().single();
    if (error) throw error;
    res.json(row);
  } catch (err) { erro(res, err, 'evento/editar'); }
});

router.delete('/:id/eventos/:eid', async (req, res) => {
  try {
    const { error } = await supabase.from('MAQUINA_EVENTOS').delete()
      .eq('id', req.params.eid).eq('maquina_id', req.params.id).eq('tenant_id', req.tenantId).neq('tipo', 'cadastro');
    if (error) throw error;
    audit(req, 'delete', 'maquina_evento', req.params.eid, {});
    res.json({ ok: true });
  } catch (err) { erro(res, err, 'evento/excluir'); }
});

module.exports = router;
