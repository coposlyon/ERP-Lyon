// ============================================================
// Área do vendedor — pedidos da carteira, agenda, comunicação
// com o gerente e o alerta compartilhado entre setores.
//
// Tudo aqui é recortado pela carteira de quem pediu: o vendedor lê os
// pedidos que são dele e conversa com o gerente. Ele não altera pedido,
// não fala com produção e não vê custo.
// ============================================================
const express  = require('express');
const router   = express.Router();
const supabase = require('../config/supabase');
const A        = require('../lib/atencao');
const { ORIGENS } = require('../lib/origens');
const { audit } = require('../lib/audit');

const isManager = req => ['admin', 'manager'].includes(req.userProfile?.role);
const tabelaAusente = err =>
  /42P01|PGRST(002|205)|does not exist|schema cache/i.test(`${err?.code || ''} ${err?.message || ''}`);

// ── Vocabulário do fluxo (o filtro de Status lê daqui) ───────
router.get('/status', (req, res) => res.json(A.listaStatus()));

// O vocabulário de origem mora em lib/origens.js — a mesma lista que o
// módulo de Vendas usa. Duas listas seriam duas verdades.
router.get('/origens', (req, res) => res.json(ORIGENS));

// ============================================================
// TELA 1 — Pedidos de Venda da carteira
// ============================================================
const PEDIDO_SELECT = `
  id, number, order_key, status, origin, source, total, freight, discount,
  created_at, operation_date, ship_date, delivery_date, max_delivery_date,
  customer_id, user_id,
  CLIENTES ( id, display_id, name, phone, mobile, address )
`;

/**
 * A carteira. O padrão é o que está acontecendo AGORA: pedido concluído
 * some da lista até alguém pedir `finalizados=1` — é o que faz o vendedor
 * abrir o sistema e ver trabalho, não histórico.
 */
router.get('/pedidos', async (req, res) => {
  try {
    const tenantId = req.tenantId;
    // Gerente pode olhar a carteira de outro; vendedor vê só a dele.
    const userId = (isManager(req) && req.query.user_id) ? String(req.query.user_id) : req.user.id;

    let q = supabase.from('VENDAS').select(PEDIDO_SELECT)
      .eq('tenant_id', tenantId)
      .neq('status', 'cancelled')
      .order('created_at', { ascending: false })
      .limit(Math.min(Math.max(parseInt(req.query.limit, 10) || 300, 1), 1000));

    // Gerente sem user_id explícito enxerga a empresa inteira.
    if (!(isManager(req) && req.query.todos === '1')) q = q.eq('user_id', userId);
    if (req.query.status) q = q.eq('status', String(req.query.status));

    const { data, error } = await q;
    if (error) throw error;

    let pedidos = data || [];

    // Busca por código do cliente — é a busca principal da tela. Aceita
    // "0234" e "234": o cadastro mostra com zeros à esquerda.
    const codigo = String(req.query.codigo || '').trim();
    if (codigo) {
      const alvo = codigo.replace(/^0+/, '');
      pedidos = pedidos.filter(p => {
        const id = p.CLIENTES?.display_id;
        return id != null && (String(id) === alvo || String(id).padStart(4, '0') === codigo.padStart(4, '0'));
      });
    }

    // Alertas levantados à mão e ainda abertos, para o cálculo da Atenção
    const alertas = await alertasAbertos(tenantId, pedidos.map(p => p.id));

    const agora = new Date();
    const comAtencao = pedidos.map(p => ({
      ...p,
      codigo_cliente: p.CLIENTES?.display_id != null ? String(p.CLIENTES.display_id).padStart(4, '0') : null,
      status_label: A.infoStatus(p.status).label,
      status_cor: A.infoStatus(p.status).cor,
      finalizado: A.finalizado(p.status),
      atencao: A.calcularAtencao(p, agora, alertas.get(p.id) || null),
    }));

    const mostrarFinalizados = req.query.finalizados === '1';
    const lista = mostrarFinalizados ? comAtencao : comAtencao.filter(p => !p.finalizado);

    res.json({
      total: lista.length,
      finalizados_incluidos: mostrarFinalizados,
      pedidos: lista,
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

/** Alertas abertos indexados por pedido. */
async function alertasAbertos(tenantId, saleIds) {
  const mapa = new Map();
  if (!saleIds.length) return mapa;
  try {
    const { data, error } = await supabase.from('ALERTAS_PEDIDO')
      .select('*').eq('tenant_id', tenantId).is('resolved_at', null)
      .in('sale_id', saleIds);
    if (error) { if (tabelaAusente(error)) return mapa; throw error; }
    (data || []).forEach(a => { if (!mapa.has(a.sale_id)) mapa.set(a.sale_id, a); });
  } catch { /* migração 067 pendente: sem alerta manual, só o do status */ }
  return mapa;
}

/**
 * Detalhe do pedido para o vendedor.
 *
 * Rota própria, e não a de Vendas, por dois motivos: o vendedor não tem
 * o módulo `sales` (que dá também PUT e DELETE), e o que ele vê aqui é
 * recortado — item, quantidade, preço de venda e etapa. Custo, margem e
 * rateio não saem daqui porque nem são consultados.
 *
 * A Tela 2 completa ainda vai ser especificada; isto é o que sustenta o
 * botão "Visualizar detalhes" enquanto isso.
 */
router.get('/pedidos/:id', async (req, res) => {
  try {
    // Um select tolerante: colunas de migrações recentes (freight_quote,
    // avisos, event_date) podem faltar numa base que ainda não migrou, e
    // o pedido tem que abrir do mesmo jeito.
    const CAMPOS = `
      id, number, status, origin, source, subtotal, discount, freight, total,
      created_at, operation_date, event_date, ship_date, delivery_date, max_delivery_date,
      payment_method, notes, artwork_url, artwork_notes, user_id, carrier_id,
      tracking_code, freight_quote, avisos, production_log, collect_date, transport_days,
      CLIENTES ( id, display_id, name, cpf_cnpj, phone, mobile, email, address, rating ),
      USUARIOS ( id, name ),
      VENDA_ITENS ( id, product_name, quantity, unit_price, discount, total, customization,
                    PRODUTOS ( id, code, name, unit, ink_type ) )
    `;
    let { data, error } = await supabase.from('VENDAS').select(CAMPOS)
      .eq('id', req.params.id).eq('tenant_id', req.tenantId).maybeSingle();

    if (error && /column|does not exist|schema cache/i.test(error.message || '')) {
      const basico = CAMPOS
        .replace(/freight_quote, avisos, production_log, collect_date, transport_days,/, 'production_log,')
        .replace(/, event_date/, '');
      ({ data, error } = await supabase.from('VENDAS').select(basico)
        .eq('id', req.params.id).eq('tenant_id', req.tenantId).maybeSingle());
    }
    if (error) throw error;
    if (!data) return res.status(404).json({ error: 'Pedido não encontrado' });
    if (!isManager(req) && data.user_id !== req.user.id) {
      return res.status(403).json({ error: 'Este pedido não é da sua carteira' });
    }

    const alertas = await alertasAbertos(req.tenantId, [data.id]);
    const info = A.infoStatus(data.status);

    // A transportadora vem de LOGISTICA por id; sem ela o campo some da
    // tela em vez de mostrar um uuid.
    let transportadora = null;
    if (data.carrier_id) {
      const { data: t } = await supabase.from('TRANSPORTADORAS')
        .select('id, name, trade_name').eq('id', data.carrier_id).maybeSingle();
      transportadora = t ? (t.trade_name || t.name) : null;
    }

    res.json({
      ...data,
      codigo: `PV-${String(data.number).padStart(6, '0')}`,
      codigo_cliente: data.CLIENTES?.display_id != null ? String(data.CLIENTES.display_id).padStart(4, '0') : null,
      vendedor: data.USUARIOS?.name || null,
      transportadora,
      status_label: info.label,
      status_cor: info.cor,
      atencao: A.calcularAtencao(data, new Date(), alertas.get(data.id) || null),
      // A régua inteira do fluxo com o estado de cada balão
      linha_do_tempo: A.linhaDoTempo(data),
      historico: A.historicoPedido(data),
      itens: (data.VENDA_ITENS || []).map(item => ({ ...item, ...detalharItem(item) })),
      avisos: await avisosDoPedido(req.tenantId, data),
      documentos: documentosDoPedido(data),
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

/**
 * As colunas de item que a tela mostra (Linha, Cor do Produto,
 * Categoria, Acessório, Cor da Personalização) não existem como campos:
 * elas foram gravadas no JSON de personalização quando o item foi
 * lançado no PDV. Aqui elas voltam a ser colunas.
 */
function detalharItem(item) {
  const c = item.customization || {};
  const acabamentos = String(c['Acabamentos'] || '').split(',').map(s => s.trim()).filter(Boolean);
  return {
    codigo_produto: c['Código'] || item.PRODUTOS?.code || null,
    produto: item.PRODUTOS?.name || item.product_name || 'Produto',
    linha: c['Tinta'] || item.PRODUTOS?.ink_type || null,
    cor_produto: c['Variação'] || null,
    // "Categoria" na tela é o acabamento contratado (Degradê, Jateado...)
    categoria: acabamentos[0] || null,
    categorias: acabamentos,
    acessorio: c['Borda'] || null,
    cor_personalizacao: c['Cor da personalização'] || null,
  };
}

/**
 * Os avisos do pedido: o padrão da empresa (Configurações) mais o que
 * for específico deste pedido. Ficam no banco e não no código porque
 * mudam com a política comercial — o custo de alterar arte não é
 * decisão de programador.
 */
async function avisosDoPedido(tenantId, venda) {
  let padrao = [];
  try {
    const { data } = await supabase.from('EMPRESAS').select('settings').eq('id', tenantId).maybeSingle();
    const cfg = data?.settings?.pedido_avisos;
    if (Array.isArray(cfg)) padrao = cfg;
  } catch { /* sem configuração: só os do pedido */ }
  const doPedido = Array.isArray(venda.avisos) ? venda.avisos : [];
  return [...padrao, ...doPedido].map(String).filter(Boolean);
}

/**
 * O que dá para baixar. A nota fiscal só aparece disponível depois da
 * coleta — antes disso ela não existe, e um botão que não funciona é
 * pior que um botão explicando por quê.
 */
function documentosDoPedido(venda) {
  const jaColetado = ['mercadoria_coletada', 'produto_retirado', 'em_transito', 'aguardando_entrega', 'entregue', 'pedido_finalizado']
    .includes(venda.status);
  return [
    { key: 'pedido',      label: 'Pedido em PDF',                disponivel: true },
    { key: 'comprovante', label: 'Baixar Comprovante de Pagamento',
      disponivel: !!venda.payment_method,
      nota: venda.payment_method ? null : 'Disponível após o pagamento' },
    { key: 'nfe',         label: 'Baixar Nota Fiscal',
      disponivel: jaColetado,
      nota: jaColetado ? null : 'Disponível após a coleta' },
  ];
}

/** O detalhe que a janelinha da coluna Atenção mostra. */
router.get('/pedidos/:id/atencao', async (req, res) => {
  try {
    const { data: venda, error } = await supabase.from('VENDAS')
      .select(PEDIDO_SELECT).eq('id', req.params.id).eq('tenant_id', req.tenantId).maybeSingle();
    if (error) throw error;
    if (!venda) return res.status(404).json({ error: 'Pedido não encontrado' });
    if (!isManager(req) && venda.user_id !== req.user.id) {
      return res.status(403).json({ error: 'Este pedido não é da sua carteira' });
    }

    const alertas = await alertasAbertos(req.tenantId, [venda.id]);
    const atencao = A.calcularAtencao(venda, new Date(), alertas.get(venda.id) || null);

    res.json({
      pedido: {
        id: venda.id,
        codigo: `PV-${String(venda.number).padStart(4, '0')}`,
        cliente: venda.CLIENTES?.name || null,
        origem: venda.origin || null,
      },
      atencao,
      // Quando o alerta foi levantado — é a "última atualização" da janela
      alerta: alertas.get(venda.id) || null,
      atualizado_em: alertas.get(venda.id)?.created_at || venda.created_at,
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ============================================================
// Alerta compartilhado entre setores
// ============================================================
/**
 * "Comunicar Gerente" da janelinha de Atenção.
 *
 * Faz duas coisas de uma vez: abre o alerta na área responsável (que o
 * módulo dela vai listar) e manda a mensagem ao gerente. O vendedor não
 * intervém no módulo do outro — ele avisa, e quem resolve é quem tem a
 * caneta.
 */
router.post('/pedidos/:id/comunicar', async (req, res) => {
  const motivo = String(req.body.reason || '').trim();
  try {
    const { data: venda } = await supabase.from('VENDAS')
      .select('id, number, status, user_id, customer_id, CLIENTES ( name )')
      .eq('id', req.params.id).eq('tenant_id', req.tenantId).maybeSingle();
    if (!venda) return res.status(404).json({ error: 'Pedido não encontrado' });
    if (!isManager(req) && venda.user_id !== req.user.id) {
      return res.status(403).json({ error: 'Este pedido não é da sua carteira' });
    }

    const info = A.infoStatus(venda.status);
    const codigo = `PV-${String(venda.number).padStart(4, '0')}`;
    const quem = req.userProfile?.name || req.user?.email || 'Vendedor';

    let alerta = null;
    try {
      const { data } = await supabase.from('ALERTAS_PEDIDO').insert({
        tenant_id: req.tenantId,
        sale_id: venda.id,
        area: info.area,
        stage: info.label,
        reason: motivo || `Pedido parado em ${A.AREAS[info.area] || info.area}`,
        raised_by: req.user.id,
        raised_name: quem,
      }).select().single();
      alerta = data;
    } catch { /* migração pendente: a mensagem ao gerente ainda vai */ }

    const gerentes = await listarGerentes(req.tenantId);
    const corpo = [
      `${codigo} — ${venda.CLIENTES?.name || 'cliente'}`,
      `Etapa atual: ${info.label} (${A.AREAS[info.area] || info.area})`,
      motivo ? `\n${motivo}` : '',
    ].join('\n');

    await enviarMensagem(req, {
      to: gerentes.map(g => g.id),
      sale_id: venda.id,
      subject: `Atenção em ${codigo}`,
      body: corpo,
    });

    audit(req, 'create', 'alerta_pedido', alerta?.id || venda.id, { area: info.area, status: venda.status });
    res.status(201).json({ alerta, gerentes: gerentes.length });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

/**
 * Os alertas de uma área. É por aqui que o Financeiro, o Estoque e a
 * Produção veem o MESMO problema que o vendedor está vendo — cada um
 * pela própria tela, com o que o perfil dele permite.
 */
router.get('/alertas', async (req, res) => {
  try {
    let q = supabase.from('ALERTAS_PEDIDO')
      .select('*, VENDAS ( id, number, status, ship_date, delivery_date, CLIENTES ( name ) )')
      .eq('tenant_id', req.tenantId)
      .order('created_at', { ascending: false })
      .limit(200);
    if (req.query.area) q = q.eq('area', String(req.query.area));
    if (req.query.abertos !== '0') q = q.is('resolved_at', null);

    const { data, error } = await q;
    if (error) { if (tabelaAusente(error)) return res.json([]); throw error; }
    res.json(data || []);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/alertas/:id/resolver', async (req, res) => {
  try {
    const { data, error } = await supabase.from('ALERTAS_PEDIDO').update({
      resolved_at: new Date().toISOString(),
      resolved_by: req.user.id,
      resolution: String(req.body.resolution || '').slice(0, 500) || null,
    }).eq('id', req.params.id).eq('tenant_id', req.tenantId).select().single();
    if (error) throw error;
    audit(req, 'update', 'alerta_pedido', req.params.id, { resolvido: true });
    res.json(data);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ============================================================
// Agenda
// ============================================================
const KINDS = ['reuniao', 'ligacao', 'retorno', 'compromisso', 'observacao'];

router.get('/agenda', async (req, res) => {
  try {
    const userId = (isManager(req) && req.query.user_id) ? String(req.query.user_id) : req.user.id;
    let q = supabase.from('AGENDA_VENDEDOR')
      .select('*, CLIENTES ( id, name )')
      .eq('tenant_id', req.tenantId).eq('user_id', userId)
      .order('done').order('due_at', { nullsFirst: false }).limit(500);
    if (req.query.pendentes === '1') q = q.eq('done', false);

    const { data, error } = await q;
    if (error) { if (tabelaAusente(error)) return res.json([]); throw error; }
    res.json(data || []);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/agenda', async (req, res) => {
  const b = req.body || {};
  if (!String(b.title || '').trim()) return res.status(400).json({ error: 'Descreva o compromisso' });
  try {
    const { data, error } = await supabase.from('AGENDA_VENDEDOR').insert({
      tenant_id: req.tenantId,
      user_id: req.user.id,
      kind: KINDS.includes(b.kind) ? b.kind : 'compromisso',
      title: String(b.title).slice(0, 200),
      notes: b.notes ? String(b.notes).slice(0, 2000) : null,
      customer_id: b.customer_id || null,
      due_at: b.due_at || null,
    }).select('*, CLIENTES ( id, name )').single();
    if (error) throw error;
    res.status(201).json(data);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/agenda/:id', async (req, res) => {
  const b = req.body || {};
  const patch = { updated_at: new Date().toISOString() };
  if (b.title !== undefined)       patch.title = String(b.title).slice(0, 200);
  if (b.notes !== undefined)       patch.notes = b.notes ? String(b.notes).slice(0, 2000) : null;
  if (b.kind !== undefined && KINDS.includes(b.kind)) patch.kind = b.kind;
  if (b.customer_id !== undefined) patch.customer_id = b.customer_id || null;
  if (b.due_at !== undefined)      patch.due_at = b.due_at || null;
  if (b.done !== undefined) {
    patch.done = !!b.done;
    patch.done_at = b.done ? new Date().toISOString() : null;
  }
  try {
    // O .eq('user_id') não é redundância: é o que impede um vendedor de
    // marcar como feito o compromisso de outro passando o id na URL.
    const { data, error } = await supabase.from('AGENDA_VENDEDOR')
      .update(patch)
      .eq('id', req.params.id).eq('tenant_id', req.tenantId).eq('user_id', req.user.id)
      .select('*, CLIENTES ( id, name )').single();
    if (error) throw error;
    res.json(data);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/agenda/:id', async (req, res) => {
  try {
    const { error } = await supabase.from('AGENDA_VENDEDOR')
      .delete().eq('id', req.params.id).eq('tenant_id', req.tenantId).eq('user_id', req.user.id);
    if (error) throw error;
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ============================================================
// Comunicação — vendedor ↔ gerente, e mais ninguém
// ============================================================
async function listarGerentes(tenantId) {
  const { data } = await supabase.from('USUARIOS')
    .select('id, name, email, role')
    .eq('tenant_id', tenantId).eq('is_active', true)
    .in('role', ['admin', 'manager']);
  return data || [];
}

/**
 * Com quem esta pessoa pode falar.
 *
 * Vendedor → só gerentes e admins. Gerente → qualquer usuário ativo.
 * Não existe "escolher a produção": o vendedor relata ao gerente e o
 * gerente encaminha internamente. Sem isso, o operador da revelação
 * receberia cobrança de quatro vendedores ao mesmo tempo.
 */
router.get('/comunicacao/contatos', async (req, res) => {
  try {
    if (isManager(req)) {
      const { data } = await supabase.from('USUARIOS')
        .select('id, name, email, role, sector_key')
        .eq('tenant_id', req.tenantId).eq('is_active', true).neq('id', req.user.id)
        .order('name');
      return res.json(data || []);
    }
    res.json(await listarGerentes(req.tenantId));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

async function enviarMensagem(req, { to = [], sale_id = null, subject = null, body, thread_id = null }) {
  const destinos = (Array.isArray(to) ? to : [to]).filter(Boolean);
  if (!destinos.length || !String(body || '').trim()) return [];

  const linhas = destinos.map(dest => ({
    tenant_id: req.tenantId,
    ...(thread_id ? { thread_id } : {}),
    from_user_id: req.user.id,
    from_name: req.userProfile?.name || req.user?.email || null,
    to_user_id: dest,
    sale_id,
    subject: subject ? String(subject).slice(0, 160) : null,
    body: String(body).slice(0, 4000),
  }));

  try {
    const { data } = await supabase.from('MENSAGENS_INTERNAS').insert(linhas).select();
    return data || [];
  } catch { return []; }
}

router.get('/comunicacao', async (req, res) => {
  try {
    // A caixa é tudo que eu mandei ou recebi — a conversa inteira, não
    // só o que chegou.
    const { data, error } = await supabase.from('MENSAGENS_INTERNAS')
      .select('*')
      .eq('tenant_id', req.tenantId)
      .or(`from_user_id.eq.${req.user.id},to_user_id.eq.${req.user.id}`)
      .order('created_at', { ascending: false })
      .limit(300);
    if (error) { if (tabelaAusente(error)) return res.json([]); throw error; }
    res.json(data || []);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/comunicacao', async (req, res) => {
  const b = req.body || {};
  if (!String(b.body || '').trim()) return res.status(400).json({ error: 'Escreva a mensagem' });

  try {
    let destinos = Array.isArray(b.to) ? b.to : (b.to ? [b.to] : []);

    if (!isManager(req)) {
      // A trava real está aqui, não na tela: o vendedor só alcança
      // gerente e admin, mesmo mandando outro id no corpo.
      const gerentes = await listarGerentes(req.tenantId);
      const ids = new Set(gerentes.map(g => g.id));
      destinos = destinos.filter(d => ids.has(d));
      if (!destinos.length) destinos = gerentes.map(g => g.id);
      if (!destinos.length) return res.status(400).json({ error: 'Nenhum gerente cadastrado para receber a mensagem' });
    }

    const enviadas = await enviarMensagem(req, {
      to: destinos,
      sale_id: b.sale_id || null,
      subject: b.subject || null,
      body: b.body,
      thread_id: b.thread_id || null,
    });
    if (!enviadas.length) return res.status(503).json({ error: 'Rode a migração 067 no banco para usar a comunicação.' });
    res.status(201).json(enviadas);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/comunicacao/:id/lida', async (req, res) => {
  try {
    const { data, error } = await supabase.from('MENSAGENS_INTERNAS')
      .update({ read_at: new Date().toISOString() })
      .eq('id', req.params.id).eq('tenant_id', req.tenantId).eq('to_user_id', req.user.id)
      .select().single();
    if (error) throw error;
    res.json(data);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
