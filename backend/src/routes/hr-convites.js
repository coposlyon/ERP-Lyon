// ============================================================
// CONVITES DE ADMISSÃO — o lado do RH.
//
// Gerar o link, ver quem já preencheu, aprovar e recusar. O lado de
// fora (o colaborador preenchendo) é `public-admissao.js`, e as duas
// portas leem as mesmas regras de `lib/conviteAdmissao.js`.
// ============================================================
const express = require('express');
const router = express.Router();
const supabase = require('../config/supabase');
const { audit } = require('../lib/audit');
const C = require('../lib/conviteAdmissao');

const ator = req => ({
  userId: req.user?.id || null,
  userName: req.userProfile?.name || req.user?.email || null,
});

/**
 * O endereço que vai para o colaborador.
 *
 * Montado a partir do que o navegador pediu, e não de uma constante:
 * o mesmo servidor atende lyoncopos.online e o localhost do
 * desenvolvimento, e um link fixo mandaria o time de testes para
 * produção. FRONTEND_URL, quando existe, tem a palavra final.
 */
function enderecoDoConvite(req, token) {
  const base = (process.env.FRONTEND_URL || '').replace(/\/+$/, '')
    || `${req.protocol}://${req.get('host')}`;
  return `${base}/admissao/${token}`;
}

// ── Gerar ───────────────────────────────────────────────────
router.post('/', async (req, res) => {
  try {
    const { convite, horas } = await C.criar({
      tenantId: req.tenantId,
      horas: req.body?.horas,
      nome: req.body?.nome,
      email: req.body?.email,
      actor: ator(req),
    });
    audit(req, 'create', 'hr-convites', convite.id, { horas });
    res.status(201).json({
      id: convite.id,
      url: enderecoDoConvite(req, convite.token),
      expires_at: convite.expires_at,
      horas,
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Listar ──────────────────────────────────────────────────
//
// A aba Pendentes pergunta por 'enviado'; a tela de links abertos
// pergunta por 'aberto'. Sem filtro, vem tudo que ainda importa.
router.get('/', async (req, res) => {
  const status = req.query.status;
  try {
    let q = supabase.from(C.TABELA)
      .select('id, status, convidado_nome, convidado_email, expires_at, created_at, submitted_at, created_by_name, reviewed_by_name, motivo_recusa, employee_id, dados, token')
      .eq('tenant_id', req.tenantId)
      .order('created_at', { ascending: false })
      .limit(200);
    if (status) q = q.in('status', String(status).split(','));

    const { data, error } = await q;
    if (error) throw error;

    const agora = new Date();
    res.json({
      data: (data || []).map(c => ({
        ...c,
        // O token não vai inteiro para a lista: quem precisa do link
        // copia na hora de gerar. Aqui basta poder reabri-lo.
        token: undefined,
        url: c.status === 'aberto' ? enderecoDoConvite(req, c.token) : null,
        expirado: c.status === 'aberto' && new Date(c.expires_at) < agora,
        // A lista mostra o nome declarado quando já preencheram; antes
        // disso, o nome que o RH escreveu ao convidar.
        nome: c.dados?.name || c.convidado_nome || 'Sem nome ainda',
        dados: undefined,
      })),
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── A ficha que chegou, para conferir antes de aprovar ──────
router.get('/:id', async (req, res) => {
  try {
    const { data, error } = await supabase.from(C.TABELA).select('*')
      .eq('id', req.params.id).eq('tenant_id', req.tenantId).maybeSingle();
    if (error) throw error;
    if (!data) return res.status(404).json({ error: 'Convite não encontrado' });
    res.json({ ...data, token: undefined });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Aprovar → nasce o colaborador ───────────────────────────
router.post('/:id/aprovar', async (req, res) => {
  try {
    const r = await C.aprovar(req.params.id, req.tenantId, ator(req));
    if (!r.ok) return res.status(400).json({ error: r.error });
    audit(req, 'approve', 'hr-convites', req.params.id, { employee_id: r.employee_id });
    res.json(r);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Recusar → volta para o colaborador corrigir ─────────────
router.post('/:id/recusar', async (req, res) => {
  try {
    const r = await C.recusar(req.params.id, req.tenantId, req.body?.motivo, ator(req));
    if (!r.ok) return res.status(400).json({ error: r.error });
    audit(req, 'reject', 'hr-convites', req.params.id, { motivo: req.body?.motivo });
    res.json(r);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Cancelar o link ─────────────────────────────────────────
router.post('/:id/cancelar', async (req, res) => {
  try {
    const { error } = await supabase.from(C.TABELA)
      .update({ status: 'cancelado', updated_at: new Date().toISOString() })
      .eq('id', req.params.id).eq('tenant_id', req.tenantId).in('status', ['aberto', 'enviado']);
    if (error) throw error;
    audit(req, 'cancel', 'hr-convites', req.params.id, {});
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
