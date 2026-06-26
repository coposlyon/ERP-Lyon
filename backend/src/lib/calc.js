// Funções de cálculo puras e testáveis (sem I/O).
// Centralizam as regras de negócio sensíveis: folha, custo, preço, ponto.

// ── Folha de pagamento (tabelas Brasil 2024) ──────────────
function calcINSS(gross) {
  if (gross <= 1412.00) return round2(gross * 0.075);
  if (gross <= 2666.68) return round2(gross * 0.09);
  if (gross <= 4000.03) return round2(gross * 0.12);
  if (gross <= 7786.02) return round2(gross * 0.14);
  return 908.86; // teto INSS 2024
}

function calcIRRF(gross, inss) {
  const base = gross - inss;
  if (base <= 2259.20) return 0;
  if (base <= 2826.65) return round2(base * 0.075 - 169.44);
  if (base <= 3751.05) return round2(base * 0.15  - 381.44);
  if (base <= 4664.68) return round2(base * 0.225 - 662.77);
  return round2(base * 0.275 - 896.00);
}

// ── Custo médio ponderado ─────────────────────────────────
// Estoque negativo é tratado como 0 para a média.
function custoMedio(estoqueAnterior, custoAnterior, qtd, custoCompra) {
  const e = Math.max(Number(estoqueAnterior) || 0, 0);
  const ca = Number(custoAnterior) || 0;
  const q = Number(qtd) || 0;
  const cc = Number(custoCompra) || 0;
  const denom = e + q;
  if (denom <= 0) return cc;
  return round2((e * ca + q * cc) / denom);
}

// ── Preço por faixa de quantidade ─────────────────────────
// Última faixa que casar com a quantidade define o preço; senão sale_price.
function precoFaixa(tiers, salePrice, qty) {
  let price = Number(salePrice) || 0;
  for (const t of tiers || []) {
    const min = Number(t.min_qty) || 0;
    const max = (t.max_qty == null || t.max_qty === '') ? Infinity : Number(t.max_qty);
    if (qty >= min && qty <= max) price = Number(t.price) || price;
  }
  return price;
}

// ── Tipos de impressão (1/2/3 cores) ──────────────────────
const PRINT_METHODS = [
  { key: 'serigrafia_1', label: 'Serigrafia 1 Cor' },
  { key: 'serigrafia_2', label: 'Serigrafia 2 Cores' },
  { key: 'transfer',     label: 'Transfer' },
  { key: 'laser_frente', label: 'Gravação a Laser - Frente' },
  { key: 'laser_fv',     label: 'Gravação a Laser - Frente e Verso' },
];

// Preço considerando o tipo de impressão escolhido. Cada tipo tem sua própria
// tabela (price + tiers) em product.print_pricing[method]. Sem método/config,
// cai na tabela padrão do produto (price_tiers / sale_price).
function precoComImpressao(product, method, qty) {
  const pp = product?.print_pricing || {};
  const m = method && pp[method];
  if (m && (m.price != null || (Array.isArray(m.tiers) && m.tiers.length))) {
    return precoFaixa(m.tiers || [], m.price != null ? m.price : product.sale_price, qty);
  }
  return precoFaixa(product?.price_tiers, product?.sale_price, qty);
}

// ── Apuração de um dia de ponto ───────────────────────────
// Atraso só conta se o déficit ultrapassar a tolerância (e aí conta cheio).
function apurarPonto({ totalMinutes, hasMarks, expected, tolerance }) {
  const extra = Math.max(0, totalMinutes - expected);
  let late = 0, status = 'worked';
  if (!hasMarks) {
    status = 'absence';
  } else {
    const shortfall = expected - totalMinutes;
    if (shortfall > tolerance) { late = shortfall; status = 'late'; }
  }
  return { extra, late, status };
}

function round2(n) { return Math.round((Number(n) || 0) * 100) / 100; }

module.exports = { calcINSS, calcIRRF, custoMedio, precoFaixa, precoComImpressao, PRINT_METHODS, apurarPonto, round2 };
