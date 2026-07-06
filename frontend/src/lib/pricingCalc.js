// Cálculo da Formação de Preço — espelho do computeSheet do backend.
// Tudo em tempo real na tela; o servidor recalcula ao salvar (fonte da verdade).

export const fmtBRL = v =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0);

// Valores unitários pequenos (rateios) com 4 casas — como no mockup (R$ 0,0842)
export const fmtBRL4 = v =>
  'R$ ' + new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 4, maximumFractionDigits: 4 }).format(v || 0);

export const fmtQty = v => new Intl.NumberFormat('pt-BR').format(v || 0);

export const num = v => {
  if (v === '' || v == null) return 0;
  const n = typeof v === 'number' ? v : parseFloat(String(v).replace(/\./g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
};

// Aceita "1,59" ou "1.59" nos inputs de valor
export const numInput = v => {
  if (v === '' || v == null) return 0;
  const n = typeof v === 'number' ? v : parseFloat(String(v).replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
};

export const TAX_REGIMES = [
  { value: 'mei',       label: 'MEI',              default_pct: 0 },
  { value: 'simples',   label: 'Simples Nacional', default_pct: 4 },
  { value: 'presumido', label: 'Lucro Presumido',  default_pct: 11.33 },
  { value: 'real',      label: 'Lucro Real',       default_pct: 0 },
];

export const PRINT_TYPES = [
  'Serigrafia', 'Transfer', 'Digital UV', 'Sublimação', 'Tampografia', 'Sem impressão',
];

export const CALC_REFERENCES = [
  { value: 'producao_propria', label: 'Produção Própria' },
  { value: 'revenda',          label: 'Compra para Revenda' },
  { value: 'ultima_compra',    label: 'Última Compra' },
];

// sheet = { calc_quantity, blocks:{materia_prima, personalizacao, tintas[],
//           embalagem, frete}, overhead_unit, tax_pct,
//           margin_min_pct, margin_ideal_pct, margin_premium_pct }
export function computeSheet(sheet) {
  const qty = Math.max(1, num(sheet.calc_quantity) || 1);
  const b = sheet.blocks || {};

  const mp   = b.materia_prima || {};
  const pers = b.personalizacao || {};
  const emb  = b.embalagem || {};
  const fr   = b.frete || {};
  const tintas = Array.isArray(b.tintas) ? b.tintas : [];

  const matUnit    = numInput(mp.unit_cost);
  const matQty     = numInput(mp.quantity) || qty;
  const matTotal   = matUnit * matQty;

  const screenCost = numInput(pers.screen_cost);
  const screenUses = Math.max(1, numInput(pers.screen_uses) || qty);
  const persUnit   = screenCost / screenUses;

  const tintaTotal = tintas.reduce((s, t) => s + numInput(t.amount), 0);
  const tintaUnit  = tintaTotal / qty;

  const boxPrice   = numInput(emb.box_price);
  const boxUnits   = numInput(emb.units_per_box);
  const embUnit    = boxUnits > 0 ? boxPrice / boxUnits : 0;

  const freteVal   = numInput(fr.freight_value);
  const freteQty   = Math.max(1, numInput(fr.quantity_bought) || qty);
  const freteUnit  = freteVal / freteQty;

  const overhead   = numInput(sheet.overhead_unit);

  const subtotal   = matUnit + persUnit + tintaUnit + embUnit + freteUnit + overhead;
  const taxPct     = numInput(sheet.tax_pct);
  const taxUnit    = subtotal * taxPct / 100;
  const custoUnit  = subtotal + taxUnit;

  const price = m => { const d = 1 - numInput(m) / 100; return d > 0 ? custoUnit / d : 0; };

  return {
    qty,
    mat_unit: matUnit, mat_total: matTotal,
    pers_unit: persUnit,
    tinta_total: tintaTotal, tinta_unit: tintaUnit,
    emb_unit: embUnit,
    frete_unit: freteUnit,
    overhead_unit: overhead,
    subtotal, tax_pct: taxPct, tax_unit: taxUnit,
    cost_unit: custoUnit,
    price_min: price(sheet.margin_min_pct ?? 20),
    price_ideal: price(sheet.margin_ideal_pct ?? 40),
    price_premium: price(sheet.margin_premium_pct ?? 50),
  };
}

// Simulador: dado o custo unitário (com imposto), imposto unitário,
// preço de venda e quantidade → faturamento e lucros (modelo do mockup).
export function simulate({ costUnit, taxUnit, price, quantity }) {
  const qty = Math.max(0, num(quantity));
  const p = numInput(price);
  const faturamento = p * qty;
  const custoTotal = costUnit * qty;
  const impostos = taxUnit * qty;
  const lucroBruto = faturamento - custoTotal;
  const lucroLiquido = lucroBruto - impostos;
  const margemEfetiva = p > 0 ? ((p - costUnit) / p) * 100 : 0;
  return { faturamento, custoTotal, impostos, lucroBruto, lucroLiquido, margemEfetiva };
}

// Preço a partir da margem (markup divisor — igual ao backend)
export function priceFromMargin(costUnit, marginPct) {
  const d = 1 - numInput(marginPct) / 100;
  return d > 0 ? costUnit / d : 0;
}

// Ficha em branco (valores do exemplo Lyon nos placeholders, não nos dados)
export function emptySheet(defaults = {}) {
  return {
    id: null,
    product_id: null,
    name: '',
    category: '',
    capacity: '',
    color_model: '',
    print_type: 'Serigrafia',
    print_colors: 1,
    calc_quantity: 1000,
    calc_reference: 'producao_propria',
    description: '',
    blocks: {
      materia_prima: { label: 'Copo Vazio (un.)', unit_cost: '', quantity: '', supplier_name: '' },
      personalizacao: { type: 'Tela de Serigrafia', screen_cost: '', screen_uses: '' },
      tintas: [
        { label: 'Cor 1', amount: '' },
        { label: 'Cor 2', amount: '' },
        { label: 'Cor 3', amount: '' },
        { label: 'Cor 4', amount: '' },
      ],
      embalagem: { box_name: '', box_price: '', units_per_box: '' },
      frete: { supplier_name: '', freight_value: '', quantity_bought: '' },
    },
    tax_regime: defaults.tax_regime || 'simples',
    tax_pct: defaults.tax_pct ?? 4,
    tax_notes: '',
    margin_min_pct: 20,
    margin_ideal_pct: 40,
    margin_premium_pct: 50,
    overhead_unit: defaults.overhead_unit ?? 0,
  };
}
