// WhatsApp via Meta Cloud API. Ativa com WHATSAPP_TOKEN + WHATSAPP_PHONE_ID.
// Mensagens de texto livres funcionam dentro da janela de 24h; envios
// proativos (cobrança) exigem template aprovado na Meta.
async function sendWhatsApp(to, message) {
  const token = process.env.WHATSAPP_TOKEN;
  const phoneId = process.env.WHATSAPP_PHONE_ID;
  if (!token || !phoneId) return { ok: false, error: 'WhatsApp não configurado (defina WHATSAPP_TOKEN e WHATSAPP_PHONE_ID)' };

  let num = String(to || '').replace(/\D/g, '');
  if (!num) return { ok: false, error: 'Telefone do destinatário ausente' };
  if (num.length <= 11) num = '55' + num; // assume Brasil se vier sem DDI

  try {
    const res = await fetch(`https://graph.facebook.com/v20.0/${phoneId}/messages`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ messaging_product: 'whatsapp', to: num, type: 'text', text: { preview_url: false, body: message } }),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) return { ok: false, error: data?.error?.message || `WhatsApp HTTP ${res.status}` };
    return { ok: true, id: data?.messages?.[0]?.id };
  } catch (err) { return { ok: false, error: err.message }; }
}

module.exports = { sendWhatsApp };
