// Aprovações de cadastro — fila dos pedidos vindos dos links públicos.
// Somente administradores (montado com requireRole(['admin']) no index).
const express = require('express');
const router = express.Router();
const supabase = require('../config/supabase');
const { audit } = require('../lib/audit');
const { ENTIDADES, aplicarSolicitacao, apagarAnexos } = require('../lib/cadastroSolicitacoes');

const STATUS = ['pendente', 'aprovada', 'rejeitada'];

// GET /api/cadastro-requests?status=pendente&entity=cliente
router.get('/', async (req, res) => {
  const { status = 'pendente', entity } = req.query;
  try {
    let q = supabase.from('CADASTRO_SOLICITACOES').select('*', { count: 'exact' })
      .eq('tenant_id', req.tenantId)
      .order('created_at', { ascending: false })
      .limit(200);
    if (status && status !== 'todas') q = q.eq('status', status);
    if (entity) q = q.eq('entity', entity);

    const { data, error, count } = await q;
    if (error) throw error;
    res.json({ data: data || [], total: count || 0 });
  } catch (err) {
    // Tabela ainda não criada (migration 062 pendente) → lista vazia em vez de 500
    if (/CADASTRO_SOLICITACOES/i.test(err.message || '')) return res.json({ data: [], total: 0, missing: true });
    res.status(500).json({ error: err.message });
  }
});

// GET /api/cadastro-requests/count — badge de pendentes
router.get('/count', async (req, res) => {
  try {
    const { count, error } = await supabase.from('CADASTRO_SOLICITACOES')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', req.tenantId).eq('status', 'pendente');
    if (error) throw error;
    res.json({ pendentes: count || 0 });
  } catch {
    res.json({ pendentes: 0 });
  }
});

async function carregar(req) {
  const { data, error } = await supabase.from('CADASTRO_SOLICITACOES').select('*')
    .eq('id', req.params.id).eq('tenant_id', req.tenantId).maybeSingle();
  if (error) throw error;
  return data;
}

// POST /api/cadastro-requests/:id/approve — grava os dados no cadastro
router.post('/:id/approve', async (req, res) => {
  try {
    const sol = await carregar(req);
    if (!sol) return res.status(404).json({ error: 'Solicitação não encontrada' });
    if (sol.status !== 'pendente') return res.status(409).json({ error: `Esta solicitação já foi ${sol.status}.` });

    const aplicado = await aplicarSolicitacao(sol);

    await supabase.from('CADASTRO_SOLICITACOES').update({
      status: 'aprovada',
      reviewed_by: req.user?.id || null,
      reviewed_by_name: req.userProfile?.name || req.user?.email || null,
      reviewed_at: new Date().toISOString(),
      review_note: String(req.body?.note || '').trim() || null,
    }).eq('id', sol.id).eq('tenant_id', req.tenantId);

    audit(req, 'approve', `cadastro_${sol.entity}`, sol.entity_id, {
      solicitacao: sol.id, changes: sol.changes, anexos: (sol.attachments || []).length,
    });
    res.json({ success: true, applied: Object.keys(aplicado || {}) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/cadastro-requests/:id/reject — descarta o pedido e os anexos
router.post('/:id/reject', async (req, res) => {
  try {
    const sol = await carregar(req);
    if (!sol) return res.status(404).json({ error: 'Solicitação não encontrada' });
    if (sol.status !== 'pendente') return res.status(409).json({ error: `Esta solicitação já foi ${sol.status}.` });

    await apagarAnexos(sol);
    await supabase.from('CADASTRO_SOLICITACOES').update({
      status: 'rejeitada',
      attachments: [],
      reviewed_by: req.user?.id || null,
      reviewed_by_name: req.userProfile?.name || req.user?.email || null,
      reviewed_at: new Date().toISOString(),
      review_note: String(req.body?.note || '').trim() || null,
    }).eq('id', sol.id).eq('tenant_id', req.tenantId);

    audit(req, 'reject', `cadastro_${sol.entity}`, sol.entity_id, {
      solicitacao: sol.id, motivo: req.body?.note || null,
    });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
module.exports.STATUS = STATUS;
module.exports.ENTIDADES = ENTIDADES;
