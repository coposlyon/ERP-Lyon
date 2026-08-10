/**
 * Pagamentos da Loja — fila dos pedidos do site que aguardam o PIX.
 *
 * O dinheiro cai direto na chave PIX da empresa (Nubank), e o banco não
 * avisa o sistema. Então quem confere o extrato é uma pessoa: confirmou
 * aqui, o pedido vira VENDA e entra em Comercial → Pedidos de Venda,
 * junto com o recebimento no Financeiro.
 */

const express  = require('express');
const router   = express.Router();
const supabase = require('../config/supabase');
const { audit } = require('../lib/audit');
const { criarVendaDoPedido, registrarRecebimento } = require('../lib/pedidoLoja');

const STATUS = ['aguardando_pagamento', 'pago', 'expirado', 'cancelado'];

// Pedido vencido continua na fila (ninguém apaga venda potencial), mas
// aparece marcado para quem estiver conferindo.
const vencido = p => p.status === 'aguardando_pagamento'
  && p.expires_at && new Date(p.expires_at) < new Date();

router.get('/', async (req, res) => {
  const status = STATUS.includes(req.query.status) ? req.query.status : 'aguardando_pagamento';
  const limit = Math.min(Math.max(parseInt(req.query.limit) || 50, 1), 200);
  try {
    const { data, error, count } = await supabase
      .from('PEDIDOS_LOJA')
      .select('*, CLIENTES(id, name, phone, email, display_id)', { count: 'exact' })
      .eq('tenant_id', req.tenantId)
      .eq('status', status)
      .order('created_at', { ascending: false })
      .limit(limit);
    if (error) throw error;
    res.json({
      data: (data || []).map(p => ({ ...p, expirado: vencido(p) })),
      total: count ?? (data || []).length,
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Quantos estão esperando conferência — para o badge do menu.
router.get('/pendentes/count', async (req, res) => {
  try {
    const { count } = await supabase
      .from('PEDIDOS_LOJA').select('id', { count: 'exact', head: true })
      .eq('tenant_id', req.tenantId).eq('status', 'aguardando_pagamento');
    res.json({ count: count || 0 });
  } catch { res.json({ count: 0 }); }
});

router.get('/:id', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('PEDIDOS_LOJA')
      .select('*, CLIENTES(id, name, phone, email, display_id)')
      .eq('tenant_id', req.tenantId).eq('id', req.params.id).maybeSingle();
    if (error) throw error;
    if (!data) return res.status(404).json({ error: 'Pedido não encontrado' });
    res.json({ ...data, expirado: vencido(data) });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Confirmar o pagamento → libera o pedido para o Comercial ──
router.post('/:id/confirmar', async (req, res) => {
  try {
    const { data: ped } = await supabase.from('PEDIDOS_LOJA').select('*')
      .eq('tenant_id', req.tenantId).eq('id', req.params.id).maybeSingle();
    if (!ped) return res.status(404).json({ error: 'Pedido não encontrado' });
    if (ped.status === 'pago') return res.status(409).json({ error: 'Este pedido já foi confirmado', sale_id: ped.sale_id });
    if (ped.status !== 'aguardando_pagamento') return res.status(409).json({ error: `Pedido ${ped.status}` });

    const actor = { userId: req.user?.id || null, userName: req.userProfile?.name || null };
    const sale = await criarVendaDoPedido(ped, actor);
    const lanc = await registrarRecebimento(ped, sale, actor);

    const { error: upErr } = await supabase.from('PEDIDOS_LOJA').update({
      status: 'pago',
      sale_id: sale.id,
      confirmed_at: new Date().toISOString(),
      confirmed_by: actor.userId,
      confirmed_by_name: actor.userName || req.user?.email || null,
    }).eq('id', ped.id).eq('tenant_id', req.tenantId);
    if (upErr) throw upErr;

    audit(req, 'confirm', 'store-payments', ped.id, { sale_id: sale.id, total: ped.total });
    res.json({
      ok: true, sale_id: sale.id, number: sale.number,
      // o pedido está liberado mesmo se o lançamento falhar; avisa a tela
      lancamento: lanc.ok ? 'criado' : 'falhou',
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Cancelar (não pagou, desistiu, pagamento não localizado) ──
router.post('/:id/cancelar', async (req, res) => {
  const reason = String(req.body?.reason || '').trim() || null;
  try {
    const { data: ped } = await supabase.from('PEDIDOS_LOJA').select('id, status')
      .eq('tenant_id', req.tenantId).eq('id', req.params.id).maybeSingle();
    if (!ped) return res.status(404).json({ error: 'Pedido não encontrado' });
    if (ped.status === 'pago') return res.status(409).json({ error: 'Pedido já confirmado — cancele pela venda' });

    await supabase.from('PEDIDOS_LOJA')
      .update({ status: 'cancelado', canceled_reason: reason })
      .eq('id', ped.id).eq('tenant_id', req.tenantId);
    audit(req, 'cancel', 'store-payments', ped.id, { reason });
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
