// ============================================================
// Painel do Vendedor — os cálculos.
//
// Tudo aqui conta UNIDADES vendidas, não reais: a meta do vendedor
// é "15.000 copos no mês". Reais só aparecem no faturamento, no
// preço médio e na comissão.
//
// Duas decisões que valem para o arquivo inteiro:
//
// 1. Faturamento é o valor dos PRODUTOS. Frete mora em VENDAS.freight
//    e fica de fora — senão um pedido para Porto Alegre inflaria o
//    preço médio do copo em relação a um para Curitiba.
// 2. A data que conta é operation_date (a data que o operador
//    escolheu ao lançar) e, na falta dela, created_at. Um pedido
//    lançado dia 2 referente ao dia 30 pertence ao mês 30.
// ============================================================
const supabase = require('../config/supabase');
// Quem sabe em que etapa o pedido esta — a mesma fonte que a linha
// do tempo do pedido e a producao leem.
const A = require('../lib/atencao');

// FORMATO x EXISTENCIA sao duas perguntas.
//
// UF_REGEX so diz "sao duas letras maiusculas" — e por isso "ZZ" passava
// por ela e ia parar dentro do territorio de um vendedor, virando um
// estado fantasma no mapa de cobertura e no filtro de clientes. Ele
// continua util para PENEIRAR listas vindas de fora (um item torto nao
// derruba os outros); quem valida ENTRADA usa `ehUf`.
const UF_REGEX = /^[A-Z]{2}$/;

const UFS = new Set([
  'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG',
  'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO',
]);

/** Este estado existe? (as 26 unidades federativas mais o DF) */
const ehUf = uf => UFS.has(String(uf || '').toUpperCase().trim());

// Só pedido conta. Orçamento vive em ORCAMENTOS; devolução não é venda.
const SALE_TYPES = ['sale', 'order'];

const SALE_SELECT = `
  id, number, status, type, total, discount, freight, created_at, operation_date, customer_id,
  CLIENTES ( id, name, address, phone, mobile ),
  VENDA_ITENS ( product_id, quantity, unit_price, discount, total, customization,
                PRODUTOS ( id, name, ink_type, CATEGORIAS ( name ) ) )
`;

// ── Datas ────────────────────────────────────────────────────

// 'YYYY-MM' → { year, month }. Sem parâmetro (ou lixo), o mês atual.
function parseMonth(str) {
  const m = /^(\d{4})-(\d{1,2})$/.exec(String(str || '').trim());
  const now = new Date();
  if (!m) return { year: now.getFullYear(), month: now.getMonth() + 1 };
  const year = parseInt(m[1], 10);
  const month = Math.min(Math.max(parseInt(m[2], 10), 1), 12);
  return { year, month };
}

const monthKey = (year, month) => `${year}-${String(month).padStart(2, '0')}`;

// Mês anterior a { year, month } (janeiro volta para dezembro do ano passado)
function prevMonthOf({ year, month }) {
  return month === 1 ? { year: year - 1, month: 12 } : { year, month: month - 1 };
}

const daysInMonth = (year, month) => new Date(year, month, 0).getDate();

function monthBounds(year, month) {
  return {
    start: `${monthKey(year, month)}-01`,
    end:   `${monthKey(year, month)}-${String(daysInMonth(year, month)).padStart(2, '0')}`,
  };
}

// A data que manda no pedido, sempre 'YYYY-MM-DD'.
function effectiveDate(sale) {
  return String(sale.operation_date || sale.created_at || '').slice(0, 10);
}

// Desloca uma data 'YYYY-MM-DD' em N dias.
function shiftDate(iso, days) {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

// ── Leitura dos pedidos ──────────────────────────────────────

/**
 * Pedidos válidos do vendedor entre duas datas (inclusive), pela data
 * efetiva do pedido.
 *
 * O filtro no banco é por created_at numa janela alargada: operation_date
 * pode apontar para trás ou para a frente, e o PostgREST não sabe
 * filtrar por COALESCE. O recorte fino sai aqui, em JS.
 *
 * SÓ ENTRA O QUE JÁ PASSOU PELO FINANCEIRO. Um pedido recém-digitado
 * contava unidade na hora — e com ela vinham a meta batida, o excedente
 * e a comissão sobre um dinheiro que ainda não entrou. Pedido que o
 * financeiro recusa depois some do painel e leva a comissão junto, o
 * que é pior do que nunca ter aparecido.
 *
 * A regra é a mesma de `lib/atencao`, para o painel do vendedor e a
 * linha do tempo do pedido nunca discordarem sobre o que é "pago".
 *
 * userId null = todos os vendedores (visão do gestor).
 */
async function fetchSales(tenantId, userId, fromDate, toDate) {
  let q = supabase
    .from('VENDAS')
    .select(SALE_SELECT)
    .eq('tenant_id', tenantId)
    .neq('status', 'cancelled')
    // A etapa nao da para filtrar aqui em cima: `not.in` com a lista
    // toda deixaria a regra escrita em dois lugares. Sai no filtro
    // abaixo, junto com o recorte de data.

    .in('type', SALE_TYPES)
    .gte('created_at', shiftDate(fromDate, -75))
    .lte('created_at', `${shiftDate(toDate, 75)}T23:59:59`)
    .limit(20000);

  if (userId) q = q.eq('user_id', userId);

  const { data, error } = await q;
  if (error) throw error;

  return (data || []).filter(s => {
    if (!A.passouPeloPagamento(s.status)) return false;
    const d = effectiveDate(s);
    return d >= fromDate && d <= toDate;
  });
}

// ── Unidades e dinheiro de um pedido ─────────────────────────

const items = sale => Array.isArray(sale.VENDA_ITENS) ? sale.VENDA_ITENS : [];

function saleUnits(sale) {
  return items(sale).reduce((s, i) => s + (Number(i.quantity) || 0), 0);
}

// Valor dos produtos: itens (já líquidos do desconto do item) menos o
// desconto do pedido. Frete fica fora.
function saleRevenue(sale) {
  const gross = items(sale).reduce((s, i) => s + (Number(i.total) || 0), 0);
  return Math.max(0, gross - (Number(sale.discount) || 0));
}

// Ordem cronológica dos pedidos. O número da venda desempata dois
// pedidos do mesmo dia — é a ordem em que entraram.
function chronological(sales) {
  return [...sales].sort((a, b) => {
    const da = effectiveDate(a), db = effectiveDate(b);
    if (da !== db) return da < db ? -1 : 1;
    return (Number(a.number) || 0) - (Number(b.number) || 0);
  });
}

// ── Plano de metas ───────────────────────────────────────────

/**
 * A migração 065 é aplicada à mão no SQL Editor do Supabase. Enquanto
 * ela não roda, as tabelas de configuração não existem — e o painel
 * tem que dizer isso em vez de devolver um erro de Postgres cru. O
 * resto (vendido, faturamento, ranking, carteira) sai dos pedidos e
 * funciona sem elas.
 */
const tabelaAusente = err =>
  /42P01|PGRST(002|205)|does not exist|schema cache/i.test(`${err?.code || ''} ${err?.message || ''}`);

async function loadPlans(tenantId, planGroup = 'padrao') {
  const { data, error } = await supabase
    .from('VENDEDOR_PLANOS')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('plan_group', planGroup)
    .eq('is_active', true)
    .order('seq');
  if (error) {
    if (tabelaAusente(error)) return { plans: [], missing: true };
    throw error;
  }
  return { plans: data || [], missing: false };
}

// A faixa pela lista de MESES da configuração.
//
// APOSENTADA: a meta deixou de ser do calendário e passou a ser da
// fase (ver caminhada, logo abaixo). Fica só porque a tela de
// configuração ainda mostra em que meses cada faixa foi cadastrada —
// nenhuma conta do painel passa por aqui.
function planForMonth(plans, month) {
  const found = (plans || []).find(p => (p.months || []).includes(month));
  return found || null;
}

const planGoal = plan => Number(plan?.monthly_goal) || 0;

/**
 * A CAMINHADA DO VENDEDOR, MÊS A MÊS.
 *
 * Uma passada só pela história dele, da primeira venda até o mês
 * pedido, decidindo em cada mês três coisas que andam juntas: qual
 * era a meta, quanto do ciclo estava fechado, e se o bônus saiu.
 *
 * AS REGRAS, NA ORDEM EM QUE VALEM:
 *
 *   1. A meta é a da FASE em que ele está — começa em 15.000 e não
 *      muda por virada de mês, trimestre ou ano.
 *
 *   2. O BÔNUS pede 3 meses SEGUIDOS batendo essa meta. São 45.000
 *      peças em três meses, mas 15.000 em cada um: 45.000 num mês só
 *      não fecha ciclo nenhum.
 *
 *   3. Falhou um mês, o ciclo VOLTA A ZERO. Não é acumulativo — dois
 *      meses bons e um ruim recomeçam do 1/3, não continuam do 2/3.
 *
 *   4. Fechou o ciclo, ele ganha o bônus E sobe de fase. A meta nova
 *      passa a valer do mês seguinte, com um ciclo novo pela frente.
 *
 *   5. FASE NUNCA REBAIXA. Quem chegou aos 30.000 fica nos 30.000
 *      mesmo em mês fraco — o que volta ao zero é o ciclo, nunca a
 *      meta conquistada.
 *
 * Por que uma passada só, e não três funções separadas: as três
 * respostas dependem umas das outras. O ciclo depende da meta do mês,
 * a meta depende dos ciclos que fecharam antes, e o bônus depende dos
 * dois. Calculadas em lugares diferentes, um dia discordariam.
 */
function caminhada(plans, unitsByMonth, year, month) {
  const faixas = (plans || []).slice().sort((a, b) => (a.seq || 0) - (b.seq || 0));
  const fases = new Map();     // 'AAAA-MM' -> faixa vigente naquele mês
  const ciclos = new Map();    // 'AAAA-MM' -> meses seguidos já cumpridos
  const bonus = new Map();     // 'AAAA-MM' -> faixa cujo bônus fechou ali
  if (!faixas.length) return { fases, ciclos, bonus, faixas };

  const chaves = Object.keys(unitsByMonth || {}).sort();
  const alvo = monthKey(year, month);
  let cursor = chaves.length
    ? { year: Number(chaves[0].slice(0, 4)), month: Number(chaves[0].slice(5, 7)) }
    : { year, month };

  let i = 0;        // fase atual
  let seguidos = 0; // meses seguidos batendo a meta da fase atual

  for (let guarda = 0; guarda < 600; guarda++) {
    const chave = monthKey(cursor.year, cursor.month);
    const faixa = faixas[i];
    fases.set(chave, faixa);

    const meta = Number(faixa?.monthly_goal) || 0;
    const precisa = Math.max(1, Number(faixa?.cycle_months) || 3);
    const vendido = Number(unitsByMonth?.[chave]) || 0;

    if (meta > 0 && vendido >= meta) {
      seguidos += 1;
      if (seguidos >= precisa) {
        bonus.set(chave, faixa);        // o bônus sai NESTE mês
        i = Math.min(i + 1, faixas.length - 1);
        seguidos = 0;                   // ciclo novo para a fase nova
      }
    } else {
      seguidos = 0;                     // um mês fraco zera o ciclo
    }

    ciclos.set(chave, seguidos);
    if (chave === alvo) break;
    cursor = nextMonthOf(cursor);
  }

  return { fases, ciclos, bonus, faixas };
}

/** A meta vigente no mês pedido. */
function faseDoMes(plans, unitsByMonth, year, month) {
  const { fases, faixas } = caminhada(plans, unitsByMonth, year, month);
  return fases.get(monthKey(year, month)) || faixas[0] || null;
}

/** O mês seguinte — o espelho de prevMonthOf. */
function nextMonthOf({ year, month }) {
  return month === 12 ? { year: year + 1, month: 1 } : { year, month: month + 1 };
}

/**
 * Unidades vendidas mês a mês desde a PRIMEIRA venda do vendedor.
 *
 * A fase depende da história inteira: quem fechou um ciclo há dois anos
 * já subiu, e uma janela curta apagaria essa conquista.
 */
async function unitsByMonthAll(tenantId, userId, year, month) {
  const fim = monthBounds(year, month).end;
  const sales = await fetchSales(tenantId, userId, '2000-01-01', fim);
  const out = {};
  for (const s of sales) {
    const key = effectiveDate(s).slice(0, 7);
    out[key] = (out[key] || 0) + saleUnits(s);
  }
  return out;
}

// ── Configuração do vendedor ─────────────────────────────────

const DEFAULT_CONFIG = {
  is_active: true,
  region_label: null,
  territory: [],
  plan_group: 'padrao',
  top_clients: 10,
};

async function loadSellerConfig(tenantId, userId) {
  if (!userId) return { ...DEFAULT_CONFIG };
  const { data, error } = await supabase
    .from('VENDEDORES')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('user_id', userId)
    .maybeSingle();
  if (error) {
    if (tabelaAusente(error)) return { ...DEFAULT_CONFIG, missing: true };
    throw error;
  }
  if (!data) return { ...DEFAULT_CONFIG };
  return {
    ...DEFAULT_CONFIG,
    ...data,
    territory: (data.territory || []).filter(uf => UF_REGEX.test(uf)),
    top_clients: Number(data.top_clients) || 10,
  };
}

// ── Comissão sobre excedente ─────────────────────────────────

/**
 * Percorre os pedidos do mês em ordem e separa o que veio DEPOIS da meta.
 *
 * A comissão não é 2% do faturamento: ela começa no pedido que entrou
 * com a meta já batida. O pedido que atravessa a linha (o vendedor
 * estava em 14.800 e entrou um de 500) entra proporcionalmente — só as
 * 300 unidades acima da meta pagam.
 */
function computeCommission(sales, goal, pct) {
  const rows = [];
  let acc = 0;
  let units = 0, amount = 0, value = 0;

  for (const sale of chronological(sales)) {
    const saleQty = saleUnits(sale);
    const before = acc;
    acc += saleQty;

    if (goal <= 0 || saleQty <= 0) continue;

    const eligibleUnits = Math.max(0, acc - Math.max(goal, before));
    if (eligibleUnits <= 0) continue;

    const eligibleAmount = saleRevenue(sale) * (eligibleUnits / saleQty);
    const commission = eligibleAmount * (Number(pct) || 0) / 100;

    units  += eligibleUnits;
    amount += eligibleAmount;
    value  += commission;

    rows.push({
      sale_id: sale.id,
      number: sale.number,
      date: effectiveDate(sale),
      customer: sale.CLIENTES?.name || null,
      units_before: round2(before),
      units_total: round2(saleQty),
      units_eligible: round2(eligibleUnits),
      amount_eligible: round2(eligibleAmount),
      commission_value: round2(commission),
    });
  }

  return {
    rows,
    units: round2(units),
    amount: round2(amount),
    value: round2(value),
  };
}

/**
 * Grava no banco quais pedidos ficaram elegíveis no mês.
 *
 * O cálculo acima é determinístico e roda a cada abertura do painel;
 * isto aqui é o registro que o financeiro consulta depois. Um pedido
 * que deixou de ser elegível (cancelamento, correção de data) some da
 * tabela — por isso o delete antes do insert.
 *
 * Best-effort: se a migração 065 ainda não rodou, o painel não quebra.
 */
async function persistCommission(tenantId, userId, referenceMonth, goal, pct, rows) {
  if (!userId) return;
  try {
    await supabase
      .from('VENDEDOR_COMISSOES')
      .delete()
      .eq('tenant_id', tenantId)
      .eq('user_id', userId)
      .eq('reference_month', referenceMonth);

    if (!rows.length) return;

    await supabase.from('VENDEDOR_COMISSOES').insert(rows.map(r => ({
      tenant_id: tenantId,
      user_id: userId,
      sale_id: r.sale_id,
      reference_month: referenceMonth,
      monthly_goal: goal,
      units_before: r.units_before,
      units_total: r.units_total,
      units_eligible: r.units_eligible,
      amount_eligible: r.amount_eligible,
      commission_pct: Number(pct) || 0,
      commission_value: r.commission_value,
    })));
  } catch { /* tabela ausente ou indisponível: o painel segue */ }
}

// ── Ciclo do bônus ───────────────────────────────────────────

/**
 * Quantos meses seguidos, terminando no mês escolhido, o vendedor bateu
 * a meta. Falhou um mês, o ciclo zera — não fica 1/3 guardado.
 *
 * unitsByMonth: { 'YYYY-MM': unidades }
 */
function cycleProgress(unitsByMonth, plans, year, month, cycleMonths) {
  const { ciclos, bonus, fases } = caminhada(plans, unitsByMonth, year, month);
  const chave = monthKey(year, month);
  const faixa = fases.get(chave);
  const total = Math.max(1, Number(faixa?.cycle_months) || Number(cycleMonths) || 3);

  // O mês em que o ciclo FECHA marca 3/3 e paga o bônus. No mês
  // seguinte o contador já é o do ciclo novo, da fase nova — por isso
  // `ciclos` guarda o valor depois de processar o mês, e o fechamento
  // é lido de `bonus`.
  const fechou = bonus.has(chave);
  const feitos = fechou ? total : (ciclos.get(chave) || 0);

  return { streak: feitos, total, unlocked: fechou, fechou_agora: fechou };
}

/** Unidades vendidas mês a mês, do mês mais antigo ao mês escolhido. */
async function unitsByMonthBack(tenantId, userId, year, month, monthsBack) {
  let cursor = { year, month };
  for (let i = 1; i < monthsBack; i++) cursor = prevMonthOf(cursor);

  const from = monthBounds(cursor.year, cursor.month).start;
  const to   = monthBounds(year, month).end;

  const sales = await fetchSales(tenantId, userId, from, to);
  const out = {};
  for (const s of sales) {
    const key = effectiveDate(s).slice(0, 7);
    out[key] = (out[key] || 0) + saleUnits(s);
  }
  return out;
}

// ── Blocos do painel ─────────────────────────────────────────

/**
 * Estados que mais compram: conta CLIENTES DIFERENTES por UF, não
 * unidades. Cinco pedidos do mesmo cliente continuam sendo 1 comprador.
 *
 * O TERRITÓRIO INTEIRO APARECE, tenha vendido ou não. Antes a lista
 * só mostrava UF com compra, e o estado zerado sumia da tela — logo
 * ele, que é o único onde ainda há o que fazer. Estado do território
 * sem nenhum comprador entra com buyers = 0, no fim da lista, e a tela
 * desenha a barra vazia.
 *
 * A posição é só de quem vendeu. Não existe "5º lugar" com zero
 * comprador: ninguém está em quinto numa disputa em que não entrou.
 */
function statesRanking(sales, territory = []) {
  const byUf = {};
  for (const s of sales) {
    const uf = String(s.CLIENTES?.address?.state || '').toUpperCase().trim();
    if (!UF_REGEX.test(uf)) continue;
    if (!byUf[uf]) byUf[uf] = new Set();
    if (s.customer_id) byUf[uf].add(s.customer_id);
  }

  // As UFs do território entram mesmo sem venda; as UFs com venda
  // entram mesmo fora do território (cliente que se mudou, venda
  // atendida em cobertura) — esconder faturamento porque a UF não
  // estava no cadastro seria mentir sobre o que foi vendido.
  const ufs = new Set(Object.keys(byUf));
  for (const uf of territory || []) {
    if (UF_REGEX.test(uf)) ufs.add(uf);
  }

  const lista = [...ufs]
    .map(uf => ({ uf, buyers: byUf[uf] ? byUf[uf].size : 0 }))
    .sort((a, b) => b.buyers - a.buyers || a.uf.localeCompare(b.uf));

  let posicao = 0;
  return lista.map(e => ({
    ...e,
    position: e.buyers > 0 ? ++posicao : null,
  }));
}

/**
 * Vendas por semana. As barras têm que somar exatamente o vendido no
 * mês, então as semanas são de segunda a domingo recortadas nas bordas
 * do mês: nenhum dia fica de fora e nenhum é contado duas vezes.
 */
function weeklySales(sales, year, month) {
  const last = daysInMonth(year, month);
  const buckets = [];

  let day = 1;
  while (day <= last) {
    // 0 = domingo. A semana fecha no domingo seguinte (ou no fim do mês).
    const dow = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
    const end = Math.min(day + (dow === 0 ? 0 : 7 - dow), last);
    buckets.push({ from: day, to: end, units: 0 });
    day = end + 1;
  }

  const short = ['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez'][month - 1];

  for (const s of sales) {
    const d = parseInt(effectiveDate(s).slice(8, 10), 10);
    const b = buckets.find(x => d >= x.from && d <= x.to);
    if (b) b.units += saleUnits(s);
  }

  return buckets.map(b => ({
    label: b.from === b.to
      ? `${pad2(b.from)} ${short}`
      : `${pad2(b.from)} a ${pad2(b.to)} ${short}`,
    units: round2(b.units),
  }));
}

/** Unidades por produto, do maior para o menor. */
/**
 * A qual linha de produto um item pertence.
 *
 * O ranking é por LINHA, não por SKU. No cadastro cada cor é um produto
 * separado — "TWISTER TRADICIONAL - VERDE GARRAFA TRANSLUCIDO - 550 ML"
 * e mais dezenove irmãos — e ranquear assim quebrava a mesma linha em
 * vinte pedaços, cada um com um pouquinho. O 1º lugar acabava sendo a
 * cor que por acaso saiu mais numa semana, e não o copo que a fábrica
 * mais vendeu. Quem vende pensa em "twister 550", não em "twister 550
 * verde garrafa".
 *
 * A chave é categoria + volume, e o volume importa: TWISTER
 * TRADICIONAL existe em 400 ml e em 550 ml, que são dois produtos
 * diferentes na prateleira e no preço.
 *
 * Sem categoria cadastrada, cai no nome até o primeiro traço — que é
 * onde a cor começa. É pior que a categoria, mas ainda agrupa.
 */
function linhaDoItem(item) {
  const nome = String(item.PRODUTOS?.name || '').trim();
  const categoria = String(item.PRODUTOS?.CATEGORIAS?.name || '').trim();

  // O volume fica no fim do nome; pego a ÚLTIMA ocorrência para nunca
  // confundir com um número que apareça no meio.
  const achados = nome.match(/(\d+(?:[.,]\d+)?)\s*(ML|L)\b/gi) || [];
  const volume = achados.length
    ? achados[achados.length - 1].toUpperCase().replace(/\s+/g, ' ')
    : '';

  const base = categoria || (nome.split(' - ')[0] || nome).trim();
  if (!base) return { key: 'sem-produto', label: 'Produto removido' };

  const label = volume ? `${base} - ${volume}` : base;
  return { key: label.toUpperCase(), label };
}

/**
 * Unidades e faturamento por linha de produto.
 *
 * Guarda também os SKUs que formaram a linha: a oferta é enviada de um
 * produto concreto, com foto e preço, e "TWISTER 550" sozinho não dá
 * para ofertar. O representante é a cor que mais vendeu no período.
 */
function productTotals(sales) {
  const map = new Map();
  for (const s of sales) {
    for (const i of items(s)) {
      const { key, label } = linhaDoItem(i);
      const prev = map.get(key) || { key, name: label, units: 0, revenue: 0, porSku: new Map() };
      const qtd = Number(i.quantity) || 0;
      prev.units   += qtd;
      prev.revenue += Number(i.total) || 0;
      if (i.product_id) prev.porSku.set(i.product_id, (prev.porSku.get(i.product_id) || 0) + qtd);
      map.set(key, prev);
    }
  }

  return [...map.values()]
    .map(l => {
      const skus = [...l.porSku.entries()].sort((a, b) => b[1] - a[1]);
      return {
        key: l.key,
        name: l.name,
        units: l.units,
        revenue: l.revenue,
        product_ids: skus.map(([id]) => id),
        product_id: skus[0]?.[0] || null,
        variants: skus.length,
      };
    })
    .sort((a, b) => b.units - a.units);
}

/**
 * Ranking do mês com participação e tendência contra o mês anterior.
 * Linha que não existia no mês anterior não tem tendência (dividir por
 * zero daria "+∞", que não diz nada a quem lê).
 */
function productRanking(sales, prevSales, limit = 8) {
  const totals = productTotals(sales);
  const totalUnits = totals.reduce((s, p) => s + p.units, 0);
  // A comparação casa pela chave da linha, e não por id de produto: a
  // cor campeã muda de um mês para o outro, a linha não.
  const prev = new Map(productTotals(prevSales).map(p => [p.key, p.units]));

  return totals.slice(0, limit).map((p, idx) => {
    const before = prev.get(p.key);
    const trend = before > 0 ? ((p.units - before) / before) * 100 : null;
    return {
      position: idx + 1,
      key: p.key,
      product_id: p.product_id,
      product_ids: p.product_ids,
      variants: p.variants,
      name: p.name,
      units: round2(p.units),
      revenue: round2(p.revenue),
      share: totalUnits > 0 ? round2((p.units / totalUnits) * 100) : 0,
      trend: trend == null ? null : round2(trend),
      prev_units: round2(before || 0),
    };
  });
}

/**
 * Cores de personalização por linha de tinta (PP e PS separadas — não
 * misturar uma na outra). A linha vem do que foi gravado no item; se o
 * item não disser, cai no cadastro do produto.
 */
function colorRanking(sales) {
  const lines = {};
  for (const s of sales) {
    for (const i of items(s)) {
      const c = i.customization || {};
      const color = String(c['Cor da personalização'] || '').trim();
      if (!color) continue;
      const line = String(c['Tinta'] || i.PRODUTOS?.ink_type || 'OUTRAS').toUpperCase().trim() || 'OUTRAS';
      lines[line] = lines[line] || {};
      lines[line][color] = (lines[line][color] || 0) + (Number(i.quantity) || 0);
    }
  }
  return Object.entries(lines)
    .map(([line, colors]) => ({
      line,
      colors: Object.entries(colors)
        .map(([color, units]) => ({ color, units: round2(units) }))
        .sort((a, b) => b.units - a.units),
    }))
    .sort((a, b) => a.line.localeCompare(b.line));
}

/**
 * Carteira: os clientes que mais compraram com este vendedor no
 * período, com os dados da ÚLTIMA compra (que é o gancho da conversa).
 */
function customerRanking(sales) {
  const map = new Map();

  for (const s of chronological(sales)) {
    if (!s.customer_id) continue;
    const c = s.CLIENTES || {};
    const date = effectiveDate(s);
    const units = saleUnits(s);
    const products = productTotals([s]);

    const prev = map.get(s.customer_id) || {
      customer_id: s.customer_id,
      name: c.name || 'Cliente',
      city: c.address?.city || null,
      uf: String(c.address?.state || '').toUpperCase() || null,
      phone: c.mobile || c.phone || null,
      units: 0,
      revenue: 0,
      orders: 0,
      last_date: null,
      last_units: 0,
      last_product: null,
      last_product_id: null,
      product_ids: new Set(),
      line_keys: new Set(),
    };

    prev.units   += units;
    prev.revenue += saleRevenue(s);
    prev.orders  += 1;
    // As duas listas servem a coisas diferentes: line_keys é o filtro
    // "quem comprou twister 550" (a cor não importa), product_ids é o
    // que a oferta precisa para achar uma promoção de um SKU de verdade.
    products.forEach(p => {
      prev.line_keys.add(p.key);
      (p.product_ids || []).forEach(id => prev.product_ids.add(id));
    });

    // chronological() sobe no tempo: o último visto é a última compra
    prev.last_date       = date;
    prev.last_units      = round2(units);
    prev.last_product    = products[0]?.name || null;
    prev.last_product_id = products[0]?.product_id || null;

    map.set(s.customer_id, prev);
  }

  return [...map.values()]
    .map(c => ({
      ...c, units: round2(c.units), revenue: round2(c.revenue),
      product_ids: [...c.product_ids], line_keys: [...c.line_keys],
    }))
    .sort((a, b) => b.units - a.units || (a.name || '').localeCompare(b.name || ''));
}

// ── Quem responde por cada estado ────────────────────────────

/**
 * O ROSTO DO ESTADO.
 *
 * O painel mostrava as UFs como uma bolinha com a sigla dentro. A sigla
 * responde "que estado é este" — que quem abre o próprio território já
 * sabe. A pergunta que sobra, e que o gestor faz quando abre o painel de
 * outra pessoa, é "quem atende aqui". Isso já está no banco: é o
 * território de cada vendedor, ao contrário. Basta virar o mapa.
 *
 * A FOTO VEM DO CADASTRO DE COLABORADOR, não do usuário. O login guarda
 * nome e e-mail; a foto (a facial da admissão) mora em CLIENTES type
 * 'CO'. O casamento entre os dois segue a MESMA ordem de lib/euSou.js —
 * `access_email` primeiro, `email` como resgate dos cadastros antigos —
 * porque duas regras de identidade diferentes no mesmo sistema é como
 * alguém acaba vendo o rosto errado no lugar do seu.
 *
 * Quem ainda não tirou foto sai com `avatar_url: null` e as iniciais
 * calculadas aqui: a tela desenha o círculo com as letras e troca pela
 * foto no dia em que ela for tirada, sem mexer em mais nada.
 *
 * @param ufs  restringe o resultado ao território pedido; vazio = todas
 * @returns    { 'PR': [{ user_id, name, avatar_url, iniciais }], ... }
 */
async function responsaveisPorUf(tenantId, ufs = []) {
  const filtro = new Set((ufs || []).map(u => String(u).toUpperCase()));

  const { data: configs } = await supabase.from('VENDEDORES')
    .select('user_id, territory, is_active').eq('tenant_id', tenantId);

  const ativos = (configs || []).filter(c => c.is_active !== false && Array.isArray(c.territory) && c.territory.length);
  if (!ativos.length) return {};

  const ids = [...new Set(ativos.map(c => c.user_id))];
  const [{ data: users }, { data: pessoas }] = await Promise.all([
    supabase.from('USUARIOS').select('id, name, email').in('id', ids),
    supabase.from('CLIENTES').select('name, email, avatar_url, admission_data')
      .eq('tenant_id', tenantId).eq('type', 'CO'),
  ]);

  const perfis = new Map((users || []).map(u => [u.id, u]));
  const fichas = pessoas || [];

  const foto = email => {
    const alvo = minusculo(email);
    if (!alvo) return null;
    const porAcesso = fichas.find(p => minusculo(p.admission_data?.access_email) === alvo);
    return (porAcesso || fichas.find(p => minusculo(p.email) === alvo) || null)?.avatar_url || null;
  };

  const mapa = {};
  for (const c of ativos) {
    const perfil = perfis.get(c.user_id);
    if (!perfil) continue;
    const nome = perfil.name || perfil.email || 'Vendedor';
    const pessoa = {
      user_id: c.user_id,
      name: nome,
      avatar_url: foto(perfil.email),
      iniciais: iniciaisDe(nome),
    };
    for (const bruto of c.territory) {
      const uf = String(bruto).toUpperCase();
      if (filtro.size && !filtro.has(uf)) continue;
      (mapa[uf] ||= []).push(pessoa);
    }
  }
  return mapa;
}

const minusculo = v => String(v || '').trim().toLowerCase();

/**
 * Duas letras para o círculo enquanto não há foto. Primeiro e último
 * nome — "LAION CESAR FARINHA" vira LF, não LC, porque é assim que a
 * pessoa é chamada.
 */
function iniciaisDe(nome) {
  const partes = String(nome || '').trim().split(/\s+/).filter(Boolean);
  if (!partes.length) return '?';
  if (partes.length === 1) return partes[0].slice(0, 2).toUpperCase();
  return (partes[0][0] + partes[partes.length - 1][0]).toUpperCase();
}

// ── Utilitários ──────────────────────────────────────────────

const pad2 = n => String(n).padStart(2, '0');
const round2 = n => Math.round((Number(n) || 0) * 100) / 100;

module.exports = {
  UF_REGEX, UFS, ehUf,
  parseMonth, monthKey, prevMonthOf, monthBounds, daysInMonth, effectiveDate,
  fetchSales, saleUnits, saleRevenue, chronological,
  loadPlans, planForMonth, planGoal, tabelaAusente,
  caminhada, faseDoMes, nextMonthOf, unitsByMonthAll,
  loadSellerConfig, DEFAULT_CONFIG,
  computeCommission, persistCommission,
  cycleProgress, unitsByMonthBack,
  responsaveisPorUf, iniciaisDe,
  statesRanking, weeklySales, linhaDoItem, productTotals, productRanking, colorRanking, customerRanking,
  round2,
};
