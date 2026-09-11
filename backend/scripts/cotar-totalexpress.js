// ============================================================
// Cotação da Total Express pela linha de comando.
//
//   node scripts/cotar-totalexpress.js 01001000
//   node scripts/cotar-totalexpress.js 01001000 --peso=120 --cubado=60 --nota=3500
//   node scripts/cotar-totalexpress.js 01001000 --caixas=10 --cx=40x30x30 --peso=120
//
// PARA QUE SERVE. Para responder "por que deu esse valor?" sem abrir o
// sistema. Ele imprime a memória de cálculo inteira — a geografia que o
// CEP caiu, o risco, a faixa de peso, cada parcela — que é exatamente o
// que se compara com a fatura da transportadora quando os dois números
// não batem.
//
// Sem argumento de peso ele usa 1 kg, que serve para conferir depressa
// se um CEP é atendido e por qual geografia.
// ============================================================
require('dotenv').config();
const { cotarTotalExpress, destinoPorCep, pesoCubado, temTabela } = require('../src/lib/totalexpress');

const arg = (nome, padrao) => {
  const m = process.argv.find(a => a.startsWith(`--${nome}=`));
  return m ? m.split('=')[1] : padrao;
};
const brl = v => `R$ ${Number(v).toFixed(2).replace('.', ',')}`;

(async () => {
  const cep = (process.argv[2] || '').replace(/\D/g, '');
  if (!cep) {
    console.log('Informe o CEP. Ex: node scripts/cotar-totalexpress.js 01001000 --nota=3500');
    process.exit(1);
  }

  let tenant = arg('tenant');
  if (!tenant) {
    const supabase = require('../src/config/supabase');
    const { data } = await supabase.from('EMPRESAS').select('id, name');
    if (!data || data.length !== 1) {
      console.error('Mais de uma empresa no banco — informe --tenant=<uuid>.');
      process.exit(1);
    }
    tenant = data[0].id;
  }

  if (!(await temTabela(tenant))) {
    console.error('Nenhuma tabela da Total Express carregada para esta empresa.');
    console.error('Rode: node scripts/importar-totalexpress.js');
    process.exit(1);
  }

  const pesoReal = Number(arg('peso', 1));
  const nota = Number(arg('nota', 0));

  // A cubagem pode vir pronta (--cubado) ou ser derivada das caixas.
  let cubado = Number(arg('cubado', 0));
  const cx = arg('cx');
  if (!cubado && cx) {
    const [a, l, c] = cx.split(/[x×*]/i).map(Number);
    const caixas = Number(arg('caixas', 1));
    cubado = pesoCubado({ altura: a, largura: l, comprimento: c }) * caixas;
  }

  const destino = await destinoPorCep(tenant, cep);
  if (!destino) {
    console.log(`\nCEP ${cep} — FORA DA ABRANGÊNCIA da Total Express.\n`);
    process.exit(0);
  }

  console.log(`\nCEP ${cep}  →  ${destino.municipio}/${destino.uf}`);
  console.log(`  geografia ${destino.geografia} · ${destino.localidade} · ${destino.atendimento}`);
  console.log(`  risco ${destino.risco} · prazo ${destino.prazo} dia(s) útil(eis)\n`);

  const r = await cotarTotalExpress(tenant, {
    cep, peso_real: pesoReal, peso_cubado: cubado, valor_nota: nota,
    opcoes: {
      municipio_origem: arg('origem', 'LONDRINA'),
      imposto_modo: arg('imposto'),
    },
  });

  if (!r.ok) { console.log('SEM COTAÇÃO:', r.motivo, '\n'); process.exit(0); }

  const m = r.memoria;
  console.log(`  peso real      ${m.peso_real} kg`);
  console.log(`  peso cubado    ${m.peso_cubado} kg`);
  console.log(`  considerado    ${m.peso_considerado} kg  (faixa ${m.faixa}${m.excedente_kg ? `, ${m.excedente_kg} kg de excedente` : ''})`);
  console.log('');
  console.log(`  frete tabela   ${brl(m.frete_tabela)}`);
  console.log(`  GRIS           ${brl(m.gris)}   (risco ${m.risco})`);
  console.log(`  ad valorem     ${brl(m.ad_valorem)}   (nota ${brl(nota)})`);
  console.log(`  ${'-'.repeat(38)}`);
  console.log(`  sem imposto    ${brl(m.subtotal_sem_imposto)}`);
  console.log(`  ${m.imposto} ${m.aliquota}%     ${brl(m.valor_imposto)}   (${m.imposto_modo})`);
  console.log(`  ${'='.repeat(38)}`);
  console.log(`  TOTAL          ${brl(r.price)}   em ${r.days} dia(s) útil(eis)\n`);
  r.avisos.forEach(a => console.log(`  ! ${a}`));
  console.log('');
})();
