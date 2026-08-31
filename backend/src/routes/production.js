const express  = require('express');
const router   = express.Router();
const supabase = require('../config/supabase');
const { audit } = require('../lib/audit');
const { uploadDataUrl } = require('../lib/storage');

const { makeClient } = require('../config/supabase');

const A = require('../lib/atencao');
const F = require('../lib/fluxoPedido');
const { etapasDosItens, caracteristicasDoItem } = require('../lib/itensPedido');

// Etapas e suas colunas de início/fim
// Fluxo: Revelação → Pintura → Metalização (opcional) → Produção → Embalagem
const STAGE_FIELDS = {
  revelacao:   { start: 'revelacao_inicio',   end: 'revelacao_fim',   label: 'Revelação' },
  producao:    { start: 'producao_inicio',    end: 'producao_fim',    label: 'Produção' },
  pintura:     { start: 'pintura_inicio',     end: 'pintura_fim',     label: 'Pintura' },
  metalizacao: { start: 'metalizacao_inicio', end: 'metalizacao_fim', label: 'Metalização' },
  embalagem:   { start: 'embalagem_inicio',   end: 'embalagem_fim',   label: 'Embalagem' },
};

/**
 * A ETAPA DO CHÃO DE FÁBRICA E A FASE DO PEDIDO SÃO A MESMA COISA.
 *
 * Esta tela e a linha do tempo do pedido viviam em mundos separados:
 * terminar a embalagem aqui gravava `status = 'ready'` e terminar
 * qualquer outra gravava `'in_production'` — dois rótulos do fluxo
 * ANTIGO. O efeito era o pior possível: o pedido andava na produção e
 * ANDAVA PARA TRÁS na linha do tempo, caindo num status que a régua nem
 * conhece. Quem olhasse a tela do pedido via a revelação sumir.
 *
 * Agora quem move é o mesmo motor de sempre (lib/fluxoPedido.js):
 * iniciar marca "em processo", finalizar CONCLUI a fase e entrega o
 * pedido na próxima. Metalização não tem fase própria no fluxo — ela
 * registra hora e não mexe no status, que é o certo para uma etapa que
 * o pedido pode ou não ter.
 */
const FASE_DA_ETAPA = {
  revelacao: { fase: 'revelacao', processo: 'revelacao_processo' },
  pintura:   { fase: 'pintura',   processo: 'pintura_processo' },

  // METALIZACAO MUDA O QUE A TELA DIZ, MAS NAO AVANCA A REGUA.
  //
  // Ela e etapa do quadro da fabrica e nao fase do pedido: mora DENTRO
  // da producao. Ficava fora deste mapa, e o efeito era o comercial e o
  // cliente lendo "Aguardando producao" enquanto a peca estava na
  // metalizadora.
  //
  // `avancaAoTerminar: false` e o que impede o estrago inverso:
  // terminar a metalizacao NAO e terminar a producao, e sem esta trava
  // o pedido pularia a fase inteira ao fechar um acabamento.
  metalizacao: { fase: 'producao', processo: 'metalizacao_processo', avancaAoTerminar: false },

  producao:  { fase: 'producao',  processo: 'producao_processo' },
  embalagem: { fase: 'embalagem', processo: 'embalando_pedido' },
};

/**
 * A FILA DA PRODUÇÃO — quem entra e quem não entra.
 *
 * Duas peneiras, e as duas existem porque a fila estava mostrando
 * trabalho que não era trabalho:
 *
 *   1. O PEDIDO FOI ENVIADO. Antes bastava o pedido chegar num certo
 *      status para cair aqui — inclusive os que o comercial ainda
 *      estava acertando com o cliente. Agora alguém precisa ter dito
 *      "pode começar" (pedido do site já nasce dito).
 *
 *   2. TEM O QUE GRAVAR. Copo liso não tem arte, nem vegetal, nem tela:
 *      não há uma etapa de serigrafia sequer para a fábrica registrar.
 *      Ele continua APARECENDO — some da tela seria a produção
 *      descobrir por telefone que existe um pedido —, mas aparece
 *      marcado e sem botão, porque não há o que iniciar.
 */
// ── Board de produção ─────────────────────────────────────
router.get('/', async (req, res) => {
  const { start_date, end_date, search, stage } = req.query;
  try {
    // Busca por número do pedido OU nome do cliente
    let customerIds = null;
    if (search && !/^\d+$/.test(String(search).trim())) {
      const { data: cs } = await supabase.from('CLIENTES').select('id')
        .eq('tenant_id', req.tenantId).ilike('name', `%${String(search).trim()}%`).limit(200);
      customerIds = (cs || []).map(c => c.id);
      if (!customerIds.length) return res.json({ data: [] });
    }

    let q = supabase
      .from('VENDAS')
      .select('*, CLIENTES(name, cpf_cnpj, phone, address), USUARIOS(name), VENDA_ITENS(product_name, quantity, unit_price, total, customization, PRODUTOS(code, name, unit, ink_type))')
      .eq('tenant_id', req.tenantId)
      .in('status', [
        // A JANELA DE PRODUÇÃO, agora completa. Faltavam justamente as
        // fases da própria fábrica — um pedido em "aguardando produção"
        // ou "aguardando embalagem" não aparecia na tela da produção,
        // enquanto "em trânsito", que já saiu daqui, aparecia.
        'aguardando_estoque', 'estoque_confirmado',
        'aguardando_arte', 'arte_aprovada',
        'aguardando_vegetal', 'vegetal_impresso',
        'aguardando_revelacao', 'revelacao_processo', 'revelacao_finalizada',
        'aguardando_pintura', 'pintura_processo', 'pintura_finalizada',
        'aguardando_borda', 'borda_processo', 'borda_finalizada',
        'aguardando_producao', 'producao_processo', 'producao_finalizada',
        'aguardando_qualidade', 'conferencia_processo', 'qualidade_finalizada',
        'aguardando_embalagem', 'embalando_pedido', 'embalagem_finalizada',
        'aguardando_foto',
        // status antigos (vendas anteriores ao novo fluxo)
        'confirmed', 'in_production', 'ready',
      ])
      .order('ship_date', { ascending: true, nullsFirst: false })
      .order('created_at', { ascending: true });

    if (stage) q = q.eq('production_stage', stage);
    if (customerIds) q = q.in('customer_id', customerIds);
    if (search && /^\d+$/.test(String(search).trim())) q = q.eq('number', parseInt(search));
    if (start_date) q = q.gte('ship_date', start_date);
    if (end_date)   q = q.lte('ship_date', end_date);

    const { data, error } = await q.limit(500);
    if (error) throw error;

    const today = new Date(); today.setHours(0, 0, 0, 0);
    const dias = d => (d ? Math.round((new Date(d + 'T00:00:00') - today) / 86400000) : null);
    const rows = (data || []).map(s => {
      const addr = s.CLIENTES?.address || {};
      // prazo de referência: prazo máximo → evento → saída
      const deadline = s.max_delivery_date || s.event_date || s.ship_date || null;
      const itens = (s.VENDA_ITENS || []).map(caracteristicasDoItem);
      const aplicaveis = etapasDosItens(itens);
      const envio = F.envioParaProducao(s);
      return {
        // O que a fábrica pode ou não fazer com este pedido, respondido
        // aqui e não na tela: a tela desenha, o servidor decide.
        personalizado: !!aplicaveis.personalizado,
        enviado_producao: envio.enviado,
        enviado_em: envio.em,
        enviado_por: envio.por,
        interagivel: envio.enviado && !!aplicaveis.personalizado,
        id: s.id, number: s.number, created_at: s.created_at,
        customer: s.CLIENTES?.name || 'Consumidor Final',
        seller: s.USUARIOS?.name || null,
        city: addr.city || null, uf: addr.state || null,
        order_date: s.created_at ? String(s.created_at).slice(0, 10) : null,
        event_date: s.event_date, ship_date: s.ship_date, ship_time: s.ship_time,
        max_delivery_date: s.max_delivery_date,
        diff_event: dias(s.event_date),
        diff_ship: dias(s.ship_date),
        diff_deadline: dias(deadline),
        diff_days: dias(deadline), // coluna "Dias" = dias até o prazo
        carrier: s.carrier,
        photos: Array.isArray(s.production_photos) ? s.production_photos : [],
        stage: s.production_stage || 'aguardando_producao',
        art_file: s.art_file, total: s.total, status: s.status,
      };
    });
    // PEDIDO NÃO ENVIADO NÃO É FILA DA PRODUÇÃO. Ele ainda está com o
    // comercial. `?pendentes=1` mostra os que aguardam o envio, para
    // quem quiser conferir o que está represado.
    const soPendentes = req.query.pendentes === '1';
    const fila = rows.filter(r => (soPendentes ? !r.enviado_producao : r.enviado_producao));

    res.json({
      data: fila,
      // Os números da tela: quantos esperam o comercial mandar e
      // quantos estão aqui sem nada para gravar.
      aguardando_envio: rows.filter(r => !r.enviado_producao).length,
      sem_personalizacao: fila.filter(r => !r.personalizado).length,
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ════════ Serigrafia: configuração, perda de matriz e quadros (telas) ════════
const SERI_DEFAULTS = {
  screen_w: 25, screen_h: 35,                                   // cm
  emulsao_g_m2: 200, emulsao_cost_kg: 0, emulsao_product_id: null,
  sensib_g_m2: 20,   sensib_cost_kg: 0,  sensib_product_id: null,
  removedor_ml_m2: 50, removedor_cost_l: 0, removedor_product_id: null,
  troca_limite: 20,                                             // recuperações antes de trocar a tela
};

async function getSeriConfig(tenantId) {
  let s = {};
  try {
    const { data } = await supabase.from('EMPRESAS').select('settings').eq('id', tenantId).maybeSingle();
    s = (data?.settings && data.settings.serigrafia) || {};
  } catch { s = {}; }
  return { ...SERI_DEFAULTS, ...s };
}

// incrementa gravacoes/recuperacoes de um quadro (cria se não existir)
async function bumpQuadro(tenantId, numero, field, inc = 1) {
  numero = String(numero || '').trim();
  if (!numero) return null;
  const { data: q } = await supabase.from('QUADROS').select('id, gravacoes, recuperacoes')
    .eq('tenant_id', tenantId).eq('numero', numero).maybeSingle();
  if (q) {
    const patch = { updated_at: new Date().toISOString() };
    patch[field] = (Number(q[field]) || 0) + inc;
    await supabase.from('QUADROS').update(patch).eq('id', q.id);
    return { ...q, ...patch };
  }
  const row = { tenant_id: tenantId, numero, gravacoes: 0, recuperacoes: 0 };
  row[field] = inc;
  const { data: ins } = await supabase.from('QUADROS').insert(row).select().single();
  return ins;
}

router.get('/serigrafia/config', async (req, res) => {
  try { res.json(await getSeriConfig(req.tenantId)); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/serigrafia/config', async (req, res) => {
  if (req.userProfile?.role !== 'admin') return res.status(403).json({ error: 'Apenas administradores podem alterar a configuração.' });
  try {
    const { data } = await supabase.from('EMPRESAS').select('settings').eq('id', req.tenantId).maybeSingle();
    const cur = data?.settings || {};
    const merged = { ...cur, serigrafia: { ...SERI_DEFAULTS, ...(cur.serigrafia || {}), ...(req.body || {}) } };
    const { error } = await supabase.from('EMPRESAS').update({ settings: merged }).eq('id', req.tenantId);
    if (error) throw error;
    res.json(merged.serigrafia);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/serigrafia/quadros', async (req, res) => {
  try {
    const cfg = await getSeriConfig(req.tenantId);
    const { data } = await supabase.from('QUADROS').select('*').eq('tenant_id', req.tenantId)
      .order('recuperacoes', { ascending: false });
    const list = (data || []).map(q => ({ ...q, precisa_troca: (Number(q.recuperacoes) || 0) >= Number(cfg.troca_limite || 0) }));
    res.json({ data: list, troca_limite: cfg.troca_limite });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/serigrafia/perdas', async (req, res) => {
  try {
    const { data } = await supabase.from('PERDAS_MATRIZ').select('*').eq('tenant_id', req.tenantId)
      .order('created_at', { ascending: false }).limit(200);
    res.json({ data: data || [] });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/serigrafia/perda', async (req, res) => {
  const { sale_id, quadro, motivo, obs, area_cm2, emulsao_g, sensib_g, removedor_ml } = req.body;
  if (!String(quadro || '').trim()) return res.status(400).json({ error: 'Informe a numeração do quadro.' });
  try {
    const cfg = await getSeriConfig(req.tenantId);
    const area = Number(area_cm2) > 0 ? Number(area_cm2) : (Number(cfg.screen_w) * Number(cfg.screen_h));
    const m2 = area / 10000;
    const emu = emulsao_g != null && emulsao_g !== '' ? Number(emulsao_g) : m2 * Number(cfg.emulsao_g_m2 || 0);
    const sen = sensib_g != null && sensib_g !== '' ? Number(sensib_g) : m2 * Number(cfg.sensib_g_m2 || 0);
    const rem = removedor_ml != null && removedor_ml !== '' ? Number(removedor_ml) : m2 * Number(cfg.removedor_ml_m2 || 0);
    const custo = (emu / 1000) * Number(cfg.emulsao_cost_kg || 0)
                + (sen / 1000) * Number(cfg.sensib_cost_kg || 0)
                + (rem / 1000) * Number(cfg.removedor_cost_l || 0);

    const { data: rec, error } = await supabase.from('PERDAS_MATRIZ').insert({
      tenant_id: req.tenantId, sale_id: sale_id || null, quadro: String(quadro).trim(),
      motivo: motivo || null, obs: obs || null, area_cm2: area,
      emulsao_g: emu, sensib_g: sen, removedor_ml: rem, custo,
      user_id: req.user?.id || null, user_name: req.user?.name || req.user?.email || null,
    }).select().single();
    if (error) throw error;

    // baixa no estoque dos insumos configurados
    const baixa = async (pid, qty, label) => {
      if (!pid || !(qty > 0)) return;
      try {
        await supabase.rpc('atualizar_estoque', {
          p_tenant_id: req.tenantId, p_product_id: pid, p_quantity: -qty, p_type: 'adjustment',
          p_reference_type: 'matriz_perda', p_reference_id: rec.id, p_user_id: req.user?.id || null,
          p_notes: `Perda de matriz ${quadro} — ${label}`,
        });
      } catch { /* estoque pode não estar configurado */ }
    };
    await baixa(cfg.emulsao_product_id, emu, 'emulsão');
    await baixa(cfg.sensib_product_id, sen, 'sensibilizante');
    await baixa(cfg.removedor_product_id, rem, 'removedor');

    const q = await bumpQuadro(req.tenantId, quadro, 'recuperacoes');
    const precisa_troca = q && (Number(q.recuperacoes) || 0) >= Number(cfg.troca_limite || 0);
    audit(req, 'create', 'matriz_perda', rec.id, { quadro, motivo, custo });
    res.status(201).json({ ...rec, quadro_recuperacoes: q?.recuperacoes, precisa_troca });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Detalhe (itens + arte) ────────────────────────────────
router.get('/:id', async (req, res) => {
  try {
    const { data: sale, error } = await supabase
      .from('VENDAS').select('*, CLIENTES(name, cpf_cnpj, phone, address), USUARIOS(name)')
      .eq('id', req.params.id).eq('tenant_id', req.tenantId).single();
    if (error || !sale) return res.status(404).json({ error: 'Pedido não encontrado' });

    const { data: items } = await supabase
      .from('VENDA_ITENS').select('*, PRODUTOS(name, code, unit)')
      .eq('sale_id', req.params.id);

    const { data: perdas } = await supabase
      .from('PRODUCAO_PERDAS').select('*')
      .eq('tenant_id', req.tenantId).eq('sale_id', req.params.id)
      .order('created_at', { ascending: false });

    res.json({
      ...sale,
      order_date: sale.created_at ? String(sale.created_at).slice(0, 10) : null,
      photos: Array.isArray(sale.production_photos) ? sale.production_photos : [],
      history: Array.isArray(sale.production_log) ? sale.production_log : [],
      perdas: perdas || [],
      items: (items || []).map(it => ({
        product_id: it.product_id,
        product_code: it.PRODUTOS?.code, product_name: it.product_name || it.PRODUTOS?.name,
        quantity: it.quantity, unit: it.PRODUTOS?.unit,
        color: it.customization?.cor || null,
        impressao: it.customization?.impressao || null,
        art: it.customization?.preview || null,
        art_file: it.customization?.art_file || null,
        obs: it.customization?.notes || null,
      })),
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Editar dados de produção (datas, transportadora, arte, obs) ──
router.patch('/:id', async (req, res) => {
  const allowed = ['event_date', 'ship_date', 'ship_time', 'carrier', 'art_file', 'production_obs', 'production_stage', 'freight', 'max_delivery_date'];
  const patch = {};
  for (const k of allowed) if (k in req.body) patch[k] = req.body[k] || null;
  if (!Object.keys(patch).length) return res.status(400).json({ error: 'Nada para atualizar' });
  try {
    const { data, error } = await supabase.from('VENDAS').update(patch)
      .eq('id', req.params.id).eq('tenant_id', req.tenantId).select().single();
    if (error) throw error;
    res.json(data);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Iniciar / Finalizar etapa (registra quem e quando) ────
router.post('/:id/stage', async (req, res) => {
  const { stage, action, password, actor_user, quadro, conferido } = req.body;
  const def = STAGE_FIELDS[stage];
  if (!def || !['start', 'finish'].includes(action)) return res.status(400).json({ error: 'Etapa ou ação inválida' });
  try {
    // Toda mudança de etapa exige usuário + senha (confirmação + histórico)
    if (!String(actor_user || '').trim()) return res.status(400).json({ error: 'Informe o usuário.' });
    if (!password) return res.status(400).json({ error: 'Digite sua senha para confirmar.' });
    const email = req.user?.email;
    // Não usar 401: o interceptor do front trata 401 como sessão expirada e desloga.
    if (!email) return res.status(403).json({ error: 'Não consegui confirmar sua sessão. Recarregue a página e tente de novo.' });
    const client = makeClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);
    const { error: authErr } = await client.auth.signInWithPassword({ email, password });
    if (authErr) {
      const badPass = authErr.status === 400 || /invalid|credential|password|senha/i.test(authErr.message || '');
      return res.status(badPass ? 403 : 502).json({ error: badPass ? 'Senha incorreta.' : `Não foi possível confirmar a senha: ${authErr.message}` });
    }

    // Revelação tem campos extras: nº do quadro + conferido
    if (stage === 'revelacao') {
      if (!String(quadro || '').trim()) return res.status(400).json({ error: 'Informe a numeração do quadro.' });
      if (!conferido) return res.status(400).json({ error: 'Marque "Conferido" para confirmar.' });
    }

    const { data: sale, error: e0 } = await supabase.from('VENDAS')
      .select(`production_log, production_stage, status, delivery_mode, notes, created_at,
               VENDA_ITENS ( id, product_name, quantity, customization, PRODUTOS ( id, code, name, ink_type ) )`)
      .eq('id', req.params.id).eq('tenant_id', req.tenantId).single();
    if (e0 || !sale) return res.status(404).json({ error: 'Pedido não encontrado' });

    /**
     * A MESMA PENEIRA DA FILA, AGORA NA AÇÃO.
     *
     * A tela já apaga o botão de quem não pode; isto é o servidor
     * dizendo a mesma coisa. Sem isto, bastaria a requisição chegar por
     * outro caminho — uma aba velha, um duplo clique antes do filtro
     * carregar — para a fábrica registrar revelação num copo liso.
     */
    {
      const itensDoPedido = (sale.VENDA_ITENS || []).map(i => caracteristicasDoItem(i));
      const aplicaveisDoPedido = etapasDosItens(itensDoPedido);
      if (!F.envioParaProducao(sale).enviado) {
        return res.status(409).json({
          error: 'Este pedido ainda não foi enviado para a produção. O comercial precisa liberar antes.',
        });
      }
      if (!aplicaveisDoPedido.personalizado) {
        return res.status(409).json({
          error: 'Este pedido não tem personalização — não passa pela serigrafia. '
               + 'Ele segue pela tela do pedido de venda.',
        });
      }
    }

    const now = new Date().toISOString();
    const actor = String(actor_user || '').trim() || req.user?.name || req.user?.email || 'Usuário';
    const log = Array.isArray(sale.production_log) ? sale.production_log : [];
    const entry = { stage, action, at: now, user_id: req.user?.id || null, user: actor };
    if (stage === 'revelacao') { entry.quadro = String(quadro).trim(); entry.conferido = true; }
    log.push(entry);

    const patch = { production_log: log };
    patch[action === 'start' ? def.start : def.end] = now;
    // estado atual
    if (action === 'start') patch.production_stage = stage;
    if (action === 'finish' && stage === 'embalagem') patch.production_stage = 'finalizado';

    // ── O status do pedido, pela régua do fluxo ──────────────
    const mapa = FASE_DA_ETAPA[stage];
    if (mapa) {
      const itens = (sale.VENDA_ITENS || []).map(i => caracteristicasDoItem(i));
      const aplicaveis = etapasDosItens(itens);
      const trilho = A.fasesVisiveis(sale, aplicaveis);
      const naFase = trilho[F.indiceAtual(trilho, sale.status)]?.key === mapa.fase;

      if (action === 'start' && naFase) {
        // "Estou com a mão nele agora". Não é uma fase nova — é a mesma,
        // dita de outro jeito, e a linha do tempo continua apontando pra cá.
        patch.status = mapa.processo;
        log.push({ stage: 'status', action: mapa.processo, at: now, user_id: req.user?.id || null, user: actor });
      } else if (action === 'finish' && naFase && mapa.avancaAoTerminar !== false) {
        // Terminar a etapa É concluir a fase. Quem trabalha na produção
        // não deveria ter que abrir o pedido depois para avançar de novo.
        //
        // Só quando o pedido está NESTA fase: registrar a hora de uma
        // etapa fora de ordem (acontece) não pode empurrar o pedido para
        // um lugar onde ele não estava.
        const passo = F.avancar(
          { ...sale, production_log: log },
          aplicaveis,
          { perfil: req.userProfile, acesso: req.acesso },
          { user: { id: req.user?.id || null, name: actor } },
        );
        if (!passo.erro) {
          patch.status = passo.status;
          patch.production_log = passo.log;
        }
      }
    }

    const { error } = await supabase.from('VENDAS').update(patch)
      .eq('id', req.params.id).eq('tenant_id', req.tenantId);
    if (error) throw error;
    // Revelação concluída com sucesso = +1 gravação na vida daquele quadro
    if (stage === 'revelacao' && action === 'finish') {
      try { await bumpQuadro(req.tenantId, quadro, 'gravacoes'); } catch { /* ignora */ }
    }
    audit(req, 'update', 'production', req.params.id, { stage, action });
    res.json({ ok: true, stage: patch.production_stage || sale.production_stage });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Registrar perda na produção ───────────────────────────
router.post('/:id/perda', async (req, res) => {
  const { product_id, product_name, quantity, deduct_stock, notes } = req.body;
  const qty = Number(quantity);
  if (!qty || qty <= 0) return res.status(400).json({ error: 'Informe a quantidade perdida' });
  try {
    const actor = req.user?.name || req.user?.email || 'Usuário';
    const { data, error } = await supabase.from('PRODUCAO_PERDAS').insert({
      tenant_id: req.tenantId, sale_id: req.params.id,
      product_id: product_id || null, product_name: product_name || null,
      quantity: qty, user_id: req.user?.id || null, user_name: actor, notes: notes || null,
    }).select().single();
    if (error) throw error;

    // baixa no estoque (quantidade negativa) se solicitado e houver produto
    if (deduct_stock && product_id) {
      try {
        await supabase.rpc('atualizar_estoque', {
          p_tenant_id: req.tenantId, p_product_id: product_id, p_quantity: -Math.abs(qty),
          p_type: 'adjustment', p_reference_type: 'production', p_reference_id: req.params.id,
          p_user_id: req.user?.id || null, p_notes: `Perda na produção${notes ? ' — ' + notes : ''}`,
        });
      } catch { /* ignora se a RPC não existir */ }
    }

    // adiciona ao histórico do pedido
    const { data: sale } = await supabase.from('VENDAS').select('production_log').eq('id', req.params.id).eq('tenant_id', req.tenantId).single();
    const log = Array.isArray(sale?.production_log) ? sale.production_log : [];
    log.push({ stage: 'perda', action: 'registro', at: new Date().toISOString(), user_id: req.user?.id || null, user: actor, detail: `${qty} un${product_name ? ' — ' + product_name : ''}` });
    await supabase.from('VENDAS').update({ production_log: log }).eq('id', req.params.id).eq('tenant_id', req.tenantId);

    audit(req, 'create', 'production_loss', req.params.id, { product_id, quantity: qty });
    res.status(201).json(data);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Anexar foto do copo personalizado (visível ao cliente no site) ──
router.post('/:id/photo', async (req, res) => {
  const { image, caption } = req.body;
  if (!image) return res.status(400).json({ error: 'Envie a imagem (foto do copo)' });
  try {
    const url = await uploadDataUrl(image, 'producao');
    if (!url) return res.status(400).json({ error: 'Não consegui salvar a imagem' });

    const { data: sale, error: e0 } = await supabase.from('VENDAS')
      .select('production_photos, production_log').eq('id', req.params.id).eq('tenant_id', req.tenantId).single();
    if (e0 || !sale) return res.status(404).json({ error: 'Pedido não encontrado' });

    const actor = req.user?.name || req.user?.email || 'Usuário';
    const photos = Array.isArray(sale.production_photos) ? sale.production_photos : [];
    photos.push({ url, caption: caption || null, at: new Date().toISOString(), user: actor });

    const log = Array.isArray(sale.production_log) ? sale.production_log : [];
    log.push({ stage: 'foto', action: 'anexou', at: new Date().toISOString(), user_id: req.user?.id || null, user: actor });

    const { error } = await supabase.from('VENDAS')
      .update({ production_photos: photos, production_log: log })
      .eq('id', req.params.id).eq('tenant_id', req.tenantId);
    if (error) throw error;
    audit(req, 'create', 'production_photo', req.params.id, {});
    res.status(201).json({ ok: true, photos });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Remover foto anexada ──────────────────────────────────
router.delete('/:id/photo', async (req, res) => {
  const url = req.query.url || req.body?.url;
  if (!url) return res.status(400).json({ error: 'Informe a foto a remover' });
  try {
    const { data: sale, error: e0 } = await supabase.from('VENDAS')
      .select('production_photos').eq('id', req.params.id).eq('tenant_id', req.tenantId).single();
    if (e0 || !sale) return res.status(404).json({ error: 'Pedido não encontrado' });
    const photos = (Array.isArray(sale.production_photos) ? sale.production_photos : []).filter(p => p.url !== url);
    const { error } = await supabase.from('VENDAS').update({ production_photos: photos })
      .eq('id', req.params.id).eq('tenant_id', req.tenantId);
    if (error) throw error;
    res.json({ ok: true, photos });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
