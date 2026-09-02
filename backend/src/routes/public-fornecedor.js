// ============================================================
// O PORTAL DO FORNECEDOR — sem login.
//
// Quem chega aqui não tem conta no ERP e não vai ter: é o fornecedor
// abrindo do celular o link que a Lyon mandou no WhatsApp. A credencial
// é o token do endereço MAIS o CNPJ e o telefone que ele confirma —
// link encaminhado sozinho não mostra nada.
//
// O QUE ESTA ROTA NÃO FAZ, DE PROPÓSITO:
//
//   - não mexe no estoque. O fornecedor diz o que tem; quem dá baixa é
//     alguém da Lyon, com um clique, depois de olhar. Rota anônima
//     escrevendo direto no estoque seria uma porta grande demais.
//   - não devolve id de produto, custo nem o estoque atual da Lyon. Ele
//     precisa saber o que e quanto foi pedido; o resto é interno.
//   - não lista nada. Só o pedido do próprio token.
//   - não aceita mais do que foi pedido. "Pediram 10, tenho 500" não é
//     generosidade: é o estoque ganhando 490 unidades não compradas.
//
// O limitador é o mesmo do convite de admissão: o token é secreto, mas
// nada impede alguém de tentar em série.
// ============================================================
const express = require('express');
const router = express.Router();
const rateLimit = require('express-rate-limit');
const multer = require('multer');
const supabase = require('../config/supabase');
const R = require('../lib/reposicaoFornecedor');

const limitador = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 60,
  message: { error: 'Muitas tentativas. Aguarde alguns minutos.' },
});

// A cotação é um arquivo do fornecedor: 8 MB é PDF de cotação com
// sobra, e é pouco o bastante para não virar depósito.
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 8 * 1024 * 1024 } });

/**
 * Abre o link e devolve o que foi pedido.
 *
 * É POST e não GET porque a identidade viaja no corpo: CNPJ e telefone
 * numa URL entram no histórico do navegador, no log do servidor e no
 * "compartilhar" do celular.
 */
router.post('/:token/entrar', limitador, async (req, res) => {
  try {
    const pedido = await R.porToken(req.params.token);
    const impedimento = R.porQueNaoAbre(pedido);
    if (impedimento) return res.status(404).json({ error: impedimento });

    const erro = R.conferirIdentidade(pedido, req.body?.cnpj, req.body?.telefone);
    if (erro) {
      await R.registrarTentativa(pedido.id);
      return res.status(401).json({ error: erro });
    }

    res.json(R.fichaParaOFornecedor(pedido));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * O fornecedor responde: o que tem de cada item, e a cotação.
 *
 * A identidade é conferida DE NOVO. A conferência do `entrar` não deixa
 * nada guardado — não há sessão, não há cookie —, então cada requisição
 * se prova por si. Guardar sessão para um portal de uma visita só seria
 * mais superfície para o mesmo trabalho.
 */
router.post('/:token/responder', limitador, upload.single('cotacao'), async (req, res) => {
  try {
    const pedido = await R.porToken(req.params.token);
    const impedimento = R.porQueNaoAbre(pedido);
    if (impedimento) return res.status(404).json({ error: impedimento });

    const erro = R.conferirIdentidade(pedido, req.body?.cnpj, req.body?.telefone);
    if (erro) {
      await R.registrarTentativa(pedido.id);
      return res.status(401).json({ error: erro });
    }

    // `itens` chega como texto quando vem junto do arquivo (multipart
    // não tem tipo, tudo é string).
    let itens = req.body?.itens;
    if (typeof itens === 'string') {
      try { itens = JSON.parse(itens); } catch { itens = []; }
    }
    if (!Array.isArray(itens)) itens = [];

    // A cotação é opcional: fornecedor que responde pelo celular às
    // vezes manda o PDF depois, no WhatsApp. Travar a resposta por
    // causa do anexo seria perder a informação que importa — o que ele
    // tem — por causa da que dá para pedir de novo.
    let cotacao_url = null;
    if (req.file) {
      const limpo = String(req.file.originalname || 'cotacao')
        .replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 60);
      const caminho = `${pedido.tenant_id}/reposicao/${pedido.id}_${Date.now()}_${limpo}`;
      const { error: upErr } = await supabase.storage.from('DOCUMENTOS')
        .upload(caminho, req.file.buffer, {
          contentType: req.file.mimetype || 'application/octet-stream', upsert: true,
        });
      if (!upErr) {
        const { data } = supabase.storage.from('DOCUMENTOS').getPublicUrl(caminho);
        cotacao_url = data?.publicUrl || null;
      } else {
        console.error('[fornecedor] cotacao:', upErr.message);
      }
    }

    const r = await R.responder(pedido, { itens, cotacao_url });
    res.json({ ...r, cotacao_anexada: !!cotacao_url });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
