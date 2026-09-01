const express = require('express');
const router = express.Router();
const Joi = require('joi');
const supabase = require('../config/supabase');
// Quem sabe se o pedido é entrega ou retirada — a mesma resposta que a
// linha do tempo usa, para as duas nunca discordarem.
const A = require('../lib/atencao');
const { makeClient } = require('../config/supabase');
const { audit } = require('../lib/audit');
const { validate } = require('../middleware/validate');
const { recomputeRating } = require('../lib/customerRating');
const { ORIGENS, normalizarOrigem } = require('../lib/origens');
const { autorizar, excluirVenda } = require('../lib/excluirVenda');
// O motor que move o pedido de etapa. A regua, os requisitos e quem pode
// dar cada passo moram la - aqui so se le o pedido, chama e grava.
const F = require('../lib/fluxoPedido');
const { etapasDosItens, caracteristicasDoItem } = require('../lib/itensPedido');
const C = require('../lib/comprovante');
// A cobranca PIX da chave da propria loja (Nubank). Sem gateway: o
// dinheiro cai direto na conta, e por isso a baixa e manual.
const { gerarCobrancaPix } = require('../lib/pixCobranca');

const saleSchema = Joi.object({
  items: Joi.array().min(1).items(
    Joi.object({
      product_id: Joi.string().uuid().required(),
      quantity:   Joi.number().positive().required(),
      unit_price: Joi.number().min(0),
    }).unknown(true)
  ).required(),
  customer_id: Joi.string().uuid().allow(null, ''),
  discount:    Joi.number().min(0),
  installments: Joi.number().integer().min(1),
}).unknown(true);

// Condições de pagamento (juros/desconto por forma) — config global em EMPRESAS.settings.payment_terms.
// percent negativo = desconto (ex.: PIX -8); positivo = acréscimo/juros (ex.: 12x +10).
router.get('/payment-terms', async (req, res) => {
  try {
    const { data } = await supabase.from('EMPRESAS').select('settings').eq('id', req.tenantId).maybeSingle();
    const terms = data?.settings?.payment_terms;
    res.json({ data: Array.isArray(terms) ? terms : [] });
  } catch (err) { res.json({ data: [] }); }
});

// O vocabulário de origem que a tela desenha no seletor e na coluna.
router.get('/origens', (req, res) => res.json(ORIGENS));

const isISODate = v => /^\d{4}-\d{2}-\d{2}$/.test(String(v || ''));

// ── O QUE ESTE USUÁRIO PODE VER ──────────────────────────
//
// A lista de pedidos mostrava TUDO para todo mundo que tivesse o módulo
// 'sales'. Um vendedor abria a tela e via a carteira dos colegas — nome
// de cliente, valor, margem de negociação. Não era permissão frouxa: era
// a ausência de qualquer pergunta sobre de quem é o pedido.
//
// A resposta tem DUAS pernas, e a segunda é a que costuma faltar:
//
//   1. OS MEUS       — pedidos em que eu sou o vendedor (user_id).
//   2. O MEU TERRITÓRIO — pedidos de clientes das UFs que o meu cadastro
//      de vendedor lista em `territory`. É por aqui que entra o pedido
//      que caiu pela loja ou que outro digitou para um cliente do RS
//      quando o RS é meu. Sem esta perna, o vendedor da região Sul não
//      enxergaria a compra da própria região só porque não foi ele quem
//      apertou o botão.
//
// Admin e gerente veem tudo — é o trabalho deles ver tudo.
//
// Devolve `null` quando não há restrição, ou um filtro para aplicar.
const VE_TUDO = ['admin', 'manager'];
const UF_OK = /^[A-Z]{2}$/;

async function escopoDoVendedor(req) {
  if (VE_TUDO.includes(req.userProfile?.role)) return null;

  let ufs = [];
  try {
    const { data } = await supabase.from('VENDEDORES')
      .select('territory').eq('tenant_id', req.tenantId).eq('user_id', req.user.id).maybeSingle();
    ufs = (data?.territory || []).map(u => String(u).toUpperCase().trim()).filter(u => UF_OK.test(u));
  } catch { /* sem cadastro de vendedor: fica só com os pedidos dele */ }

  if (!ufs.length) return { userId: req.user.id, customerIds: [] };

  // A UF do cliente mora dentro de address (jsonb), e não numa coluna.
  const { data: clientes } = await supabase.from('CLIENTES')
    .select('id').eq('tenant_id', req.tenantId).in('address->>state', ufs).limit(5000);

  return { userId: req.user.id, customerIds: (clientes || []).map(c => c.id) };
}

/** Aplica o escopo numa query de VENDAS já montada. */
function aplicarEscopo(query, escopo) {
  if (!escopo) return query;
  if (!escopo.customerIds.length) return query.eq('user_id', escopo.userId);
  const lista = escopo.customerIds.map(id => `"${id}"`).join(',');
  return query.or(`user_id.eq.${escopo.userId},customer_id.in.(${lista})`);
}

router.get('/', async (req, res) => {
  const { status, type, search } = req.query;
  const limit = Math.min(Math.max(parseInt(req.query.limit) || 50, 1), 200);
  const page = Math.max(parseInt(req.query.page) || 1, 1);
  const offset = (page - 1) * limit;
  // datas entram na string do filtro .or() → só aceita AAAA-MM-DD
  const start_date = isISODate(req.query.start_date) ? req.query.start_date : null;
  const end_date   = isISODate(req.query.end_date)   ? req.query.end_date   : null;

  try {
    // Busca do topo da tela. Só dígitos = código do cliente (o número
    // permanente que ele recebeu no primeiro cadastro, com ou sem os
    // zeros à esquerda); qualquer outra coisa = nome. Duas buscas numa
    // caixa só porque é assim que o operador pensa: ou ele sabe o código,
    // ou ele lembra o nome.
    let customerIds = null;
    if (search) {
      const termo = String(search).trim();
      const soDigitos = /^\d+$/.test(termo);

      let q = supabase.from('CLIENTES').select('id').eq('tenant_id', req.tenantId).limit(200);
      q = soDigitos
        ? q.eq('display_id', parseInt(termo, 10))
        : q.ilike('name', `%${termo}%`);

      const { data: customers } = await q;
      customerIds = (customers || []).map(c => c.id);
      if (customerIds.length === 0) {
        return res.json({ data: [], total: 0, page: Number(page), limit: Number(limit) });
      }
    }

    let query = supabase
      .from('VENDAS')
      .select('*, CLIENTES(id, name, cpf_cnpj, display_id), USUARIOS(name)', { count: 'exact' })
      .eq('tenant_id', req.tenantId)
      .order('created_at', { ascending: false });

    if (status) query = query.eq('status', status);
    if (type) query = query.eq('type', type);
    // Filtro por período: usa a Data da Operação (operation_date) que é a que
    // aparece na coluna "Data"; quando ela não existe, cai para created_at.
    if (start_date || end_date) {
      const op = [];
      const ca = ['operation_date.is.null'];
      if (start_date) { op.push(`operation_date.gte.${start_date}`); ca.push(`created_at.gte.${start_date}`); }
      if (end_date)   { op.push(`operation_date.lte.${end_date}`);   ca.push(`created_at.lte.${end_date}T23:59:59`); }
      query = query.or(`and(${op.join(',')}),and(${ca.join(',')})`);
    }
    if (customerIds) query = query.in('customer_id', customerIds);
    query = aplicarEscopo(query, await escopoDoVendedor(req));
    query = query.range(offset, offset + limit - 1);

    const { data, error, count } = await query;
    if (error) throw error;

    // O NOME DA TRANSPORTADORA, e não o uuid dela.
    //
    // A lista mostra a coluna Transportadora; sem esta resolução ela
    // mostraria um identificador que não diz nada a ninguém. Vem numa
    // consulta só para a página inteira — uma por linha seria cinquenta
    // idas ao banco para desenhar uma tela.
    const linhas = data || [];
    const idsTransp = [...new Set(linhas.map(v => v.carrier_id).filter(Boolean))];
    if (idsTransp.length) {
      try {
        const { data: transp } = await supabase.from('TRANSPORTADORAS')
          .select('id, name, trade_name').eq('tenant_id', req.tenantId).in('id', idsTransp);
        const porId = Object.fromEntries((transp || []).map(t => [t.id, t.trade_name || t.name]));
        for (const v of linhas) v.transportadora = porId[v.carrier_id] || null;
      } catch { /* sem transportadora a coluna fica vazia, e a lista abre */ }
    }

    res.json({ data: linhas, total: count, page: Number(page), limit: Number(limit) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const { data: sale, error: saleError } = await supabase
      .from('VENDAS')
      .select('*, CLIENTES(*), USUARIOS(name)')
      .eq('id', req.params.id)
      .eq('tenant_id', req.tenantId)
      .single();

    if (saleError || !sale) return res.status(404).json({ error: 'Venda não encontrada' });

    // Esconder na lista e deixar abrir pelo endereço não é esconder: o
    // id vaza num print, num link colado no grupo, no histórico do
    // navegador. A mesma pergunta da lista vale aqui.
    const escopo = await escopoDoVendedor(req);
    if (escopo) {
      const meu = sale.user_id === escopo.userId;
      const doTerritorio = sale.customer_id && escopo.customerIds.includes(sale.customer_id);
      if (!meu && !doTerritorio) {
        return res.status(404).json({ error: 'Venda não encontrada' });
      }
    }

    const { data: items } = await supabase
      .from('VENDA_ITENS')
      .select('*, PRODUTOS(id, name, code, unit)')
      .eq('sale_id', req.params.id);

    const { data: payments } = await supabase
      .from('LANCAMENTOS')
      .select('*')
      .eq('reference_type', 'sale')
      .eq('reference_id', req.params.id);

    // O ROTULO DO STATUS VEM DAQUI, e nao de uma copia no frontend.
    // A tela tinha uma lista de nove status para traduzir `status` em
    // texto; com o fluxo inteiro liberado, os outros dezenove chegavam
    // nela sem tradução e apareciam crus ("aguardando_qualidade"). O
    // catalogo é um só (lib/atencao.js) e é ele que responde.
    const infoStatus = A.infoStatus(sale.status);
    res.json({
      ...sale,
      items: items || [],
      payments: payments || [],
      status_label: infoStatus.label,
      status_cor: infoStatus.cor,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/', validate(saleSchema), async (req, res) => {
  const {
    customer_id, type, items, notes, discount, delivery_date,
    artwork_url, artwork_notes, payment_method, installments, first_due_date,
    operation_date, event_date, ship_date, max_delivery_date, freight, payment_adjustment, carrier_id,
    delivery_mode, // entrega ou retirada — decide se o pedido passa por Em Trânsito
    billing_company_id, receiving_account_id, // Contábil: empresa faturadora + conta de destino (migração 043)
    origin, // de onde veio o cliente (Shopee, WhatsApp, Site...) — migração 067
  } = req.body;

  if (!items || items.length === 0) {
    return res.status(400).json({ error: 'A venda deve ter ao menos um item' });
  }
  if (payment_method === 'a_prazo' && !customer_id) {
    return res.status(400).json({ error: 'Venda a prazo exige um cliente identificado' });
  }

  // Apenas admin/gerente podem praticar preço abaixo da tabela;
  // para os demais o servidor aplica o preço oficial (faixas/sale_price)
  const allowOverride = ['admin', 'manager'].includes(req.userProfile?.role);

  try {
    const { data, error } = await supabase.rpc('criar_venda', {
      _tenant_id:            req.tenantId,
      _user_id:              req.user.id,
      _customer_id:          customer_id || null,
      _type:                 type || 'sale',
      _items:                items,
      _discount:             Number(discount) || 0,
      _payment_method:       payment_method || null,
      _notes:                notes || null,
      _delivery_date:        delivery_date || null,
      _artwork_url:          artwork_url || null,
      _artwork_notes:        artwork_notes || null,
      _allow_price_override: allowOverride,
      _installments:         payment_method === 'a_prazo' ? Math.max(parseInt(installments) || 1, 1) : 1,
      _first_due_date:       payment_method === 'a_prazo' ? (first_due_date || null) : null,
    });

    if (error) {
      // Função ainda não existe no banco (migração pendente) → caminho legado
      if (/criar_venda/i.test(error.message) && /function|não existe|does not exist|schema cache/i.test(error.message)) {
        return legacyCreateSale(req, res);
      }
      // Erros de negócio da função (RAISE EXCEPTION) viram 400 legíveis
      return res.status(400).json({ error: error.message.replace(/^.*?:\s*/, '') });
    }

    // Pedido de venda começa em "INICIANDO PEDIDO" + datas e chave do pedido
    if (data?.id) {
      const patch = { status: 'iniciando_pedido' };
      if (operation_date) patch.operation_date = operation_date;
      if (event_date) patch.event_date = event_date;
      if (ship_date) patch.ship_date = ship_date;
      if (delivery_date) patch.delivery_date = delivery_date;
      if (max_delivery_date) patch.max_delivery_date = max_delivery_date;
      if (carrier_id) patch.carrier_id = carrier_id;
      // ENTREGA OU RETIRADA, JA NA CRIACAO.
      //
      // So havia como gravar isto DEPOIS, pela rota de logistica
      // (PATCH /:id/entrega). O PDV entao marcava retirada escrevendo
      // uma observacao em texto e zerando a transportadora — e o pedido
      // nascia sem `delivery_mode`, que e a coluna que lib/atencao.js le
      // para decidir se pula "Em Transito". Retirada criada no PDV
      // seguia a rota de entrega, esperando uma coleta que nao existia.
      if (delivery_mode) patch.delivery_mode = delivery_mode === 'retirada' ? 'retirada' : 'entrega';
      // De onde veio o cliente. Fora do vocabulário vira null em vez de
      // entrar torta — "ML", "mercado livre" e "Mercado Livre" não
      // agrupariam em relatório nenhum.
      const origemOk = normalizarOrigem(origin);
      if (origemOk) patch.origin = origemOk;
      if (billing_company_id) patch.billing_company_id = billing_company_id;
      if (receiving_account_id) patch.receiving_account_id = receiving_account_id;
      // Frete + ajuste por condição de pagamento (juros/desconto): somam no total da venda
      const freightVal = Number(freight) || 0;
      const payAdj = Number(payment_adjustment) || 0;
      if (freightVal || payAdj) {
        if (freightVal) patch.freight = freightVal;
        patch.total = Math.max(0, (Number(data.total) || 0) + freightVal + payAdj);
      }
      // tenta gravar tudo; se alguma coluna não existir, remove a citada e tenta de novo
      let attempt = { ...patch };
      for (let i = 0; i < 6; i++) {
        const { error: uErr } = await supabase.from('VENDAS').update(attempt).eq('id', data.id).eq('tenant_id', req.tenantId);
        if (!uErr) break;
        const m = (uErr.message || '').match(/column "?(\w+)"?/i);
        if (m && attempt[m[1]] !== undefined && m[1] !== 'status') { delete attempt[m[1]]; continue; }
        // erro não relacionado a coluna: garante ao menos o status
        await supabase.from('VENDAS').update({ status: 'iniciando_pedido' }).eq('id', data.id).eq('tenant_id', req.tenantId);
        break;
      }
      Object.assign(data, attempt);
      data.status = 'iniciando_pedido';
    }

    audit(req, 'create', 'sale', data?.id, {
      number: data?.number, total: data?.total, items: items.length, payment_method,
    });
    // Atualiza as estrelas automáticas do cliente pela compra (12 meses) — sem travar a resposta
    if (customer_id) recomputeRating(req.tenantId, customer_id).catch(() => {});
    res.status(201).json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Caminho legado (não transacional) — usado apenas enquanto a função
// criar_venda não tiver sido criada no banco via MIGRATIONS.sql
async function legacyCreateSale(req, res) {
  const { customer_id, type, items, notes, discount, delivery_date, artwork_url, artwork_notes, payment_method, operation_date, freight, payment_adjustment } = req.body;
  try {
    const { data: nextNumber } = await supabase
      .rpc('proximo_numero_venda', { p_tenant_id: req.tenantId });

    const subtotal = items.reduce((sum, item) => sum + (item.quantity * item.unit_price), 0);
    const totalDiscount = discount || 0;
    const freightVal = Number(freight) || 0;
    const payAdj = Number(payment_adjustment) || 0;
    const total = Math.max(0, subtotal - totalDiscount + freightVal + payAdj);

    const { data: sale, error: saleError } = await supabase
      .from('VENDAS')
      .insert({
        tenant_id: req.tenantId,
        number: nextNumber,
        type: type || 'sale',
        customer_id,
        user_id: req.user.id,
        status: 'iniciando_pedido',
        ...(operation_date ? { operation_date } : {}),
        subtotal,
        discount: totalDiscount,
        freight: freightVal,
        total,
        notes,
        artwork_url,
        artwork_notes,
        delivery_date,
        payment_method,
      })
      .select()
      .single();

    if (saleError) throw saleError;

    // Contábil: empresa faturadora + conta de destino (migração 043; ignora se as colunas faltarem)
    if (req.body.billing_company_id || req.body.receiving_account_id) {
      const bill = {};
      if (req.body.billing_company_id) bill.billing_company_id = req.body.billing_company_id;
      if (req.body.receiving_account_id) bill.receiving_account_id = req.body.receiving_account_id;
      await supabase.from('VENDAS').update(bill).eq('id', sale.id).eq('tenant_id', req.tenantId);
    }

    const saleItems = items.map(item => ({
      sale_id: sale.id,
      product_id: item.product_id,
      quantity: item.quantity,
      unit_price: item.unit_price,
      discount: item.discount || 0,
      total: item.quantity * item.unit_price - (item.discount || 0),
      customization: item.customization || null,
    }));

    const { error: itemsError } = await supabase.from('VENDA_ITENS').insert(saleItems);
    if (itemsError) throw itemsError;

    for (const item of items) {
      await supabase.rpc('atualizar_estoque', {
        p_tenant_id: req.tenantId,
        p_product_id: item.product_id,
        p_quantity: -item.quantity,
        p_type: 'exit',
        p_reference_type: 'sale',
        p_reference_id: sale.id,
        p_user_id: req.user.id,
      });
    }

    // Venda a prazo → gera contas a receber (parcelas mensais)
    if (payment_method === 'a_prazo' && customer_id) {
      const n = Math.max(parseInt(req.body.installments) || 1, 1);
      const parcela = Math.round((total / n) * 100) / 100;
      const base = req.body.first_due_date ? new Date(req.body.first_due_date) : new Date(Date.now() + 30 * 86400000);
      const rows = [];
      for (let i = 0; i < n; i++) {
        const due = new Date(base);
        due.setMonth(due.getMonth() + i);
        rows.push({
          tenant_id: req.tenantId, user_id: req.user.id,
          description: `Venda #${nextNumber}${n > 1 ? ` (${i + 1}/${n})` : ''}`,
          type: 'receivable',
          amount: i === n - 1 ? total - parcela * (n - 1) : parcela,
          paid_amount: 0, due_date: due.toISOString().split('T')[0],
          status: 'pending', customer_id,
          document_number: `Venda #${nextNumber}`,
          installment: i + 1, total_installments: n,
          reference_type: 'sale', reference_id: sale.id,
        });
      }
      await supabase.from('LANCAMENTOS').insert(rows);
    }

    res.status(201).json(sale);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

// ============================================================
// O FLUXO DO PEDIDO — as rotas que fazem o pedido ANDAR.
//
// Antes existia uma lista de nove status aqui dentro, e ela era a razão
// de o módulo não funcionar: o pedido percorre quinze fases, e a maior
// parte delas simplesmente não tinha como ser alcançada. Um copo que
// precisava de revelação, pintura ou controle de qualidade parava para
// sempre na etapa anterior.
//
// Agora a régua é uma só (lib/atencao.js) e quem decide o passo é uma só
// (lib/fluxoPedido.js). Estas rotas leem o pedido, perguntam ao motor e
// gravam o que ele mandar.
// ============================================================

// Tudo que o motor precisa saber sobre o pedido para decidir. Os itens
// entram porque são eles que dizem se este pedido passa por pintura e
// por borda — isso não se pergunta ao status.
// `total` entra por causa do comprovante: quando o pedido ainda nao tem
// parcela no contas a receber, a parcela e virtual e o valor dela E o
// total do pedido. (E uma lista do PostgREST, nao SQL: sem comentario
// dentro.)
const CAMPOS_FLUXO = `
  id, number, status, total, production_log, delivery_mode, notes, created_at,
  artwork_url, art_file, receipt_url, production_photos, carrier_id, tracking_code,
  VENDA_ITENS ( id, product_name, quantity, unit_price, discount, total, customization,
                PRODUTOS ( id, code, name, unit, ink_type ) )
`;

async function carregarParaFluxo(tenantId, id) {
  let { data, error } = await supabase.from('VENDAS').select(CAMPOS_FLUXO)
    .eq('id', id).eq('tenant_id', tenantId).maybeSingle();

  // Base sem as colunas mais novas: o pedido tem que abrir do mesmo
  // jeito — o fluxo só fica sem os requisitos que dependem delas.
  if (error && /column|does not exist|schema cache/i.test(error.message || '')) {
    const basico = CAMPOS_FLUXO.replace(', delivery_mode', '').replace(', tracking_code', '');
    ({ data, error } = await supabase.from('VENDAS').select(basico)
      .eq('id', id).eq('tenant_id', tenantId).maybeSingle());
  }
  if (error) throw error;
  if (!data) return null;

  const itens = (data.VENDA_ITENS || []).map(i => caracteristicasDoItem(i));

  // OS COMPROVANTES ENTRAM NA FICHA porque agora sao eles que liberam a
  // etapa de pagamento. Uma consulta a mais por leitura do fluxo — que
  // e a tela de detalhe de UM pedido, aberta por uma pessoa de cada vez.
  // Se a leitura falhar, o pedido abre do mesmo jeito: fica sem o
  // requisito cumprido, e nao sem a tela.
  let comprovante_quitado = false;
  try {
    const parcelas = await C.parcelasDaVenda(tenantId, data);
    const aberto = parcelas.reduce((soma, x) => soma + (x.falta || 0), 0);
    comprovante_quitado = parcelas.length > 0 && aberto <= 0.005;
  } catch { /* sem parcelas legiveis: o requisito segue por cumprir */ }

  return {
    venda: { ...data, itens_qtd: itens.length, comprovante_quitado },
    aplicaveis: etapasDosItens(itens),
  };
}

const quemPergunta = req => ({ acesso: req.acesso, perfil: req.userProfile });

/**
 * Grava o resultado de um passo do motor.
 *
 * O `production_log` veio numa migração mais nova que a tabela. Se ele
 * não existir, o status muda mesmo assim — perder o histórico é ruim,
 * travar a fábrica é pior.
 */
async function gravarPasso(tenantId, id, passo) {
  let { data, error } = await supabase.from('VENDAS')
    .update({ status: passo.status, production_log: passo.log })
    .eq('id', id).eq('tenant_id', tenantId).select('id, number, status').single();

  if (error && /production_log|column|does not exist/i.test(error.message || '')) {
    ({ data, error } = await supabase.from('VENDAS')
      .update({ status: passo.status })
      .eq('id', id).eq('tenant_id', tenantId).select('id, number, status').single());
  }
  if (error) throw error;
  return data;
}

/** A ficha depois do passo — a tela redesenha sem pedir de novo. */
async function fichaAtual(req) {
  const carga = await carregarParaFluxo(req.tenantId, req.params.id);
  return carga ? F.fichaDeFluxo(carga.venda, carga.aplicaveis, quemPergunta(req)) : null;
}

// ============================================================
// O COMPROVANTE DE PAGAMENTO, PARCELA A PARCELA (migracao 095).
//
// "Liberar pagamento" dizia "confia em mim". Estas rotas trocam isso por
// um arquivo: cada parcela recebe o seu comprovante, a maquina le a
// imagem e o financeiro confere depois. O botao de liberar continua
// existindo em /pagamento/liberar - mas como excecao, para quando o
// dinheiro caiu e ninguem tem o papel.
// ============================================================

async function vendaDoComprovante(req) {
  const { data } = await supabase.from('VENDAS')
    .select('id, number, total, customer_id, payment_method, status')
    .eq('id', req.params.id).eq('tenant_id', req.tenantId).maybeSingle();
  return data || null;
}

/**
 * A COBRANCA PIX DO PEDIDO.
 *
 * Gerada DEPOIS que o pedido nasce, e nao antes, porque o txid da
 * cobranca e o id do pedido: e por ele que o financeiro reconhece o
 * dinheiro que caiu na conta. Cobranca sem pedido seria um PIX que
 * ninguem sabe de quem e.
 *
 * Nao ha gateway (decisao da Lyon: taxa zero). O BR Code aponta para a
 * chave da propria loja, entao o banco nao avisa o sistema quando o
 * PIX cai — quem da a baixa e o financeiro, na mao. A tela avisa isso.
 */
router.post('/:id/pix', async (req, res) => {
  try {
    const { data: venda } = await supabase.from('VENDAS')
      .select('id, number, total, payment_method, status')
      .eq('id', req.params.id).eq('tenant_id', req.tenantId).maybeSingle();
    if (!venda) return res.status(404).json({ error: 'Pedido nao encontrado' });

    const valor = Number(venda.total) || 0;
    if (valor <= 0) return res.status(400).json({ error: 'Pedido sem valor a cobrar' });

    const cobranca = await gerarCobrancaPix({ tenantId: req.tenantId, amount: valor, txid: venda.id });
    // Sem chave cadastrada nao ha o que gerar — e dizer isso e melhor do
    // que devolver um QR que nao leva a conta nenhuma.
    if (!cobranca) {
      return res.status(400).json({
        error: 'Chave PIX nao configurada. Cadastre em Configuracoes > Empresa > PIX.',
      });
    }

    audit(req, 'pix', 'sale', venda.id, { amount: valor, provider: 'static' });
    res.json({
      number: venda.number,
      amount: valor,
      qr_code_base64: cobranca.qr_base64,
      copy_paste: cobranca.copy_paste,
      txid: cobranca.txid,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// As parcelas do pedido, com o que ja foi anexado em cada uma.
router.get('/:id/parcelas', async (req, res) => {
  try {
    const venda = await vendaDoComprovante(req);
    if (!venda) return res.status(404).json({ error: 'Pedido nao encontrado' });
    const parcelas = await C.parcelasDaVenda(req.tenantId, venda);
    const aberto = parcelas.reduce((soma, x) => soma + (x.falta || 0), 0);
    res.json({
      parcelas,
      total: Number(venda.total) || 0,
      em_aberto: Math.round(aberto * 100) / 100,
      quitado: aberto <= 0.005,
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

/**
 * Anexa o comprovante numa parcela.
 *
 * `parcela_id` vazio = o pedido ainda nao tem parcela no contas a
 * receber (venda a vista); a primeira e criada aqui, no momento em que
 * alguem diz que pagou.
 */
router.post('/:id/parcelas/comprovante', async (req, res) => {
  const { parcela_id, arquivo, valor } = req.body || {};
  if (!arquivo) return res.status(400).json({ error: 'Envie o arquivo do comprovante.' });
  try {
    const venda = await vendaDoComprovante(req);
    if (!venda) return res.status(404).json({ error: 'Pedido nao encontrado' });

    const r = await C.anexarComprovante(req.tenantId, venda, parcela_id || null, { arquivo, valor, req });
    if (r.erro) return res.status(400).json({ error: r.erro });

    audit(req, 'update', 'comprovante', venda.id, {
      parcela: r.parcela.id, valor: r.parcela.paid_amount,
      leitura_ok: r.leitura.ok, divergente: r.divergente, gerou_saldo: !!r.saldo,
    });
    res.json(r);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// O link temporario para ver o comprovante (o arquivo e privado).
router.get('/:id/parcelas/:parcelaId/comprovante', async (req, res) => {
  try {
    const { data } = await supabase.from('LANCAMENTOS').select('receipt_url')
      .eq('tenant_id', req.tenantId).eq('id', req.params.parcelaId).maybeSingle();
    if (!data || !data.receipt_url) {
      return res.status(404).json({ error: 'Esta parcela ainda nao tem comprovante.' });
    }
    const url = await C.linkDoComprovante(data.receipt_url);
    if (!url) return res.status(502).json({ error: 'Nao foi possivel abrir o comprovante agora.' });
    res.json({ url });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// A conferencia do financeiro - o outro lado da leitura automatica.
router.post('/:id/parcelas/:parcelaId/conferir', async (req, res) => {
  try {
    const r = await C.conferir(req.tenantId, req.params.parcelaId, {
      status: req.body && req.body.status, nota: req.body && req.body.nota, req,
    });
    if (r.erro) return res.status(400).json({ error: r.erro });
    audit(req, 'update', 'comprovante', req.params.parcelaId, { conferencia: req.body && req.body.status });
    res.json(r);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Onde o pedido está, o que falta para ele seguir e qual é o botão.
router.get('/:id/fluxo', async (req, res) => {
  try {
    const ficha = await fichaAtual(req);
    if (!ficha) return res.status(404).json({ error: 'Pedido não encontrado' });
    res.json(ficha);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Um passo à frente: conclui a fase atual e entrega o pedido na próxima.
router.post('/:id/fluxo/avancar', async (req, res) => {
  try {
    const carga = await carregarParaFluxo(req.tenantId, req.params.id);
    if (!carga) return res.status(404).json({ error: 'Pedido não encontrado' });

    const passo = F.avancar(carga.venda, carga.aplicaveis, quemPergunta(req), req, req.body?.observacao);
    if (passo.erro) {
      return res.status(passo.http || 400).json({ error: passo.erro, requisitos: passo.requisitos || null });
    }

    const salvo = await gravarPasso(req.tenantId, req.params.id, passo);
    audit(req, 'update', 'sale', req.params.id, { fluxo: 'avancar', fase: passo.fase.key, status: passo.destino });
    res.json({ ...salvo, fluxo: await fichaAtual(req) });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

/**
 * ENVIAR O PEDIDO PARA A PRODUÇÃO.
 *
 * O pedido NÃO muda de status: ele continua onde estava. O que muda é
 * que a fábrica passa a vê-lo na fila e as etapas dela destravam.
 *
 * Antes disto, a produção via na tela qualquer pedido que tivesse
 * chegado num certo status — inclusive os que o comercial ainda estava
 * acertando com o cliente. Agora existe um momento em que alguém diz
 * "pode começar", e ele fica no histórico com nome e hora.
 */
router.post('/:id/producao/enviar', async (req, res) => {
  try {
    const carga = await carregarParaFluxo(req.tenantId, req.params.id);
    if (!carga) return res.status(404).json({ error: 'Pedido não encontrado' });

    const passo = F.enviarParaProducao(carga.venda, carga.aplicaveis, quemPergunta(req), req);
    if (passo.erro) return res.status(passo.http || 400).json({ error: passo.erro });

    const { error } = await supabase.from('VENDAS')
      .update({ production_log: passo.log })
      .eq('id', req.params.id).eq('tenant_id', req.tenantId);
    if (error) throw error;

    audit(req, 'update', 'sale', req.params.id, { fluxo: 'enviar_producao' });
    res.json({ ok: true, fluxo: await fichaAtual(req) });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Um passo atrás, com motivo, para corrigir etapa marcada por engano.
router.post('/:id/fluxo/voltar', async (req, res) => {
  try {
    const carga = await carregarParaFluxo(req.tenantId, req.params.id);
    if (!carga) return res.status(404).json({ error: 'Pedido não encontrado' });

    const passo = F.voltar(carga.venda, carga.aplicaveis, quemPergunta(req), req, req.body?.motivo);
    if (passo.erro) return res.status(passo.http || 400).json({ error: passo.erro });

    const salvo = await gravarPasso(req.tenantId, req.params.id, passo);
    audit(req, 'update', 'sale', req.params.id, {
      fluxo: 'voltar', status: passo.destino, motivo: req.body?.motivo || null,
    });
    res.json({ ...salvo, fluxo: await fichaAtual(req) });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

/**
 * LIBERAR O PAGAMENTO.
 *
 * `modo: 'banco'` é o caminho que a integração bancária vai usar quando
 * ela entrar: ela chama esta mesma rota com a referência da transação e
 * o pedido anda sozinho. `modo: 'manual'` é o de hoje — alguém do
 * financeiro viu o dinheiro e assume a liberação, com motivo registrado.
 *
 * Uma rota só, de propósito. Duas — uma para o robô, outra para a
 * pessoa — seriam duas chances de o pedido andar por caminhos que se
 * comportam diferente.
 */
router.post('/:id/pagamento/liberar', async (req, res) => {
  try {
    const carga = await carregarParaFluxo(req.tenantId, req.params.id);
    if (!carga) return res.status(404).json({ error: 'Pedido não encontrado' });

    const passo = F.liberarPagamento(carga.venda, carga.aplicaveis, quemPergunta(req), req, {
      modo: req.body?.modo,
      motivo: req.body?.motivo,
      referencia: req.body?.referencia,
    });
    if (passo.erro) return res.status(passo.http || 400).json({ error: passo.erro });

    const salvo = await gravarPasso(req.tenantId, req.params.id, passo);
    audit(req, 'update', 'sale', req.params.id, {
      fluxo: 'pagamento_liberado',
      modo: req.body?.modo === 'banco' ? 'banco' : 'manual',
      status: passo.status,
    });
    res.json({ ...salvo, avancou: passo.avancou, fluxo: await fichaAtual(req) });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

/**
 * A rota antiga de status, agora falando com o motor.
 *
 * Ela recebia um status e o gravava conferindo a sequência contra uma
 * lista de nove itens que não existe mais. Agora aceita o PRÓXIMO status
 * do trilho DESTE pedido — o mesmo que /fluxo/avancar faz — e recusa o
 * resto dizendo qual era.
 */
router.patch('/:id/status', async (req, res) => {
  const { status } = req.body;
  try {
    const carga = await carregarParaFluxo(req.tenantId, req.params.id);
    if (!carga) return res.status(404).json({ error: 'Pedido não encontrado' });

    const plano = F.planoDeAvanco(carga.venda, carga.aplicaveis);
    if (plano.erro) return res.status(400).json({ error: plano.erro });
    if (status && ![plano.destino, ...plano.marcos].includes(status)) {
      return res.status(400).json({
        error: `Não é possível pular etapas. O próximo status deste pedido é "${plano.destino}".`,
      });
    }

    const passo = F.avancar(carga.venda, carga.aplicaveis, quemPergunta(req), req);
    if (passo.erro) return res.status(passo.http || 400).json({ error: passo.erro });

    const salvo = await gravarPasso(req.tenantId, req.params.id, passo);
    audit(req, 'update', 'sale', req.params.id, { fluxo: 'avancar', status: passo.destino });
    res.json(salvo);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * "Iniciar Pedido".
 *
 * Ela pulava direto de "Iniciando pedido" para "Aguardando anexo da
 * arte" — passando por cima do financeiro e do estoque. Era o atalho de
 * quando o fluxo tinha nove status e ninguém conferia nada; hoje seria
 * uma porta lateral para produzir sem pagamento confirmado.
 *
 * Agora ela dá o mesmo passo que /fluxo/avancar daria, e nada mais.
 */
router.post('/:id/start', async (req, res) => {
  try {
    const carga = await carregarParaFluxo(req.tenantId, req.params.id);
    if (!carga) return res.status(404).json({ error: 'Pedido não encontrado' });

    const passo = F.avancar(carga.venda, carga.aplicaveis, quemPergunta(req), req);
    if (passo.erro) return res.status(passo.http || 400).json({ error: passo.erro });

    const salvo = await gravarPasso(req.tenantId, req.params.id, passo);
    audit(req, 'update', 'sale', req.params.id, { action: 'iniciar_pedido', status: passo.destino });
    res.json(salvo);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Define a transportadora + código de rastreio do pedido (aba Transportadores)
router.patch('/:id/shipping', async (req, res) => {
  const { carrier_id, tracking_code, delivery_mode } = req.body || {};
  try {
    const patch = {
      carrier_id: carrier_id || null,
      tracking_code: (tracking_code || '').trim() || null,
    };
    // Entrega ou retirada (migração 090). Só entra no patch quando vem
    // na requisição: tela antiga que não manda o campo não pode
    // transformar todo pedido em entrega sem querer.
    if (delivery_mode !== undefined) {
      patch.delivery_mode = delivery_mode === 'retirada' ? 'retirada' : 'entrega';
    }
    const { data, error } = await supabase.from('VENDAS').update(patch)
      .eq('id', req.params.id).eq('tenant_id', req.tenantId).select().single();
    if (error) throw error;
    audit(req, 'update', 'sale', req.params.id, {
      action: 'shipping', tracking_code: patch.tracking_code,
      delivery_mode: patch.delivery_mode ?? null,
    });
    res.json(data);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

/**
 * Corrigir a origem de um pedido já gravado.
 *
 * Os pedidos manuais antigos ficaram sem origem (a migração 069 não
 * chutou nenhuma), e quem lançou sem escolher também. É por aqui que o
 * Administrativo acerta um a um — e fica na auditoria, porque origem
 * alimenta relatório de canal e não pode mudar sem rastro.
 */
router.patch('/:id/origin', async (req, res) => {
  const origem = normalizarOrigem(req.body?.origin);
  if (req.body?.origin && !origem) {
    return res.status(400).json({ error: 'Origem não reconhecida. Use uma das opções da lista.' });
  }
  try {
    const { data: antes } = await supabase.from('VENDAS')
      .select('origin').eq('id', req.params.id).eq('tenant_id', req.tenantId).maybeSingle();

    const { data, error } = await supabase.from('VENDAS').update({ origin: origem })
      .eq('id', req.params.id).eq('tenant_id', req.tenantId).select().single();
    if (error) throw error;

    audit(req, 'update', 'sale', req.params.id, { action: 'origin', de: antes?.origin || null, para: origem });
    res.json(data);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Exclusão do pedido de venda — só ADMIN e com a senha dele
/**
 * Excluir pedido de venda.
 *
 * Quem está no administrativo confirma com a PRÓPRIA senha. Gerente
 * também pode — ele responde pelo time, e obrigar a chamar o dono da
 * empresa para apagar um pedido lançado errado só faz o pedido errado
 * ficar no sistema.
 *
 * A regra de quem autoriza e o desfazer (devolver estoque, limpar
 * financeiro) moram em lib/excluirVenda.js, porque a tela do vendedor
 * usa exatamente os mesmos.
 */
router.post('/:id/delete', async (req, res) => {
  try {
    const papel = req.userProfile?.role;
    if (!['admin', 'manager'].includes(papel)) {
      return res.status(403).json({ error: 'Apenas administradores e gerentes podem excluir pedidos de venda.' });
    }

    // O e-mail é o da sessão: aqui a pessoa confirma a própria senha.
    // Não usar 401 — o interceptor do front trata 401 como sessão
    // expirada e desloga no meio da operação.
    const email = req.user?.email;
    if (!email) return res.status(403).json({ error: 'Não consegui confirmar sua sessão. Recarregue a página e tente de novo.' });

    const auth = await autorizar(email, String(req.body?.password || ''), req.tenantId);
    if (!auth.ok) return res.status(auth.status).json({ error: auth.motivo });

    const r = await excluirVenda(req, req.params.id, auth.usuario, req.body?.motivo);
    if (!r.ok) return res.status(r.status).json({ error: r.motivo });
    res.json({ message: r.mensagem, estoque_devolvido: r.estoque_devolvido });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
