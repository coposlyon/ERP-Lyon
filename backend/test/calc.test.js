const { test } = require('node:test');
const assert = require('node:assert');
const { calcINSS, calcIRRF, custoMedio, precoFaixa, apurarPonto } = require('../src/lib/calc');

// ── INSS ──────────────────────────────────────────────────
test('INSS — 1ª faixa (7,5%)', () => {
  assert.strictEqual(calcINSS(1000), 75);
});
test('INSS — faixa intermediária (12%)', () => {
  assert.strictEqual(calcINSS(3000), 360);
});
test('INSS — teto', () => {
  assert.strictEqual(calcINSS(20000), 908.86);
});

// ── IRRF ──────────────────────────────────────────────────
test('IRRF — isento abaixo da faixa', () => {
  assert.strictEqual(calcIRRF(2000, calcINSS(2000)), 0);
});
test('IRRF — salário 5000 desconta imposto', () => {
  const inss = calcINSS(5000);
  const irrf = calcIRRF(5000, inss);
  assert.ok(irrf > 0, 'deve haver IRRF');
  // base = 5000 - 700 = 4300 → faixa 22,5%
  assert.strictEqual(irrf, Number((4300 * 0.225 - 662.77).toFixed(2)));
});

// ── Custo médio ponderado ─────────────────────────────────
test('custo médio — primeira compra (estoque zero)', () => {
  assert.strictEqual(custoMedio(0, 0, 100, 2.5), 2.5);
});
test('custo médio — mistura preços', () => {
  // 100 un a 2,00 + 100 un a 4,00 → 3,00
  assert.strictEqual(custoMedio(100, 2.0, 100, 4.0), 3.0);
});
test('custo médio — estoque negativo conta como zero', () => {
  assert.strictEqual(custoMedio(-50, 9.99, 10, 5.0), 5.0);
});

// ── Preço por faixa ───────────────────────────────────────
const tiers = [
  { min_qty: 10, max_qty: 20, price: 2.5 },
  { min_qty: 21, max_qty: 60, price: 2.0 },
  { min_qty: 61, max_qty: null, price: 1.5 },
];
test('preço faixa — abaixo da menor faixa usa sale_price', () => {
  assert.strictEqual(precoFaixa(tiers, 3.0, 5), 3.0);
});
test('preço faixa — 15 unidades cai na 1ª faixa', () => {
  assert.strictEqual(precoFaixa(tiers, 3.0, 15), 2.5);
});
test('preço faixa — 40 unidades cai na 2ª faixa', () => {
  assert.strictEqual(precoFaixa(tiers, 3.0, 40), 2.0);
});
test('preço faixa — 100 unidades cai na faixa aberta', () => {
  assert.strictEqual(precoFaixa(tiers, 3.0, 100), 1.5);
});
test('preço faixa — sem faixas usa sale_price', () => {
  assert.strictEqual(precoFaixa([], 3.0, 100), 3.0);
});

// ── Apuração de ponto ─────────────────────────────────────
test('ponto — sem marcações é falta', () => {
  const r = apurarPonto({ totalMinutes: 0, hasMarks: false, expected: 480, tolerance: 10 });
  assert.strictEqual(r.status, 'absence');
});
test('ponto — dentro da tolerância não gera atraso', () => {
  // trabalhou 7h52 (472) de 8h, déficit 8 ≤ tolerância 10
  const r = apurarPonto({ totalMinutes: 472, hasMarks: true, expected: 480, tolerance: 10 });
  assert.strictEqual(r.status, 'worked');
  assert.strictEqual(r.late, 0);
});
test('ponto — déficit acima da tolerância gera atraso cheio', () => {
  // trabalhou 7h49 (469) de 8h, déficit 11 > 10 → atraso 11
  const r = apurarPonto({ totalMinutes: 469, hasMarks: true, expected: 480, tolerance: 10 });
  assert.strictEqual(r.status, 'late');
  assert.strictEqual(r.late, 11);
});
test('ponto — hora extra', () => {
  const r = apurarPonto({ totalMinutes: 540, hasMarks: true, expected: 480, tolerance: 10 });
  assert.strictEqual(r.extra, 60);
  assert.strictEqual(r.status, 'worked');
});
