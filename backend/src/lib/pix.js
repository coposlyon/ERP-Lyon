// PIX via Mercado Pago. Ativa com MP_ACCESS_TOKEN.
async function createPix({ amount, description, payerEmail, payerName, externalRef }) {
  const token = process.env.MP_ACCESS_TOKEN;
  if (!token) return { ok: false, error: 'PIX não configurado (defina MP_ACCESS_TOKEN)' };
  try {
    const res = await fetch('https://api.mercadopago.com/v1/payments', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        'X-Idempotency-Key': `pix-${externalRef || 'x'}-${Date.now()}`,
      },
      body: JSON.stringify({
        transaction_amount: Number(Number(amount).toFixed(2)),
        description: description || 'Cobrança',
        payment_method_id: 'pix',
        payer: { email: payerEmail || 'cliente@example.com', first_name: payerName || 'Cliente' },
        external_reference: externalRef || undefined,
        notification_url: process.env.MP_WEBHOOK_URL || undefined,
      }),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) return { ok: false, error: data?.message || `Mercado Pago HTTP ${res.status}` };
    const tx = data?.point_of_interaction?.transaction_data || {};
    return {
      ok: true, id: String(data.id), status: data.status,
      qr_code: tx.qr_code, qr_code_base64: tx.qr_code_base64, ticket_url: tx.ticket_url,
    };
  } catch (err) { return { ok: false, error: err.message }; }
}

async function getPayment(id) {
  const token = process.env.MP_ACCESS_TOKEN;
  if (!token) return null;
  try {
    const res = await fetch(`https://api.mercadopago.com/v1/payments/${id}`, { headers: { Authorization: `Bearer ${token}` } });
    return res.ok ? await res.json() : null;
  } catch { return null; }
}

module.exports = { createPix, getPayment };
