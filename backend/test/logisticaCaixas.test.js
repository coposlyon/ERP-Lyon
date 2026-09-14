const { test } = require('node:test');
const assert = require('node:assert');
const L = require('../src/lib/logisticaCaixas');

// Caixas reais da tabela logística da Lyon.
const LONG_DRINK = { id: 'cx-ld', nome: 'Copo Long Drink 350ml', largura_cm: 33, altura_cm: 28, comprimento_cm: 45, peso_cheia_kg: 5.0, valor: 4.63 };
const TWISTER_300 = { id: 'cx-tw300', nome: 'Copo Twister 300ml', largura_cm: 28, altura_cm: 17, comprimento_cm: 39, peso_cheia_kg: 4.0, valor: 3.69 };
const CAIXAS = new Map([[LONG_DRINK.id, LONG_DRINK], [TWISTER_300.id, TWISTER_300]]);

// Unidades por caixa ainda não informadas pela Lyon: 100 é só para o teste.
const REGRA_LD = { id: 'r-ld', category_id: 'cat-ld', capacidade_ml: 350, caixa_id: 'cx-ld', unidades_por_caixa: 100, caixa_pequena_id: 'cx-tw300', unidades_caixa_pequena: 20 };

const grupo = quantidade => [{ nome: 'Long Drink 350 ml', quantidade, regra: REGRA_LD }];

test('caixas — 250 copos em caixas de 100 são 3 caixas, com cubado e valor por caixa', () => {
  const e = L.calcularEnvio(grupo(250), CAIXAS);
  assert.strictEqual(e.ok, true);
  assert.strictEqual(e.volumes, 3);
  assert.strictEqual(e.peso_cubado, 20.832);        // 33×28×45 cm = 6,944 kg × 3
  assert.strictEqual(e.peso_real, 12.5);            // 5 kg ÷ 100 = 0,05 kg por copo
  assert.strictEqual(e.valor_caixas, 13.89);        // 3 × R$ 4,63
});

test('caixa menor — pedido pequeno vai na caixa menor e o frete sai dela', () => {
  const e = L.calcularEnvio(grupo(10), CAIXAS);
  assert.strictEqual(e.volumes, 1);
  assert.strictEqual(e.detalhe[0].caixa.nome, 'Copo Twister 300ml');
  assert.strictEqual(e.detalhe[0].caixa_pequena, true);
  assert.strictEqual(e.peso_cubado, 3.1);           // 28×17×39
  assert.strictEqual(e.valor_caixas, 3.69);
});

test('caixa menor — acima do limite dela, volta para a caixa padrão', () => {
  const e = L.calcularEnvio(grupo(21), CAIXAS);
  assert.strictEqual(e.detalhe[0].caixa.nome, 'Copo Long Drink 350ml');
  assert.strictEqual(e.volumes, 1);
});

test('12% — acima de 70% de ocupação leva acréscimo; 70% exato não', () => {
  assert.strictEqual(L.calcularEnvio(grupo(80), CAIXAS).aplica_acrescimo, true);
  assert.strictEqual(L.calcularEnvio(grupo(70), CAIXAS).aplica_acrescimo, false);
  assert.strictEqual(L.calcularEnvio(grupo(250), CAIXAS).ocupacao_pct, 83.3);
  // 10 copos na caixa menor de 20 = 50%
  assert.strictEqual(L.calcularEnvio(grupo(10), CAIXAS).aplica_acrescimo, false);
});

test('12% — limite e percentual vêm da configuração', () => {
  const e = L.calcularEnvio(grupo(60), CAIXAS, { acrescimo_pct: 15, ocupacao_limite_pct: 50 });
  assert.strictEqual(e.aplica_acrescimo, true);
  assert.deepStrictEqual(L.aplicarAoFrete(100, e), { frete_base: 100, acrescimo: 15, frete: 115, valor_caixas: 4.63, total: 119.63 });
});

test('valor da caixa — desligado, não entra no total', () => {
  const e = L.calcularEnvio(grupo(80), CAIXAS, { cobrar_caixa: false });
  assert.strictEqual(e.valor_caixas, 0);
  assert.strictEqual(e.valor_caixas_bruto, 4.63);
});

test('frete final — base + 12% + caixas', () => {
  const e = L.calcularEnvio(grupo(80), CAIXAS);
  assert.deepStrictEqual(L.aplicarAoFrete(50, e), { frete_base: 50, acrescimo: 6, frete: 56, valor_caixas: 4.63, total: 60.63 });
});

test('cadastro incompleto — não chuta, diz o que falta', () => {
  const semUnidades = L.calcularEnvio([{ nome: 'Twister 550 ml', quantidade: 50, regra: { ...REGRA_LD, unidades_por_caixa: null } }], CAIXAS);
  assert.strictEqual(semUnidades.ok, false);
  assert.match(semUnidades.faltas.join(' '), /unidades cabem na caixa/);
  const semRegra = L.calcularEnvio([{ nome: 'Taça Gin', quantidade: 10, regra: null }], CAIXAS);
  assert.match(semRegra.faltas.join(' '), /sem regra de caixa/);
});

test('regra — o tamanho vence a regra da categoria inteira', () => {
  const regras = [
    { id: 'geral', category_id: 'cat-tw', capacidade_ml: null },
    { id: 'tw550', category_id: 'cat-tw', capacidade_ml: 550 },
  ];
  assert.strictEqual(L.escolherRegra(regras, 'cat-tw', 550).id, 'tw550');
  assert.strictEqual(L.escolherRegra(regras, 'cat-tw', 400).id, 'geral');
  assert.strictEqual(L.escolherRegra(regras, 'outra', 400), null);
});

test('capacidade — lida do nome do produto', () => {
  assert.strictEqual(L.capacidadeDoNome('TWISTER TRADICIONAL - PRETO - 550 ML'), 550);
  assert.strictEqual(L.capacidadeDoNome('BALDE'), null);
});

test('configuração — padrões da Lyon quando nada foi salvo', () => {
  assert.deepStrictEqual(L.configLogistica({}), { acrescimo_pct: 12, ocupacao_limite_pct: 70, cobrar_caixa: true });
  assert.deepStrictEqual(L.configLogistica({ logistica: { acrescimo_pct: '0', cobrar_caixa: false } }), { acrescimo_pct: 0, ocupacao_limite_pct: 70, cobrar_caixa: false });
});
