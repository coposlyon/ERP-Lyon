// E-mail transacional via Resend. Ativa quando RESEND_API_KEY estiver setado.
async function sendEmail({ to, subject, html, text }) {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.MAIL_FROM || 'Loja <onboarding@resend.dev>';
  if (!key) return { ok: false, error: 'E-mail não configurado (defina RESEND_API_KEY)' };
  if (!to) return { ok: false, error: 'Destinatário ausente' };
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from, to, subject, html, text }),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) return { ok: false, error: data?.message || `Resend HTTP ${res.status}` };
    return { ok: true, id: data?.id };
  } catch (err) { return { ok: false, error: err.message }; }
}

module.exports = { sendEmail };
