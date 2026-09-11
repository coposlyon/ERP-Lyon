const { test } = require('node:test');
const assert = require('node:assert');
const {
  calcular, precoTabela, pesoCubado, adValoremPct, icmsPct, FATOR_CUBAGEM,
} = require('../src/lib/totalexpress');

// Recorte real da tabela MO-0.1-Londrina-PR, geografia SPC (São Paulo
// capital). Poucas faixas bastam: o que se testa é a regra, não a
// planilha inteira.
const SPC = {
  adicional_kg: 12.11,
  faixas: [
    { peso_ini: 0.001,  peso_fim: 0.25, preco: 13.32 },
    { peso_ini: 0.251,  peso_fim: 0.3,  preco: 13.58 },
    { peso_ini: 0.301,  peso_fim: 0.5,  preco: 14.57 },
    { peso_ini: 4.001,  peso_fim: 5,    preco: 25.42 },
    { peso_ini: 29.001, peso_fim: 30,   preco: 58.05 },
  ],
};

// ── Cubagem ───────────────────────────────────────────────
test('cubagem — fator 167 sobre o volume em m³', () => {
  // Caixa de 40 × 30 × 30 cm = 0,036 m³ → 6,012 kg
  assert.strictEqual(Math.round(pesoCubado({ altura: 40, largura: 30, comprimento: 30 }) * 1000) / 1000, 6.012);
});
test('cubagem — o fator da tabela é 167', () => {
  assert.strictEqual(FATOR_CUBAGEM, 167);
});
test('cubagem — caixa sem medida devolve zero, e não um palpite', () => {
  assert.strictEqual(pesoCubado({ altura: 40, largura: 30 }), 0);
  assert.strictEqual(pesoCubado({}), 0);
});

// ── Faixa de peso ─────────────────────────────────────────
test('faixa — peso dentro da faixa pega o preço dela', () => {
  assert.strictEqual(precoTabela(SPC.faixas, SPC.adicional_kg, 0.2).preco, 13.32);
  assert.strictEqual(precoTabela(SPC.faixas, SPC.adicional_kg, 4.5).preco, 25.42);
});
test('faixa — o limite superior pertence à própria faixa', () => {
  assert.strictEqual(precoTabela(SPC.faixas, SPC.adicional_kg, 0.25).preco, 13.32);
  assert.strictEqual(precoTabela(SPC.faixas, SPC.adicional_kg, 0.3).preco, 13.58);
});
test('faixa — acima de 30 kg soma o adicional por quilo excedente', () => {
  // 33,4 kg → 58,05 + ceil(3,4) × 12,11 = 58,05 + 48,44
  const r = precoTabela(SPC.faixas, SPC.adicional_kg, 33.4);
  assert.strictEqual(r.excedente_kg, 4);
  assert.strictEqual(Math.round(r.preco * 100) / 100, 106.49);
});

// ── Ad Valorem ────────────────────────────────────────────
test('ad valorem — 0,40% até R$ 10.000', () => {
  assert.strictEqual(adValoremPct(5000), 0.004);
  assert.strictEqual(adValoremPct(10000), 0.004);
});
test('ad valorem — 1% entre 10.000,01 e 15.000', () => {
  assert.strictEqual(adValoremPct(12000), 0.01);
});
test('ad valorem — 2% acima de 15.000', () => {
  assert.strictEqual(adValoremPct(18000), 0.02);
});

// ── ICMS, origem PR ───────────────────────────────────────
test('ICMS — dentro do Paraná é 19,5%', () => {
  assert.strictEqual(icmsPct('PR'), 0.195);
});
test('ICMS — Sul/Sudeste desenvolvido é 12%', () => {
  for (const uf of ['SP', 'RJ', 'MG', 'SC', 'RS']) assert.strictEqual(icmsPct(uf), 0.12);
});
test('ICMS — o resto do país é 7%', () => {
  for (const uf of ['BA', 'PE', 'AM', 'GO', 'DF']) assert.strictEqual(icmsPct(uf), 0.07);
});

// ── O cálculo inteiro ─────────────────────────────────────
const destinoSP = {
  uf: 'SP', municipio: 'SAO PAULO', risco: 'Padrão',
  prazo: 5, atendimento: 'Atendido', geografia: 'SPC',
};

test('frete — a conta completa de ponta a ponta', () => {
  const r = calcular({
    destino: destinoSP,
    tarifa: SPC,
    carga: { peso_real: 0.2, peso_cubado: 0, valor_nota: 1000 },
    opcoes: { municipio_origem: 'LONDRINA' },
  });
  assert.ok(r.ok);
  // tabela 13,32 + GRIS 0,20% × 1000 = 2,00 + AdVal 0,40% × 1000 = 4,00
  assert.strictEqual(r.memoria.frete_tabela, 13.32);
  assert.strictEqual(r.memoria.gris, 2);
  assert.strictEqual(r.memoria.ad_valorem, 4);
  assert.strictEqual(r.memoria.subtotal_sem_imposto, 19.32);
  // ICMS 12% por fora: 19,32 x 1,12 = 21,64
  // (confirmado pela Total Express em 11/09/2026 — o imposto e somado depois)
  assert.strictEqual(r.memoria.imposto, 'ICMS');
  assert.strictEqual(r.price, 21.64);
});

test('frete — o peso cubado manda quando é maior que o real', () => {
  const r = calcular({
    destino: destinoSP,
    tarifa: SPC,
    carga: { peso_real: 0.2, peso_cubado: 4.5, valor_nota: 1000 },
    opcoes: { municipio_origem: 'LONDRINA' },
  });
  assert.strictEqual(r.memoria.peso_considerado, 4.5);
  assert.strictEqual(r.memoria.frete_tabela, 25.42);
  assert.ok(r.avisos.some(a => /cubado/i.test(a)));
});

test('frete — mesmo município troca ICMS por ISS', () => {
  const r = calcular({
    destino: { ...destinoSP, uf: 'PR', municipio: 'LONDRINA', geografia: 'LDBL' },
    tarifa: SPC,
    carga: { peso_real: 0.2, peso_cubado: 0, valor_nota: 1000 },
    opcoes: { municipio_origem: 'Londrina' },   // o casamento ignora caixa
  });
  assert.strictEqual(r.memoria.imposto, 'ISS');
  assert.strictEqual(r.memoria.aliquota, 5);
});

test('frete — por fora é o padrão, porque é o que a Total Express faz', () => {
  const carga = { peso_real: 0.2, peso_cubado: 0, valor_nota: 1000 };
  const padrao = calcular({ destino: destinoSP, tarifa: SPC, carga, opcoes: {} });
  const fora   = calcular({ destino: destinoSP, tarifa: SPC, carga, opcoes: { imposto_modo: 'por_fora' } });
  assert.strictEqual(padrao.memoria.imposto_modo, 'por_fora');
  assert.strictEqual(padrao.price, fora.price);
  assert.strictEqual(fora.price, 21.64);   // 19,32 × 1,12
});

test('frete — por dentro continua disponível, e cobra mais', () => {
  const carga = { peso_real: 0.2, peso_cubado: 0, valor_nota: 1000 };
  const dentro = calcular({ destino: destinoSP, tarifa: SPC, carga, opcoes: { imposto_modo: 'por_dentro' } });
  assert.strictEqual(dentro.price, 21.95);   // 19,32 ÷ 0,88
  assert.ok(dentro.price > 21.64);
});

test('frete — risco alto multiplica o GRIS por cinco', () => {
  const base = calcular({ destino: destinoSP, tarifa: SPC, carga: { peso_real: 0.2, valor_nota: 1000 }, opcoes: {} });
  const alto = calcular({ destino: { ...destinoSP, risco: 'Alto' }, tarifa: SPC, carga: { peso_real: 0.2, valor_nota: 1000 }, opcoes: {} });
  assert.strictEqual(base.memoria.gris, 2);
  assert.strictEqual(alto.memoria.gris, 10);
});

test('frete — nota acima de R$ 15.000 avisa que está sem cobertura', () => {
  const r = calcular({ destino: destinoSP, tarifa: SPC, carga: { peso_real: 0.2, valor_nota: 20000 }, opcoes: {} });
  assert.ok(r.avisos.some(a => /15\.000/.test(a)));
});

test('frete — repostagem avisa que vai pelos Correios', () => {
  const r = calcular({
    destino: { ...destinoSP, atendimento: 'Repostagem', geografia: 'SPRC' },
    tarifa: SPC, carga: { peso_real: 0.2, valor_nota: 100 }, opcoes: {},
  });
  assert.ok(r.avisos.some(a => /repostagem/i.test(a)));
});

test('frete — o município da origem casa mesmo com acento diferente', () => {
  // A abrangência da Total Express grava "ANDIRA" (base IBGE); o
  // cadastro fiscal da Lyon grava "Andirá". Se a comparação fosse
  // literal, a entrega dentro da própria cidade pagaria ICMS de 19,5%
  // em vez de ISS.
  const r = calcular({
    destino: { ...destinoSP, uf: 'PR', municipio: 'ANDIRA', geografia: 'LDBI' },
    tarifa: SPC,
    carga: { peso_real: 0.2, valor_nota: 1000 },
    opcoes: { municipio_origem: 'Andirá' },
  });
  assert.strictEqual(r.memoria.imposto, 'ISS');
});

test('frete — município diferente continua sendo ICMS', () => {
  const r = calcular({
    destino: { ...destinoSP, uf: 'PR', municipio: 'LONDRINA', geografia: 'LDBL' },
    tarifa: SPC,
    carga: { peso_real: 0.2, valor_nota: 1000 },
    opcoes: { municipio_origem: 'Andirá' },
  });
  assert.strictEqual(r.memoria.imposto, 'ICMS');
  assert.strictEqual(r.memoria.aliquota, 19.5);
});
