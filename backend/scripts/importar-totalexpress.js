// ============================================================
// Carrega a tabela negociada da Total Express no banco.
//
//   node scripts/importar-totalexpress.js                  a empresa única
//   node scripts/importar-totalexpress.js <tenant_id>      uma empresa
//
// DE ONDE VÊM OS DADOS. De `backend/data/totalexpress/*.csv.gz`, que
// saíram da planilha `Tabela_MO-0.1-Londrina-PR.xlsb` (origem
// LONDRINA/PR, Total Standard). Três arquivos:
//
//   abrangencia.csv.gz  59.959 faixas de CEP → geografia, risco, prazo
//   tarifas.csv.gz       6.630 células da grade peso × geografia
//   geografias.csv.gz      195 adicionais por quilo
//
// POR QUE `pg` E NÃO O SUPABASE-JS. São sessenta mil linhas. Pelo
// PostgREST isso vira centenas de requisições HTTP e alguns minutos;
// por COPY é uma conexão e alguns segundos. O migrate.js já abre esse
// caminho (DATABASE_URL no backend/.env), e este script usa o mesmo.
//
// RODAR DE NOVO É SEGURO, e é assim que se aplica um reajuste: cada
// tabela é apagada e recarregada dentro da MESMA transação. Ou a tabela
// nova entra inteira, ou a antiga continua de pé — nunca um meio-termo
// em que metade dos CEPs tem preço novo e metade tem preço velho.
//
// QUANDO A TOTAL EXPRESS MANDAR TABELA NOVA: regenerar os três .csv.gz
// da planilha nova e rodar isto. O formato dos arquivos é o contrato.
// ============================================================
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { Client } = require('pg');

const DADOS = path.join(__dirname, '..', 'data', 'totalexpress');

/** Lê um .csv.gz e devolve as linhas já separadas, sem o cabeçalho. */
function lerCsvGz(nome) {
  const bruto = zlib.gunzipSync(fs.readFileSync(path.join(DADOS, nome))).toString('utf8');
  const linhas = bruto.split(/\r?\n/).filter(Boolean);
  const cab = linhas.shift().split(',');
  return { cab, linhas: linhas.map(parseCsvLine) };
}

// Os campos com vírgula vêm entre aspas (nome de município, por
// exemplo). Um split(',') cru quebraria justamente esses.
function parseCsvLine(linha) {
  const out = []; let campo = ''; let aspas = false;
  for (let i = 0; i < linha.length; i++) {
    const c = linha[i];
    if (aspas) {
      if (c === '"' && linha[i + 1] === '"') { campo += '"'; i++; }
      else if (c === '"') aspas = false;
      else campo += c;
    } else if (c === '"') aspas = true;
    else if (c === ',') { out.push(campo); campo = ''; }
    else campo += c;
  }
  out.push(campo);
  return out;
}

const num = v => { const n = Number(v); return Number.isFinite(n) ? n : null; };

/**
 * Insere em lotes de 1.000 com um único INSERT multi-linha por lote.
 * Lote maior estoura o limite de 65.535 parâmetros do protocolo; menor
 * multiplica as idas ao banco sem ganho.
 */
async function inserirEmLotes(cli, tabela, colunas, linhas, tamanho = 1000) {
  let gravadas = 0;
  for (let i = 0; i < linhas.length; i += tamanho) {
    const lote = linhas.slice(i, i + tamanho);
    const params = [];
    const valores = lote.map((linha, j) => {
      const base = j * colunas.length;
      params.push(...linha);
      return `(${colunas.map((_, k) => `$${base + k + 1}`).join(',')})`;
    });
    await cli.query(
      `INSERT INTO "${tabela}" (${colunas.map(c => `"${c}"`).join(',')}) VALUES ${valores.join(',')}`,
      params,
    );
    gravadas += lote.length;
    process.stdout.write(`\r  ${tabela}: ${gravadas}/${linhas.length}`);
  }
  process.stdout.write('\n');
  return gravadas;
}

(async () => {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error('DATABASE_URL não está no backend/.env. É a mesma que o migrate.js usa.');
    process.exit(1);
  }

  const cli = new Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
  await cli.connect();

  try {
    // Qual empresa. Com uma só no banco, não faz sentido exigir o UUID
    // na linha de comando; com duas, exige — carregar a tabela da Lyon
    // no tenant errado é o tipo de engano que só aparece na cotação.
    let tenant = process.argv[2];
    if (!tenant) {
      const { rows } = await cli.query('SELECT id, name FROM "EMPRESAS" ORDER BY name');
      if (rows.length !== 1) {
        console.error('Informe o tenant_id. Empresas no banco:');
        rows.forEach(r => console.error(`  ${r.id}  ${r.name}`));
        process.exit(1);
      }
      tenant = rows[0].id;
      console.log(`Empresa: ${rows[0].name}\n`);
    }

    const abr = lerCsvGz('abrangencia.csv.gz');
    const tar = lerCsvGz('tarifas.csv.gz');
    const geo = lerCsvGz('geografias.csv.gz');

    console.log(`Lidos: ${abr.linhas.length} faixas de CEP · ${tar.linhas.length} tarifas · ${geo.linhas.length} geografias\n`);

    // A conferência que vale a pena fazer antes de gravar: todo CEP
    // atendido precisa ter uma coluna de preço. Geografia sem tarifa
    // vira cotação que falha só quando um cliente daquela cidade
    // aparecer — meses depois, e sem ninguém ligar uma coisa à outra.
    const comPreco = new Set(geo.linhas.map(l => l[0]));
    const orfas = [...new Set(abr.linhas.map(l => l[10]))].filter(g => !comPreco.has(g));
    if (orfas.length) {
      console.error(`ABORTADO: ${orfas.length} geografia(s) sem tarifa: ${orfas.join(', ')}`);
      process.exit(1);
    }

    await cli.query('BEGIN');

    await cli.query('DELETE FROM "TOTALEXPRESS_ABRANGENCIA" WHERE tenant_id = $1', [tenant]);
    await cli.query('DELETE FROM "TOTALEXPRESS_TARIFAS"     WHERE tenant_id = $1', [tenant]);
    await cli.query('DELETE FROM "TOTALEXPRESS_GEOGRAFIAS"  WHERE tenant_id = $1', [tenant]);

    await inserirEmLotes(cli, 'TOTALEXPRESS_GEOGRAFIAS',
      ['tenant_id', 'geografia', 'adicional_kg'],
      geo.linhas.map(l => [tenant, l[0], num(l[1]) ?? 0]));

    await inserirEmLotes(cli, 'TOTALEXPRESS_TARIFAS',
      ['tenant_id', 'geografia', 'peso_ini', 'peso_fim', 'preco'],
      tar.linhas.map(l => [tenant, l[0], num(l[1]), num(l[2]), num(l[3])]));

    await inserirEmLotes(cli, 'TOTALEXPRESS_ABRANGENCIA',
      ['tenant_id', 'cep_ini', 'cep_fim', 'uf', 'ibge', 'municipio', 'base', 'risco', 'prazo', 'atendimento', 'localidade', 'geografia'],
      abr.linhas.map(l => [tenant, num(l[0]), num(l[1]), l[2] || null, l[3] || null, l[4] || null,
        l[5] || null, l[6] || null, num(l[7]), l[8] || null, l[9] || null, l[10]]));

    await cli.query('COMMIT');
    console.log('\nPronto. A cotação da Total Express já tem com o que trabalhar.');
  } catch (err) {
    await cli.query('ROLLBACK').catch(() => {});
    console.error('\nFALHOU, e nada foi gravado:', err.message);
    process.exit(1);
  } finally {
    await cli.end();
  }
})();
