// WhatsApp via Meta Cloud API. Ativa com WHATSAPP_TOKEN + WHATSAPP_PHONE_ID.
// Mensagens de texto livres funcionam dentro da janela de 24h; envios
// proativos (cobrança) exigem template aprovado na Meta.

// Normaliza para o formato que a Meta espera. Número sem DDI é tratado
// como brasileiro — é de onde vêm todos os clientes da base.
function normalizarNumero(to) {
  let num = String(to || '').replace(/\D/g, '');
  if (!num) return null;
  if (num.length <= 11) num = '55' + num;
  return num;
}

async function enviar(payload) {
  const token = process.env.WHATSAPP_TOKEN;
  const phoneId = process.env.WHATSAPP_PHONE_ID;
  if (!token || !phoneId) return { ok: false, error: 'WhatsApp não configurado (defina WHATSAPP_TOKEN e WHATSAPP_PHONE_ID)' };

  try {
    const res = await fetch(`https://graph.facebook.com/v20.0/${phoneId}/messages`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ messaging_product: 'whatsapp', ...payload }),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) return { ok: false, error: data?.error?.message || `WhatsApp HTTP ${res.status}` };
    return { ok: true, id: data?.messages?.[0]?.id };
  } catch (err) { return { ok: false, error: err.message }; }
}

async function sendWhatsApp(to, message) {
  const num = normalizarNumero(to);
  if (!num) return { ok: false, error: 'Telefone do destinatário ausente' };
  return enviar({ to: num, type: 'text', text: { preview_url: false, body: message } });
}

/**
 * Arte + texto na MESMA mensagem (a legenda da imagem), que é como o
 * cliente vê no WhatsApp: uma bolha só, imagem em cima e texto embaixo.
 * Mandar em duas mensagens separadas chegaria fora de ordem com
 * frequência — e a pré-visualização do ERP mostra uma bolha só.
 *
 * A URL precisa ser pública: quem baixa a imagem é a Meta, não nós.
 */
async function sendWhatsAppImage(to, imageUrl, caption) {
  const num = normalizarNumero(to);
  if (!num) return { ok: false, error: 'Telefone do destinatário ausente' };
  if (!imageUrl) return sendWhatsApp(to, caption);
  return enviar({ to: num, type: 'image', image: { link: imageUrl, caption: caption || undefined } });
}

module.exports = { sendWhatsApp, sendWhatsAppImage, normalizarNumero };
