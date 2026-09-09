/**
 * Pagamentos da Loja — fila dos pedidos do site que aguardam o PIX.
 *
 * O dinheiro cai direto na chave PIX da empresa (Nubank), e o banco não
 * avisa o sistema. Então quem confere o extrato é uma pessoa: confirmou
 * aqui, o pedido vira VENDA e entra em Comercial → Pedidos de Venda,
 * junto com o recebimento no Financeiro.
 */

const express  = require('express');
const router   = express.Router();
const supabase = require('../config/supabase');
const { codigoPedido } = require('../lib/pedidoCodigo');
const { audit } = require('../lib/audit');
const { linkAssinado } = require('../lib/storage');
const { criarVendaDoPedido, registrarRecebimento } = require('../lib/pedidoLoja');
const { sendWhatsApp } = require('../lib/whatsapp');

const STATUS = ['aguardando_pagamento', 'pago', 'expirado', 'cancelado'];

const brl = v => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })
  .format(Number(v) || 0);

// Pedido vencido continua na fila (ninguém apaga venda potencial), mas
// aparece marcado para quem estiver conferindo.
/**
 * Os dados do cliente, buscados à parte.
 *
 * Antes isto era um embed do PostgREST — `CLIENTES(id, name, ...)`
 * dentro do select. Não existe chave estrangeira declarada entre
 * PEDIDOS_LOJA e CLIENTES, então o PostgREST recusava a consulta
 * INTEIRA com 'Could not find a relationship', e a fila de pagamentos
 * respondia 500. O pedido estava no banco o tempo todo; era a tela que
 * não conseguia listá-lo.
 *
 * Uma segunda consulta também é mais honesta com o dado: o pedido
 * guarda um retrato do cliente em `customer` (nome e telefone do
 * momento da compra), e visitante sem cadastro tem customer_id nulo.
 */
async function clientesDe(tenantId, pedidos) {
  const ids = [...new Set(pedidos.map(p => p.customer_id).filter(Boolean))];
  if (!ids.length) return {};
  const { data } = await supabase.from('CLIENTES')
    .select('id, name, phone, email, display_id').eq('tenant_id', tenantId).in('id', ids);
  return Object.fromEntries((data || []).map(c => [c.id, c]));
}

/** O pedido pronto para a tela: cliente resolvido e vencimento marcado. */
function paraTela(p, porId) {
  return {
    ...p,
    CLIENTES: porId[p.customer_id] || null,
    // O retrato do momento da compra vale quando não há cadastro.
    cliente_nome: porId[p.customer_id]?.name || p.customer?.name || 'Cliente do site',
    cliente_fone: porId[p.customer_id]?.phone || p.customer?.phone || null,
    expirado: vencido(p),
    // Quem avisou que pagou vai na frente da fila.
    avisou_pagamento: !!p.paid_notified_at,
    // ANEXOU COMPROVANTE É OUTRA COISA de avisou que pagou. "Avisei" é
    // palavra; comprovante é o documento que se confere contra o
    // extrato. A tela separa os dois, e a fila põe o comprovante na
    // frente — é o que dá para resolver agora.
    tem_comprovante: !!p.receipt_url,
  };
}

/**
 * O LINK DO COMPROVANTE, ASSINADO E COM HORA PARA ACABAR.
 *
 * O arquivo mora no bucket privado (traz nome do pagador, banco e
 * valor). O caminho cru não abre em lugar nenhum; o link assinado abre
 * por dez minutos, que é tempo de conferir e não é tempo de virar
 * corrente de WhatsApp. Comprovante antigo, gravado como URL inteira
 * quando o bucket era público, continua passando direto.
 */
async function comLinkDoComprovante(linhas) {
  return Promise.all(linhas.map(async l => (
    l.receipt_url ? { ...l, receipt_link: await linkAssinado(l.receipt_url, 600) } : l
  )));
}

const vencido = p => p.status === 'aguardando_pagamento'
  && p.expires_at && new Date(p.expires_at) < new Date();

router.get('/', async (req, res) => {
  const status = STATUS.includes(req.query.status) ? req.query.status : 'aguardando_pagamento';
  const limit = Math.min(Math.max(parseInt(req.query.limit) || 50, 1), 200);
  try {
    const { data, error, count } = await supabase
      .from('PEDIDOS_LOJA')
      .select('*', { count: 'exact' })
      .eq('tenant_id', req.tenantId)
      .eq('status', status)
      .order('created_at', { ascending: false })
      .limit(limit);
    if (error) throw error;

    const porId = await clientesDe(req.tenantId, data || []);
    const linhas = await comLinkDoComprovante((data || []).map(p => paraTela(p, porId)));
    // A fila é por quem dá para resolver AGORA: comprovante anexado na
    // frente, depois quem só avisou, e por último quem nem avisou.
    const peso = l => (l.tem_comprovante ? 2 : 0) + (l.avisou_pagamento ? 1 : 0);
    linhas.sort((a, b) => peso(b) - peso(a));

    res.json({
      data: linhas,
      total: count ?? linhas.length,
      aguardando_conferencia: linhas.filter(l => l.avisou_pagamento).length,
      com_comprovante: linhas.filter(l => l.tem_comprovante).length,
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Quantos estão esperando conferência — para o badge do menu.
router.get('/pendentes/count', async (req, res) => {
  try {
    const { count } = await supabase
      .from('PEDIDOS_LOJA').select('id', { count: 'exact', head: true })
      .eq('tenant_id', req.tenantId).eq('status', 'aguardando_pagamento');
    res.json({ count: count || 0 });
  } catch { res.json({ count: 0 }); }
});

router.get('/:id', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('PEDIDOS_LOJA')
      .select('*')
      .eq('tenant_id', req.tenantId).eq('id', req.params.id).maybeSingle();
    if (error) throw error;
    if (!data) return res.status(404).json({ error: 'Pedido não encontrado' });
    const porId = await clientesDe(req.tenantId, [data]);
    const [linha] = await comLinkDoComprovante([paraTela(data, porId)]);
    res.json(linha);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Confirmar o pagamento → libera o pedido para o Comercial ──
router.post('/:id/confirmar', async (req, res) => {
  try {
    const { data: ped } = await supabase.from('PEDIDOS_LOJA').select('*')
      .eq('tenant_id', req.tenantId).eq('id', req.params.id).maybeSingle();
    if (!ped) return res.status(404).json({ error: 'Pedido não encontrado' });
    if (ped.status === 'pago') return res.status(409).json({ error: 'Este pedido já foi confirmado', sale_id: ped.sale_id });
    if (ped.status !== 'aguardando_pagamento') return res.status(409).json({ error: `Pedido ${ped.status}` });

    const actor = { userId: req.user?.id || null, userName: req.userProfile?.name || null };
    const sale = await criarVendaDoPedido(ped, actor);
    const lanc = await registrarRecebimento(ped, sale, actor);

    const { error: upErr } = await supabase.from('PEDIDOS_LOJA').update({
      status: 'pago',
      sale_id: sale.id,
      confirmed_at: new Date().toISOString(),
      confirmed_by: actor.userId,
      confirmed_by_name: actor.userName || req.user?.email || null,
    }).eq('id', ped.id).eq('tenant_id', req.tenantId);
    if (upErr) throw upErr;

    audit(req, 'confirm', 'store-payments', ped.id, { sale_id: sale.id, total: ped.total });
    res.json({
      ok: true, sale_id: sale.id, number: sale.number,
      // o pedido está liberado mesmo se o lançamento falhar; avisa a tela
      lancamento: lanc.ok ? 'criado' : 'falhou',
      // A tela pergunta "avisar o cliente no WhatsApp?" logo depois, e
      // precisa saber se há para quem mandar antes de perguntar.
      cliente_fone: ped.customer?.phone || null,
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ════════════════════════════════════════════════════════════
// AVISAR O CLIENTE — depois de confirmado, num clique.
//
// POR QUE É UMA ROTA SEPARADA e não um campo do "confirmar". Confirmar
// cria a venda e o recebimento; avisar manda uma mensagem. Juntar as
// duas faria um WhatsApp que falha derrubar uma confirmação que já deu
// certo — e a pessoa clicaria de novo, com o dinheiro já lançado.
// Separadas, avisar pode ser refeito quantas vezes for preciso.
//
// O TEXTO É O MESMO PARA TODO MUNDO, de propósito: pagamento
// confirmado, o pedido inteiro escrito, e o caminho para anexar a arte.
// É o que o cliente pergunta em seguida, sempre — e responder antes de
// ele perguntar é o que tira a mensagem do "vou ver e te falo".
//
// SEM API CONFIGURADA A TELA NÃO FICA SEM SAÍDA. Quando o envio
// automático não está de pé (ou falha), a resposta traz o link do
// wa.me com o texto pronto: quem está conferindo abre e manda pelo
// próprio WhatsApp, em vez de reescrever tudo à mão.
// ════════════════════════════════════════════════════════════

const soDigitos = v => String(v || '').replace(/\D/g, '');

/** O endereço público desta instalação — a mesma conta do resto do ERP. */
const enderecoBase = req => (process.env.APP_URL
  || `${req.headers['x-forwarded-proto'] || req.protocol}://${req.get('host')}`).replace(/\/+$/, '');

/**
 * A MENSAGEM DO PAGAMENTO CONFIRMADO.
 *
 * O pedido inteiro escrito — item, quantidade e valor — porque o
 * cliente vai conferir se é o dele antes de fazer qualquer coisa, e um
 * "seu pedido foi confirmado" sem dizer qual pedido é o tipo de recado
 * que ninguém sabe se é golpe.
 */
function mensagemDeConfirmacao(ped, numero, base) {
  const nome = String(ped.customer?.name || '').trim().split(/\s+/)[0] || '';
  const codigo = numero ? codigoPedido(numero) : null;

  const linhas = (Array.isArray(ped.items) ? ped.items : []).map(i => {
    const qtd = Number(i.quantity) || 0;
    const detalhe = [i.color, i.print_name].filter(Boolean).join(' · ');
    return `• ${qtd}x ${i.product_name}${detalhe ? ` (${detalhe})` : ''} — ${brl(qtd * (Number(i.unit_price) || 0))}`;
  });

  return [
    '✅ *O pagamento do seu pedido já foi confirmado!*',
    '',
    codigo ? `*Pedido ${codigo}*` : '*Seu pedido*',
    nome ? `Cliente: ${ped.customer?.name}` : null,
    '',
    ...linhas,
    Number(ped.freight) > 0 ? `Frete: ${brl(ped.freight)}` : null,
    `*Total: ${brl(ped.total)}*`,
    ped.event_date ? `Data do evento: ${String(ped.event_date).slice(0, 10).split('-').reverse().join('/')}` : null,
    '',
    '🎨 *Agora é a arte.*',
    `Entre em ${base}/acompanhar e faça login com o seu CPF e a sua data de nascimento.`,
    'Lá você anexa a arte de cada item do pedido — se você comprou peças diferentes, cada uma tem o seu espaço —',
    'e acompanha o andamento e o status da produção pelo mesmo lugar, a qualquer hora.',
    '',
    'Qualquer dúvida é só responder por aqui. Obrigado pela preferência! 💙',
  ].filter(l => l !== null).join('\n');
}

router.post('/:id/avisar-whatsapp', async (req, res) => {
  try {
    const { data: ped } = await supabase.from('PEDIDOS_LOJA').select('*')
      .eq('tenant_id', req.tenantId).eq('id', req.params.id).maybeSingle();
    if (!ped) return res.status(404).json({ error: 'Pedido não encontrado' });
    if (ped.status !== 'pago') {
      return res.status(409).json({ error: 'Este pedido ainda não foi confirmado.' });
    }

    // O telefone do cadastro vence o retrato do momento da compra: é o
    // que foi corrigido se o cliente trocou de número desde então.
    const porId = await clientesDe(req.tenantId, [ped]);
    const fone = soDigitos(porId[ped.customer_id]?.phone || ped.customer?.phone);
    if (!fone) {
      return res.status(400).json({ error: 'Este cliente não tem telefone cadastrado.' });
    }

    let numero = null;
    if (ped.sale_id) {
      const { data: venda } = await supabase.from('VENDAS')
        .select('number').eq('id', ped.sale_id).eq('tenant_id', req.tenantId).maybeSingle();
      numero = venda?.number ?? null;
    }

    const texto = mensagemDeConfirmacao(ped, numero, enderecoBase(req));
    const destino = fone.length <= 11 ? `55${fone}` : fone;
    const link = `https://wa.me/${destino}?text=${encodeURIComponent(texto)}`;

    const envio = await sendWhatsApp(fone, texto);
    audit(req, 'notify', 'store-payments', ped.id, { canal: 'whatsapp', enviado: !!envio.ok });

    res.json({
      ok: true,
      enviado: !!envio.ok,
      // O motivo aparece na tela junto com o link manual: "não
      // configurado" e "número inválido" pedem providências diferentes.
      erro: envio.ok ? null : envio.error,
      telefone: destino,
      link,
      mensagem: texto,
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Reprovar (não pagou, desistiu, comprovante não confere) ───
//
// A tela chama de REPROVAR quando o cliente anexou comprovante, porque é
// isso que está acontecendo: alguém mandou um documento e a Lyon está
// dizendo que ele não fecha. É a mesma porta do cancelamento comum — um
// pedido recusado e um pedido abandonado terminam no mesmo lugar.
router.post('/:id/cancelar', async (req, res) => {
  const reason = String(req.body?.reason || '').trim() || null;
  try {
    const { data: ped } = await supabase.from('PEDIDOS_LOJA').select('id, status, receipt_url')
      .eq('tenant_id', req.tenantId).eq('id', req.params.id).maybeSingle();
    if (!ped) return res.status(404).json({ error: 'Pedido não encontrado' });
    if (ped.status === 'pago') return res.status(409).json({ error: 'Pedido já confirmado — cancele pela venda' });
    // RECUSAR COMPROVANTE EXIGE MOTIVO. O cliente mandou um documento e
    // vai receber um "não": sem o porquê, quem for atendê-lo no telefone
    // não tem o que dizer, e o próprio cliente não sabe o que corrigir.
    if (ped.receipt_url && !reason) {
      return res.status(400).json({ error: 'Diga por que o comprovante não confere — o cliente anexou um documento.' });
    }

    await supabase.from('PEDIDOS_LOJA')
      .update({ status: 'cancelado', canceled_reason: reason })
      .eq('id', ped.id).eq('tenant_id', req.tenantId);
    audit(req, 'cancel', 'store-payments', ped.id, { reason });
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
