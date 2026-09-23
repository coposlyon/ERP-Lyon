const express = require('express');
const router  = express.Router();
const multer  = require('multer');
const { randomUUID: uuidv4 } = require('crypto');
const supabase = require('../config/supabase');
const { audit } = require('../lib/audit');
// O lado do fornecedor na reposicao: link, identidade e resposta.
const R = require('../lib/reposicaoFornecedor');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 }, // 20 MB
});

// ── Movimentações ─────────────────────────────────────────────────────────────
/**
 * OS STATUS EM QUE UMA SOLICITAÇÃO AINDA ESTÁ VIVA.
 *
 * 'pending' é a Lyon esperando o fornecedor; 'respondido' é o
 * fornecedor tendo respondido e a Lyon ainda não tendo recebido. Nos
 * dois casos o produto JÁ FOI PEDIDO — e é isso que impede de pedir de
 * novo. 'completed' e 'cancelled' liberam o produto para uma
 * solicitação nova, que é o que se quer: chegou, ou desistiram.
 */
const EM_ABERTO = ['pending', 'respondido'];

/**
 * LIMPAR O HISTÓRICO NÃO APAGA NENHUMA MOVIMENTAÇÃO.
 *
 * As linhas de MOVIMENTACOES_ESTOQUE não são só histórico: a de venda é
 * o que o excluirVenda.js usa para devolver o estoque quando o pedido é
 * excluído, e a de reposição aponta para a solicitação. Apagar de
 * verdade faria a exclusão de uma venda antiga não devolver nada.
 *
 * Então "limpar" é gravar na AUDITORIA um marco (quem, quando, quantas)
 * e a tela passa a mostrar só o que veio DEPOIS do último marco. O
 * registro de que foi limpo é o próprio marco, e ele fica na Auditoria.
 */
async function ultimaLimpeza(tenantId) {
  const { data, error } = await supabase
    .from('AUDITORIA')
    .select('created_at, user_name, details')
    .eq('tenant_id', tenantId)
    .eq('entity', 'stock_movements')
    .eq('action', 'clear_history')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data || null;
}

router.get('/movements', async (req, res) => {
  const { page = 1, limit = 50, product_id, type, start_date, end_date } = req.query;
  const offset = (page - 1) * limit;

  try {
    const limpeza = await ultimaLimpeza(req.tenantId);

    let query = supabase
      .from('MOVIMENTACOES_ESTOQUE')
      .select('*, PRODUTOS(id, name, code), USUARIOS(name)', { count: 'exact' })
      .eq('tenant_id', req.tenantId)
      .order('created_at', { ascending: false });

    if (limpeza)     query = query.gt('created_at', limpeza.created_at);
    if (product_id)  query = query.eq('product_id', product_id);
    if (type)        query = query.eq('type', type);
    if (start_date)  query = query.gte('created_at', start_date);
    if (end_date)    query = query.lte('created_at', end_date + 'T23:59:59');
    query = query.range(offset, offset + Number(limit) - 1);

    const { data, error, count } = await query;
    if (error) throw error;
    res.json({
      data, total: count, page: Number(page), limit: Number(limit),
      limpeza: limpeza ? { em: limpeza.created_at, por: limpeza.user_name, quantidade: limpeza.details?.quantidade ?? null } : null,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Limpar o histórico — exige a senha da conta (mesma checagem do
// /products/bulk-delete). Só Administrativo.
router.post('/movements/clear', async (req, res) => {
  const papel = req.userProfile?.role;
  if (papel !== 'admin' && papel !== 'manager') return res.status(403).json({ error: 'Só o Administrativo pode limpar o histórico.' });

  const { password } = req.body || {};
  if (!password) return res.status(400).json({ error: 'Digite a senha da conta para confirmar' });

  const email = req.user?.email;
  // Não usar 401: o interceptor do front trata 401 como sessão expirada e desloga.
  if (!email) return res.status(403).json({ error: 'Não consegui confirmar sua sessão. Recarregue a página e tente de novo.' });

  try {
    const client = supabase.makeClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);
    const { error: authErr } = await client.auth.signInWithPassword({ email, password });
    if (authErr) {
      const badPass = authErr.status === 400 || /invalid|credential|password|senha/i.test(authErr.message || '');
      return res.status(badPass ? 403 : 502).json({ error: badPass ? 'Senha incorreta.' : `Não foi possível confirmar a senha: ${authErr.message}` });
    }

    const anterior = await ultimaLimpeza(req.tenantId);
    let contagem = supabase.from('MOVIMENTACOES_ESTOQUE')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', req.tenantId);
    if (anterior) contagem = contagem.gt('created_at', anterior.created_at);
    const { count, error: cErr } = await contagem;
    if (cErr) throw cErr;

    // Aqui NÃO é o audit() fire-and-forget: o marco é o que esconde as
    // linhas, então se não gravar a limpeza não aconteceu.
    const { data: marco, error } = await supabase.from('AUDITORIA').insert({
      tenant_id: req.tenantId,
      user_id:   req.user?.id || null,
      user_name: req.userProfile?.name || req.user?.email || null,
      action:    'clear_history',
      entity:    'stock_movements',
      entity_id: null,
      details:   { quantidade: count || 0 },
    }).select('created_at, user_name').single();
    if (error) throw error;

    res.json({ ok: true, quantidade: count || 0, em: marco.created_at, por: marco.user_name });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Alertas de estoque mínimo ─────────────────────────────────────────────────
router.get('/alerts', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('PRODUTOS')
      .select('id, name, code, current_stock, min_stock, unit')
      .eq('tenant_id', req.tenantId)
      .eq('is_active', true);
    if (error) throw error;
    // filtra em JS (PostgREST não compara duas colunas diretamente)
    const alerts = (data || []).filter(p =>
      Number(p.current_stock) <= Number(p.min_stock || 0) && Number(p.min_stock || 0) > 0
    );
    res.json(alerts);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Sugestão de compra: itens no/abaixo do mínimo, agrupados por fornecedor ────
router.get('/purchase-suggestion', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('PRODUTOS')
      .select('id, code, name, unit, current_stock, min_stock, cost_price, supplier_id, FORNECEDORES(id, name, phone)')
      .eq('tenant_id', req.tenantId)
      .eq('is_active', true);
    if (error) throw error;

    const groups = {};
    for (const p of (data || [])) {
      const stock = Number(p.current_stock) || 0;
      const min   = Number(p.min_stock) || 0;
      // necessidade: repor até o mínimo (ou zerar o negativo)
      let needed = 0;
      if (min > 0 && stock <= min) needed = Math.ceil(min - stock);
      else if (stock < 0)          needed = Math.ceil(-stock);
      if (needed <= 0) continue;

      const key = p.supplier_id || 'sem_fornecedor';
      if (!groups[key]) {
        groups[key] = {
          supplier_id:   p.supplier_id || null,
          supplier_name: p.FORNECEDORES?.name || 'Sem fornecedor',
          supplier_phone: p.FORNECEDORES?.phone || null,
          items: [], total_estimado: 0,
        };
      }
      const estimado = needed * (Number(p.cost_price) || 0);
      groups[key].items.push({
        id: p.id, code: p.code, name: p.name, unit: p.unit,
        current_stock: stock, min_stock: min, cost_price: Number(p.cost_price) || 0,
        suggested_qty: needed, estimated_cost: estimado,
      });
      groups[key].total_estimado += estimado;
    }

    res.json(Object.values(groups).sort((a, b) => b.total_estimado - a.total_estimado));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Folha de contagem para inventário ──────────────────────────────────────────
router.get('/count-sheet', async (req, res) => {
  const { search } = req.query;
  try {
    let query = supabase
      .from('PRODUTOS')
      .select('id, code, name, unit, current_stock, cost_price')
      .eq('tenant_id', req.tenantId)
      .eq('is_active', true)
      .order('name');
    if (search) {
      const s = String(search).replace(/[,()]/g, ' ').trim();
      query = query.or(`name.ilike.%${s}%,code.ilike.%${s}%`);
    }
    const { data, error } = await query.limit(1000);
    if (error) throw error;
    res.json(data || []);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Inventário: aplica a contagem física, ajustando as diferenças ──────────────
router.post('/inventory', async (req, res) => {
  const { items, notes } = req.body; // items: [{ product_id, counted }]
  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'Informe ao menos um produto contado' });
  }
  try {
    const ids = items.map(i => i.product_id);
    const { data: products } = await supabase
      .from('PRODUTOS').select('id, name, current_stock')
      .eq('tenant_id', req.tenantId).in('id', ids);
    const stockMap = Object.fromEntries((products || []).map(p => [p.id, Number(p.current_stock) || 0]));

    const adjustments = [];
    for (const it of items) {
      if (it.counted === '' || it.counted == null) continue;
      const counted = Number(it.counted);
      if (Number.isNaN(counted)) continue;
      const atual = stockMap[it.product_id];
      if (atual === undefined) continue;
      const diff = counted - atual;
      if (diff === 0) continue;

      await supabase.rpc('atualizar_estoque', {
        p_tenant_id:      req.tenantId,
        p_product_id:     it.product_id,
        p_quantity:       diff,
        p_type:           'adjustment',
        p_reference_type: 'inventory',
        p_reference_id:   null,
        p_user_id:        req.user.id,
        p_notes:          `Inventário: contado ${counted}, sistema ${atual}${notes ? ` — ${notes}` : ''}`,
      });
      adjustments.push({ product_id: it.product_id, de: atual, para: counted, diff });
    }

    audit(req, 'inventory', 'stock', null, { ajustados: adjustments.length, itens: adjustments });
    res.json({ success: true, adjusted: adjustments.length, adjustments });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Ajuste de estoque ─────────────────────────────────────────────────────────
router.post('/adjustment', async (req, res) => {
  const { product_id, quantity, notes } = req.body;
  if (!product_id || quantity === undefined) {
    return res.status(400).json({ error: 'Produto e quantidade são obrigatórios' });
  }

  try {
    await supabase.rpc('atualizar_estoque', {
      p_tenant_id:      req.tenantId,
      p_product_id:     product_id,
      p_quantity:       quantity,
      p_type:           'adjustment',
      p_reference_type: 'manual',
      p_reference_id:   null,
      p_user_id:        req.user.id,
      p_notes:          notes,
    });
    audit(req, 'adjustment', 'stock', product_id, { quantity, notes });
    res.json({ message: 'Ajuste de estoque aplicado com sucesso' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Reposição: produtos com estoque negativo ──────────────────────────────────
router.get('/replenishment', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('PRODUTOS')
      .select('id, code, name, unit, current_stock, cost_price, supplier_id, FORNECEDORES(id, name, phone)')
      .eq('tenant_id', req.tenantId)
      .eq('is_active', true)
      .lt('current_stock', 0)
      .order('name');

    if (error) throw error;
    res.json({ data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Solicitar Reposição: salva PDF + registra movimentação ────────────────────
router.post('/replenishment-request', upload.single('pdf'), async (req, res) => {
  const { supplier_id, supplier_name, products_json } = req.body;
  const file = req.file;

  let products = [];
  try { products = JSON.parse(products_json || '[]'); } catch {}
  if (!products.length) return res.status(400).json({ error: 'Nenhum produto informado' });

  let pdf_url = null;

  try {
    // 1. Upload PDF ao Storage (bucket DOCUMENTOS)
    if (file) {
      const date    = new Date().toISOString().split('T')[0];
      const safeName = (supplier_name || 'fornecedor').replace(/[^a-zA-Z0-9]/g, '_').slice(0, 40);
      const filePath = `${req.tenantId}/replenishment/${date}_${safeName}_${Date.now()}.pdf`;

      const { error: upErr } = await supabase.storage
        .from('DOCUMENTOS')
        .upload(filePath, file.buffer, { contentType: 'application/pdf', upsert: true });

      if (!upErr) {
        const { data: { publicUrl } } = supabase.storage
          .from('DOCUMENTOS')
          .getPublicUrl(filePath);
        pdf_url = publicUrl;
      } else {
        console.error('PDF upload error:', upErr.message);
      }
    }

    // 2. Registra uma movimentação por produto (type = replenishment_request)
    const requestId = uuidv4();
    const notes     = `Pedido de reposição — Fornecedor: ${supplier_name || 'N/A'}${pdf_url ? ` | PDF: ${pdf_url}` : ''}`;

    const movements = products.map(p => ({
      tenant_id:      req.tenantId,
      product_id:     p.id,
      type:           'replenishment_request',
      quantity:       Math.abs(Number(p.current_stock)),
      previous_stock: Number(p.current_stock),
      current_stock:  Number(p.current_stock), // sem alteração real de estoque
      reference_type: 'replenishment',
      reference_id:   requestId,
      user_id:        req.user.id,
      notes,
    }));

    const { error: movErr } = await supabase
      .from('MOVIMENTACOES_ESTOQUE')
      .insert(movements);

    if (movErr) console.error('Movement insert error:', movErr.message);

    res.json({ pdf_url, request_id: requestId, success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Pedidos de Reposição (PEDIDOS_REPOSICAO) ─────────────────────────────────

// GET /stock/replenishment-orders
router.get('/replenishment-orders', async (req, res) => {
  const { status, supplier_id } = req.query;
  try {
    let query = supabase
      .from('PEDIDOS_REPOSICAO')
      .select('*')
      .eq('tenant_id', req.tenantId)
      .order('created_at', { ascending: false });

    if (status)      query = query.eq('status', status);
    if (supplier_id) query = query.eq('supplier_id', supplier_id);

    const { data, error } = await query;
    if (error) throw error;
    res.json({ data: data || [] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /stock/replenishment-orders — cria pedido (status=pending) + movimento histórico
// Aceita campo opcional `html_content` (string) para salvar o documento no Storage
router.post('/replenishment-orders', async (req, res) => {
  // `products` é reatribuído abaixo, depois de tirar o que já está numa
  // solicitação em aberto.
  let { supplier_id, supplier_name, products, html_content, protocol_number } = req.body;

  if (!Array.isArray(products) || !products.length)
    return res.status(400).json({ error: 'Nenhum produto informado' });

  try {
    // ── NÃO SE PEDE DUAS VEZES A MESMA COISA ─────────────────
    //
    // O QUE ACONTECIA. A trava era `.maybeSingle()` procurando UM pedido
    // pendente do fornecedor. Ela funciona enquanto não existe
    // duplicata — e quebra no instante em que existe: com duas linhas,
    // `maybeSingle` devolve erro e `data` nulo, o guarda entende "não
    // achei nada" e cria a TERCEIRA. A trava que protege contra
    // duplicata parava de funcionar por causa da primeira duplicata.
    //
    // E ela olhava só 'pending'. Respondido o pedido, o fornecedor
    // sumia da trava e os mesmos copos podiam ser pedidos de novo,
    // agora com dois protocolos correndo atrás da mesma reposição.
    //
    // A PERGUNTA CERTA É POR PRODUTO, e não por fornecedor: o que já
    // está numa solicitação ABERTA não entra em outra. O que ainda não
    // foi pedido segue normalmente — é para isso que serve clicar de
    // novo depois de um copo novo ficar negativo.
    const { data: abertos } = await supabase
      .from('PEDIDOS_REPOSICAO')
      .select('id, supplier_id, protocol_number, products, status')
      .eq('tenant_id', req.tenantId)
      .in('status', EM_ABERTO);

    const jaPedidos = new Set();
    for (const o of abertos || []) {
      for (const p of (o.products || [])) if (p?.id) jaPedidos.add(p.id);
    }

    const novos = products.filter(p => !jaPedidos.has(p.id));
    if (!novos.length) {
      const doFornecedor = (abertos || []).find(o => o.supplier_id === supplier_id) || (abertos || [])[0];
      return res.status(409).json({
        error: 'Todos estes produtos já estão numa solicitação em aberto.',
        dica: 'Veja em Solicitações. Para pedir de novo, cancele a solicitação anterior ou registre o recebimento dela.',
        existing_id: doFornecedor?.id || null,
        protocolo: doFornecedor?.protocol_number || null,
      });
    }

    // Daqui para baixo, `products` é só o que ainda não foi pedido.
    products = novos;

    // Upload do HTML como documento no Storage (quando enviado pelo "Gerar PDF")
    let pdf_url = null;
    if (html_content) {
      try {
        const buffer   = Buffer.from(html_content, 'utf-8');
        const date     = new Date().toISOString().split('T')[0];
        const safeName = (supplier_name || 'fornecedor').replace(/[^a-zA-Z0-9]/g, '_').slice(0, 40);
        const filePath = `${req.tenantId}/replenishment/${date}_${safeName}_${Date.now()}.html`;

        const { error: upErr } = await supabase.storage
          .from('DOCUMENTOS')
          .upload(filePath, buffer, { contentType: 'text/html', upsert: true });

        if (!upErr) {
          const { data: { publicUrl } } = supabase.storage
            .from('DOCUMENTOS')
            .getPublicUrl(filePath);
          pdf_url = publicUrl;
        } else {
          console.error('HTML upload error:', upErr.message);
        }
      } catch (e) {
        console.error('Erro no upload do HTML:', e.message);
      }
    }

    // Gera protocolo de 5 dígitos se não fornecido pelo frontend
    const proto = protocol_number
      || String(Math.floor(Math.random() * 100000)).padStart(5, '0');

    // Cria o pedido
    const { data: order, error: orderErr } = await supabase
      .from('PEDIDOS_REPOSICAO')
      .insert({
        tenant_id:       req.tenantId,
        supplier_id:     supplier_id || null,
        supplier_name:   supplier_name || 'Sem Fornecedor',
        products:        products,
        status:          'pending',
        pdf_url:         pdf_url,
        protocol_number: proto,
        created_by:      req.user.id,
      })
      .select()
      .single();

    if (orderErr) throw orderErr;

    // Registra movimentos históricos (sem alterar estoque real)
    const notesBase = `Solicitação de reposição — Fornecedor: ${supplier_name || 'N/A'} | CONTROLE: ${proto}`;
    const movements = products.map(p => ({
      tenant_id:      req.tenantId,
      product_id:     p.id,
      type:           'adjustment',              // usa tipo aceito pela constraint
      quantity:       0,                         // sem alteração real de estoque
      previous_stock: Number(p.current_stock_at_request || 0),
      current_stock:  Number(p.current_stock_at_request || 0),
      reference_type: 'replenishment_request',   // identifica como solicitação de reposição
      reference_id:   order.id,
      user_id:        req.user.id,
      notes:          notesBase,
    }));

    const { error: movErr } = await supabase
      .from('MOVIMENTACOES_ESTOQUE')
      .insert(movements);

    if (movErr) {
      // Não falha o pedido — só loga o erro de movimentação
      console.error('[replenishment-orders] Erro ao inserir movimentos:', movErr.message, movErr.details);
    }

    // Gera a conta a pagar automática com o custo da reposição.
    // Custo vem do cadastro do produto (não confia no payload do cliente).
    let payable = null;
    try {
      const ids = products.map(p => p.id).filter(Boolean);
      const { data: prods } = await supabase
        .from('PRODUTOS').select('id, cost_price')
        .eq('tenant_id', req.tenantId).in('id', ids);
      const costMap = Object.fromEntries((prods || []).map(p => [p.id, Number(p.cost_price) || 0]));

      const total = products.reduce((s, p) => {
        const qty = Math.abs(Number(p.qty_to_replenish ?? p.current_stock_at_request ?? 0));
        return s + qty * (costMap[p.id] || 0);
      }, 0);

      if (total > 0) {
        const due = new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0];
        const { data: lanc, error: lancErr } = await supabase.from('LANCAMENTOS').insert({
          tenant_id: req.tenantId,
          user_id: req.user.id,
          description: `Reposição de estoque — ${supplier_name || 'Sem Fornecedor'} (Controle ${proto})`,
          type: 'payable',
          amount: Math.round(total * 100) / 100,
          paid_amount: 0,
          due_date: due,
          status: 'pending',
          supplier_id: supplier_id || null,
          reference_type: 'replenishment',
          reference_id: order.id,
        }).select('id, amount, due_date').single();
        if (lancErr) throw lancErr;
        payable = lanc;
        audit(req, 'create', 'financial', lanc.id, {
          origem: 'reposicao', pedido: order.id, protocolo: proto, amount: lanc.amount,
        });
      }
    } catch (e) {
      // Conta a pagar é acessória — não derruba o pedido de reposição
      console.error('[replenishment-orders] Erro ao gerar conta a pagar:', e.message);
    }

    /**
     * O LINK NASCE COM A SOLICITACAO.
     *
     * Ele era criado num botao separado — "gerar novo link" —, e quem
     * esquecesse de clicar mandava para o fornecedor uma mensagem sem
     * endereco nenhum. Pior: clicar de novo TROCAVA o token e matava o
     * link ja enviado.
     *
     * Agora a solicitacao ja sai com o endereco e com o recado do
     * WhatsApp montado. O botao continua existindo para reenviar (e
     * devolve o MESMO link).
     *
     * Se falhar, a solicitacao nao cai junto: ela existe, e o link se
     * pede de novo na tela.
     */
    let link = null;
    try {
      const r = await R.gerarLink(req.tenantId, order.id);
      if (r) link = await linkDaReposicao(req, { ...order, ...r });
    } catch (e) {
      console.error('[replenishment-orders] Erro ao gerar link:', e.message);
    }

    res.status(201).json({ ...order, payable, link });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /stock/replenishment-orders/:id/log-resend — loga reenvio de WA sem criar novo pedido
/**
 * EDITAR A SOLICITACAO — mexer no que foi pedido.
 *
 * Aceita so a QUANTIDADE de cada item e a remocao de linhas. Trocar o
 * fornecedor nao entra: seria outro pedido, com outro protocolo e
 * outro link — e o fornecedor antigo continuaria com um endereco vivo
 * para uma lista que nao e mais dele.
 *
 * SE O FORNECEDOR JA TINHA RESPONDIDO, a resposta cai junto. Ele
 * respondeu sobre uma lista que acabou de mudar: manter o "tenho 10"
 * de um item cuja quantidade virou 40 e guardar uma resposta que
 * ninguem deu. O pedido volta para "aguardando" e o link — que
 * continua o mesmo — mostra a lista nova.
 */
router.put('/replenishment-orders/:id', async (req, res) => {
  const { itens } = req.body || {};
  if (!Array.isArray(itens)) return res.status(400).json({ error: 'Informe os itens' });

  try {
    const { data: order } = await supabase.from('PEDIDOS_REPOSICAO')
      .select('*').eq('id', req.params.id).eq('tenant_id', req.tenantId).maybeSingle();
    if (!order) return res.status(404).json({ error: 'Solicitacao nao encontrada' });
    if (order.status === 'completed') {
      return res.status(400).json({ error: 'Esta solicitacao ja foi concluida — o estoque ja entrou.' });
    }
    if (order.status === 'cancelled') {
      return res.status(400).json({ error: 'Esta solicitacao foi cancelada.' });
    }

    // A quantidade nova entra por POSICAO na lista original: o corpo da
    // requisicao nao pode inventar produto que nao estava no pedido.
    const originais = order.products || [];
    const porLinha = new Map(itens.map(i => [Number(i.linha), i]));
    const novos = originais
      .map((p, i) => {
        const pedido = porLinha.get(i);
        if (!pedido || pedido.remover) return null;
        const qtd = Math.max(0, Math.round(Number(pedido.qtd)) || 0);
        return qtd > 0 ? { ...p, qty_to_replenish: qtd } : null;
      })
      .filter(Boolean);

    if (!novos.length) {
      return res.status(400).json({ error: 'A solicitacao ficaria sem nenhum item. Para isso, cancele.' });
    }

    const { data, error } = await supabase.from('PEDIDOS_REPOSICAO')
      .update({
        products: novos,
        // A resposta antiga era sobre outra lista.
        resposta: null, respondido_em: null, status: 'pending',
      })
      .eq('id', order.id).eq('tenant_id', req.tenantId)
      .select('*').single();
    if (error) throw error;

    audit(req, 'update', 'reposicao', order.id, {
      fornecedor: order.supplier_name,
      de: originais.length, para: novos.length,
      resposta_descartada: !!order.respondido_em,
    });
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * CANCELAR A SOLICITACAO.
 *
 * Nao apaga: o pedido fica no historico com status `cancelled`. Sumir
 * com ele deixaria o fornecedor com um link vivo e ninguem deste lado
 * sabendo que ele existiu.
 *
 * O TOKEN MORRE JUNTO. O link ja saiu no WhatsApp e ninguem
 * desencaminha mensagem — se o endereco continuasse valendo, o
 * fornecedor responderia a um pedido que a Lyon desistiu de fazer.
 */
router.post('/replenishment-orders/:id/cancel', async (req, res) => {
  try {
    const { data: order } = await supabase.from('PEDIDOS_REPOSICAO')
      .select('id, status, supplier_name').eq('id', req.params.id)
      .eq('tenant_id', req.tenantId).maybeSingle();
    if (!order) return res.status(404).json({ error: 'Solicitacao nao encontrada' });
    if (order.status === 'completed') {
      return res.status(400).json({ error: 'Ja concluida: o estoque entrou. Cancelar aqui nao o tiraria.' });
    }

    const { error } = await supabase.from('PEDIDOS_REPOSICAO')
      .update({
        status: 'cancelled',
        public_token: null, token_expira_em: null,
      })
      .eq('id', order.id).eq('tenant_id', req.tenantId);
    if (error) throw error;

    audit(req, 'cancel', 'reposicao', order.id, { fornecedor: order.supplier_name });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/replenishment-orders/:id/log-resend', async (req, res) => {
  const { id } = req.params;
  try {
    const { data: order } = await supabase
      .from('PEDIDOS_REPOSICAO')
      .select('*')
      .eq('id', id)
      .eq('tenant_id', req.tenantId)
      .single();

    if (!order) return res.status(404).json({ error: 'Pedido não encontrado' });

    const notes = `Reenvio de solicitação — Fornecedor: ${order.supplier_name} | CONTROLE: ${order.protocol_number}`;
    const movements = (order.products || []).map(p => ({
      tenant_id:      req.tenantId,
      product_id:     p.id,
      type:           'adjustment',
      quantity:       0,
      previous_stock: Number(p.current_stock_at_request || 0),
      current_stock:  Number(p.current_stock_at_request || 0),
      reference_type: 'replenishment_request',
      reference_id:   order.id,
      user_id:        req.user.id,
      notes,
    }));

    const { error: movErr } = await supabase
      .from('MOVIMENTACOES_ESTOQUE')
      .insert(movements);

    if (movErr) console.error('[log-resend] movErr:', movErr.message);

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /stock/replenishment-orders/:id/complete — confirma recebimento e atualiza estoque
/**
 * O ENDERECO DO FORNECEDOR PARA ESTE PEDIDO.
 *
 * Devolve a URL inteira, pronta para colar no WhatsApp. Renova o token
 * quando ja existe um, em vez de criar outro: dois enderecos vivos para
 * a mesma reposicao e o fornecedor respondendo num e o estoque olhando
 * o outro.
 */
router.post('/replenishment-orders/:id/link', async (req, res) => {
  try {
    // `renovar` so quando alguem pede de proposito — ver `gerarLink`.
    // Sem isso, clicar no botao de novo matava o link ja enviado.
    const r = await R.gerarLink(req.tenantId, req.params.id, { renovar: !!req.body?.renovar });
    if (!r) return res.status(404).json({ error: 'Pedido de reposicao nao encontrado' });

    audit(req, 'link', 'reposicao', r.id, { fornecedor: r.supplier_name, renovado: !!req.body?.renovar });
    res.json(await linkDaReposicao(req, r));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * O ENDERECO E O RECADO, MONTADOS NO MESMO LUGAR.
 *
 * Sao usados em dois pontos — quando a solicitacao NASCE e quando
 * alguem abre a tela depois — e duas copias e uma que vai divergir no
 * dia em que o texto mudar.
 *
 * A base vem do que o proprio navegador usou para chegar aqui: o ERP
 * roda em lyoncopos.online e em localhost, e um endereco fixo no codigo
 * mandaria o fornecedor para o lugar errado num deles.
 */
async function linkDaReposicao(req, pedido) {
  const base = process.env.APP_URL
    || `${req.headers['x-forwarded-proto'] || req.protocol}://${req.get('host')}`;
  const url = `${base}/fornecedor/${pedido.public_token}`;

  // O telefone sai do cadastro, nunca do corpo da requisicao: e para ele
  // que a mensagem vai.
  let telefone = null;
  if (pedido.supplier_id) {
    const { data } = await supabase.from('FORNECEDORES')
      .select('phone').eq('id', pedido.supplier_id).maybeSingle();
    telefone = data?.phone || null;
  }

  const itens = (pedido.products || []).map(p => ({
    nome: p.name || p.nome || 'Produto',
    pedido: Math.abs(Number(p.qty_to_replenish ?? p.qtd ?? 0)) || 0,
  }));

  return {
    url,
    expira_em: pedido.token_expira_em,
    protocolo: pedido.protocol_number,
    fornecedor: pedido.supplier_name,
    tem_telefone: !!telefone,
    whatsapp: R.mensagemWhatsapp({
      url, telefone, itens,
      protocolo: pedido.protocol_number,
      fornecedor: pedido.supplier_name,
    }),
  };
}

router.post('/replenishment-orders/:id/complete', async (req, res) => {
  const { id } = req.params;

  try {
    const { data: order, error: orderErr } = await supabase
      .from('PEDIDOS_REPOSICAO')
      .select('*')
      .eq('id', id)
      .eq('tenant_id', req.tenantId)
      .single();

    if (orderErr || !order) return res.status(404).json({ error: 'Pedido não encontrado' });
    if (order.status === 'completed')
      return res.status(400).json({ error: 'Este pedido já foi concluído' });

    /**
     * ENTRA O QUE O FORNECEDOR DISSE QUE TEM, e não o que foi pedido.
     *
     * Antes a baixa era da lista INTEIRA: pedimos 10 canecas slim, o
     * fornecedor não tinha nenhuma, e o estoque passava a acreditar em
     * dez caixas que nunca chegaram. Com a resposta dele em mãos, a
     * quantidade que entra é a que ele confirmou.
     *
     * Sem resposta (pedido antigo, ou baixa feita sem passar pelo
     * link), vale a lista pedida — é o comportamento de antes, e
     * mudá-lo travaria a baixa de quem combina por telefone.
     */
    const respondeu = Array.isArray(order.resposta) && order.resposta.length > 0;
    const products = respondeu
      ? order.resposta.map(r => ({ id: r.product_id, qty_to_replenish: r.tem }))
      : (order.products || []);
    const results  = [];

    // Adiciona estoque para cada produto via RPC
    for (const p of products) {
      const qty = Math.abs(Number(p.qty_to_replenish ?? p.current_stock_at_request ?? 0));
      // Zero e resposta valida: "nao tenho" nao vira entrada nenhuma.
      if (!qty || !p.id) continue;
      try {
        await supabase.rpc('atualizar_estoque', {
          p_tenant_id:      req.tenantId,
          p_product_id:     p.id,
          p_quantity:       qty,
          p_type:           'entry',
          p_reference_type: 'replenishment_received',
          p_reference_id:   id,
          p_user_id:        req.user.id,
          p_notes:          `Reposição recebida — ${order.supplier_name}`,
        });
        results.push({ id: p.id, qty, success: true });
      } catch (e) {
        console.error(`Estoque produto ${p.id}:`, e.message);
        results.push({ id: p.id, qty, success: false, error: e.message });
      }
    }

    // Marca pedido como concluído
    await supabase
      .from('PEDIDOS_REPOSICAO')
      .update({
        status:       'completed',
        completed_at: new Date().toISOString(),
        completed_by: req.user.id,
      })
      .eq('id', id)
      .eq('tenant_id', req.tenantId);

    res.json({ success: true, products_updated: results });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Resumo de movimentações (últimos 30 dias) ─────────────────────────────────
router.get('/movements-summary', async (req, res) => {
  try {
    const since = new Date();
    since.setDate(since.getDate() - 30);

    // Os KPIs contam o mesmo que a aba Movimentações mostra: o que foi
    // limpo não volta a aparecer aqui.
    const limpeza = await ultimaLimpeza(req.tenantId);
    const desde = limpeza && new Date(limpeza.created_at) > since ? limpeza.created_at : since.toISOString();

    const { data, error } = await supabase
      .from('MOVIMENTACOES_ESTOQUE')
      .select('quantity, notes, type')
      .eq('tenant_id', req.tenantId)
      .gt('created_at', desde);

    if (error) throw error;

    const entries = data.filter(m => m.type === 'entry').length;
    const exits   = data.filter(m => m.type === 'exit').length;
    const losses  = data.filter(m => (m.notes || '').toUpperCase().includes('PERDA')).length;

    res.json({ entries, exits, losses, period_days: 30 });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
