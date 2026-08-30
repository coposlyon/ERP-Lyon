// ============================================================
// Cliente da Groq — o assistente do sistema.
//
// A API é compatível com a da OpenAI (/openai/v1/chat/completions),
// então o formato das mensagens é o de lá, não o da Anthropic. O
// `lib/ai.js` (Claude) continua existindo e cuidando do que já usava
// ele: OCR de comprovante, sugestão de design, análise de previsão.
// Aqui é só o copiloto que responde dúvidas sobre o sistema.
//
// OS MODELOS, CONFERIDOS CONTRA A CHAVE EM 30/08/2026.
//
// A conta não tem Llama 4, que é o modelo de visão que a documentação
// da Groq mais cita. Dos catorze modelos que a chave alcança, só a
// família Qwen3 aceita imagem — e isso foi testado, não suposto:
//
//   openai/gpt-oss-120b   recusa: "messages[0].content must be a string"
//   groq/compound         recusa: a mesma coisa
//   qwen/qwen3.6-27b      LÊ imagem, mas vaza o raciocínio <think> na resposta
//   qwen/qwen3.8-27b      LÊ imagem e responde limpo  ← escolhido
//
// Por isso UM modelo só para texto e imagem: o 3.8. Trocar de modelo
// conforme a pergunta tenha ou não print faria o assistente responder
// com duas personalidades diferentes para o mesmo usuário.
//
// Dá para trocar por env sem mexer no código (GROQ_MODEL). Se um dia a
// conta ganhar Llama 4, é só apontar.
// ============================================================

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';

// Print de tela é imagem grande. O limite protege a requisição de
// estourar antes de sair daqui, com uma mensagem que diz o que fazer.
const MAX_IMAGEM_MB = 4;

/**
 * Pergunta para a Groq.
 *
 * @param system     instrução de sistema
 * @param mensagens  [{ role, content }] no formato da OpenAI. `content`
 *                   pode ser string ou o array multimodal com imagem.
 * @returns { ok, text } ou { ok: false, error }
 */
async function askGroq({ system, mensagens, max_tokens = 1200, model, temperature = 0.3 }) {
  const key = process.env.GROQ_API_KEY;
  if (!key) return { ok: false, error: 'Assistente não configurado (defina GROQ_API_KEY no servidor).' };

  const msgs = system ? [{ role: 'system', content: system }, ...mensagens] : mensagens;

  try {
    const res = await fetch(GROQ_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: model || process.env.GROQ_MODEL || 'qwen/qwen3.8-27b',
        max_tokens, temperature, messages: msgs,
      }),
      signal: AbortSignal.timeout(60000),
    });

    const data = await res.json().catch(() => null);
    if (!res.ok) {
      const msg = data?.error?.message || `Groq HTTP ${res.status}`;
      // O erro cru da Groq é em inglês e fala de "messages[0].content".
      // Quem lê é o vendedor, no meio do trabalho.
      if (/rate limit/i.test(msg)) return { ok: false, error: 'O assistente está sobrecarregado agora. Tente de novo em alguns segundos.' };
      if (/image/i.test(msg))      return { ok: false, error: 'Não consegui ler essa imagem. Tente um print em PNG ou JPG.' };
      return { ok: false, error: msg };
    }

    let text = String(data?.choices?.[0]?.message?.content || '').trim();
    // Rede de segurança: se um modelo pensativo for configurado por env,
    // o bloco de raciocínio não vai para a tela do usuário.
    text = text.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
    return { ok: true, text };
  } catch (err) {
    if (err.name === 'TimeoutError') return { ok: false, error: 'O assistente demorou demais para responder. Tente de novo.' };
    return { ok: false, error: err.message };
  }
}

/**
 * Monta o conteúdo de uma mensagem do usuário, com print ou sem.
 * `imagem` é uma data URL vinda do navegador (colar ou anexar).
 */
function conteudoDoUsuario(texto, imagem) {
  if (!imagem) return texto;

  const m = /^data:(image\/(png|jpe?g|webp|gif));base64,([A-Za-z0-9+/=]+)$/.exec(String(imagem).trim());
  if (!m) return texto;  // não é imagem reconhecível: segue só com o texto

  const bytes = Math.ceil(m[3].length * 0.75);
  if (bytes > MAX_IMAGEM_MB * 1024 * 1024) {
    return `${texto}\n\n(o usuário tentou anexar um print de ${(bytes / 1024 / 1024).toFixed(1)} MB, acima do limite de ${MAX_IMAGEM_MB} MB — peça um print menor ou um recorte da parte que importa)`;
  }

  return [
    { type: 'text', text: texto },
    { type: 'image_url', image_url: { url: imagem } },
  ];
}

module.exports = { askGroq, conteudoDoUsuario, MAX_IMAGEM_MB };
