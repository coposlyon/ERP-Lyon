// ============================================================
// Baixa os municípios do Brasil para a tabela MUNICIPIOS.
//
//   node scripts/seed-municipios.js          país inteiro
//   node scripts/seed-municipios.js PR SC    só essas UFs
//
// A tela do território sabe se virar sozinha: UF que ainda não foi
// baixada ela baixa na primeira abertura. Este script existe para que
// essa primeira abertura não seja a do vendedor esperando trinta
// segundos com a tela em branco.
//
// Rodar de novo é seguro: é upsert por código do IBGE, e a faixa de CEP
// (que é preenchida à mão, se um dia for) não entra no payload e não é
// sobrescrita.
// ============================================================
require('dotenv').config();
const { UFS, sincronizarUF, mapaDDD } = require('../src/lib/municipios');

(async () => {
  const pedidas = process.argv.slice(2).map(s => s.toUpperCase()).filter(Boolean);
  const alvo = pedidas.length ? pedidas.filter(uf => UFS.includes(uf)) : UFS;

  const invalidas = pedidas.filter(uf => !UFS.includes(uf));
  if (invalidas.length) console.log(`Ignorando UF inválida: ${invalidas.join(', ')}`);
  if (!alvo.length) return console.log('Nada a fazer.');

  // A varredura dos DDDs vale para o país todo — uma vez só, não uma
  // por UF.
  console.log('Buscando os DDDs (89 códigos)...');
  const ddd = await mapaDDD();
  console.log(`  ${ddd.tamanho} cidades com DDD conhecido\n`);

  let total = 0;
  const falhas = [];

  for (const uf of alvo) {
    try {
      const n = await sincronizarUF(uf, ddd);
      total += n;
      console.log(`${uf}  ${String(n).padStart(4)} cidades`);
    } catch (err) {
      falhas.push(uf);
      console.log(`${uf}  FALHOU — ${err.message}`);
    }
  }

  console.log(`\n${total} cidades gravadas em ${alvo.length - falhas.length} UF(s).`);
  if (falhas.length) {
    console.log(`Sem dados: ${falhas.join(', ')}. Rode de novo só para elas.`);
    process.exit(1);
  }
})();
