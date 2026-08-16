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

    // Baixa pelo valor realmente pago no gateway — pagamento menor que o
    // lançamento vira 'partial' em vez de quitar a dívida inteira.
    const paidAmount = Number(payment.transaction_amount) > 0
      ? Number(payment.transaction_amount)
      : Number(lanc.amount) || 0;
    const fullyPaid = paidAmount >= (Number(lanc.amount) || 0);
    if (!fullyPaid) {
      console.warn(`[webhook mercadopago] pagamento ${paymentId} (R$ ${paidAmount}) menor que o lançamento ${lanc.id} (R$ ${lanc.amount})`);
    }
    await supabase.from('LANCAMENTOS').update({
      paid_amount: paidAmount,
      paid_date: new Date().toISOString().split('T')[0],
      status: fullyPaid ? 'paid' : 'partial',
      payment_method: 'pix',
      gateway_payment_id: String(paymentId),
    }).eq('id', lanc.id);
  } catch (err) {
    console.error('[webhook mercadopago]', err.message);
  }
});

// ============================================================
// Webhook do WhatsApp (Meta Cloud API) — fecha o ciclo da oferta.
//
// Sem ele, o ERP sabe o que saiu e não sabe o que voltou: a campanha
// vira disparo cego uma hora depois do disparo. Dois tipos de evento
// interessam:
//
//   statuses  entregue / lido — casam pelo id da mensagem que a Meta
//             devolveu no envio (provider_message_id)
//   messages  a resposta do cliente — chega só com o telefone, então
//             cai no envio mais recente daquele número
//
// Configure no painel da Meta apontando para /api/webhooks/whatsapp,
// com WHATSAPP_VERIFY_TOKEN como token de verificação.
// ============================================================

// Handshake de verificação da Meta (GET com hub.challenge)
router.get('/whatsapp', (req, res) => {
  const token = process.env.WHATSAPP_VERIFY_TOKEN;
  if (token && req.query['hub.verify_token'] === token) {
    return res.status(200).send(String(req.query['hub.challenge'] || ''));
  }
  res.sendStatus(403);
});

// Uma resposta só faz sentido perto do envio. Fora dessa janela é outra
// conversa, e grudá-la numa campanha antiga seria inventar histórico.
const JANELA_RESPOSTA_DIAS = 30;

router.post('/whatsapp', async (req, res) => {
  // responde rápido — a Meta reenvia se não receber 200
  res.sendStatus(200);
  try {
    const entradas = req.body?.entry || [];
    for (const entrada of entradas) {
      for (const ch of (entrada.changes || [])) {
        const valor = ch.value || {};

        // ── entregue / lido ──
        for (const st of (valor.statuses || [])) {
          const patch = st.status === 'read'      ? { status: 'read',      read_at: new Date().toISOString() }
                      : st.status === 'delivered' ? { status: 'delivered', delivered_at: new Date().toISOString() }
                      : st.status === 'failed'    ? { status: 'failed',    error: st.errors?.[0]?.title || 'falha na entrega' }
                      : null;
          if (!patch || !st.id) continue;
          await supabase.from('OFERTAS_ENVIOS').update(patch).eq('provider_message_id', st.id);
        }

        // ── resposta do cliente ──
        for (const msg of (valor.messages || [])) {
          const de = String(msg.from || '').replace(/\D/g, '');
          if (!de) continue;

          const texto = msg.text?.body
            || msg.button?.text
            || msg.interactive?.button_reply?.title
            || msg.interactive?.list_reply?.title
            || `[${msg.type || 'mensagem'}]`;

          const desde = new Date(Date.now() - JANELA_RESPOSTA_DIAS * 86400000).toISOString();

          // O envio mais recente para este número dentro da janela. O
          // tenant sai da própria linha — o número é a única chave que
          // a Meta manda de volta.
          const { data: envio } = await supabase.from('OFERTAS_ENVIOS')
            .select('id, reply_text')
            .eq('phone_digits', de)
            .gte('created_at', desde)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();
          if (!envio) continue;

          // Cliente que manda três mensagens seguidas não apaga as
          // anteriores: a conversa fica inteira, em ordem.
          const acumulado = envio.reply_text ? `${envio.reply_text}\n${texto}` : texto;
          await supabase.from('OFERTAS_ENVIOS').update({
            status: 'replied',
            replied_at: new Date().toISOString(),
            reply_text: acumulado.slice(0, 4000),
          }).eq('id', envio.id);
        }
      }
    }
  } catch (err) {
    console.error('[webhook whatsapp]', err.message);
  }
});

module.exports = router;
