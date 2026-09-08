// ============================================================
// O MÓDULO COMUNICAÇÃO — o que aconteceu, e quem falou o quê.
//
// SÃO DUAS PERGUNTAS DIFERENTES NA MESMA TELA, e é de propósito.
//
//   "O que aconteceu no sistema?"  o mural de atividades: cadastro
//                                  alterado, pedido editado, etapa
//                                  concluída, arte anexada.
//
//   "O que a gente combinou?"      o chat da empresa.
//
// Separadas, viram duas telas que ninguém cruza: alguém pergunta no
// chat "por que o PV-12 voltou para vegetal?" sem ver que a resposta
// está no mural, três linhas acima, com nome e hora. Juntas, a conversa
// acontece ao lado do fato.
//
// O MURAL VEM DE DUAS FONTES, e não de uma tabela nova.
//
//   AUDITORIA           já registra criar/alterar/excluir de tudo. É a
//                       fonte de "quem mexeu no cadastro".
//
//   VENDAS.production_log  registra o andamento do pedido, marco a
//                       marco, com hora e com quem. É a fonte de "quem
//                       moveu o pedido".
//
// Duplicar isso numa terceira tabela seria criar uma terceira versão da
// verdade para manter em dia. O custo é ler as duas e ordenar por
// tempo, feito aqui — e o teto está anotado onde ele começa a doer.
// ============================================================
const express = require('express');
const router = express.Router();
const supabase = require('../config/supabase');
const A = require('../lib/atencao');
const { audit } = require('../lib/audit');

const isManager = req => ['admin', 'manager'].includes(req.userProfile?.role);
const tabelaAusente = err => /does not exist|schema cache|relation/i.test(err?.message || '');

// ============================================================
// O MURAL DE ATIVIDADES
// ============================================================

/**
 * O nome legível de cada coisa que o sistema registra.
 *
 * A AUDITORIA guarda `entity` como chave técnica ('sale', 'product') e
 * `action` como verbo cru ('create', 'update'). "create sale" é o que o
 * banco entende; "Pedido criado" é o que a pessoa lê. A tradução mora
 * aqui, e não na tela, porque o mesmo texto precisa sair igual no
 * resumo do dia, na busca e em qualquer relatório que venha depois.
 *
 * Entidade desconhecida NÃO some do mural: ela aparece com a chave
 * crua. Sumir seria esconder uma ação que aconteceu porque ninguém
 * lembrou de acrescentá-la nesta lista.
 */
const ENTIDADES = {
  sale: 'Pedido', venda: 'Pedido', product: 'Produto', customer: 'Cliente',
  supplier: 'Fornecedor', financial: 'Lançamento', lancamento: 'Lançamento',
  stock: 'Estoque', purchase: 'Compra', quote: 'Orçamento', user: 'Usuário',
  employee: 'Colaborador', item: 'Item', categoria: 'Categoria',
  alerta_pedido: 'Alerta de pedido', nota_fiscal: 'Nota fiscal',
  reposicao: 'Reposição', agenda: 'Compromisso', chat: 'Mensagem',
};

const ACOES = {
  create: 'criou', update: 'alterou', delete: 'excluiu',
  login: 'entrou no sistema', export: 'exportou', import: 'importou',
};

/** A frase do mural, montada do registro cru da auditoria. */
function frase(e) {
  const ent = ENTIDADES[e.entity] || e.entity;
  const acao = ACOES[e.action] || e.action;
  // Detalhes que valem uma linha a mais. `editou_itens` é o caso que
  // motivou isto: "alterou Pedido" não conta que o valor mudou.
  const d = e.details || {};
  if (e.entity === 'sale' && d.editou_itens) {
    return `editou o Pedido — total de ${brl(d.total_antes)} para ${brl(d.total_agora)}`;
  }
  if (e.entity === 'sale' && d.number) return `${acao} o Pedido #${d.number}`;
  return `${acao} ${ent}`;
}

const brl = n => (Number(n) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

/**
 * GET /comunicacao/atividades
 *
 * O mural. Junta auditoria e andamento de pedido numa linha do tempo só.
 *
 * O TETO: lê os últimos N pedidos para achatar o `production_log` de
 * cada um. Com a Lyon inteira em algumas centenas de pedidos isso é uma
 * consulta e um `flatMap`. Passando de alguns milhares, o certo é a
 * gravação do marco também escrever em AUDITORIA — e aí esta função lê
 * uma fonte só. Está anotado porque o dia de mudar isso tem um sinal
 * claro, e não é hoje.
 */
router.get('/atividades', async (req, res) => {
  const limite = Math.min(Math.max(parseInt(req.query.limite, 10) || 80, 1), 300);
  const quem = String(req.query.user_id || '').trim();
  const tipo = String(req.query.tipo || '').trim();   // 'sistema' | 'pedidos' | ''

  try {
    const eventos = [];

    // ── 1. O que a auditoria registrou ──────────────────────
    if (tipo !== 'pedidos') {
      let q = supabase.from('AUDITORIA')
        .select('id, user_id, user_name, action, entity, entity_id, details, created_at')
        .eq('tenant_id', req.tenantId)
        .order('created_at', { ascending: false })
        .limit(limite);
      if (quem) q = q.eq('user_id', quem);

      const { data, error } = await q;
      if (error && !tabelaAusente(error)) throw error;
      for (const e of data || []) {
        eventos.push({
          id: `aud:${e.id}`,
          fonte: 'sistema',
          at: e.created_at,
          user_id: e.user_id,
          user: e.user_name,
          entidade: ENTIDADES[e.entity] || e.entity,
          texto: frase(e),
          alvo_tipo: e.entity,
          alvo_id: e.entity_id,
          cor: e.action === 'delete' ? 'vermelho' : e.action === 'create' ? 'verde' : 'azul',
        });
      }
    }

    // ── 2. O andamento dos pedidos ──────────────────────────
    if (tipo !== 'sistema') {
      const { data: vendas, error } = await supabase.from('VENDAS')
        .select('id, number, status, production_log')
        .eq('tenant_id', req.tenantId)
        .order('created_at', { ascending: false })
        .limit(200);
      if (error && !tabelaAusente(error)) throw error;

      for (const v of vendas || []) {
        const log = Array.isArray(v.production_log) ? v.production_log : [];
        log.forEach((m, i) => {
          const chave = m.action || m.status;
          if (!chave || !m.at) return;
          const info = A.infoStatus(chave);
          // Chave que o catálogo não conhece vira o texto cru, e não
          // desaparece: marco registrado é marco acontecido.
          const label = info?.label && info.label !== chave
            ? info.label
            : String(chave).replace(/_/g, ' ');
          eventos.push({
            id: `ped:${v.id}:${i}`,
            fonte: 'pedido',
            at: m.at,
            user_id: null,
            user: m.user || (m.automatico ? 'Sistema' : null),
            entidade: 'Pedido',
            texto: `${label} — PV-${String(v.number).padStart(6, '0')}`,
            alvo_tipo: 'sale',
            alvo_id: v.id,
            automatico: !!m.automatico,
            observacao: m.observacao || m.motivo || null,
            cor: info?.cor || 'azul',
          });
        });
      }
    }

    // Uma linha do tempo só, do mais recente para trás. O corte vem
    // DEPOIS da mistura: cortar cada fonte antes daria oitenta de cada,
    // e o mural mostraria oitenta marcos de ontem misturados com
    // oitenta ações de hoje.
    eventos.sort((a, b) => String(b.at).localeCompare(String(a.at)));

    res.json({ data: eventos.slice(0, limite), total: eventos.length });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ============================================================
// O CHAT DA EMPRESA
// ============================================================

const CANAL_PADRAO = 'geral';
const canalDe = req => String(req.query.canal || req.body?.canal || CANAL_PADRAO).slice(0, 40) || CANAL_PADRAO;

/**
 * Quem foi chamado pelo nome na mensagem.
 *
 * Resolve "@" + começo do nome contra os usuários ativos. É feito na
 * ESCRITA, uma vez, e não a cada leitura: pintar menção varrendo mil
 * mensagens contra a lista de gente é trabalho repetido para sempre.
 *
 * Casa pelo primeiro nome e pelo nome inteiro sem espaço — é assim que
 * as pessoas escrevem: "@renata", "@renataalves".
 */
function acharMencionados(texto, usuarios) {
  const marcas = String(texto || '').match(/@([\p{L}\d._-]{2,40})/gu) || [];
  if (!marcas.length) return [];
  const alvo = new Set();
  for (const m of marcas) {
    const chave = m.slice(1).toLowerCase();
    for (const u of usuarios) {
      const nome = String(u.name || '').toLowerCase();
      const primeiro = nome.split(/\s+/)[0] || '';
      const junto = nome.replace(/\s+/g, '');
      const email = String(u.email || '').split('@')[0].toLowerCase();
      if (chave === primeiro || chave === junto || chave === email) alvo.add(u.id);
    }
  }
  return [...alvo];
}

async function usuariosAtivos(tenantId) {
  const { data } = await supabase.from('USUARIOS')
    .select('id, name, email, role, sector_key')
    .eq('tenant_id', tenantId).eq('is_active', true).order('name');
  return data || [];
}

/** As pessoas com quem se fala — para a lista de menção e de participantes. */
router.get('/pessoas', async (req, res) => {
  try { res.json(await usuariosAtivos(req.tenantId)); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

/**
 * GET /comunicacao/chat
 *
 * As mensagens do canal, da mais antiga para a mais nova — que é a
 * ordem em que se lê uma conversa. A consulta pega as últimas N pelo
 * fim e reinverte aqui: pedir as N primeiras traria o começo da
 * história da empresa toda vez que alguém abrisse a tela.
 */
router.get('/chat', async (req, res) => {
  const canal = canalDe(req);
  const limite = Math.min(Math.max(parseInt(req.query.limite, 10) || 120, 1), 400);
  try {
    const { data, error } = await supabase.from('CHAT_MENSAGENS')
      .select('id, canal, user_id, user_name, body, reply_to, mencionados, deleted_at, edited_at, created_at')
      .eq('tenant_id', req.tenantId).eq('canal', canal)
      .order('created_at', { ascending: false }).limit(limite);
    if (error) { if (tabelaAusente(error)) return res.json({ data: [], canal }); throw error; }

    const msgs = (data || []).reverse();

    // A CITAÇÃO VEM JUNTO. Sem isto a tela mostraria "respondendo a…"
    // com um id, ou faria uma consulta por mensagem citada — cem
    // consultas para desenhar uma conversa.
    const citadas = [...new Set(msgs.map(m => m.reply_to).filter(Boolean))];
    let porId = {};
    if (citadas.length) {
      const { data: c } = await supabase.from('CHAT_MENSAGENS')
        .select('id, user_name, body, deleted_at').in('id', citadas);
      porId = Object.fromEntries((c || []).map(x => [x.id, x]));
    }

    res.json({
      canal,
      data: msgs.map(m => ({
        ...m,
        // Removida não devolve o texto. Marcar `deleted_at` e mandar o
        // corpo assim mesmo seria esconder na tela o que continua
        // viajando pela rede.
        body: m.deleted_at ? null : m.body,
        removida: !!m.deleted_at,
        citada: m.reply_to && porId[m.reply_to] ? {
          id: m.reply_to,
          user_name: porId[m.reply_to].user_name,
          body: porId[m.reply_to].deleted_at ? null : String(porId[m.reply_to].body || '').slice(0, 180),
          removida: !!porId[m.reply_to].deleted_at,
        } : null,
      })),
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

/** Manda uma mensagem para a sala. */
router.post('/chat', async (req, res) => {
  const corpo = String(req.body?.body || '').trim();
  if (!corpo) return res.status(400).json({ error: 'Escreva a mensagem.' });
  if (corpo.length > 4000) return res.status(400).json({ error: 'Mensagem muito longa (limite de 4000 caracteres).' });

  const canal = canalDe(req);
  try {
    // A citação tem de ser DESTE canal e desta empresa: o id vem da
    // tela, e sem esta conferência daria para pendurar uma resposta na
    // conversa de outra empresa.
    let reply = null;
    if (req.body?.reply_to) {
      const { data } = await supabase.from('CHAT_MENSAGENS')
        .select('id').eq('id', req.body.reply_to)
        .eq('tenant_id', req.tenantId).eq('canal', canal).maybeSingle();
      reply = data?.id || null;
    }

    const { data, error } = await supabase.from('CHAT_MENSAGENS').insert({
      tenant_id: req.tenantId, canal,
      user_id: req.user.id,
      user_name: req.userProfile?.name || req.user?.email || null,
      body: corpo,
      reply_to: reply,
      mencionados: acharMencionados(corpo, await usuariosAtivos(req.tenantId)),
    }).select().single();
    if (error) throw error;

    // Quem escreve já leu o que escreveu.
    await marcarLido(req.tenantId, req.user.id, canal);

    res.status(201).json({ ...data, removida: false });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

/** Editar a própria mensagem. */
router.put('/chat/:id', async (req, res) => {
  const corpo = String(req.body?.body || '').trim();
  if (!corpo) return res.status(400).json({ error: 'Escreva a mensagem.' });
  try {
    const { data: msg } = await supabase.from('CHAT_MENSAGENS')
      .select('id, user_id, canal, deleted_at')
      .eq('id', req.params.id).eq('tenant_id', req.tenantId).maybeSingle();
    if (!msg) return res.status(404).json({ error: 'Mensagem não encontrada.' });
    if (msg.deleted_at) return res.status(409).json({ error: 'Esta mensagem foi removida.' });
    // EDITAR É SÓ DO DONO — inclusive para o gerente. Apagar mensagem
    // alheia é moderação; REESCREVÊ-LA é pôr palavra na boca de alguém,
    // e nenhum cargo devia poder fazer isso.
    if (msg.user_id !== req.user.id) {
      return res.status(403).json({ error: 'Só quem escreveu pode editar a mensagem.' });
    }

    const { data, error } = await supabase.from('CHAT_MENSAGENS').update({
      body: corpo.slice(0, 4000),
      edited_at: new Date().toISOString(),
      mencionados: acharMencionados(corpo, await usuariosAtivos(req.tenantId)),
    }).eq('id', msg.id).eq('tenant_id', req.tenantId).select().single();
    if (error) throw error;
    res.json({ ...data, removida: false });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

/** Remove a mensagem — o dono, ou um gerente moderando. */
router.delete('/chat/:id', async (req, res) => {
  try {
    const { data: msg } = await supabase.from('CHAT_MENSAGENS')
      .select('id, user_id, user_name').eq('id', req.params.id).eq('tenant_id', req.tenantId).maybeSingle();
    if (!msg) return res.status(404).json({ error: 'Mensagem não encontrada.' });
    if (msg.user_id !== req.user.id && !isManager(req)) {
      return res.status(403).json({ error: 'Só quem escreveu, ou um gerente, pode remover.' });
    }
    const { error } = await supabase.from('CHAT_MENSAGENS')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', msg.id).eq('tenant_id', req.tenantId);
    if (error) throw error;
    // Gerente apagando mensagem de outro é ato de moderação, e ato de
    // moderação fica registrado.
    if (msg.user_id !== req.user.id) {
      audit(req, 'delete', 'chat', msg.id, { autor: msg.user_name, moderacao: true });
    }
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

async function marcarLido(tenantId, userId, canal) {
  try {
    await supabase.from('CHAT_LEITURAS').upsert({
      tenant_id: tenantId, user_id: userId, canal, lido_ate: new Date().toISOString(),
    }, { onConflict: 'tenant_id,user_id,canal' });
  } catch { /* marca de leitura perdida não pode derrubar o envio */ }
}

router.post('/chat/lido', async (req, res) => {
  try {
    await marcarLido(req.tenantId, req.user.id, canalDe(req));
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

/**
 * Quantas mensagens novas, e quantas delas chamam esta pessoa pelo nome.
 *
 * Os dois números são diferentes de propósito: quarenta mensagens não
 * lidas na sala é rotina, uma menção é alguém esperando resposta.
 */
router.get('/chat/nao-lidas', async (req, res) => {
  const canal = canalDe(req);
  try {
    const { data: leitura } = await supabase.from('CHAT_LEITURAS')
      .select('lido_ate').eq('tenant_id', req.tenantId)
      .eq('user_id', req.user.id).eq('canal', canal).maybeSingle();
    // Quem nunca abriu a sala não recebe mil não lidas na cara: o
    // marco é a última hora, e a conversa antiga fica como histórico.
    const desde = leitura?.lido_ate || new Date(Date.now() - 3600000).toISOString();

    const { data } = await supabase.from('CHAT_MENSAGENS')
      .select('id, user_id, mencionados')
      .eq('tenant_id', req.tenantId).eq('canal', canal)
      .is('deleted_at', null).gt('created_at', desde);

    // O que eu mesmo escrevi não conta como não lido.
    const outras = (data || []).filter(m => m.user_id !== req.user.id);
    res.json({
      canal,
      nao_lidas: outras.length,
      mencoes: outras.filter(m => (m.mencionados || []).includes(req.user.id)).length,
      desde,
    });
  } catch (err) { res.json({ canal, nao_lidas: 0, mencoes: 0 }); }
});

// ============================================================
// A AGENDA — o calendário da empresa
// ============================================================
const TIPOS = ['reuniao', 'ligacao', 'retorno', 'compromisso', 'tarefa', 'entrega', 'observacao'];

/**
 * O QUE ESTA PESSOA ENXERGA NA AGENDA.
 *
 * Gerente vê tudo — é o trabalho dele saber quem está onde. Os demais
 * veem o que é seu, o que é da empresa e aquilo em que foram postos
 * como participantes. Ninguém vê a agenda pessoal de outro por acaso.
 */
function podeVer(item, req) {
  if (isManager(req)) return true;
  if (item.da_empresa) return true;
  if (item.user_id === req.user.id) return true;
  return (item.participantes || []).includes(req.user.id);
}

/** Dono ou gerente editam; participante só marca como concluído. */
function podeEditar(item, req) {
  return isManager(req) || item.user_id === req.user.id;
}

/**
 * GET /comunicacao/agenda?de=YYYY-MM-DD&ate=YYYY-MM-DD
 *
 * A faixa vem da tela: o calendário pede o mês que está mostrando, com
 * as sobras da semana que entram e da que sai. Sem faixa, devolveria a
 * agenda inteira da empresa para desenhar trinta quadradinhos.
 */
router.get('/agenda', async (req, res) => {
  try {
    let q = supabase.from('AGENDA_VENDEDOR')
      .select('*, CLIENTES ( id, name )')
      .eq('tenant_id', req.tenantId)
      .order('due_at', { nullsFirst: false })
      .limit(1000);

    if (req.query.de)  q = q.gte('due_at', `${req.query.de}T00:00:00`);
    if (req.query.ate) q = q.lte('due_at', `${req.query.ate}T23:59:59`);
    if (req.query.pendentes === '1') q = q.eq('done', false);

    const { data, error } = await q;
    if (error) { if (tabelaAusente(error)) return res.json([]); throw error; }

    // O FILTRO DE VISIBILIDADE É AQUI, e não no `select`: a regra tem
    // três braços (meu, da empresa, sou participante) e um deles é
    // busca dentro de array. Escrever isso em PostgREST daria uma
    // string que ninguém revisa; aqui está em três linhas legíveis, e o
    // volume é o de um mês de agenda.
    res.json((data || []).filter(x => podeVer(x, req)));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

function corpoDoCompromisso(b) {
  const patch = {};
  if (b.title !== undefined)  patch.title = String(b.title).slice(0, 200);
  if (b.notes !== undefined)  patch.notes = b.notes ? String(b.notes).slice(0, 2000) : null;
  if (b.kind !== undefined && TIPOS.includes(b.kind)) patch.kind = b.kind;
  if (b.customer_id !== undefined) patch.customer_id = b.customer_id || null;
  if (b.due_at !== undefined) patch.due_at = b.due_at || null;
  if (b.end_at !== undefined) patch.end_at = b.end_at || null;
  if (b.dia_inteiro !== undefined) patch.dia_inteiro = !!b.dia_inteiro;
  if (b.local !== undefined)  patch.local = b.local ? String(b.local).slice(0, 200) : null;
  if (b.da_empresa !== undefined) patch.da_empresa = !!b.da_empresa;
  if (b.participantes !== undefined) {
    patch.participantes = Array.isArray(b.participantes) ? b.participantes.filter(Boolean).slice(0, 50) : [];
  }
  return patch;
}

router.post('/agenda', async (req, res) => {
  const b = req.body || {};
  if (!String(b.title || '').trim()) return res.status(400).json({ error: 'Descreva o compromisso.' });
  try {
    const patch = corpoDoCompromisso(b);
    // COMPROMISSO DA EMPRESA É DECISÃO DE GESTÃO. Feriado, parada de
    // máquina e inventário aparecem no calendário de todo mundo — não é
    // coisa que cada um marca para os outros.
    if (patch.da_empresa && !isManager(req)) patch.da_empresa = false;

    // O FIM NÃO PODE VIR ANTES DO COMEÇO. Sem isto, o calendário
    // desenharia um bloco de altura negativa e a reunião apareceria no
    // dia anterior.
    if (patch.due_at && patch.end_at && new Date(patch.end_at) < new Date(patch.due_at)) {
      return res.status(400).json({ error: 'O término não pode ser antes do início.' });
    }

    const { data, error } = await supabase.from('AGENDA_VENDEDOR').insert({
      tenant_id: req.tenantId,
      user_id: req.user.id,
      kind: TIPOS.includes(b.kind) ? b.kind : 'compromisso',
      ...patch,
    }).select('*, CLIENTES ( id, name )').single();
    if (error) throw error;
    audit(req, 'create', 'agenda', data.id, { titulo: data.title, quando: data.due_at });
    res.status(201).json(data);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/agenda/:id', async (req, res) => {
  const b = req.body || {};
  try {
    const { data: atual } = await supabase.from('AGENDA_VENDEDOR')
      .select('*').eq('id', req.params.id).eq('tenant_id', req.tenantId).maybeSingle();
    if (!atual) return res.status(404).json({ error: 'Compromisso não encontrado.' });
    if (!podeVer(atual, req)) return res.status(404).json({ error: 'Compromisso não encontrado.' });

    // PARTICIPANTE CONCLUI, MAS NÃO REESCREVE. Quem foi convidado para
    // a reunião pode dizer "feito"; mudar a hora, o lugar e a lista de
    // quem vai é de quem marcou.
    const soConcluir = !podeEditar(atual, req);
    const patch = soConcluir ? {} : corpoDoCompromisso(b);
    if (soConcluir && Object.keys(corpoDoCompromisso(b)).length) {
      return res.status(403).json({ error: 'Só quem marcou o compromisso (ou um gerente) pode alterá-lo.' });
    }
    if (patch.da_empresa !== undefined && !isManager(req)) delete patch.da_empresa;

    if (b.done !== undefined) {
      patch.done = !!b.done;
      patch.done_at = b.done ? new Date().toISOString() : null;
    }
    if (!Object.keys(patch).length) return res.json(atual);

    const inicio = patch.due_at !== undefined ? patch.due_at : atual.due_at;
    const fim = patch.end_at !== undefined ? patch.end_at : atual.end_at;
    if (inicio && fim && new Date(fim) < new Date(inicio)) {
      return res.status(400).json({ error: 'O término não pode ser antes do início.' });
    }

    patch.updated_at = new Date().toISOString();
    const { data, error } = await supabase.from('AGENDA_VENDEDOR')
      .update(patch).eq('id', atual.id).eq('tenant_id', req.tenantId)
      .select('*, CLIENTES ( id, name )').single();
    if (error) throw error;
    res.json(data);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/agenda/:id', async (req, res) => {
  try {
    const { data: atual } = await supabase.from('AGENDA_VENDEDOR')
      .select('id, user_id, title, da_empresa, participantes')
      .eq('id', req.params.id).eq('tenant_id', req.tenantId).maybeSingle();
    if (!atual) return res.status(404).json({ error: 'Compromisso não encontrado.' });
    if (!podeEditar(atual, req)) {
      return res.status(403).json({ error: 'Só quem marcou o compromisso (ou um gerente) pode excluí-lo.' });
    }
    const { error } = await supabase.from('AGENDA_VENDEDOR')
      .delete().eq('id', atual.id).eq('tenant_id', req.tenantId);
    if (error) throw error;
    audit(req, 'delete', 'agenda', atual.id, { titulo: atual.title });
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
