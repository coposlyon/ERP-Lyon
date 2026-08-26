const { test } = require('node:test');
const assert = require('node:assert');

// lib/ponto.js conversa com o Supabase para LER escala e gravar
// apuração. `jornadaDoDia` não faz nem uma coisa nem outra — é conta
// pura sobre horários. As credenciais falsas existem só para o módulo
// de configuração poder ser carregado; nenhuma chamada de rede sai
// daqui.
process.env.SUPABASE_URL ||= 'http://localhost/teste';
process.env.SUPABASE_SERVICE_KEY ||= 'teste';

const { jornadaDoDia, minutosDe, paraHora } = require('../src/lib/ponto');

const ESCALA = {
  name: 'Comercial 8h', entry_time: '08:00', exit_time: '18:00',
  break_minutes: 60, tolerance_minutes: 10, daily_minutes: 480, weekdays: [1, 2, 3, 4, 5],
};
const dia = (marcacoes, agora, extra = {}) =>
  jornadaDoDia({ escala: ESCALA, marcacoes, agora, diaSemana: 3, ...extra });

// ── Antes de bater ──────────────────────────────────────────
test('sem batida e dentro da tolerância: ainda é aguardando', () => {
  const d = dia([], '08:07');
  assert.strictEqual(d.status, 'aguardando');
  assert.strictEqual(d.proximo.acao, 'entrada');
  assert.strictEqual(d.proximo.previsto, '08:00');
});

test('sem batida passada a tolerância: atraso, e não falta', () => {
  const d = dia([], '08:40');
  assert.strictEqual(d.status, 'atraso');
  assert.strictEqual(d.proximo.faltam_min, -40);
  assert.strictEqual(d.proximo.atrasado, true);
});

test('sem batida depois do fim da jornada: aí sim é falta', () => {
  assert.strictEqual(dia([], '19:00').status, 'falta');
});

// ── Durante o dia ───────────────────────────────────────────
test('uma batida: trabalhando, e o trabalhado conta até agora', () => {
  const d = dia(['08:00'], '10:30');
  assert.strictEqual(d.status, 'presente');
  assert.strictEqual(d.trabalhado_min, 150);
  assert.strictEqual(d.proximo.acao, 'intervalo');
});

test('o retorno do intervalo sai da batida real, não do horário previsto', () => {
  // Saiu 12:15 para o almoço → volta 13:15, e não às 13:00.
  const d = dia(['08:00', '12:15'], '12:40');
  assert.strictEqual(d.status, 'intervalo');
  assert.strictEqual(d.retorno_previsto, '13:15');
  assert.strictEqual(d.proximo.acao, 'retorno');
  assert.strictEqual(d.proximo.faltam_min, 35);
  // Tempo parado não é tempo trabalhado.
  assert.strictEqual(d.trabalhado_min, 255);
});

test('quatro batidas fecham o dia', () => {
  const d = dia(['08:00', '12:00', '13:00', '18:00'], '18:05');
  assert.strictEqual(d.status, 'encerrado');
  assert.strictEqual(d.trabalhado_min, 540);
  assert.strictEqual(d.falta_para_jornada_min, 0);
  assert.strictEqual(d.proximo, null);
});

// ── Dias que não são de trabalho ────────────────────────────
test('domingo não é falta', () => {
  const d = jornadaDoDia({ escala: ESCALA, marcacoes: [], agora: '19:00', diaSemana: 0 });
  assert.strictEqual(d.dia_util, false);
  assert.strictEqual(d.status, 'folga');
});

test('férias em curso não viram falta no portal', () => {
  const d = dia([], '19:00', { folga: true });
  assert.strictEqual(d.status, 'folga');
});

test('trabalhar em dia de folga aparece como isso mesmo', () => {
  const d = dia(['09:00'], '11:00', { folga: true });
  assert.strictEqual(d.status, 'trabalhando_na_folga');
  assert.strictEqual(d.trabalhado_min, 120);
});

// ── Escala sem horário cadastrado ───────────────────────────
test('escala sem entry_time não inventa horário previsto', () => {
  const d = jornadaDoDia({ escala: { daily_minutes: 480 }, marcacoes: [], agora: '10:00', diaSemana: 2 });
  assert.strictEqual(d.escala.entrada, null);
  assert.strictEqual(d.proximo.previsto, null);
  assert.strictEqual(d.proximo.faltam_min, null);
  // Sem horário previsto não há como afirmar atraso.
  assert.strictEqual(d.status, 'aguardando');
});

// ── Conversões ──────────────────────────────────────────────
test('minutosDe e paraHora são o mesmo caminho de ida e volta', () => {
  assert.strictEqual(minutosDe('13:15'), 795);
  assert.strictEqual(paraHora(795), '13:15');
  assert.strictEqual(paraHora(minutosDe('00:00')), '00:00');
});
