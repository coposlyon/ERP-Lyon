// ============================================================
// O SININHO.
//
// Uma rota só, sem módulo próprio: cada fonte de aviso já confere o
// módulo lá dentro (lib/avisos.js). Exigir um módulo aqui obrigaria a
// inventar um "módulo de notificação" que ninguém sabe o que libera.
// ============================================================
const express = require('express');
const router = express.Router();
const { montarAvisos } = require('../lib/avisos');

/**
 * GET /api/avisos?janela=3
 *
 * `janela` é por quantos dias um fato novo continua sendo novidade.
 * Situações abertas (estoque baixo, conta vencida, fila do PIX) não
 * dependem dela: enquanto estiverem de pé, aparecem.
 */
router.get('/', async (req, res) => {
  try {
    const janela = Math.min(Math.max(parseInt(req.query.janela) || 3, 1), 30);
    const r = await montarAvisos(req, { janela_dias: janela });
    res.json(r);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
