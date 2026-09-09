const express = require('express');
const router = express.Router();
const Joi = require('joi');
const supabase = require('../config/supabase');
const { codigoPedido } = require('../lib/pedidoCodigo');
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
// A leitura do pedido para o motor de etapas e a gravação do passo
// moram em lib/fluxoCarga.js: a tela do vendedor e o portal do cliente
// também movem o pedido desde que a arte passou a avançá-lo, e três
// cópias do mesmo `select` seriam três para divergir.
const { carregarParaFluxo, gravarPasso } = require('../lib/fluxoCarga');
const { etapasDosItens, caracteristicasDoItem } = require('../lib/itensPedido');
const C = require('../lib/comprovante');
// A cobranca PIX da chave da propria loja (Nubank). Sem gateway: o
// dinheiro cai direto na conta, e por isso a baixa e manual.
const { gerarCobrancaPix } = require('../lib/pixCobranca');
// O que o pedido faz sozinho ao nascer — hoje, confirmar o pagamento
// quando a empresa configurou assim.
const Auto = require('../lib/pedidoAutomacao');
// O teto de faturamento por CNPJ mora no Contábil, junto do cálculo
// que sabe quanto cada empresa já faturou no ano.
const Contabil = require('./contabil');

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

// ============================================================
// A CONFIGURACAO DO PAINEL DE PEDIDOS.
//
// Rota propria em vez de PUT /settings por dois motivos: aquela troca o
// objeto `settings` INTEIRO (dois painéis salvando ao mesmo tempo e um
// apaga o outro) e exige admin — e quem cuida do painel de pedidos é o
// comercial. Aqui só a chave de pedidos entra, mesclada.
//
// Vem ANTES de `/:id` de propósito: /sales/config bateria na rota do
// pedido e viraria "pedido não encontrado".
// ============================================================
router.get('/config', async (req, res) => {
  try {
    res.json({
      [Auto.CHAVE]: await Auto.confirmaPagamentoSozinho(req.tenantId),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/config', async (req, res) => {
  if (!['admin', 'manager'].includes(req.userProfile?.role)) {
    return res.status(403).json({ error: 'Só administrador ou gerente muda a configuração dos pedidos.' });
  }
  try {
    const { data: emp } = await supabase.from('EMPRESAS')
      .select('settings').eq('id', req.tenantId).maybeSingle();

    // Mescla, e nao substitui: `settings` guarda site, PIX, prazos de
    // pagamento e mais — escrever o objeto inteiro daqui apagaria tudo
    // o que esta tela nao conhece.
    const settings = { ...(emp?.settings || {}) };
    settings.pedidos = { ...(settings.pedidos || {}), [Auto.CHAVE]: !!req.body?.[Auto.CHAVE] };

    const { error } = await supabase.from('EMPRESAS')
      .update({ settings }).eq('id', req.tenantId);
    if (error) throw error;

    audit(req, 'update', 'config', null, { pedidos: settings.pedidos });
    res.json({ [Auto.CHAVE]: settings.pedidos[Auto.CHAVE] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

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
    artwork_url, artwork_notes, payment_method, installments, first_due_date, entrada,
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
      /**
       * O FRETE VAI JUNTO — e antes não ia.
       *
       * A função fechava o total como "produtos - desconto" e gerava as
       * parcelas em cima disso; o frete era somado DEPOIS, num update
       * daqui. As parcelas já estavam gravadas: pedido de R$ 400 + R$ 30
       * de frete em 2x virava duas parcelas de R$ 200 num pedido de
       * R$ 430, e faltavam R$ 30 no contas a receber de todo pedido a
       * prazo com frete.
       *
       * Agora a soma acontece dentro da função (migração 111), que é
       * onde o total e as parcelas são decididos na mesma transação.
       */
      _freight:              Number(freight) || 0,
      _payment_adjustment:   Number(payment_adjustment) || 0,
      /**
       * A ENTRADA — o que o cliente paga no ato.
       *
       * Vira a primeira parcela, vencendo hoje, e o resto se divide no
       * prazo. Só faz sentido na venda a prazo: à vista o pedido
       * inteiro já é a entrada.
       */
      _entrada:              payment_method === 'a_prazo' ? Math.max(0, Number(entrada) || 0) : 0,
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
      /**
       * O FRETE JÁ VEIO SOMADO — este bloco virou rede de segurança.
       *
       * Ele existia para somar frete e ajuste depois da função. Desde a
       * migração 111 a própria `criar_venda` faz isso, junto com as
       * parcelas, e refazer a soma aqui cobraria o frete duas vezes.
       *
       * O que sobrou é o caso do banco que ainda não migrou: a função
       * antiga ignora os dois argumentos novos e devolve o total sem
       * frete. Aí, e só aí, o total é corrigido aqui — sem as parcelas,
       * que é a limitação que a migração veio resolver.
       */
      const freightVal = Number(freight) || 0;
      const payAdj = Number(payment_adjustment) || 0;
      const jaVeioComFrete = Math.abs((Number(data.total) || 0)
        - ((Number(data.subtotal) || 0) - (Number(data.discount) || 0) + freightVal + payAdj)) < 0.005;
      if ((freightVal || payAdj) && !jaVeioComFrete) {
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

      /**
       * O PAGAMENTO SE CONFIRMA SOZINHO — se a empresa quiser.
       *
       * Na Lyon o dinheiro entra ANTES do pedido: paga no balcão, manda
       * o PIX, combina o prazo, e só então alguém digita a venda. Nascer
       * em "Aguardando financeiro" fazia todo pedido ficar parado
       * esperando alguém confirmar o que já tinha acontecido.
       *
       * Não é um UPDATE de status escrito aqui: são dois passos do mesmo
       * motor que a tela usa, então a linha do tempo fica igual à de um
       * pedido confirmado no clique — com os marcos e as horas — e cada
       * um deles marcado como automático, para quem olhar daqui a seis
       * meses saber que ninguém clicou.
       *
       * Falhar aqui não derruba a venda: ela já está gravada, e o pior
       * caso é o pedido ficar onde nasceu, esperando o clique de sempre.
       */
      try {
        if (await Auto.confirmaPagamentoSozinho(req.tenantId)) {
          const carga = await carregarParaFluxo(req.tenantId, data.id);
          const r = carga && Auto.confirmarPagamentoAoNascer(carga.venda, carga.aplicaveis, req);
          if (r) {
            await gravarPasso(req.tenantId, data.id, r);
            data.status = r.status;
          }
        }
      } catch (e) {
        console.error('[sales] confirmacao automatica do pagamento:', e.message);
      }
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
    /**
     * O MESMO PEDIDO CHEGANDO DUAS VEZES NÃO VIRA DOIS.
     *
     * Aconteceu de verdade: dois cliques em "Confirmar pedido" viraram
     * doze vendas iguais. O botão tem `disabled`, mas a tela consulta o
     * Contábil ANTES de gravar, e nessa janela ele ainda está solto.
     *
     * A trava do botão nunca seria suficiente, e é por isso que a
     * proteção mora AQUI: duplo clique é só uma das formas de mandar o
     * mesmo pedido duas vezes — as outras são a rede repetindo o POST,
     * o F5 no meio da gravação e a segunda aba no mesmo carrinho.
     *
     * A tela manda uma chave por PEDIDO (não por clique). Se ela já
     * existe, devolvemos a venda que existe em vez de criar outra: para
     * quem clicou, o resultado é o mesmo — o pedido dele —, e é isso
     * que se espera de um botão apertado duas vezes.
     *
     * Sem chave, nada muda: pedido antigo e pedido vindo de outro
     * caminho (o do site) continuam entrando como sempre.
     */
    const idem = String(req.body?.idempotency_key || '').trim().slice(0, 100) || null;
    if (idem) {
      const { data: jaExiste } = await supabase.from('VENDAS')
        .select('*, VENDA_ITENS(*)')
        .eq('tenant_id', req.tenantId).eq('idempotency_key', idem).maybeSingle();
      if (jaExiste) {
        console.log(`[sales] pedido repetido ignorado (chave ${idem}) — devolvendo PV-${jaExiste.number}`);
        return res.status(200).json(jaExiste);
      }
    }

    const { data: nextNumber } = await supabase
      .rpc('proximo_numero_venda', { p_tenant_id: req.tenantId });

    const subtotal = items.reduce((sum, item) => sum + (item.quantity * item.unit_price), 0);
    const totalDiscount = discount || 0;
    const freightVal = Number(freight) || 0;
    const payAdj = Number(payment_adjustment) || 0;
    const total = Math.max(0, subtotal - totalDiscount + freightVal + payAdj);

    /**
     * O TETO DE FATURAMENTO — A TRAVA DE VERDADE.
     *
     * Já havia um aviso na tela ("isto ultrapassa o limite, continuar?")
     * e ele não protege ninguém: quem está com o cliente na frente
     * clica em continuar, porque é o que se faz com uma caixa que
     * atrapalha.
     *
     * Com o bloqueio LIGADO em Contábil, a venda que estoura o limite
     * anual do CNPJ é recusada AQUI, no servidor. A recusa vem com os
     * CNPJs que ainda têm espaço para este valor — e, quando não há
     * nenhum, com a frase que descreve o que realmente aconteceu: o
     * sistema parou de vender.
     *
     * Desligado (o padrão), nada muda: o aviso da tela continua sendo o
     * que era. Passar do teto do Simples é decisão de dono, não de
     * quem opera o caixa — e por isso ela é tomada uma vez, na
     * configuração, e não a cada venda.
     */
    const teto = await Contabil.podeFaturar(req.tenantId, billing_company_id, total);
    if (!teto.ok) {
      return res.status(409).json({
        error: teto.alternativas.length
          ? `${teto.empresa} chegou ao limite anual. Escolha outro CNPJ para faturar esta venda.`
          : `${teto.empresa} chegou ao limite anual e não há outro CNPJ com espaço. `
            + 'O sistema está bloqueado para novas vendas até que um segundo CNPJ seja cadastrado '
            + 'ou o bloqueio seja desligado em Contábil.',
        code: 'TETO_ATINGIDO',
        teto: {
          empresa: teto.empresa, faturado: teto.faturado, limite: teto.limite,
          depois: teto.depois, excedente: teto.excedente,
        },
        alternativas: teto.alternativas,
      });
    }

    const { data: sale, error: saleError } = await supabase
      .from('VENDAS')
      .insert({
        tenant_id: req.tenantId,
        number: nextNumber,
        // Grava a chave junto: é o índice único que segura a corrida
        // quando dois cliques chegam ao servidor ao mesmo tempo e a
        // consulta acima não vê nem um nem outro.
        ...(idem ? { idempotency_key: idem } : {}),
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
const quemPergunta = req => ({ acesso: req.acesso, perfil: req.userProfile });

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

/**
 * A CONFIRMAÇÃO DO PAGAMENTO NÃO MORA AQUI — E É DE PROPÓSITO.
 *
 * Esta rota existiu por algumas horas e foi retirada. Ela deixava o
 * pedido de venda confirmar o dinheiro, e é justamente isso que não
 * pode acontecer: quem anexa o comprovante é o comercial, e o comercial
 * conferindo o próprio comprovante é a mesma pessoa dos dois lados do
 * caixa.
 *
 * Anexar continua aqui (POST /:id/parcelas/comprovante) porque anexar é
 * trabalho de quem está com o cliente. Conferir e confirmar são do
 * Financeiro, na tela do Financeiro — e a rota de lá cobra o módulo
 * `financial`, que o setor de Vendas não tem.
 *
 * Se um dia isto voltar, volta com a permissão junto.
 */

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
// ============================================================
// EDITAR OS ITENS DE UM PEDIDO JÁ FECHADO.
//
// O caso real: a cliente fechou 100 copos e ligou pedindo mais 20. Sem
// isto, a saída era cancelar e refazer — outro número de pedido, outro
// PV mandado para ela, e a produção já andada perdida no caminho.
//
// EDITA POR DIFERENÇA, NÃO POR SUBSTITUIÇÃO. A tela manda o que MUDOU
// (esta linha vai para 120, esta sai, esta entra) — não a lista inteira
// de volta. Parece um detalhe e não é: a personalização de cada item
// (borda, cor, o id da arte que a cliente montou) nunca é exposta à
// tela, e mandar a lista inteira de volta significaria a tela devolver
// um campo que nunca recebeu. Na primeira edição de quantidade, a arte
// de todo mundo viraria null.
//
// TRÊS REGRAS, e as três existem porque isto mexe em dinheiro.
//
// 1. PEDE SENHA. Não a sessão aberta: a senha, na hora. Editar pedido
//    fechado muda o quanto o cliente deve, e é a mesma trava que já
//    guarda a exclusão e a troca de arte.
//
// 2. A DIFERENÇA VIRA COBRANÇA, e só a diferença. Os 20 copos a mais
//    não refazem a cobrança dos 120: entra um lançamento novo com o que
//    falta. Refazer a cobrança inteira quebraria as parcelas já pagas e
//    a conciliação do que caiu no banco.
//
// 3. O HISTÓRICO GUARDA O ANTES E O DEPOIS — quem editou, quando, o
//    total de antes, o de agora e a diferença. Pedido que muda de valor
//    sem deixar rastro é o que ninguém consegue explicar no fim do mês.
//
// NÃO ENCOLHE ABAIXO DO QUE JÁ FOI PAGO SEM AVISAR. Tirar item é
// legítimo, mas quando o novo total fica abaixo do que já entrou, sobra
// crédito na mão do cliente — e isso se acerta na devolução, com motivo
// e nota. A resposta devolve o valor para a tela dizer isso na cara de
// quem editou, em vez de deixar um saldo escondido dentro do pedido.
// ============================================================
router.patch('/:id/itens', async (req, res) => {
  const alteracoes = Array.isArray(req.body?.alteracoes) ? req.body.alteracoes : [];
  const remover    = Array.isArray(req.body?.remover)    ? req.body.remover    : [];
  const novos      = Array.isArray(req.body?.novos)      ? req.body.novos      : [];

  // O FRETE SOZINHO JÁ É UMA EDIÇÃO. A cotação que voltou mais cara não
  // mexe em item nenhum, e antes desta linha ela era recusada com "nada
  // foi alterado" — o que obrigava a mexer numa quantidade só para
  // conseguir salvar o frete certo.
  const mexeNoFrete = req.body?.freight !== undefined && req.body?.freight !== null
    && req.body?.freight !== '';
  if (!alteracoes.length && !remover.length && !novos.length && !mexeNoFrete) {
    return res.status(400).json({ error: 'Nada foi alterado no pedido.' });
  }

  try {
    const aut = await autorizar(
      String(req.body?.autorizador_email || '').trim().toLowerCase(),
      String(req.body?.autorizador_senha || ''),
      req.tenantId,
    );
    if (!aut.ok) {
      return res.status(aut.status).json({
        error: aut.motivo, code: 'AUTORIZACAO_NECESSARIA',
        dica: 'Editar um pedido fechado muda o valor que o cliente deve — por isso pede a senha.',
      });
    }

    const { data: venda } = await supabase.from('VENDAS')
      .select('id, number, status, customer_id, subtotal, discount, freight, total, '
            + 'production_log, delivery_mode, created_at')
      .eq('id', req.params.id).eq('tenant_id', req.tenantId).maybeSingle();
    if (!venda) return res.status(404).json({ error: 'Pedido não encontrado' });

    // O NOME VEM JUNTO PORQUE `product_name` COSTUMA ESTAR VAZIO. Quem
    // grava a venda não preenche essa coluna; o nome sai de PRODUTOS na
    // hora de mostrar. Sem o join, o histórico da edição registraria
    // "null: de 50 para 70" — a linha existe e não diz de qual copo.
    const { data: atuais } = await supabase.from('VENDA_ITENS')
      .select('id, product_id, product_name, quantity, unit_price, discount, total, PRODUTOS ( name )')
      .eq('sale_id', venda.id);
    // Quantas peças o pedido tinha ANTES: é a régua do frete lá embaixo.
    const pecasAntes = (atuais || []).reduce((s, i) => s + (Number(i.quantity) || 0), 0);
    const porItem = Object.fromEntries((atuais || [])
      .map(i => [i.id, { ...i, product_name: i.product_name || i.PRODUTOS?.name || 'Produto' }]));

    // Os ids têm de ser DESTE pedido. Vêm da tela, e tela manda o que
    // mandarem para ela — sem esta linha, o id de um item de outro
    // pedido (ou de outra empresa) entraria na conta.
    const tocados = [...alteracoes.map(a => a.item_id), ...remover];
    if (tocados.some(id => !porItem[id])) {
      return res.status(400).json({ error: 'Um dos itens não pertence a este pedido.' });
    }
    if (remover.length >= (atuais || []).length && !novos.length) {
      return res.status(400).json({ error: 'O pedido não pode ficar sem itens. Para cancelá-lo, use Excluir.' });
    }

    // E os produtos novos têm de ser desta empresa.
    const idsNovos = [...new Set(novos.map(n => n.product_id).filter(Boolean))];
    let porProduto = {};
    if (idsNovos.length) {
      const { data: prods } = await supabase.from('PRODUTOS')
        .select('id, name, sale_price').eq('tenant_id', req.tenantId).in('id', idsNovos);
      porProduto = Object.fromEntries((prods || []).map(p => [p.id, p]));
      if (idsNovos.some(id => !porProduto[id])) {
        return res.status(400).json({ error: 'Um dos produtos não é desta empresa.' });
      }
    }

    const totalAntes = Number(venda.total) || 0;
    const registro = [];   // o que contar no histórico

    // ── 1. Quantidades ───────────────────────────────────────
    for (const alt of alteracoes) {
      const item = porItem[alt.item_id];
      const qtd = Math.max(0, Number(alt.quantity) || 0);
      if (!qtd) {
        return res.status(400).json({
          error: 'Quantidade tem de ser maior que zero. Para tirar o item, remova-o.',
        });
      }
      if (qtd === Number(item.quantity)) continue;
      const desc = Number(item.discount) || 0;
      const totalDoItem = Math.max(0, qtd * Number(item.unit_price) - desc);
      const { error } = await supabase.from('VENDA_ITENS')
        .update({ quantity: qtd, total: totalDoItem })
        .eq('id', item.id).eq('sale_id', venda.id);
      if (error) throw error;
      registro.push({
        o_que: 'quantidade', produto: item.product_name,
        de: Number(item.quantity), para: qtd,
      });
    }

    // ── 2. Remoções ──────────────────────────────────────────
    if (remover.length) {
      const { error } = await supabase.from('VENDA_ITENS')
        .delete().in('id', remover).eq('sale_id', venda.id);
      if (error) throw error;
      for (const id of remover) {
        registro.push({
          o_que: 'removido', produto: porItem[id].product_name,
          de: Number(porItem[id].quantity), para: 0,
        });
      }
    }

    // ── 3. Itens novos ───────────────────────────────────────
    if (novos.length) {
      const linhas = novos.map(n => {
        const prod = porProduto[n.product_id];
        const qtd = Math.max(0, Number(n.quantity) || 0);
        // Preço em branco cai no preço de tabela: quem acrescenta 20
        // copos com o cliente no telefone não deveria ter de lembrar
        // quanto custa cada um.
        const unit = (n.unit_price != null && n.unit_price !== '')
          ? Math.max(0, Number(n.unit_price) || 0)
          : (Number(prod.sale_price) || 0);
        return {
          sale_id: venda.id, product_id: n.product_id, product_name: prod.name,
          quantity: qtd, unit_price: unit, discount: 0,
          total: Math.max(0, qtd * unit),
          customization: n.customization || null,
        };
      }).filter(l => l.quantity > 0);

      if (linhas.length) {
        const { error } = await supabase.from('VENDA_ITENS').insert(linhas);
        if (error) throw error;
        for (const l of linhas) {
          registro.push({ o_que: 'acrescentado', produto: l.product_name, de: 0, para: l.quantity });
        }
      }
    }

    // Sem mudança em item E sem frete informado, não há edição nenhuma —
    // com o frete, a conta segue e ele entra no histórico lá embaixo.
    if (!registro.length && !mexeNoFrete) {
      return res.status(400).json({ error: 'Nada mudou no pedido.' });
    }

    // ── O total, recontado do banco ──────────────────────────
    // Do banco, e não somando a diferença em cima do total antigo: se
    // algum dos passos acima falhou pela metade, o que vale é o que
    // ficou gravado. A conta tem de bater com as linhas que existem, não
    // com as que eu esperava ter escrito.
    const { data: depois } = await supabase.from('VENDA_ITENS')
      .select('id, total, quantity').eq('sale_id', venda.id);
    const subtotal = (depois || []).reduce((s, i) => s + (Number(i.total) || 0), 0);
    const desconto = Number(venda.discount) || 0;

    /**
     * O FRETE ACOMPANHA A QUANTIDADE.
     *
     * Ele ficava parado enquanto o pedido crescia: acrescentar 100 copos
     * mudava o total dos produtos e mantinha o frete de 100 — e a caixa
     * a mais viajava de graça, com o prejuízo aparecendo só na fatura da
     * transportadora, um mês depois, sem ninguém ligar uma coisa à outra.
     *
     * A REGRA É PROPORCIONAL ÀS PEÇAS, e não ao valor: transportadora
     * cobra por peso e volume, e o dobro de copos ocupa o dobro de
     * caixa, custe cada copo R$ 2 ou R$ 8. Dobrar a quantidade dobra o
     * frete.
     *
     * É UMA ESTIMATIVA, E ELA CEDE AO NÚMERO CERTO: quem tem a cotação
     * nova na mão manda `freight` no corpo e é esse valor que vale. A
     * proporção existe para o caso comum — o vendedor no telefone, sem
     * cotação, que não pode deixar o frete defasado por não saber o
     * número exato.
     *
     * RETIRADA CONTINUA EM ZERO. Ninguém entrega, não há o que ratear —
     * e multiplicar zero por qualquer coisa continua dando zero, mas
     * dizê-lo aqui evita a próxima pergunta.
     */
    const pecasDepois = (depois || []).reduce((s, i) => s + (Number(i.quantity) || 0), 0);
    const freteAntes = Number(venda.freight) || 0;
    const freteInformado = req.body?.freight;
    let frete = freteAntes;
    let freteAutomatico = false;
    if (freteInformado !== undefined && freteInformado !== null && freteInformado !== '') {
      const v = Number(freteInformado);
      if (!Number.isFinite(v) || v < 0) {
        return res.status(400).json({ error: 'Frete inválido.' });
      }
      frete = Math.round(v * 100) / 100;
    } else if (freteAntes > 0 && pecasAntes > 0 && pecasDepois !== pecasAntes) {
      frete = Math.round((freteAntes * pecasDepois / pecasAntes) * 100) / 100;
      freteAutomatico = true;
    }

    // O frete que muda é uma linha do histórico como qualquer outra:
    // "por que este pedido ficou R$ 40 mais caro" tem de ter resposta.
    if (frete !== freteAntes) {
      registro.push({
        o_que: 'frete', produto: freteAutomatico ? 'Frete (ajustado pela quantidade)' : 'Frete',
        de: freteAntes, para: frete,
      });
    }
    if (!registro.length) return res.status(400).json({ error: 'Nada mudou no pedido.' });

    const novoTotal = Math.round(Math.max(0, subtotal - desconto + frete) * 100) / 100;
    const diferenca = Math.round((novoTotal - totalAntes) * 100) / 100;

    // O que já entrou de dinheiro neste pedido.
    const { data: lancs } = await supabase.from('LANCAMENTOS')
      .select('paid_amount').eq('tenant_id', req.tenantId)
      .eq('reference_type', 'sale').eq('reference_id', venda.id);
    const jaPago = (lancs || []).reduce((s, l) => s + (Number(l.paid_amount) || 0), 0);

    const agora = new Date().toISOString();
    const quem = aut.usuario?.name || aut.usuario?.email || null;
    const log = Array.isArray(venda.production_log) ? [...venda.production_log] : [];
    log.push({
      action: 'pedido_editado', at: agora,
      user: quem, stage: 'comercial',
      total_antes: totalAntes, total_agora: novoTotal, diferenca,
      frete_antes: freteAntes, frete_agora: frete, frete_automatico: freteAutomatico,
      pecas_antes: pecasAntes, pecas_agora: pecasDepois,
      mudancas: registro,
      motivo: String(req.body?.motivo || '').trim().slice(0, 300) || null,
    });

    /**
     * MUDOU O VALOR, VOLTA PARA O FINANCEIRO.
     *
     * O pedido seguia andando com o valor novo e o dinheiro velho: a
     * fábrica continuava de onde estava, e a diferença virava uma
     * cobrança que ninguém era obrigado a olhar antes de gravar mil
     * copos. Quem descobria era o financeiro, no fim do mês, com a peça
     * já entregue.
     *
     * Agora a etapa de Pagamento volta a valer, e ela só passa quando o
     * financeiro CONFERIR o comprovante da diferença (ou liberar à mão,
     * com nome e hora). A liberação anterior é cancelada de propósito:
     * ela dizia respeito ao valor de antes, e um "liberado" de ontem
     * não pode responder por uma cobrança de hoje.
     *
     * PEDIDO JÁ ENTREGUE NÃO VOLTA. Escrever "aguardando financeiro"
     * num pedido que o cliente já recebeu seria mentir sobre onde ele
     * está; a cobrança da diferença existe do mesmo jeito, no contas a
     * receber, que é onde ela se resolve.
     */
    const mudouValor = diferenca !== 0;
    const finalizado = A.finalizado(venda.status);
    const voltaAoFinanceiro = mudouValor && !finalizado && venda.status !== 'aguardando_financeiro';

    if (mudouValor && !finalizado) {
      log.push({
        stage: 'status', action: 'pagamento_cancelado', at: agora, user: quem,
        nota: 'o pedido foi editado e o valor mudou — a liberação anterior não vale para o novo total',
      });
      log.push({
        stage: 'status', action: 'aguardando_financeiro', at: agora, user: quem,
        nota: `total de ${totalAntes.toFixed(2)} para ${novoTotal.toFixed(2)}`,
      });
    }

    const patch = { subtotal, total: novoTotal, production_log: log };
    if (frete !== freteAntes) patch.freight = frete;
    if (voltaAoFinanceiro || (mudouValor && !finalizado)) patch.status = 'aguardando_financeiro';

    const { error: erroUpd } = await supabase.from('VENDAS')
      .update(patch)
      .eq('id', venda.id).eq('tenant_id', req.tenantId);
    if (erroUpd) throw erroUpd;

    // SÓ A DIFERENÇA VIRA COBRANÇA. Ficou mais caro: um lançamento novo
    // com o que falta. Ficou mais barato: nada é criado aqui — inventar
    // um lançamento negativo sujaria o contas a receber com uma linha
    // que ninguém cobra, e o crédito é acertado na devolução.
    let cobranca = null;
    if (diferenca > 0) {
      const { data: nova } = await supabase.from('LANCAMENTOS').insert({
        tenant_id: req.tenantId, user_id: req.user.id,
        description: `${codigoPedido(venda.number)} — diferença da edição`,
        document_number: codigoPedido(venda.number),
        type: 'receivable', amount: diferenca, paid_amount: 0,
        due_date: new Date().toISOString().split('T')[0],
        status: 'pending', customer_id: venda.customer_id,
        installment: 1, total_installments: 1,
        reference_type: 'sale', reference_id: venda.id,
      }).select('id, amount').single();
      cobranca = nova || null;
    }

    audit(req, 'update', 'sale', venda.id, {
      editou_itens: true, total_antes: totalAntes, total_agora: novoTotal,
      diferenca, mudancas: registro, autorizou: aut.usuario?.email,
      frete_antes: freteAntes, frete_agora: frete,
      voltou_ao_financeiro: mudouValor && !finalizado,
    });

    res.json({
      ok: true, total_antes: totalAntes, total: novoTotal, diferenca,
      // O frete, para a tela poder dizer que ele mudou junto — e por quê.
      frete_antes: freteAntes, frete: frete, frete_automatico: freteAutomatico,
      pecas_antes: pecasAntes, pecas: pecasDepois,
      // Para onde o pedido foi. Quem edita precisa saber na hora que a
      // produção parou de andar até o financeiro conferir.
      status: (mudouValor && !finalizado) ? 'aguardando_financeiro' : venda.status,
      voltou_ao_financeiro: mudouValor && !finalizado,
      mudancas: registro, cobranca_gerada: !!cobranca, ja_pago: jaPago,
      falta_pagar: Math.max(0, Math.round((novoTotal - jaPago) * 100) / 100),
      // Encolheu abaixo do que já foi pago: a edição vale do mesmo jeito,
      // mas quem editou precisa saber na hora que sobrou crédito na mão
      // do cliente — e que isso se resolve na devolução, não aqui.
      credito_do_cliente: jaPago > novoTotal
        ? Math.round((jaPago - novoTotal) * 100) / 100 : 0,
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ============================================================
// DESIGNAR O VENDEDOR DE UM PEDIDO.
//
// O `user_id` da venda é quem a lançou — e quem a lançou nem sempre é
// de quem ela é. O pedido que entra pelo site não tem vendedor nenhum;
// o que o administrativo digita fica no nome de quem digitou; e há o
// caso simples de o pedido ter sido atribuído à pessoa errada.
//
// ISSO MEXE EM COMISSÃO E EM CARTEIRA, e é por isso que é SÓ DO ADMIN.
// O vendedor enxerga os pedidos dele (`escopoDoVendedor` acima): mudar
// o dono é tirar um pedido da vista de alguém e pôr na de outro, além
// de mover a venda de uma comissão para outra. Gerente não basta.
//
// Fica no histórico com quem mandou e de quem para quem — é a primeira
// pergunta quando o vendedor reclamar que a venda dele sumiu.
// ============================================================
router.patch('/:id/vendedor', async (req, res) => {
  if (req.userProfile?.role !== 'admin') {
    return res.status(403).json({ error: 'Só o administrador designa o vendedor de um pedido.' });
  }
  // Vazio é legítimo: devolve o pedido para "sem vendedor".
  const novoDono = req.body?.user_id ? String(req.body.user_id) : null;

  try {
    const { data: venda } = await supabase.from('VENDAS')
      .select('id, number, user_id, production_log')
      .eq('id', req.params.id).eq('tenant_id', req.tenantId).maybeSingle();
    if (!venda) return res.status(404).json({ error: 'Pedido não encontrado' });

    let nome = null;
    if (novoDono) {
      // O vendedor tem de ser desta empresa. Sem esta conferência, um id
      // de outro tenant entraria e o pedido sumiria da carteira de todos.
      const { data: u } = await supabase.from('USUARIOS')
        .select('id, name').eq('id', novoDono).eq('tenant_id', req.tenantId).maybeSingle();
      if (!u) return res.status(400).json({ error: 'Esse usuário não é desta empresa.' });
      nome = u.name;
    }

    let anterior = null;
    if (venda.user_id) {
      const { data: a } = await supabase.from('USUARIOS')
        .select('name').eq('id', venda.user_id).maybeSingle();
      anterior = a?.name || null;
    }

    const log = Array.isArray(venda.production_log) ? [...venda.production_log] : [];
    log.push({
      action: 'vendedor_designado', at: new Date().toISOString(),
      user: req.userProfile?.name || req.user?.email || null, stage: 'comercial',
      de: anterior, para: nome,
    });

    const { error } = await supabase.from('VENDAS')
      .update({ user_id: novoDono, production_log: log })
      .eq('id', venda.id).eq('tenant_id', req.tenantId);
    if (error) throw error;

    audit(req, 'update', 'sale', venda.id, { vendedor: { de: anterior, para: nome } });
    res.json({ ok: true, vendedor: nome, anterior });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

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
