// ============================================================
// TOTAL EXPRESS — O FRETE CALCULADO, E NÃO DIGITADO.
//
// A tabela por estado (lib/shipping.js) responde uma pergunta só: "quanto
// custa mandar para o Rio?". Serve enquanto o pedido é sempre parecido.
// Mil copos e dez copos para o mesmo endereço não são parecidos, e a
// tabela por estado cobra o mesmo pelos dois.
//
// Aqui o preço sai de onde a transportadora manda que saia:
//
//     preço da tabela + GRIS + Ad Valorem + ICMS/ISS
//
// NÃO EXISTE API DE COTAÇÃO. Procurei no manual do webservice (EDI ICS
// V24, o que o cliente mandou): há RegistraColeta e ObterTracking, e
// nada que devolva preço. O preço é a planilha negociada, que a
// migração 118 trouxe para o banco. Isso é melhor do que parece: a
// cotação não depende de a Total Express estar no ar, e o valor que o
// vendedor vê é o mesmo que vai chegar na fatura.
//
// AS QUATRO PERGUNTAS, NESTA ORDEM:
//
//   1. ONDE   o CEP cai numa das 59.959 faixas e sai de lá com a
//             geografia comercial, o risco e o prazo.
//   2. QUANTO o peso considerado é o MAIOR entre o real e o cubado.
//             Copo é leve e ocupa espaço: para a Lyon, quem manda é
//             quase sempre o cubado.
//   3. TABELA geografia × faixa de peso = o preço. Acima de 30 kg, o
//             preço da última faixa mais o adicional por quilo.
//   4. MAIS   GRIS pelo risco do CEP, Ad Valorem pelo valor da nota,
//             e o imposto por fim.
// ============================================================
// O Supabase entra SÓ quando alguém for ao banco. A conta em si é
// aritmética pura, e exigir SUPABASE_URL para somar GRIS com Ad Valorem
// tornaria a regra impossível de testar sem um .env ao lado.
let _supabase;
const db = () => (_supabase ||= require('../config/supabase'));

// ── Fator de cubagem ─────────────────────────────────────────
// "Cálculo automático do volume multiplicando o comprimento pela
// largura, pela altura e pelo fator de cubagem 167" — Anexo III da
// tabela. 167 kg por metro cúbico, sem isenção (padrão B2C).
const FATOR_CUBAGEM = 167;

// ── GRIS: o risco do CEP vira alíquota ───────────────────────
// A coluna `risco` da abrangência traz o texto; a tabela de
// Gerenciamento de Risco traz o percentual sobre a nota.
const GRIS = {
  'Padrão': 0.0020, 'Padrao': 0.0020,
  'Especial B1': 0.0020, 'Especial B2': 0.0020,
  'Alto': 0.0100,
  'Altíssimo': 0.0200, 'Altissimo': 0.0200,
  'Especial A1': 0.0200, 'Especial A2': 0.0200, 'Especial A3': 0.0200,
};
const GRIS_PADRAO = 0.0020;

// ── Ad Valorem: o seguro, por faixa de valor da nota ─────────
// Acima de R$ 15.000 a Total Express declara que NÃO se responsabiliza
// pela entrega. A faixa de 2% existe na tabela, mas quem manda uma nota
// dessas está sem seguro — por isso o aviso, e não só o número.
function adValoremPct(valorNota) {
  const v = Number(valorNota) || 0;
  if (v <= 10000) return 0.0040;
  if (v <= 15000) return 0.0100;
  return 0.0200;
}

// ── ICMS: matriz da tabela, origem PR ────────────────────────
// Não é a alíquota interestadual genérica: são os números da aba
// Simulador da própria planilha. PR para o Sul/Sudeste desenvolvido é
// 12%, para o resto do país 7%, e dentro do próprio Paraná 19,5%.
const ICMS_ORIGEM_PR = {
  PR: 19.5,
  MG: 12, RS: 12, RJ: 12, SC: 12, SP: 12,
};
const ICMS_PR_DEMAIS = 7;

function icmsPct(ufDestino) {
  const uf = String(ufDestino || '').toUpperCase();
  return (ICMS_ORIGEM_PR[uf] ?? ICMS_PR_DEMAIS) / 100;
}

const soDigitos = v => String(v || '').replace(/\D/g, '');

/**
 * Peso cubado de uma caixa, em kg.
 *
 * Medidas em centímetros; o volume vai para metro cúbico antes de
 * multiplicar pelo fator. Caixa sem medida devolve 0 — e é o chamador
 * que decide se isso é aceitável, porque zero aqui significa "o sistema
 * não sabe", e não "não ocupa espaço".
 */
function pesoCubado({ altura, largura, comprimento }) {
  const a = Number(altura) || 0, l = Number(largura) || 0, c = Number(comprimento) || 0;
  if (!a || !l || !c) return 0;
  return (a * l * c / 1e6) * FATOR_CUBAGEM;
}

/**
 * O preço da tabela para um peso numa geografia.
 *
 * `faixas` vem ordenada por peso_ini. Acima da última faixa (30 kg) o
 * preço é o dela mais o adicional por quilo excedente, arredondando o
 * excedente para cima: a transportadora não cobra meio quilo adicional.
 */
function precoTabela(faixas, adicionalKg, peso) {
  if (!faixas || !faixas.length) return null;
  const p = Number(peso) || 0;

  const faixa = faixas.find(f => p >= Number(f.peso_ini) && p <= Number(f.peso_fim));
  if (faixa) return { preco: Number(faixa.preco), excedente_kg: 0, faixa: `${f2(faixa.peso_ini)}–${f2(faixa.peso_fim)} kg` };

  const ultima = faixas[faixas.length - 1];
  if (p > Number(ultima.peso_fim)) {
    const excedente = Math.ceil(p - Number(ultima.peso_fim));
    return {
      preco: Number(ultima.preco) + excedente * (Number(adicionalKg) || 0),
      excedente_kg: excedente,
      faixa: `acima de ${f2(ultima.peso_fim)} kg`,
    };
  }
  // Abaixo da primeira faixa (0,001 kg): cobra-se a primeira.
  return { preco: Number(faixas[0].preco), excedente_kg: 0, faixa: `até ${f2(faixas[0].peso_fim)} kg` };
}

const f2 = v => String(Number(v)).replace('.', ',');
const round2 = v => Math.round((Number(v) + Number.EPSILON) * 100) / 100;

/**
 * O cálculo puro, sem banco — é aqui que mora a regra, e é isto que os
 * testes exercitam.
 *
 * @param destino   { uf, municipio, risco, geografia, prazo, atendimento }
 * @param tarifa    { faixas, adicional_kg }
 * @param carga     { peso_real, peso_cubado, valor_nota }
 * @param opcoes    { municipio_origem, iss_pct, imposto_modo }
 */
function calcular({ destino, tarifa, carga, opcoes = {} }) {
  const pesoReal = Number(carga.peso_real) || 0;
  const pesoCub = Number(carga.peso_cubado) || 0;
  const pesoConsiderado = Math.max(pesoReal, pesoCub);
  const valorNota = Number(carga.valor_nota) || 0;

  const tab = precoTabela(tarifa.faixas, tarifa.adicional_kg, pesoConsiderado);
  if (!tab) return { ok: false, motivo: `Sem tarifa para a geografia ${destino.geografia}.` };

  const gris = round2(valorNota * (GRIS[destino.risco] ?? GRIS_PADRAO));
  const adValorem = round2(valorNota * adValoremPct(valorNota));
  const semImposto = round2(tab.preco + gris + adValorem);

  // ISS quando origem e destino são o MESMO município; ICMS no resto.
  // É o que a planilha chama de "Frete 1" e "Frete 2".
  const mesmoMunicipio = !!opcoes.municipio_origem
    && String(opcoes.municipio_origem).trim().toUpperCase() === String(destino.municipio || '').trim().toUpperCase();

  const imposto = mesmoMunicipio ? 'ISS' : 'ICMS';
  const aliquota = mesmoMunicipio
    ? (Number(opcoes.iss_pct) || 0.05)   // 2% a 5% conforme o município; a planilha simula com 5%
    : icmsPct(destino.uf);

  // POR DENTRO É O PADRÃO, e é a diferença entre cobrar certo e cobrar
  // 1,5% a menos. No transporte o imposto compõe a própria base: para
  // sobrar `semImposto` depois de recolher, cobra-se
  // `semImposto / (1 - alíquota)`. Somar por fora (× 1 + alíquota) dá
  // sempre menos, e a diferença sai do bolso da Lyon.
  const porFora = opcoes.imposto_modo === 'por_fora';
  const total = porFora
    ? round2(semImposto * (1 + aliquota))
    : round2(semImposto / (1 - aliquota));

  const avisos = [];
  if (valorNota > 15000) {
    avisos.push('Nota acima de R$ 15.000: a Total Express não se responsabiliza pela entrega acima desse limite.');
  }
  if (pesoCub > pesoReal && pesoReal > 0) {
    avisos.push(`Cobrado pelo peso cubado (${f2(round2(pesoCub))} kg), maior que o real (${f2(round2(pesoReal))} kg).`);
  }
  if (destino.atendimento === 'Repostagem') {
    avisos.push('CEP fora da área de entrega própria: segue por repostagem (Correios), com prazo maior.');
  }

  return {
    ok: true,
    price: total,
    days: destino.prazo || null,
    memoria: {
      geografia: destino.geografia,
      localidade: destino.municipio,
      uf: destino.uf,
      atendimento: destino.atendimento,
      risco: destino.risco,
      peso_real: round2(pesoReal),
      peso_cubado: round2(pesoCub),
      peso_considerado: round2(pesoConsiderado),
      faixa: tab.faixa,
      excedente_kg: tab.excedente_kg,
      frete_tabela: round2(tab.preco),
      gris,
      ad_valorem: adValorem,
      subtotal_sem_imposto: semImposto,
      imposto,
      aliquota: round2(aliquota * 100),
      imposto_modo: porFora ? 'por_fora' : 'por_dentro',
      valor_imposto: round2(total - semImposto),
    },
    avisos,
  };
}

// ── A parte que fala com o banco ─────────────────────────────

/** A faixa de CEP que contém este CEP. */
async function destinoPorCep(tenantId, cep) {
  const n = parseInt(soDigitos(cep), 10);
  if (!n || String(n).length < 7) return null;

  const { data } = await db().from('TOTALEXPRESS_ABRANGENCIA')
    .select('uf, ibge, municipio, risco, prazo, atendimento, localidade, geografia')
    .eq('tenant_id', tenantId)
    .lte('cep_ini', n).gte('cep_fim', n)
    .limit(1).maybeSingle();

  return data || null;
}

/** As faixas de peso e o adicional daquela geografia. */
async function tarifaDaGeografia(tenantId, geografia) {
  const [{ data: faixas }, { data: geo }] = await Promise.all([
    db().from('TOTALEXPRESS_TARIFAS')
      .select('peso_ini, peso_fim, preco')
      .eq('tenant_id', tenantId).eq('geografia', geografia)
      .order('peso_ini'),
    db().from('TOTALEXPRESS_GEOGRAFIAS')
      .select('adicional_kg')
      .eq('tenant_id', tenantId).eq('geografia', geografia).maybeSingle(),
  ]);
  return { faixas: faixas || [], adicional_kg: Number(geo?.adicional_kg) || 0 };
}

/** Existe tabela carregada para esta empresa? */
async function temTabela(tenantId) {
  const { count } = await db().from('TOTALEXPRESS_ABRANGENCIA')
    .select('id', { count: 'exact', head: true }).eq('tenant_id', tenantId);
  return (count || 0) > 0;
}

/**
 * Cotação completa a partir do CEP e da carga.
 *
 * Devolve `{ ok: false, motivo }` em vez de zero quando não sabe
 * responder. Frete R$ 0,00 na tela é uma promessa de frete grátis que
 * ninguém fez.
 */
async function cotarTotalExpress(tenantId, { cep, peso_real, peso_cubado, valor_nota, opcoes } = {}) {
  const destino = await destinoPorCep(tenantId, cep);
  if (!destino) {
    return { ok: false, motivo: 'CEP fora da abrangência da Total Express.', fora_de_area: true };
  }
  const tarifa = await tarifaDaGeografia(tenantId, destino.geografia);
  if (!tarifa.faixas.length) {
    return { ok: false, motivo: `Sem tarifa carregada para a geografia ${destino.geografia}.` };
  }
  return calcular({
    destino,
    tarifa,
    carga: { peso_real, peso_cubado, valor_nota },
    opcoes: opcoes || {},
  });
}

module.exports = {
  cotarTotalExpress, destinoPorCep, tarifaDaGeografia, temTabela,
  calcular, precoTabela, pesoCubado, adValoremPct, icmsPct,
  FATOR_CUBAGEM, GRIS,
};
