// ============================================================
// OS AVISOS DO SININHO.
//
// A escolha que decide tudo aqui: NÃO EXISTE TABELA DE NOTIFICAÇÃO.
//
// O caminho comum seria criar uma, e mandar cada rota gravar uma linha
// quando "algo acontecesse". Duas coisas dão errado nesse caminho, e as
// duas são difíceis de descobrir depois:
//
//   1. TODA ROTA NOVA PRECISA LEMBRAR DE AVISAR. A que esquecer não dá
//      erro — só fica em silêncio. E ninguém sente falta de um aviso
//      que nunca existiu.
//   2. O AVISO ENVELHECE SOZINHO. "Estoque baixo do copo X" gravado
//      ontem continua lá depois de a compra chegar, porque a linha não
//      sabe que o mundo mudou. O usuário aprende a ignorar o sininho —
//      e aí ele deixou de servir para qualquer coisa.
//
// Então o aviso é CALCULADO na leitura, das mesmas tabelas que as telas
// já mostram. Estoque subiu? O aviso some. PIX confirmado? Some. É o
// mesmo raciocínio da coluna Atenção (lib/atencao.js): estado que muda
// sozinho não se guarda, se calcula.
//
// O que sobra de estado é só "eu já vi isso", e isso é do usuário, não
// do fato — mora no navegador dele, não no banco.
//
// CADA FONTE RESPEITA O MÓDULO. Quem não tem 'stock' não recebe aviso
// de estoque: o sininho não é uma porta lateral para ver o que a pessoa
// não pode abrir.
// ============================================================
const supabase = require('../config/supabase');
const { podeModulo } = require('./setores');

const DIA = 864e5;
const iso = d => new Date(d).toISOString();

/**
 * Consulta que não derruba a lista.
 *
 * Um sininho que responde 500 porque uma tabela não existe é pior que
 * um sininho vazio: some junto com os avisos que funcionavam. Cada
 * fonte falha sozinha e em silêncio.
 */
async function tentar(fn) {
  try {
    const { data, error } = await fn();
    if (error) return [];
    return data || [];
  } catch { return []; }
}

const brl = v => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

// Quantas linhas de uma MESMA situação valem a pena listar uma a uma.
// Acima disso vira um aviso só, com o total.
const DETALHAR_ATE = 3;

/**
 * SITUAÇÃO REPETIDA VIRA UM AVISO SÓ.
 *
 * Medido no banco da Lyon: 15 contas fixas vencidas contra 3 pedidos
 * esperando PIX. Listadas uma a uma, as contas empurram para fora da
 * tela justamente o aviso que faz alguém agir — e o sininho com 18
 * bolinhas ensina a pessoa a nunca mais abrir o sininho.
 *
 * O `id` do agregado inclui a contagem de propósito: quando uma conta
 * nova vence, o id muda e o aviso volta a ser não lido. É o que
 * diferencia "a mesma situação de ontem" de "a situação piorou".
 */
function agregar({ linhas, chave, tipo, titulo, detalhe, link, prioridade = 'alta' }) {
  if (linhas.length <= DETALHAR_ATE) return null;
  return {
    id: `${chave}:${linhas.length}`,
    tipo,
    titulo: titulo(linhas.length),
    detalhe: detalhe(linhas),
    quando: null,
    link,
    prioridade,
    agregado: linhas.length,
  };
}

/**
 * Monta os avisos para quem está logado.
 *
 * @param req            requisição já com tenantId e acesso resolvidos
 * @param janela_dias    quanto tempo um fato NOVO continua sendo novidade
 */
async function montarAvisos(req, { janela_dias = 3 } = {}) {
  const t = req.tenantId;
  const pode = (...m) => podeModulo(req.acesso, ...m);
  const desde = iso(Date.now() - janela_dias * DIA);
  const hoje = new Date().toISOString().slice(0, 10);
  const avisos = [];

  // ── COMERCIAL: pedido novo ───────────────────────────────
  if (pode('sales', 'pdv', 'vendedor')) {
    const vendas = await tentar(() => supabase.from('VENDAS')
      .select('id, number, total, status, created_at, CLIENTES(name)')
      .eq('tenant_id', t).neq('status', 'cancelled')
      .gte('created_at', desde).order('created_at', { ascending: false }).limit(20));

    for (const v of vendas) {
      avisos.push({
        id: `venda:${v.id}`,
        tipo: 'pedido',
        titulo: `Novo pedido #${v.number}`,
        detalhe: `${v.CLIENTES?.name || 'Cliente'} · ${brl(v.total)}`,
        quando: v.created_at,
        link: `/sales/${v.id}/detalhe`,
        prioridade: 'normal',
      });
    }

    // A fila do PIX. É aqui que o dinheiro fica parado esperando UMA
    // PESSOA conferir o extrato — o banco não avisa o sistema.
    const loja = await tentar(() => supabase.from('PEDIDOS_LOJA')
      .select('id, total, created_at, paid_notified_at, customer, customer_id')
      .eq('tenant_id', t).eq('status', 'aguardando_pagamento')
      .order('created_at', { ascending: false }).limit(30));

    for (const p of loja) {
      const avisou = !!p.paid_notified_at;
      avisos.push({
        id: `loja:${p.id}`,
        tipo: 'pagamento',
        titulo: avisou ? 'Cliente avisou que pagou' : 'Pedido da loja aguardando PIX',
        detalhe: `${p.customer?.name || 'Cliente do site'} · ${brl(p.total)}`,
        // Quem avisou que pagou está esperando resposta AGORA; quem só
        // fez o pedido ainda pode estar decidindo.
        quando: p.paid_notified_at || p.created_at,
        link: '/store-payments',
        prioridade: avisou ? 'alta' : 'normal',
      });
    }
  }

  // ── COMPRAS ──────────────────────────────────────────────
  if (pode('purchases', 'stock')) {
    const compras = await tentar(() => supabase.from('COMPRAS')
      .select('id, number, total, status, created_at, FORNECEDORES(name)')
      .eq('tenant_id', t).gte('created_at', desde)
      .order('created_at', { ascending: false }).limit(20));

    for (const c of compras) {
      const pendente = !['received', 'cancelled'].includes(String(c.status));
      avisos.push({
        id: `compra:${c.id}`,
        tipo: 'compra',
        titulo: pendente ? `Compra #${c.number} aguardando recebimento` : `Compra #${c.number} registrada`,
        detalhe: `${c.FORNECEDORES?.name || 'Fornecedor'} · ${brl(c.total)}`,
        quando: c.created_at,
        link: '/purchases',
        prioridade: pendente ? 'alta' : 'normal',
      });
    }
  }

  // ── ESTOQUE BAIXO ────────────────────────────────────────
  // Mesma régua da tela de Estoque: só conta quando existe mínimo
  // definido. Produto sem mínimo não está "baixo" — está sem régua.
  if (pode('stock', 'purchases')) {
    const produtos = await tentar(() => supabase.from('PRODUTOS')
      .select('id, name, code, current_stock, min_stock, unit')
      .eq('tenant_id', t).eq('is_active', true).gt('min_stock', 0).limit(500));

    const baixos = produtos
      .filter(p => Number(p.current_stock) <= Number(p.min_stock))
      .sort((a, b) => Number(a.current_stock) - Number(b.current_stock))
      .slice(0, 15);

    const juntos = agregar({
      linhas: baixos, chave: 'estoque', tipo: 'estoque', link: '/stock',
      titulo: n => `${n} produtos no mínimo ou zerados`,
      detalhe: l => `${l.filter(p => Number(p.current_stock) <= 0).length} sem nenhuma peça · ${l.slice(0, 3).map(p => p.name).join(', ')}…`,
    });
    if (juntos) avisos.push(juntos);
    else for (const p of baixos) {
      const zerado = Number(p.current_stock) <= 0;
      avisos.push({
        id: `estoque:${p.id}`,
        tipo: 'estoque',
        titulo: zerado ? `Sem estoque: ${p.name}` : `Estoque baixo: ${p.name}`,
        detalhe: `${Number(p.current_stock)} ${p.unit || 'un'} em casa · mínimo ${Number(p.min_stock)}`,
        // Estoque baixo não tem "quando": é uma situação, não um
        // evento. A data de agora deixaria o aviso pulando para o topo
        // a cada leitura, sem nada ter mudado.
        quando: null,
        link: '/stock',
        prioridade: zerado ? 'alta' : 'normal',
      });
    }
  }

  // ── FINANCEIRO: contas vencidas ──────────────────────────
  if (pode('financial')) {
    const contas = await tentar(() => supabase.from('LANCAMENTOS')
      .select('id, description, amount, due_date, type, status')
      .eq('tenant_id', t).eq('type', 'payable').in('status', ['pending', 'partial'])
      .lte('due_date', hoje).order('due_date').limit(15));

    const juntas = agregar({
      linhas: contas, chave: 'conta', tipo: 'financeiro', link: '/financial',
      titulo: n => `${n} contas a pagar vencidas ou vencendo hoje`,
      detalhe: l => `${brl(l.reduce((soma, c) => soma + Number(c.amount || 0), 0))} no total · a mais antiga de ${l[0].due_date.split('-').reverse().join('/')}`,
    });
    if (juntas) avisos.push(juntas);
    else for (const c of contas) {
      const atrasada = c.due_date < hoje;
      avisos.push({
        id: `conta:${c.id}`,
        tipo: 'financeiro',
        titulo: atrasada ? 'Conta a pagar vencida' : 'Conta a pagar vence hoje',
        detalhe: `${c.description || 'Lançamento'} · ${brl(c.amount)} · ${c.due_date.split('-').reverse().join('/')}`,
        quando: null,
        link: '/financial',
        prioridade: atrasada ? 'alta' : 'normal',
      });
    }
  }

  // ── RH: o que espera decisão ─────────────────────────────
  if (pode('hr')) {
    const [solic, oco, ferias] = await Promise.all([
      tentar(() => supabase.from('RH_SOLICITACOES')
        .select('id, kind, titulo, created_at, employee_id')
        .eq('tenant_id', t).eq('status', 'aberta').order('created_at').limit(15)),
      tentar(() => supabase.from('RH_OCORRENCIAS')
        .select('id, kind, occurred_on, created_at, employee_id')
        .eq('tenant_id', t).eq('status', 'justificada').order('created_at').limit(15)),
      tentar(() => supabase.from('RH_FERIAS')
        .select('id, start_date, end_date, days, created_at, employee_id')
        .eq('tenant_id', t).eq('status', 'pending').order('created_at').limit(15)),
    ]);

    const ids = [...new Set([...solic, ...oco, ...ferias].map(x => x.employee_id).filter(Boolean))];
    const pessoas = ids.length
      ? await tentar(() => supabase.from('CLIENTES').select('id, name').eq('tenant_id', t).in('id', ids))
      : [];
    const nome = id => pessoas.find(p => p.id === id)?.name || 'Colaborador';

    for (const s of solic) {
      avisos.push({
        id: `solicitacao:${s.id}`, tipo: 'rh',
        titulo: 'Solicitação do colaborador',
        detalhe: `${nome(s.employee_id)} · ${s.titulo || s.kind}`,
        quando: s.created_at, link: '/portal/gestor', prioridade: 'normal',
      });
    }
    for (const o of oco) {
      avisos.push({
        id: `ocorrencia:${o.id}`, tipo: 'rh',
        titulo: 'Justificativa aguardando decisão',
        detalhe: `${nome(o.employee_id)} · ${o.kind} em ${String(o.occurred_on).split('-').reverse().join('/')}`,
        quando: o.created_at, link: '/portal/gestor', prioridade: 'normal',
      });
    }
    for (const f of ferias) {
      avisos.push({
        id: `ferias:${f.id}`, tipo: 'rh',
        titulo: 'Pedido de férias aguardando aprovação',
        detalhe: `${nome(f.employee_id)} · ${f.days || 0} dia(s) a partir de ${String(f.start_date).split('-').reverse().join('/')}`,
        quando: f.created_at, link: '/portal/gestor', prioridade: 'normal',
      });
    }
  }

  // ── CADASTRO: alterações pedidas pelos links públicos ────
  if (req.userProfile?.role === 'admin') {
    const pedidos = await tentar(() => supabase.from('CADASTRO_SOLICITACOES')
      .select('id, entity, entity_name, created_at')
      .eq('tenant_id', t).eq('status', 'pendente').order('created_at').limit(15));

    for (const p of pedidos) {
      avisos.push({
        id: `cadastro:${p.id}`, tipo: 'cadastro',
        titulo: 'Alteração de cadastro para aprovar',
        detalhe: `${p.entity_name || 'Sem nome'} · ${p.entity}`,
        quando: p.created_at, link: '/cadastro-aprovacoes', prioridade: 'normal',
      });
    }
  }

  // Urgente primeiro; dentro da urgência, o mais recente na frente.
  // Situação sem data (estoque baixo, conta vencida) vai para o fim do
  // próprio grupo — ela não aconteceu num instante, ela simplesmente É.
  const peso = a => (a.prioridade === 'alta' ? 0 : 1);
  avisos.sort((a, b) => peso(a) - peso(b)
    || String(b.quando || '').localeCompare(String(a.quando || '')));

  return {
    avisos,
    gerado_em: new Date().toISOString(),
    janela_dias,
  };
}

module.exports = { montarAvisos };
