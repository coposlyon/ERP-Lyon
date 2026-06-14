const express  = require('express');
const router   = express.Router();
const supabase = require('../config/supabase');
const { getPayment } = require('../lib/pix');

// Webhook do Mercado Pago (público, sem auth). Quando um PIX é aprovado,
// dá baixa automática no lançamento correspondente.
router.post('/mercadopago', async (req, res) => {
  // responde rápido — o MP reenvia se não receber 200
  res.sendStatus(200);
  try {
    const paymentId = req.body?.data?.id || req.query?.['data.id'] || req.query?.id;
    const topic = req.body?.type || req.query?.topic || req.query?.type;
    if (!paymentId || (topic && topic !== 'payment')) return;

    const payment = await getPayment(paymentId);
    if (!payment || payment.status !== 'approved') return;

    const ref = payment.external_reference;
    let query = supabase.from('LANCAMENTOS').select('*');
    if (ref) query = query.eq('id', ref);
    else query = query.eq('gateway_payment_id', String(paymentId));
    const { data: lanc } = await query.maybeSingle();
    if (!lanc || lanc.status === 'paid') return;

    await supabase.from('LANCAMENTOS').update({
      paid_amount: lanc.amount,
      paid_date: new Date().toISOString().split('T')[0],
      status: 'paid',
      payment_method: 'pix',
      gateway_payment_id: String(paymentId),
    }).eq('id', lanc.id);
  } catch (err) {
    console.error('[webhook mercadopago]', err.message);
  }
});

module.exports = router;
