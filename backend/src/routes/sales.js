const express = require('express');
const router = express.Router();
const Joi = require('joi');
const supabase = require('../config/supabase');
const { makeClient } = require('../config/supabase');
const { audit } = require('../lib/audit');
const { validate } = require('../middleware/validate');
const { recomputeRating } = require('../lib/customerRating');
const { ORIGENS, normalizarOrigem } = require('../lib/origens');

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
    query = query.range(offset, offset + limit - 1);

    const { data, error, count } = await query;
    if (error) throw error;
    res.json({ data, total: count, page: Number(page), limit: Number(limit) });
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

    const { data: items } = await supabase
      .from('VENDA_ITENS')
      .select('*, PRODUTOS(id, name, code, unit)')
      .eq('sale_id', req.params.id);

    const { data: payments } = await supabase
      .from('LANCAMENTOS')
      .select('*')
      .eq('reference_type', 'sale')
      .eq('reference_id', req.params.id);

    res.json({ ...sale, items: items || [], payments: payments || [] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/', validate(saleSchema), async (req, res) => {
  const {
    customer_id, type, items, notes, discount, delivery_date,
    artwork_url, artwork_notes, payment_method, installments, first_due_date,
    operation_date, event_date, ship_date, max_delivery_date, order_key, freight, payment_adjustment, carrier_id,
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
      if (order_key) patch.order_key = order_key;
      if (carrier_id) patch.carrier_id = carrier_id;
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

// Sequência oficial do Pedido de Venda — não pode pular etapas
const SALE_STATUS_ORDER = [
  'iniciando_pedido', 'aguardando_financeiro', 'aguardando_estoque',
  'aguardando_arte', 'aguardando_vegetal', 'aguardando_revelacao',
  'aguardando_coleta', 'em_transito', 'entregue',
];

router.patch('/:id/status', async (req, res) => {
  const { status } = req.body;
  if (!SALE_STATUS_ORDER.includes(status)) {
    return res.status(400).json({ error: 'Status inválido' });
  }

  try {
    // registra a mudança de status no histórico do pedido (se a coluna existir)
    const { data: cur } = await supabase.from('VENDAS')
      .select('status, production_log').eq('id', req.params.id).eq('tenant_id', req.tenantId).maybeSingle();

    // Não deixa pular etapas: só avança 1 passo (pode voltar para corrigir)
    const curIdx = SALE_STATUS_ORDER.indexOf(cur?.status);
    const newIdx = SALE_STATUS_ORDER.indexOf(status);
    if (curIdx >= 0 && newIdx > curIdx + 1) {
      return res.status(400).json({ error: `Não é possível pular etapas. O próximo status permitido é "${SALE_STATUS_ORDER[curIdx + 1]}".` });
    }

    const log = Array.isArray(cur?.production_log) ? cur.production_log : [];
    log.push({ stage: 'status', action: status, at: new Date().toISOString(), user_id: req.user?.id || null, user: req.user?.name || req.user?.email || 'Usuário' });

    let upd = { status, production_log: log };
    let { data, error } = await supabase.from('VENDAS').update(upd)
      .eq('id', req.params.id).eq('tenant_id', req.tenantId).select().single();
    // se a coluna production_log ainda não existir, atualiza só o status
    if (error && /production_log|column|does not exist/i.test(error.message || '')) {
      ({ data, error } = await supabase.from('VENDAS').update({ status })
        .eq('id', req.params.id).eq('tenant_id', req.tenantId).select().single());
    }
    if (error) throw error;
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// "Iniciar Pedido": de Iniciando Pedido → Aguardando Anexo da Arte
router.post('/:id/start', async (req, res) => {
  try {
    const { data: cur } = await supabase.from('VENDAS')
      .select('status, production_log').eq('id', req.params.id).eq('tenant_id', req.tenantId).maybeSingle();
    if (!cur) return res.status(404).json({ error: 'Pedido não encontrado' });
    const log = Array.isArray(cur.production_log) ? cur.production_log : [];
    log.push({ stage: 'status', action: 'aguardando_arte', at: new Date().toISOString(), user_id: req.user?.id || null, user: req.user?.name || req.user?.email || 'Usuário' });
    let { data, error } = await supabase.from('VENDAS').update({ status: 'aguardando_arte', production_log: log })
      .eq('id', req.params.id).eq('tenant_id', req.tenantId).select().single();
    if (error && /production_log|column|does not exist/i.test(error.message || '')) {
      ({ data, error } = await supabase.from('VENDAS').update({ status: 'aguardando_arte' })
        .eq('id', req.params.id).eq('tenant_id', req.tenantId).select().single());
    }
    if (error) throw error;
    audit(req, 'update', 'sale', req.params.id, { action: 'iniciar_pedido' });
    res.json(data);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Define a transportadora + código de rastreio do pedido (aba Transportadores)
router.patch('/:id/shipping', async (req, res) => {
  const { carrier_id, tracking_code } = req.body || {};
  try {
    const patch = {
      carrier_id: carrier_id || null,
      tracking_code: (tracking_code || '').trim() || null,
    };
    const { data, error } = await supabase.from('VENDAS').update(patch)
      .eq('id', req.params.id).eq('tenant_id', req.tenantId).select().single();
    if (error) throw error;
    audit(req, 'update', 'sale', req.params.id, { action: 'shipping', tracking_code: patch.tracking_code });
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
router.post('/:id/delete', async (req, res) => {
  try {
    if (req.userProfile?.role !== 'admin') {
      return res.status(403).json({ error: 'Apenas administradores podem excluir pedidos de venda.' });
    }
    const password = String(req.body?.password || '');
    const email = req.user?.email;
    if (!password) return res.status(400).json({ error: 'Digite sua senha para confirmar.' });
    // Não usar 401: o interceptor do front trata 401 como sessão expirada e desloga.
    if (!email) return res.status(403).json({ error: 'Não consegui confirmar sua sessão. Recarregue a página e tente de novo.' });

    // Reautentica para confirmar a senha
    const client = makeClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);
    const { error: authErr } = await client.auth.signInWithPassword({ email, password });
    if (authErr) {
      const badPass = authErr.status === 400 || /invalid|credential|password|senha/i.test(authErr.message || '');
      return res.status(badPass ? 403 : 502).json({ error: badPass ? 'Senha incorreta.' : `Não foi possível confirmar a senha: ${authErr.message}` });
    }

    const id = req.params.id;
    // guarda o cliente para recalcular estrelas/total 12m depois da exclusão
    const { data: saleRow } = await supabase.from('VENDAS')
      .select('customer_id').eq('id', id).eq('tenant_id', req.tenantId).maybeSingle();
    // remove os vínculos (itens, financeiro e movimentações da venda)
    const safe = (p) => p.then(() => {}, () => {});
    await safe(supabase.from('VENDA_ITENS').delete().eq('sale_id', id));
    await safe(supabase.from('LANCAMENTOS').delete().eq('tenant_id', req.tenantId).eq('reference_type', 'sale').eq('reference_id', id));
    await safe(supabase.from('MOVIMENTACOES_ESTOQUE').delete().eq('tenant_id', req.tenantId).eq('reference_type', 'sale').eq('reference_id', id));

    const { error } = await supabase.from('VENDAS').delete().eq('id', id).eq('tenant_id', req.tenantId);
    if (error) {
      if (/foreign key|violat|23503/i.test(error.message || '')) {
        return res.status(409).json({ error: 'Não foi possível excluir: o pedido tem registros vinculados.' });
      }
      throw error;
    }
    audit(req, 'delete', 'sale', id, { hard: true });
    // a venda excluída sai da soma dos 12 meses do cliente
    if (saleRow?.customer_id) recomputeRating(req.tenantId, saleRow.customer_id).catch(() => {});
    res.json({ message: 'Pedido de venda excluído com sucesso' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
