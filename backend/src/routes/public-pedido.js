// ============================================================
// Acompanhamento do pedido pelo CLIENTE — telas 3A e 3B.
//
// Rota pública: não passa pelo authMiddleware do ERP. Por isso três
// cuidados que não são opcionais aqui:
//
// 1. O acesso é CPF + número do pedido, e os dois têm que ser do MESMO
//    cadastro. CPF certo com pedido de outra pessoa não abre.
// 2. Depois de validar, o servidor emite um token assinado preso àquele
//    sale_id. As telas seguintes leem o pedido DO TOKEN, nunca da URL —
//    é isso que torna inútil trocar o PV no endereço do navegador.
// 3. O erro é sempre o mesmo, seja o CPF errado, o pedido inexistente ou
//    o par trocado. Mensagem específica ("pedido não existe") vira
//    oráculo para descobrir quais números existem.
//
// O que sai daqui é montado por lib/pedidoPublico.js, que é uma lista de
// permissão campo a campo — custo, margem e comissão não têm caminho.
// ============================================================
const express  = require('express');
const router   = express.Router();
const jwt      = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');
const supabase = require('../config/supabase');
const P        = require('../lib/pedidoPublico');
const { askClaude } = require('../lib/ai');

const SEGREDO = process.env.PEDIDO_TOKEN_SECRET
  || process.env.JWT_SECRET
  || process.env.SUPABASE_SERVICE_KEY;   // já é secreto e existe em todo ambiente
const VALIDADE = '12h';

// Sempre a mesma frase, em qualquer falha de acesso.
const ERRO_ACESSO = 'Dados de acesso inválidos. Confira o CPF e o número do pedido.';

/**
 * Força bruta aqui seria varrer números de pedido com um CPF conhecido.
 * 10 tentativas a cada 15 minutos por IP não atrapalham quem digitou
 * errado e tornam a varredura inviável.
 */
const limiteAcesso = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { error: 'Muitas tentativas. Aguarde alguns minutos e tente de novo.' },
});

/** 'PV-000123', 'pv 123' ou '123' → 123 */
function numeroDoPedido(entrada) {
  const m = String(entrada || '').match(/(\d+)\s*$/);
  return m ? parseInt(m[1], 10) : null;
}

const CAMPOS_PEDIDO = `
  id, number, status, origin, subtotal, freight, total, payment_method,
  created_at, operation_date, event_date, ship_date, delivery_date,
  collect_date, transport_days, freight_quote, tracking_code,
  carrier_id, user_id, tenant_id, production_log,
  CLIENTES ( id, display_id, name, cpf_cnpj, phone, mobile, email, address, rating ),
  VENDA_ITENS ( id, product_name, quantity, unit_price, total, customization,
                PRODUTOS ( id, code, name, ink_type ) )
`;

/** Tudo que a tela 3B precisa, já filtrado para os olhos do cliente. */
async function carregarPedido(saleId) {
  const { data: venda, error } = await supabase.from('VENDAS')
    .select(CAMPOS_PEDIDO).eq('id', saleId).maybeSingle();
  if (error || !venda) return null;

  const [transportadora, temNota, avisos] = await Promise.all([
    nomeTransportadora(venda.carrier_id),
    notaEmitida(venda.tenant_id, venda.id),
    avisosDaEmpresa(venda.tenant_id),
  ]);

  return P.montarPedidoDoCliente(venda, { transportadora, temNota, avisos });
}

async function nomeTransportadora(carrierId) {
  if (!carrierId) return null;
  try {
    const { data } = await supabase.from('TRANSPORTADORAS')
      .select('name, trade_name').eq('id', carrierId).maybeSingle();
    return data ? (data.trade_name || data.name) : null;
  } catch { return null; }
}

// Nota autorizada de verdade — 'processando' ainda não é nota na mão.
async function notaEmitida(tenantId, saleId) {
  try {
    const { data } = await supabase.from('NOTAS_FISCAIS')
      .select('id, status, danfe_url').eq('tenant_id', tenantId).eq('sale_id', saleId)
      .is('cancelled_at', null).limit(5);
    return (data || []).some(n => /autoriz/i.test(n.status || '') && n.danfe_url);
  } catch { return false; }
}

async function avisosDaEmpresa(tenantId) {
  try {
    const { data } = await supabase.from('EMPRESAS').select('settings').eq('id', tenantId).maybeSingle();
    const cfg = data?.settings?.pedido_avisos;
    return Array.isArray(cfg) ? cfg.map(String).filter(Boolean) : [];
  } catch { return []; }
}

// ── TELA 3A — entrar ─────────────────────────────────────────
router.post('/acesso', limiteAcesso, async (req, res) => {
  const cpf = P.soDigitos(req.body?.cpf);
  const numero = numeroDoPedido(req.body?.pedido);

  if (!cpf || !numero) return res.status(401).json({ error: ERRO_ACESSO });

  try {
    // Procura o pedido pelo número. Como `number` se repete entre
    // empresas, o CPF é que decide qual é o certo.
    const { data: candidatos } = await supabase.from('VENDAS')
      .select('id, number, tenant_id, CLIENTES ( cpf_cnpj )')
      .eq('number', numero).limit(20);

    const venda = (candidatos || []).find(
      v => P.soDigitos(v.CLIENTES?.cpf_cnpj) === cpf
    );
    // CPF certo com pedido de outra pessoa cai aqui, com a mesma frase.
    if (!venda) return res.status(401).json({ error: ERRO_ACESSO });

    const token = jwt.sign(
      { sale_id: venda.id, tenant_id: venda.tenant_id, escopo: 'acompanhamento' },
      SEGREDO, { expiresIn: VALIDADE },
    );

    const pedido = await carregarPedido(venda.id);
    if (!pedido) return res.status(401).json({ error: ERRO_ACESSO });

    res.json({ token, ...pedido });
  } catch {
    // Erro interno também não vira pista sobre o que existe no banco.
    res.status(401).json({ error: ERRO_ACESSO });
  }
});

/**
 * O pedido vem do token, não da URL. Trocar o PV no endereço não muda
 * nada: o servidor nem lê o que está lá.
 */
function exigirToken(req, res, next) {
  const bruto = req.headers.authorization?.split(' ')[1] || req.query.t;
  if (!bruto) return res.status(401).json({ error: 'Sessão expirada. Entre de novo.' });
  try {
    const dados = jwt.verify(bruto, SEGREDO);
    if (dados.escopo !== 'acompanhamento') throw new Error('escopo');
    req.saleId = dados.sale_id;
    req.tenantId = dados.tenant_id;
    next();
  } catch {
    res.status(401).json({ error: 'Sessão expirada. Entre de novo.' });
  }
}

// ── TELA 3B — o pedido, sempre atual ─────────────────────────
// A tela chama isto de tempos em tempos: quando a Produção muda a etapa
// no ERP, o cliente vê a mudança sem fazer nada.
router.get('/', exigirToken, async (req, res) => {
  try {
    const pedido = await carregarPedido(req.saleId);
    if (!pedido) return res.status(404).json({ error: 'Pedido não encontrado' });
    res.json(pedido);
  } catch (err) { res.status(500).json({ error: 'Não foi possível carregar o pedido' }); }
});

// ── Contato / Dúvidas ────────────────────────────────────────
/**
 * O vendedor responsável por ESTE pedido — o cliente não escolhe
 * atendente nem vê telefone de outro vendedor.
 */
async function vendedorDoPedido(saleId) {
  const { data: venda } = await supabase.from('VENDAS')
    .select('user_id, tenant_id').eq('id', saleId).maybeSingle();
  if (!venda?.user_id) return null;

  const { data: user } = await supabase.from('USUARIOS')
    .select('id, name, email, phone').eq('id', venda.user_id).maybeSingle();
  if (!user) return null;
  if (P.soDigitos(user.phone)) return user;

  // Sem telefone no usuário: procura na ficha de colaborador, que é onde
  // o RH já guarda o número. A migração 072 faz esse backfill, mas quem
  // for cadastrado depois pode cair aqui de novo.
  try {
    const { data: colab } = await supabase.from('CLIENTES')
      .select('phone, mobile').eq('tenant_id', venda.tenant_id)
      .eq('email', user.email).eq('type', 'CO').maybeSingle();
    return { ...user, phone: colab?.mobile || colab?.phone || null };
  } catch { return user; }
}

router.get('/contato', exigirToken, async (req, res) => {
  try {
    const vendedor = await vendedorDoPedido(req.saleId);
    res.json({
      // Só o primeiro nome: o cliente precisa saber com quem fala, não
      // o cadastro completo de quem trabalha aqui.
      vendedor: vendedor?.name ? String(vendedor.name).split(' ')[0] : null,
      tem_whatsapp: !!P.soDigitos(vendedor?.phone),
      prazo_humano: 'até 20 minutos',
    });
  } catch { res.json({ vendedor: null, tem_whatsapp: false, prazo_humano: 'até 20 minutos' }); }
});

/**
 * Atendimento por IA.
 *
 * Ela responde sobre ESTE pedido e só com o que está na tela do cliente
 * — o contexto entregue ao modelo é o mesmo objeto público. Se a
 * pergunta for de preço, prazo excepcional ou qualquer coisa que mude o
 * combinado, a resposta é encaminhar ao vendedor: a IA informa, não
 * negocia.
 */
router.post('/ia', exigirToken, async (req, res) => {
  const pergunta = String(req.body?.pergunta || '').trim();
  if (!pergunta) return res.status(400).json({ error: 'Escreva sua dúvida' });

  try {
    const p = await carregarPedido(req.saleId);
    if (!p) return res.status(404).json({ error: 'Pedido não encontrado' });

    const etapaAtual = (p.linha_do_tempo || []).find(e => e.estado === 'atual');
    const contexto = [
      `Pedido ${p.pedido.codigo}, situação atual: ${p.pedido.status_label}.`,
      etapaAtual ? `Etapa ${etapaAtual.passo} de ${p.linha_do_tempo.length}.` : '',
      `Feito em ${new Date(p.pedido.data).toLocaleDateString('pt-BR')}.`,
      p.pedido.data_evento ? `Data do evento: ${new Date(p.pedido.data_evento + 'T12:00:00').toLocaleDateString('pt-BR')}.` : '',
      p.prazos.saida ? `Previsão de saída: ${p.prazos.saida}.` : 'Previsão de saída ainda não definida.',
      p.prazos.entrega ? `Previsão de entrega: ${p.prazos.entrega}.` : 'Previsão de entrega ainda não definida.',
      p.pedido.transportadora ? `Transportadora: ${p.pedido.transportadora}.` : '',
      p.pedido.rastreio ? `Código de rastreio: ${p.pedido.rastreio}.` : '',
      `Itens: ${p.itens.map(i => `${i.quantidade}x ${i.produto}`).join('; ')}.`,
      `Valor total pago: R$ ${p.valores.total.toFixed(2)}.`,
      `Etapas já concluídas: ${(p.historico || []).map(h => h.label).join(', ') || 'nenhuma ainda'}.`,
      `Avisos: ${(p.avisos || []).join(' ')}`,
    ].filter(Boolean).join('\n');

    const r = await askClaude({
      system: [
        'Você atende clientes da Lyon Copos que estão acompanhando o próprio pedido.',
        'Responda em português do Brasil, curto e cordial, USANDO SOMENTE os dados do pedido fornecidos.',
        'Se a pergunta pedir algo que não está nos dados — desconto, troca, cancelamento, exceção de prazo,',
        'alteração do pedido, ou qualquer negociação — não invente: diga que quem resolve isso é o vendedor',
        'e oriente a usar o atendimento humanizado, que responde em até 20 minutos.',
        'Nunca cite custo interno, margem, comissão ou dados de outros clientes.',
      ].join(' '),
      prompt: `Dados do pedido:\n${contexto}\n\nPergunta do cliente: ${pergunta}`,
      max_tokens: 500,
    });

    if (!r.ok) {
      return res.status(503).json({
        error: 'O atendimento automático está indisponível agora. Use o atendimento humanizado.',
      });
    }
    res.json({ resposta: r.text });
  } catch {
    res.status(503).json({ error: 'Não foi possível responder agora. Use o atendimento humanizado.' });
  }
});

/**
 * Atendimento humanizado: devolve o link de WhatsApp do vendedor DESTE
 * pedido, com a mensagem já começando pelo número do pedido — assim o
 * vendedor abre a conversa sabendo do que se trata.
 */
router.post('/humano', exigirToken, async (req, res) => {
  try {
    const [vendedor, p] = await Promise.all([
      vendedorDoPedido(req.saleId),
      carregarPedido(req.saleId),
    ]);
    const digitos = P.soDigitos(vendedor?.phone);
    if (!digitos) {
      return res.status(503).json({
        error: 'O vendedor deste pedido ainda não tem WhatsApp cadastrado. Fale com a loja pelo canal de sempre.',
      });
    }
    const numero = digitos.length <= 11 ? `55${digitos}` : digitos;
    const texto = [
      `Olá! Sou ${p?.cliente?.nome || 'cliente'} e tenho uma dúvida sobre o pedido ${p?.pedido?.codigo}.`,
      String(req.body?.mensagem || '').trim(),
    ].filter(Boolean).join('\n');

    res.json({
      link: `https://wa.me/${numero}?text=${encodeURIComponent(texto)}`,
      vendedor: vendedor?.name ? String(vendedor.name).split(' ')[0] : null,
      prazo: 'até 20 minutos',
    });
  } catch { res.status(500).json({ error: 'Não foi possível abrir o atendimento agora.' }); }
});

module.exports = router;
