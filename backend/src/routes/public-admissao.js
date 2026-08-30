// ============================================================
// A FICHA DE ADMISSÃO PELO LINK — sem login.
//
// Quem chega aqui não tem conta e não vai ter: é alguém sendo
// contratado, preenchendo a própria ficha do celular. A credencial é o
// token no endereço, e ele tem prazo (migração 096).
//
// O QUE ESTA ROTA NÃO FAZ, DE PROPÓSITO:
//
//   - não cria colaborador. O que chega fica em quarentena até o RH
//     aprovar. Rota anônima que escreve na lista usada pela folha, pelo
//     ponto e pelo eSocial seria uma porta grande demais.
//   - não aceita arquivo. Upload anônimo é convite para encher o
//     Storage; documento entra depois, pelo RH ou pelo portal do
//     colaborador, onde se sabe quem enviou.
//   - não devolve nada de outro convite, nem lista. Só o próprio.
//
// O limitador de taxa é o mesmo do cadastro público: o token é secreto,
// mas nada impede alguém de tentar adivinhar em série.
// ============================================================
const express = require('express');
const router = express.Router();
const rateLimit = require('express-rate-limit');
const C = require('../lib/conviteAdmissao');

const limitador = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 60,
  message: { error: 'Muitas tentativas. Aguarde alguns minutos.' },
});

// ── O link é válido? ────────────────────────────────────────
//
// Devolve o mínimo: se abre, e o que já foi preenchido. O que já foi
// preenchido importa quando o RH recusou pedindo correção — a pessoa
// reabre o link e encontra a ficha dela, não uma folha em branco.
router.get('/:token', limitador, async (req, res) => {
  try {
    const c = await C.porToken(req.params.token);
    const impedimento = C.porQueNaoAbre(c);
    if (impedimento) return res.status(404).json({ error: impedimento });

    res.json({
      ok: true,
      expires_at: c.expires_at,
      convidado_nome: c.convidado_nome,
      // Quando houve recusa, a pessoa precisa ler o motivo antes de tudo.
      motivo_recusa: c.motivo_recusa || null,
      dados: c.dados || null,
    });
  } catch { res.status(500).json({ error: 'Não foi possível abrir este link agora.' }); }
});

// ── Enviar a ficha ──────────────────────────────────────────
router.post('/:token', limitador, async (req, res) => {
  try {
    const r = await C.receber(req.params.token, req.body?.dados);
    if (!r.ok) return res.status(400).json({ error: r.error });
    res.json({ ok: true });
  } catch { res.status(500).json({ error: 'Não foi possível enviar a ficha agora.' }); }
});

module.exports = router;
