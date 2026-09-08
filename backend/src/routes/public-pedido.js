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
const { montarAutorizacao, paraOCliente } = require('../lib/retirada');
const rateLimit = require('express-rate-limit');
const supabase = require('../config/supabase');
const P        = require('../lib/pedidoPublico');
const A        = require('../lib/atencao');
const { askClaude } = require('../lib/ai');
// O comprovante mora em bucket privado: o portal entrega um link que expira.
const { linkAssinado, uploadDataUrl } = require('../lib/storage');
// `caracteristicasDoItem` responde se o item é personalizado — a mesma
// conta que decide se a coluna "Cor da personalização" aparece na tela.
// Uma segunda leitura do JSON aqui seria uma para discordar dela.
const { caracteristicasDoItem, estadoDaArte } = require('../lib/itensPedido');
// A arte que chega move o pedido, e quem decide para onde é o motor de
// etapas — a mesma régua da tela do vendedor.
const Auto = require('../lib/pedidoAutomacao');
const { carregarParaFluxo, gravarPasso } = require('../lib/fluxoCarga');

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
/**
 * A data digitada, em qualquer formato razoável, virando AAAA-MM-DD.
 *
 * O campo da tela manda AAAA-MM-DD (input type=date), mas gente colando
 * de outro lugar manda 01/01/2025 — e recusar por causa da barra seria
 * recusar quem digitou certo.
 */
function dataISO(entrada) {
  const t = String(entrada || '').trim();
  let m = t.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = t.match(/^(\d{2})[/\-.](\d{2})[/\-.](\d{4})$/);
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  return null;
}

// NAO PONHA COMENTARIO AQUI DENTRO.
//
// Esta string vai inteira para o parametro `select` do PostgREST, que
// nao e SQL: ele nao conhece `--`. O comentario que morava no meio desta
// lista virava nome de coluna, o parse falhava, `carregarPedido` devolvia
// null e o portal do cliente dizia "Pedido nao encontrado" em TODO
// pedido — enquanto a lista, que tem um select sem comentario, mostrava
// os mesmos pedidos normalmente.
//
// `delivery_mode` (migracao 090) responde entrega ou retirada; `notes`
// carrega o texto antigo do catalogo, que e o que responde pelos pedidos
// gravados antes de a coluna existir.
const CAMPOS_PEDIDO = `
  id, number, status, origin, subtotal, freight, total, payment_method,
  created_at, operation_date, event_date, ship_date, delivery_date,
  collect_date, transport_days, freight_quote, tracking_code,
  carrier_id, user_id, tenant_id, production_log,
  delivery_mode, notes, pickup_person, receipt_url,
  CLIENTES ( id, display_id, name, cpf_cnpj, phone, mobile, email, address, rating ),
  VENDA_ITENS ( id, product_name, quantity, unit_price, total, customization,
                PRODUTOS ( id, code, name, ink_type ) )
`;

/** Tudo que a tela 3B precisa, já filtrado para os olhos do cliente. */
async function carregarPedido(saleId) {
  const { data: venda, error } = await supabase.from('VENDAS')
    .select(CAMPOS_PEDIDO).eq('id', saleId).maybeSingle();
  if (error || !venda) return null;

  const [transportadora, danfe, avisos, comprovante] = await Promise.all([
    nomeTransportadora(venda.carrier_id),
    notaEmitida(venda.tenant_id, venda.id),
    avisosDaEmpresa(venda.tenant_id),
    comprovanteDoPedido(venda),
  ]);

  return P.montarPedidoDoCliente(venda, {
    transportadora, avisos,
    temNota: !!danfe,
    temComprovante: !!comprovante,
  });
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
//
// Devolve a URL da DANFE, e não um sim/não: quem pergunta é o botão de
// baixar, e um booleano só dizia que existe sem dizer onde está.
async function notaEmitida(tenantId, saleId) {
  try {
    const { data } = await supabase.from('NOTAS_FISCAIS')
      .select('id, status, danfe_url').eq('tenant_id', tenantId).eq('sale_id', saleId)
      .is('cancelled_at', null).limit(5);
    const ok = (data || []).find(n => /autoriz/i.test(n.status || '') && n.danfe_url);
    return ok ? ok.danfe_url : null;
  } catch { return null; }
}

/**
 * O COMPROVANTE DE PAGAMENTO DESTE PEDIDO.
 *
 * Dois lugares, nesta ordem: a parcela mais recente que tenha
 * comprovante (migração 095, que é onde eles passaram a morar) e, se não
 * houver, o campo antigo do próprio pedido — que é o que responde pelos
 * pedidos gravados antes de o comprovante virar da parcela.
 *
 * Devolve o CAMINHO no bucket privado, nunca uma URL eterna: quem
 * transforma em link é a rota de download, e o link expira.
 */
async function comprovanteDoPedido(venda) {
  try {
    const { data } = await supabase.from('LANCAMENTOS')
      .select('receipt_url, receipt_at')
      .eq('tenant_id', venda.tenant_id)
      .eq('reference_type', 'sale').eq('reference_id', venda.id)
      .not('receipt_url', 'is', null)
      .order('receipt_at', { ascending: false }).limit(1);
    if (data && data[0]?.receipt_url) return data[0].receipt_url;
  } catch { /* base sem a 095: cai no campo antigo */ }
  return venda.receipt_url || null;
}

async function avisosDaEmpresa(tenantId) {
  try {
    const { data } = await supabase.from('EMPRESAS').select('settings').eq('id', tenantId).maybeSingle();
    const cfg = data?.settings?.pedido_avisos;
    return Array.isArray(cfg) ? cfg.map(String).filter(Boolean) : [];
  } catch { return []; }
}

// ── TELA 3A — entrar ────────────────────────────
//
// CPF + DATA DE NASCIMENTO, e não mais CPF + número do pedido.
//
// A diferença não é só de campo: o acesso deixou de ser de UM pedido e
// passou a ser DO CLIENTE. Quem entra vê a própria lista e escolhe qual
// abrir — antes precisava ter o número na mão, e quem perdeu o
// WhatsApp do vendedor não entrava de jeito nenhum.
//
// O que NÃO mudou é a trava: o token carrega o customer_id, e cada
// pedido aberto é conferido contra ele. Trocar o id na URL continua não
// abrindo pedido de outra pessoa.
//
// Uma data de nascimento é um segredo mais fraco que um número de
// pedido, e vale saber disso: quem souber CPF e nascimento de alguém
// entra. É o mesmo nível do login da loja, que já pedia só o CPF —
// então isto sobe a barra, não desce. Para subir mais, o caminho é
// código por WhatsApp, que exige o telefone na mão.
router.post('/acesso', limiteAcesso, async (req, res) => {
  const cpf = P.soDigitos(req.body?.cpf);
  const nascimento = dataISO(req.body?.nascimento);

  if (!cpf || !nascimento) return res.status(401).json({ error: ERRO_ACESSO });

  try {
    // doc_digits quando existir (é indexado); senão compara na mão,
    // porque o cadastro antigo gravou com pontuação.
    let cliente = null;
    const { data, error } = await supabase.from('CLIENTES')
      .select('id, tenant_id, name, birth_date, cpf_cnpj')
      .eq('doc_digits', cpf).limit(5);

    if (error) {
      const { data: todos } = await supabase.from('CLIENTES')
        .select('id, tenant_id, name, birth_date, cpf_cnpj').limit(5000);
      cliente = (todos || []).find(c => P.soDigitos(c.cpf_cnpj) === cpf
        && String(c.birth_date || '').slice(0, 10) === nascimento) || null;
    } else {
      cliente = (data || []).find(
        c => String(c.birth_date || '').slice(0, 10) === nascimento) || null;
    }

    // CPF certo com nascimento errado cai aqui, com a mesma frase de
    // sempre: dizer "a data não confere" confirmaria que o CPF existe.
    if (!cliente) return res.status(401).json({ error: ERRO_ACESSO });

    const token = jwt.sign(
      { customer_id: cliente.id, tenant_id: cliente.tenant_id, escopo: 'acompanhamento' },
      SEGREDO, { expiresIn: VALIDADE },
    );

    res.json({ token, cliente: { nome: cliente.name } });
  } catch {
    // Erro interno também não vira pista sobre o que existe no banco.
    res.status(401).json({ error: ERRO_ACESSO });
  }
});

/**
 * O cliente vem do token, nunca da URL.
 */
function exigirToken(req, res, next) {
  // Aceita o token que VALIDAR, venha do cabeçalho ou da URL. Preferir
  // o cabeçalho cegamente derrubava o cliente quando havia outro Bearer
  // na janela — por exemplo o do ERP, se o vendedor abrisse o link no
  // mesmo navegador em que está logado.
  const candidatos = [req.query.t, req.headers.authorization?.split(' ')[1]].filter(Boolean);

  for (const bruto of candidatos) {
    try {
      const dados = jwt.verify(bruto, SEGREDO);
      if (dados.escopo !== 'acompanhamento' || !dados.customer_id) continue;
      req.customerId = dados.customer_id;
      req.tenantId = dados.tenant_id;
      return next();
    } catch { /* tenta o próximo */ }
  }
  res.status(401).json({ error: 'Sessão expirada. Entre de novo.' });
}

/**
 * O pedido pedido na URL É daquele cliente?
 *
 * Esta é a trava inteira do modelo novo. Com o token preso a um pedido
 * só, trocar o id na URL não fazia nada porque o servidor nem lia a URL.
 * Agora ele lê — então tem que conferir. Devolve 404, e não 403: "esse
 * pedido não é seu" confirmaria que o pedido existe.
 */
async function pedidoDoCliente(saleId, customerId) {
  if (!saleId) return null;
  const { data } = await supabase.from('VENDAS')
    .select('id, customer_id').eq('id', saleId).maybeSingle();
  if (!data || data.customer_id !== customerId) return null;
  return data.id;
}

// ── A LISTA ────────────────────────────────────────
//
// Só o suficiente para escolher: número, data, status e valor. O
// detalhe fica no pedido aberto — mandar tudo de todos os pedidos seria
// carregar dez vezes o que a pessoa vai olhar uma vez.
router.get('/pedidos', exigirToken, async (req, res) => {
  try {
    const { data, error } = await supabase.from('VENDAS')
      .select('id, number, status, total, freight, created_at, operation_date, event_date, delivery_date')
      .eq('tenant_id', req.tenantId).eq('customer_id', req.customerId)
      .in('type', ['sale', 'order'])
      .order('created_at', { ascending: false }).limit(200);
    if (error) throw error;

    res.json({
      pedidos: (data || []).map(v => {
        const info = A.infoStatus(v.status);
        return {
          id: v.id,
          codigo: `PV-${String(v.number).padStart(6, '0')}`,
          numero: v.number,
          data: v.operation_date || (v.created_at || '').slice(0, 10),
          data_evento: v.event_date || null,
          previsao_entrega: v.delivery_date || null,
          status: info.label,
          cor: info.cor,
          finalizado: !!info.final,
          total: Number(v.total) || 0,
        };
      }),
    });
  } catch (err) {
    res.status(500).json({ error: 'Não foi possível carregar seus pedidos agora.' });
  }
});

/**
 * POST /acompanhar/pedido/:id/retirada
 *
 * Quem vai buscar o pedido. Duas portas para a mesma gravação:
 *
 *   sem `codigo`  o dono do pedido informando pelo portal — o token já
 *                 provou quem ele é;
 *   com `codigo`  OUTRA pessoa assumindo a retirada, provando com o
 *                 código do pedido que o cliente passou a ela por
 *                 WhatsApp. Substitui a autorização anterior.
 *
 * A segunda porta existe porque a primeira sozinha trava o mundo real:
 * quem ia buscar ficou doente e mandou o irmão. O código é o segredo
 * que só quem comprou tem — e a troca fica registrada no lugar da
 * anterior, com data.
 */
router.post('/pedido/:id/retirada', exigirToken, async (req, res) => {
  try {
    const saleId = await pedidoDoCliente(req.params.id, req.customerId);
    if (!saleId) return res.status(404).json({ error: 'Pedido não encontrado.' });

    const { data: venda } = await supabase.from('VENDAS')
      .select('id, number, status, delivery_mode, notes, pickup_person')
      .eq('id', saleId).maybeSingle();
    if (!venda) return res.status(404).json({ error: 'Pedido não encontrado.' });

    if (!A.ehRetirada(venda)) {
      return res.status(409).json({
        error: 'Este pedido é para entrega, não para retirada.',
        dica: 'Fale com o vendedor se você quiser buscar na fábrica.',
      });
    }

    // Substituir quem já estava autorizado exige o código do pedido.
    const codigoEsperado = `PV-${String(venda.number).padStart(6, '0')}`;
    const jaTem = !!venda.pickup_person?.nome;
    const codigo = String(req.body?.codigo || '').trim().toUpperCase().replace(/\s/g, '');
    if (jaTem && codigo.replace(/^PV-?0*/, '') !== String(venda.number)) {
      return res.status(403).json({
        error: `Já existe alguém autorizado a retirar (${venda.pickup_person.nome}).`,
        dica: `Para trocar, informe o código do pedido (${codigoEsperado}) — peça ao titular da compra.`,
        code: 'CODIGO_NECESSARIO',
      });
    }

    const { autorizacao, erro } = montarAutorizacao({
      nome: req.body?.nome, cpf: req.body?.cpf,
      origem: jaTem ? 'portal (substituição pelo código)' : 'portal',
    });
    if (erro) return res.status(400).json({ error: erro });

    const { error } = await supabase.from('VENDAS')
      .update({ pickup_person: autorizacao }).eq('id', saleId);
    if (error) throw error;

    res.status(201).json({
      autorizado: paraOCliente(autorizacao),
      substituiu: jaTem ? venda.pickup_person.nome : null,
      aviso: 'No ato da retirada é preciso apresentar documento com foto.',
    });
  } catch (err) {
    res.status(500).json({ error: 'Não foi possível registrar quem vai retirar.' });
  }
});

// ── TELA 3B — o pedido, sempre atual ─────────────────────────
// A tela chama isto de tempos em tempos: quando a Produção muda a etapa
// no ERP, o cliente vê a mudança sem fazer nada.
/**
 * GET /acompanhar/pedido/:id/documento/:tipo
 *
 * O LINK DE VERDADE. Os três botões de "Baixar" do portal chamavam um
 * `alert('O download será liberado em breve')` — os três, inclusive o
 * que aparecia habilitado. O cliente clicava e recebia um aviso de que
 * nada ia acontecer.
 *
 * Agora os que têm arquivo devolvem o endereço dele:
 *
 *   comprovante  link ASSINADO, que expira em dez minutos. O arquivo
 *                vive em bucket privado e o endereço dele não pode
 *                ficar guardado na aba do navegador.
 *   nfe          a DANFE, que já é pública por natureza.
 *
 * `pedido` não passa por aqui: a folha do pedido é a própria tela, e
 * quem quiser PDF usa o "salvar como PDF" da impressão do navegador.
 */
router.get('/pedido/:id/documento/:tipo', exigirToken, async (req, res) => {
  try {
    const saleId = await pedidoDoCliente(req.params.id, req.customerId);
    if (!saleId) return res.status(404).json({ error: 'Pedido não encontrado.' });

    const { data: venda } = await supabase.from('VENDAS')
      .select('id, tenant_id, receipt_url').eq('id', saleId).maybeSingle();
    if (!venda) return res.status(404).json({ error: 'Pedido não encontrado.' });

    if (req.params.tipo === 'nfe') {
      const danfe = await notaEmitida(venda.tenant_id, venda.id);
      if (!danfe) return res.status(404).json({ error: 'A nota fiscal deste pedido ainda não foi emitida.' });
      return res.json({ url: danfe });
    }

    if (req.params.tipo === 'comprovante') {
      const caminho = await comprovanteDoPedido(venda);
      if (!caminho) return res.status(404).json({ error: 'Ainda não há comprovante anexado neste pedido.' });
      const url = await linkAssinado(caminho, 600);
      if (!url) return res.status(502).json({ error: 'Não foi possível abrir o comprovante agora.' });
      return res.json({ url });
    }

    return res.status(400).json({ error: 'Documento desconhecido.' });
  } catch (err) { res.status(500).json({ error: 'Não foi possível abrir o documento' }); }
});

router.get('/pedido/:id', exigirToken, async (req, res) => {
  try {
    const saleId = await pedidoDoCliente(req.params.id, req.customerId);
    if (!saleId) return res.status(404).json({ error: 'Pedido não encontrado.' });
    const pedido = await carregarPedido(saleId);
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

router.get('/pedido/:id/contato', exigirToken, async (req, res) => {
  try {
    const saleId = await pedidoDoCliente(req.params.id, req.customerId);
    if (!saleId) return res.status(404).json({ error: 'Pedido não encontrado.' });
    const vendedor = await vendedorDoPedido(saleId);
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
router.post('/pedido/:id/ia', exigirToken, async (req, res) => {
  const pergunta = String(req.body?.pergunta || '').trim();
  if (!pergunta) return res.status(400).json({ error: 'Escreva sua dúvida' });

  try {
    const saleId = await pedidoDoCliente(req.params.id, req.customerId);
    if (!saleId) return res.status(404).json({ error: 'Pedido não encontrado.' });
    const p = await carregarPedido(saleId);
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
router.post('/pedido/:id/humano', exigirToken, async (req, res) => {
  try {
    const saleId = await pedidoDoCliente(req.params.id, req.customerId);
    if (!saleId) return res.status(404).json({ error: 'Pedido não encontrado.' });
    const [vendedor, p] = await Promise.all([
      vendedorDoPedido(saleId),
      carregarPedido(saleId),
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

/**
 * A ARTE QUE A CLIENTE MONTOU DEPOIS DE PAGAR.
 *
 * A personalização deixou de ser feita antes da compra: no catálogo ela
 * só marca que QUER, e monta a arte aqui, com o pedido já pago. Vender
 * primeiro e desenhar depois é o que tira a decisão de arte do caminho
 * de quem só queria saber o preço.
 *
 * A TRAVA É DUPLA, e as duas são do servidor:
 *   - o pedido tem que ser deste cliente (`pedidoDoCliente`);
 *   - o item tem que ser DAQUELE pedido, e tem que estar marcado como
 *     "quer personalizar". Sem a segunda, o id de um item de outro
 *     pedido passaria só por vir junto de um pedido válido.
 *
 * O QUE ENTRA É UM ID DE PROJETO, nunca o vetor. O desenho já foi
 * gravado por `/catalogo/projeto`, que aplica o gabarito do cadastro —
 * aceitar SVG aqui seria aceitar arte fora da área de impressão.
 */
router.post('/pedido/:id/arte', exigirToken, async (req, res) => {
  try {
    const saleId = await pedidoDoCliente(req.params.id, req.customerId);
    if (!saleId) return res.status(404).json({ error: 'Pedido não encontrado.' });

    const { item_id, projeto_id } = req.body || {};
    if (!item_id || !projeto_id) return res.status(400).json({ error: 'Faltou o item ou a arte.' });

    const { data: item } = await supabase.from('VENDA_ITENS')
      .select('id, sale_id, customization').eq('id', item_id).maybeSingle();
    if (!item || item.sale_id !== saleId) return res.status(404).json({ error: 'Item não encontrado.' });

    const conf = item.customization || {};

    // QUEM MANDA AQUI É "O ITEM É PERSONALIZADO", E NÃO `personalizar`.
    //
    // `personalizar` é uma marca que só o CATÁLOGO grava: é a cliente
    // dizendo, na compra pelo site, "vou montar a arte depois". Pedido
    // digitado no balcão nunca teve esse campo — e o portal respondia
    // "este item não foi pedido com personalização" para um copo com
    // "PRETO - PS" na cor da personalização, que é personalizado por
    // definição. A cliente entrava para mandar a arte e não conseguia.
    //
    // A pergunta certa é a mesma que a tela faz para decidir se mostra a
    // coluna de personalização, e ela mora numa função só.
    if (!caracteristicasDoItem(item).tem_personalizacao && !conf.personalizar) {
      return res.status(400).json({ error: 'Este item não leva arte.' });
    }

    // A mesma trava da rota de anexo: arte confirmada é arte combinada,
    // e montar outra no editor a substituiria sem ninguém saber.
    if (estadoDaArte(conf).estado === 'aprovada') {
      return res.status(409).json({
        error: 'Você já confirmou a arte deste item e a personalização começou.',
        dica: 'Para trocar agora, fale com um atendente.',
        code: 'ARTE_CONFIRMADA',
      });
    }

    const { data: proj } = await supabase.from('CATALOGO_PROJETOS')
      .select('id, posicao, gabarito, faces, preview_url')
      .eq('tenant_id', req.tenantId).eq('id', projeto_id).maybeSingle();
    if (!proj) return res.status(404).json({ error: 'Arte não encontrada.' });

    const { error } = await supabase.from('VENDA_ITENS').update({
      customization: {
        ...conf,
        projeto_arte: proj.id,
        arte: {
          projeto_id: proj.id,
          posicao: proj.posicao,
          gabarito: proj.gabarito || null,
          frente: proj.faces?.frente?.svg || null,
          verso: proj.faces?.verso?.svg || null,
          preview_url: proj.preview_url || null,
          enviada_em: new Date().toISOString(),
        },
      },
    }).eq('id', item.id);
    if (error) throw error;

    res.json({ ok: true });
  } catch { res.status(500).json({ error: 'Não foi possível salvar sua arte agora.' }); }
});

/**
 * A ARTE QUE A CLIENTE JÁ TINHA PRONTA — o arquivo do designer dela.
 *
 * A rota acima atende quem MONTA a arte no editor. Boa parte das
 * clientes não monta nada: chega com o PDF ou o PNG que o designer
 * mandou e só quer anexar. Sem esta porta, esse arquivo ia parar no
 * WhatsApp do vendedor — e de lá entrava no pedido à mão, quando
 * entrava.
 *
 * É POR ITEM, e é essa a razão de a rota levar o `itemId` no endereço.
 * Cem copos de um jeito e cem de outro são dois itens com dois
 * desenhos: a arte precisa saber em qual dos dois ela entra, e só a
 * cliente sabe.
 *
 * TROCAR TEM HORA. Enquanto a arte não foi aprovada, trocar é trabalho
 * normal — ela mandou o arquivo errado e percebeu. Do "arte aprovada"
 * em diante o desenho já pode ter virado vegetal, tela e copo impresso,
 * e a troca silenciosa é o caminho para mil peças saírem erradas sem
 * ninguém saber quem mandou trocar. Aí a resposta é falar com o
 * vendedor, que é quem consegue segurar a produção.
 */
const PASSO_ARTE_APROVADA = 7;   // 'arte_aprovada' no catálogo de status

router.post('/pedido/:id/item/:itemId/arte-anexada', exigirToken, async (req, res) => {
  try {
    const saleId = await pedidoDoCliente(req.params.id, req.customerId);
    if (!saleId) return res.status(404).json({ error: 'Pedido não encontrado.' });

    const arquivo = req.body?.arquivo;
    if (typeof arquivo !== 'string' || !arquivo.startsWith('data:')) {
      return res.status(400).json({ error: 'Escolha o arquivo da arte.' });
    }
    // O express corta o corpo em 10 MB e devolve um erro que ninguém
    // entende. Aqui o arquivo grande recebe uma resposta que diz o
    // tamanho e o que fazer — a base64 infla ~33%, então 8 MB de texto
    // são cerca de 6 MB de arquivo.
    if (arquivo.length > 8 * 1024 * 1024) {
      return res.status(413).json({
        error: 'A arte passa de 6 MB. Mande um arquivo menor ou envie pelo WhatsApp do vendedor.',
      });
    }

    const { data: venda } = await supabase.from('VENDAS')
      .select('id, number, status, artwork_url, production_log')
      .eq('id', saleId).maybeSingle();
    if (!venda) return res.status(404).json({ error: 'Pedido não encontrado.' });

    // O ITEM É DESTE PEDIDO? Sem esta conferência, trocar o id do item
    // na chamada gravaria a arte no pedido de outra pessoa.
    const { data: item } = await supabase.from('VENDA_ITENS')
      .select('id, sale_id, product_name, customization')
      .eq('id', req.params.itemId).maybeSingle();
    if (!item || item.sale_id !== saleId) {
      return res.status(404).json({ error: 'Item não encontrado.' });
    }

    const conf = item.customization || {};
    // A mesma pergunta que a rota do editor faz e que a tela usa para
    // decidir se mostra o bloco: pedido digitado no balcão não tem
    // `personalizar`, e continua sendo personalizado.
    if (!caracteristicasDoItem(item).tem_personalizacao && !conf.personalizar) {
      return res.status(400).json({ error: 'Este item não leva arte.' });
    }

    /**
     * DEPOIS DE CONFIRMADA, NÃO SE TROCA MAIS AQUI.
     *
     * A trava era o PASSO DO PEDIDO: só barrava depois que ele saía da
     * etapa de arte. Num pedido de cinco itens isso é frouxo — o pedido
     * fica na etapa da arte enquanto UM item ainda espera, e nesse
     * tempo o desenho já confirmado de outro item podia ser trocado sem
     * ninguém saber.
     *
     * Agora quem tranca é a confirmação do próprio item, que é o que
     * significa "combinado". A partir dela o desenho vira vegetal, tela
     * e copo impresso, e a troca em silêncio é o caminho para mil peças
     * saírem erradas. O passo do pedido continua valendo como segunda
     * trava, para a arte antiga que nunca passou por confirmação.
     */
    const arte = estadoDaArte(conf);
    if (arte.estado === 'aprovada') {
      return res.status(409).json({
        error: 'Você já confirmou a arte deste item e a personalização começou.',
        dica: 'Para trocar agora, fale com um atendente pelo botão de atendimento.',
        code: 'ARTE_CONFIRMADA',
      });
    }

    const passo = A.infoStatus(venda.status)?.passo || 0;
    if (conf.arte_cliente?.url && passo > PASSO_ARTE_APROVADA) {
      return res.status(409).json({
        error: 'A arte deste item já foi aprovada e está em produção.',
        dica: 'Para trocar agora, fale com o vendedor pelo botão de atendimento.',
      });
    }

    // Bucket PÚBLICO: produção, designer e a própria cliente precisam
    // abrir a arte o tempo todo. É a mesma pasta em que a área do
    // vendedor já grava as artes que ela anexa.
    const url = await uploadDataUrl(arquivo, 'artes-pedido');
    if (!url) return res.status(502).json({ error: 'Não consegui guardar o arquivo. Tente de novo.' });

    const agora = new Date().toISOString();
    const nome = String(req.body?.nome || '').trim().slice(0, 120) || null;

    // `aprovada_em` já sai preenchida: a arte que o próprio cliente
    // escolhe não volta para ele confirmar — perguntar de novo pelo
    // arquivo que ele acabou de mandar seria a mesma pergunta duas
    // vezes. O aviso de que a personalização começa e não se interrompe
    // é dado ANTES do envio, na tela, que é onde ainda dá para desistir.
    const { error: erroItem } = await supabase.from('VENDA_ITENS').update({
      customization: {
        ...conf,
        arte_cliente: { url, nome, enviada_em: agora, por: 'cliente', aprovada_em: agora },
      },
    }).eq('id', item.id);
    if (erroItem) throw erroItem;

    // O PEDIDO TAMBÉM PRECISA APONTAR PARA UMA ARTE: é `artwork_url`
    // que cumpre o requisito da etapa de Arte no fluxo e é o que o card
    // "Arte" do ERP abre. A primeira arte anexada assume o posto; as
    // seguintes não roubam o lugar dela — elas moram no item, que é
    // onde a produção vai procurar a arte daquela peça.
    const log = Array.isArray(venda.production_log) ? [...venda.production_log] : [];
    log.push({
      action: 'arte_anexada', at: agora, user: 'Cliente (portal)',
      stage: 'documentos', item: item.product_name || null, nota: 'anexada pelo cliente',
    });
    const patch = { production_log: log };
    if (!venda.artwork_url) patch.artwork_url = url;

    const { error: erroVenda } = await supabase.from('VENDAS').update(patch).eq('id', venda.id);
    // Perder o registro no histórico não pode desfazer o envio: a arte
    // já está guardada e amarrada ao item.
    if (erroVenda) console.error('[acompanhar:arte-anexada]', erroVenda.message);

    // O PEDIDO ANDA. Antes não andava: a cliente mandava a arte e a
    // linha do tempo continuava escrita "Aguardando anexo da arte" —
    // ela via na própria tela que o sistema não tinha percebido o que
    // ela acabara de fazer, e ligava para o vendedor perguntar.
    let avancou = null;
    try {
      const { data: v2 } = await supabase.from('VENDAS')
        .select('tenant_id').eq('id', venda.id).maybeSingle();
      const carga = v2 && await carregarParaFluxo(v2.tenant_id, venda.id);
      const passo = carga && await Auto.avancarAposArte(v2.tenant_id, carga.venda, carga.aplicaveis, req);
      if (passo) {
        await gravarPasso(v2.tenant_id, venda.id, passo);
        avancou = passo.status;
      }
    } catch (e) {
      // A arte já está guardada. O pedido ficar onde estava é
      // recuperável; perder o arquivo da cliente, não.
      console.error('[acompanhar:arte-anexada] avanco:', e?.message || e);
    }

    res.json({
      ok: true, url, enviada_em: agora,
      status: avancou || venda.status,
      status_label: avancou ? A.infoStatus(avancou).label : null,
    });
  } catch (err) {
    console.error('[acompanhar:arte-anexada]', err?.message || err);
    res.status(500).json({ error: 'Não foi possível enviar a arte agora.' });
  }
});

/**
 * O CLIENTE VÊ A ARTE QUE A LOJA MANDOU E DIZ SE É AQUILO.
 *
 * O QUE FALTAVA. A loja anexava a arte pelo ERP e o pedido seguia
 * sozinho para a serigrafia. O cliente descobria o desenho quando a
 * foto do produto pronto chegava — e a hora de descobrir que o nome
 * está escrito errado não é depois de mil copos impressos.
 *
 * DUAS RESPOSTAS, DOIS CAMINHOS:
 *
 *   confirmar  a arte passa a valer como combinada. Daqui o cliente não
 *              troca mais sozinho (a rota de anexo recusa), porque o
 *              desenho vai virar vegetal, tela e copo — e o pedido, que
 *              estava parado esperando esta resposta, anda.
 *
 *   reprovar   o item fica marcado, o pedido NÃO anda e a etapa de arte
 *              passa a ter um requisito não cumprido no painel do
 *              vendedor. Quem conserta é a loja, anexando outra arte —
 *              e a arte nova nasce sem aprovação nenhuma, esperando o
 *              cliente de novo.
 *
 * O MOTIVO DA RECUSA É OPCIONAL E VAI PARA O HISTÓRICO. Obrigar a
 * escrever faria gente inventar "não gostei" para conseguir clicar; sem
 * campo nenhum, o vendedor liga para perguntar o que já podia estar
 * escrito.
 *
 * A CONFIRMAÇÃO DUPLA MORA NA TELA, e é lá que ela faz sentido: aqui a
 * decisão chega uma vez só, e repetir a pergunta no servidor não
 * protegeria de nada.
 */
router.post('/pedido/:id/item/:itemId/arte-decisao', exigirToken, async (req, res) => {
  try {
    const saleId = await pedidoDoCliente(req.params.id, req.customerId);
    if (!saleId) return res.status(404).json({ error: 'Pedido não encontrado.' });

    const decisao = String(req.body?.decisao || '').trim().toLowerCase();
    if (!['aprovar', 'reprovar'].includes(decisao)) {
      return res.status(400).json({ error: 'Diga se você confirma ou reprova a arte.' });
    }
    const motivo = String(req.body?.motivo || '').trim().slice(0, 500) || null;

    const { data: venda } = await supabase.from('VENDAS')
      .select('id, tenant_id, status, production_log').eq('id', saleId).maybeSingle();
    if (!venda) return res.status(404).json({ error: 'Pedido não encontrado.' });

    const { data: item } = await supabase.from('VENDA_ITENS')
      .select('id, sale_id, product_name, customization')
      .eq('id', req.params.itemId).maybeSingle();
    if (!item || item.sale_id !== saleId) {
      return res.status(404).json({ error: 'Item não encontrado.' });
    }

    const conf = item.customization || {};
    const arte = estadoDaArte(conf);

    if (arte.estado === 'sem_arte') {
      return res.status(409).json({ error: 'Este item ainda não tem arte para confirmar.' });
    }
    // Já respondida: a resposta que vale é a primeira. Sem isto, um
    // duplo toque no celular viraria aprovar-e-reprovar, e o histórico
    // ficaria com as duas.
    if (arte.estado === 'aprovada') {
      return res.status(409).json({
        error: 'Você já confirmou a arte deste item.',
        dica: 'Para mudar alguma coisa agora, fale com um atendente.',
        code: 'ARTE_CONFIRMADA',
      });
    }
    if (arte.estado === 'reprovada' && decisao === 'reprovar') {
      return res.status(409).json({ error: 'Você já reprovou esta arte. A loja vai mandar outra.' });
    }

    const agora = new Date().toISOString();
    const anexo = conf.arte_cliente || {};
    const arteNova = decisao === 'aprovar'
      ? { ...anexo, aprovada_em: agora, reprovada_em: null, motivo: null }
      : { ...anexo, reprovada_em: agora, aprovada_em: null, motivo };

    const { error: erroItem } = await supabase.from('VENDA_ITENS')
      .update({ customization: { ...conf, arte_cliente: arteNova } })
      .eq('id', item.id);
    if (erroItem) throw erroItem;

    const log = Array.isArray(venda.production_log) ? [...venda.production_log] : [];
    log.push({
      stage: 'documentos',
      action: decisao === 'aprovar' ? 'arte_confirmada_cliente' : 'arte_reprovada_cliente',
      at: agora,
      user: 'Cliente (portal)',
      item: item.product_name || null,
      nota: decisao === 'aprovar'
        ? 'cliente confirmou a arte'
        : `cliente reprovou a arte${motivo ? `: ${motivo}` : ''}`,
    });
    const { error: erroVenda } = await supabase.from('VENDAS')
      .update({ production_log: log }).eq('id', venda.id);
    // O histórico é importante, a decisão é mais: ela já está gravada no
    // item, e é ela que trava a troca e solta o pedido.
    if (erroVenda) console.error('[acompanhar:arte-decisao]', erroVenda.message);

    // O PEDIDO ANDA SE ERA ISTO QUE FALTAVA. Com a última arte
    // confirmada, a etapa de arte passa a estar cumprida — e quem move
    // o pedido é o mesmo motor da tela do vendedor, para a linha do
    // tempo ficar igual à de um pedido tocado no clique.
    let avancou = null;
    if (decisao === 'aprovar') {
      try {
        const carga = await carregarParaFluxo(venda.tenant_id, venda.id);
        const passo = carga && await Auto.avancarAposArte(venda.tenant_id, carga.venda, carga.aplicaveis, req);
        if (passo) {
          await gravarPasso(venda.tenant_id, venda.id, passo);
          avancou = passo.status;
        }
      } catch (e) {
        console.error('[acompanhar:arte-decisao] avanco:', e?.message || e);
      }
    }

    res.json({
      ok: true,
      decisao,
      em: agora,
      status: avancou || venda.status,
      status_label: A.infoStatus(avancou || venda.status).label,
    });
  } catch (err) {
    console.error('[acompanhar:arte-decisao]', err?.message || err);
    res.status(500).json({ error: 'Não foi possível registrar sua resposta agora.' });
  }
});

module.exports = router;
