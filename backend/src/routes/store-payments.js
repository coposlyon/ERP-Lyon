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
/**
 * Os dados do cliente, buscados à parte.
 *
 * Antes isto era um embed do PostgREST — `CLIENTES(id, name, ...)`
 * dentro do select. Não existe chave estrangeira declarada entre
 * PEDIDOS_LOJA e CLIENTES, então o PostgREST recusava a consulta
 * INTEIRA com 'Could not find a relationship', e a fila de pagamentos
 * respondia 500. O pedido estava no banco o tempo todo; era a tela que
 * não conseguia listá-lo.
 *
 * Uma segunda consulta também é mais honesta com o dado: o pedido
 * guarda um retrato do cliente em `customer` (nome e telefone do
 * momento da compra), e visitante sem cadastro tem customer_id nulo.
 */
async function clientesDe(tenantId, pedidos) {
  const ids = [...new Set(pedidos.map(p => p.customer_id).filter(Boolean))];
  if (!ids.length) return {};
  const { data } = await supabase.from('CLIENTES')
    .select('id, name, phone, email, display_id').eq('tenant_id', tenantId).in('id', ids);
  return Object.fromEntries((data || []).map(c => [c.id, c]));
}

/** O pedido pronto para a tela: cliente resolvido e vencimento marcado. */
function paraTela(p, porId) {
  return {
    ...p,
    CLIENTES: porId[p.customer_id] || null,
    // O retrato do momento da compra vale quando não há cadastro.
    cliente_nome: porId[p.customer_id]?.name || p.customer?.name || 'Cliente do site',
    cliente_fone: porId[p.customer_id]?.phone || p.customer?.phone || null,
    expirado: vencido(p),
    // Quem avisou que pagou vai na frente da fila.
    avisou_pagamento: !!p.paid_notified_at,
  };
}

const vencido = p => p.status === 'aguardando_pagamento'
  && p.expires_at && new Date(p.expires_at) < new Date();

router.get('/', async (req, res) => {
  const status = STATUS.includes(req.query.status) ? req.query.status : 'aguardando_pagamento';
  const limit = Math.min(Math.max(parseInt(req.query.limit) || 50, 1), 200);
  try {
    const { data, error, count } = await supabase
      .from('PEDIDOS_LOJA')
      .select('*', { count: 'exact' })
      .eq('tenant_id', req.tenantId)
      .eq('status', status)
      .order('created_at', { ascending: false })
      .limit(limit);
    if (error) throw error;

    const porId = await clientesDe(req.tenantId, data || []);
    const linhas = (data || []).map(p => paraTela(p, porId));
    // Quem avisou que pagou primeiro — é quem está esperando resposta.
    linhas.sort((a, b) => (b.avisou_pagamento ? 1 : 0) - (a.avisou_pagamento ? 1 : 0));

    res.json({
      data: linhas,
      total: count ?? linhas.length,
      aguardando_conferencia: linhas.filter(l => l.avisou_pagamento).length,
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
      .select('*')
      .eq('tenant_id', req.tenantId).eq('id', req.params.id).maybeSingle();
    if (error) throw error;
    if (!data) return res.status(404).json({ error: 'Pedido não encontrado' });
    const porId = await clientesDe(req.tenantId, [data]);
    res.json(paraTela(data, porId));
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
