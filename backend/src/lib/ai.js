// Cliente da API da Claude (Anthropic). Ativa com ANTHROPIC_API_KEY.
// Modelo configurável via ANTHROPIC_MODEL (padrão: claude-sonnet-4-6).
async function askClaude({ system, prompt, messages, max_tokens = 1024, model }) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return { ok: false, error: 'IA não configurada (defina ANTHROPIC_API_KEY)' };
  const msgs = messages || [{ role: 'user', content: prompt }];
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: model || process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-6',
        max_tokens,
        system,
        messages: msgs,
      }),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) return { ok: false, error: data?.error?.message || `Anthropic HTTP ${res.status}` };
    const text = (data?.content || []).filter(c => c.type === 'text').map(c => c.text).join('\n').trim();
    return { ok: true, text };
  } catch (err) { return { ok: false, error: err.message }; }
}

// Extrai o primeiro objeto JSON de um texto (a IA às vezes embrulha em prosa)
function extractJSON(text) {
  try { return JSON.parse(text); } catch {}
  const m = String(text || '').match(/\{[\s\S]*\}/);
  if (m) { try { return JSON.parse(m[0]); } catch {} }
  return null;
}

module.exports = { askClaude, extractJSON };
