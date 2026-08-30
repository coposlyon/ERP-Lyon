const express  = require('express');
const router   = express.Router();
const supabase = require('../config/supabase');
const { askClaude, extractJSON } = require('../lib/ai');
const { responder } = require('../lib/copiloto');

const brl = v => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0);

// ── Copiloto: dúvida sobre COMO USAR o sistema ──────────────
//
// Outro assunto que o /assistant logo abaixo, e por isso outra rota: o
// /assistant lê o banco e responde sobre os números da empresa; este
// responde sobre o sistema, lê print de tela e sabe abrir tela.
//
// As telas permitidas vêm do NAVEGADOR, montadas do menu que aquele
// usuário enxerga. O servidor não tem essa lista — o menu e as
// permissões vivem no front — e inventá-la aqui criaria uma segunda
// cópia para sair de sincronia com a primeira.
router.post('/copiloto', async (req, res) => {
  const pergunta = String(req.body?.pergunta || '').trim();
  const imagem   = req.body?.imagem || null;

  if (!pergunta && !imagem) return res.status(400).json({ error: 'Escreva a sua dúvida.' });

  // Só o que a instrução usa. Deixar passar o objeto cru do menu poria
  // ícone e componente React dentro do prompt.
  const telas = (Array.isArray(req.body?.telas) ? req.body.telas : [])
    .filter(t => t && typeof t.path === 'string' && t.path.startsWith('/') && t.label)
    .slice(0, 120)
    .map(t => ({ label: String(t.label).slice(0, 60), path: t.path, grupo: t.grupo ? String(t.grupo).slice(0, 40) : null }));

  try {
    const r = await responder({
      pergunta: pergunta || 'Olhe este print e me diga o que está acontecendo.',
      imagem,
      historico: req.body?.historico,
      telas,
      contextoTela: req.body?.contexto_tela ? String(req.body.contexto_tela).slice(0, 3000) : null,
      ctx: { tela_atual: req.body?.tela_atual ? String(req.body.tela_atual).slice(0, 80) : null },
    });
    if (!r.ok) return res.status(400).json({ error: r.error });
    res.json({ resposta: r.resposta, acao: r.acao });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Assistente de gestão (responde com base nos dados da empresa) ──
router.post('/assistant', async (req, res) => {
  const question = String(req.body.question || '').trim();
  if (!question) return res.status(400).json({ error: 'Faça uma pergunta' });
  const t = req.tenantId;
  const today = new Date().toISOString().split('T')[0];
  const monthStart = today.slice(0, 8) + '01';

  try {
    const [{ data: salesMonth }, { data: lowStock }, { data: recv }, { data: overdue }, { data: openOrders }] = await Promise.all([
      supabase.from('VENDAS').select('total').eq('tenant_id', t).neq('status', 'cancelled').gte('created_at', monthStart),
      supabase.from('PRODUTOS').select('name, current_stock, min_stock').eq('tenant_id', t).eq('is_active', true),
      supabase.from('LANCAMENTOS').select('amount').eq('tenant_id', t).eq('type', 'receivable').eq('status', 'pending'),
      supabase.from('LANCAMENTOS').select('amount').eq('tenant_id', t).eq('type', 'payable').in('status', ['pending', 'partial']).lt('due_date', today),
      supabase.from('VENDAS').select('id', { count: 'exact', head: true }).eq('tenant_id', t).in('status', ['open', 'confirmed', 'in_production']),
    ]);

    const totalMes = (salesMonth || []).reduce((s, v) => s + (v.total || 0), 0);
    const baixo = (lowStock || []).filter(p => Number(p.current_stock) <= Number(p.min_stock || 0) && Number(p.min_stock) > 0);
    const totalRecv = (recv || []).reduce((s, v) => s + (v.amount || 0), 0);
    const totalOver = (overdue || []).reduce((s, v) => s + (v.amount || 0), 0);

    const context = [
      `Período atual: ${monthStart} a ${today}.`,
      `Vendas no mês (confirmadas): ${brl(totalMes)} em ${(salesMonth || []).length} vendas.`,
      `Pedidos abertos/em produção: ${openOrders?.length || 0}.`,
      `Contas a receber pendentes: ${brl(totalRecv)}.`,
      `Contas a pagar vencidas: ${brl(totalOver)}.`,
      `Produtos abaixo do estoque mínimo (${baixo.length}): ${baixo.slice(0, 15).map(p => `${p.name} (${p.current_stock}/${p.min_stock})`).join('; ') || 'nenhum'}.`,
    ].join('\n');

    const r = await askClaude({
      system: 'Você é o assistente de gestão de um ERP de copos personalizados (Lyon Copos). Responda em português do Brasil, curto, direto e prático, usando SOMENTE os dados fornecidos. Use R$ e seja específico com números. Se algum dado necessário não estiver no contexto, diga que não tem essa informação.',
      prompt: `Dados atuais da empresa:\n${context}\n\nPergunta do gestor: ${question}`,
      max_tokens: 700,
    });
    if (!r.ok) return res.status(400).json({ error: r.error });
    res.json({ answer: r.text });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Sugestão de design (briefing de marca → cores/acabamento) ──
async function designSuggestion(brief) {
  const r = await askClaude({
    system: 'Você é um designer de produtos promocionais (copos e garrafas personalizados). Dado um briefing de marca/evento, sugira combinações de cores e acabamento. Responda APENAS um JSON válido, sem texto fora dele, no formato: {"palettes":[{"name":"nome curto","color1":"#RRGGBB","color2":"#RRGGBB","gradient":true|false}],"finish":"opaco|brilhante|metalico|translucido","idea":"sugestão curta de arte/texto"}. Dê 3 paletas.',
    prompt: `Briefing: ${brief}`,
    max_tokens: 500,
  });
  if (!r.ok) return { error: r.error };
  return extractJSON(r.text) || { idea: r.text, palettes: [] };
}

router.post('/design', async (req, res) => {
  const brief = String(req.body.brief || '').trim();
  if (!brief) return res.status(400).json({ error: 'Descreva a marca ou evento' });
  const out = await designSuggestion(brief);
  if (out.error) return res.status(400).json({ error: out.error });
  res.json(out);
});

// ── Análise da previsão de demanda (narrativa curta) ──
router.post('/forecast-insight', async (req, res) => {
  const items = Array.isArray(req.body.items) ? req.body.items.slice(0, 20) : [];
  if (!items.length) return res.status(400).json({ error: 'Sem dados de previsão' });
  const linhas = items.map(p =>
    `${p.name}: média/mês ${p.avg_month}, previsão próximo mês ${p.forecast}, tendência ${p.trend}, estoque ${p.current_stock}, sugestão compra ${p.suggested_purchase}`
  ).join('\n');
  const r = await askClaude({
    system: 'Você é o analista de compras de uma fábrica de copos personalizados (Lyon Copos). Com base na previsão de demanda, escreva uma análise curta em português do Brasil (no máximo 6 linhas): destaque o que comprar com prioridade, riscos de ruptura de estoque e produtos em queda. Seja prático e direto.',
    prompt: `Previsão por produto:\n${linhas}`,
    max_tokens: 500,
  });
  if (!r.ok) return res.status(400).json({ error: r.error });
  res.json({ insight: r.text });
});

module.exports = router;
module.exports.designSuggestion = designSuggestion;
