// ============================================================
// ONDE O SERVIDOR PROCURA AS VARIÁVEIS DE AMBIENTE — e DIZ onde procurou.
//
// `require('dotenv').config()` sem caminho lê o `.env` da pasta de onde
// o Node foi INICIADO (process.cwd()). Na máquina local isso é
// `backend/`; no Discloud é a raiz do app, `/home/node`. Um `.env`
// criado na pasta errada era ignorado em silêncio, e o servidor caía
// com "Missing SUPABASE_URL" sem dizer que tinha um arquivo a dez
// centímetros dali que ele não abriu.
//
// Isso custou uma madrugada: o app do Discloud foi recriado, as
// variáveis foram coladas no painel, o painel não injetou, o arquivo
// foi criado na pasta que parecia certa, e três reinícios seguidos
// caíram com a mesma linha — sem uma pista sequer de por quê.
//
// Agora ele tenta TODOS os lugares plausíveis, na ordem, e escreve no
// log qual carregou (ou que não achou nenhum, e onde olhou). Variável
// já presente no ambiente (painel da hospedagem) tem precedência: o
// dotenv nunca sobrescreve o que já existe.
// ============================================================
const fs = require('fs');
const path = require('path');

const RAIZ_DO_BACKEND = path.join(__dirname, '..', '..');      // backend/
const RAIZ_DO_REPO = path.join(RAIZ_DO_BACKEND, '..');         // a pasta do index.js

const CANDIDATOS = [
  path.join(process.cwd(), '.env'),           // de onde o Node foi iniciado
  path.join(RAIZ_DO_REPO, '.env'),            // /home/node/.env no Discloud
  path.join(RAIZ_DO_BACKEND, '.env'),         // backend/.env (máquina local)
  path.join(RAIZ_DO_REPO, 'backend', '.env'), // idem, por outro caminho
];

const OBRIGATORIAS = ['SUPABASE_URL', 'SUPABASE_SERVICE_KEY'];

function carregarAmbiente() {
  const dotenv = require('dotenv');
  const carregados = [];
  for (const arquivo of [...new Set(CANDIDATOS)]) {
    if (!fs.existsSync(arquivo)) continue;
    const r = dotenv.config({ path: arquivo, override: false });
    if (!r.error) carregados.push(arquivo);
  }

  const faltam = OBRIGATORIAS.filter(k => !process.env[k]);
  const jaTinha = OBRIGATORIAS.filter(k => process.env[k]);

  if (carregados.length) {
    console.log(`[env] .env carregado de: ${carregados.join(', ')}`);
  } else if (jaTinha.length === OBRIGATORIAS.length) {
    console.log('[env] nenhum .env encontrado; variáveis vieram do ambiente (painel da hospedagem).');
  }

  if (faltam.length) {
    console.error('[env] FALTAM variáveis obrigatórias: ' + faltam.join(', '));
    console.error('[env] Procurei um .env em:');
    for (const c of [...new Set(CANDIDATOS)]) {
      console.error(`[env]   ${fs.existsSync(c) ? 'existe ' : 'não há'}  ${c}`);
    }
    console.error(`[env] cwd = ${process.cwd()}`);
    const vistas = Object.keys(process.env).filter(k => /SUPA|DATABASE|GOOGLE|FRONTEND|GROQ/.test(k));
    console.error(`[env] Variáveis parecidas presentes no ambiente: ${vistas.length ? vistas.map(k => JSON.stringify(k)).join(', ') : 'NENHUMA'}`);
    console.error('[env] Crie o arquivo .env na PRIMEIRA pasta da lista acima, ou configure as variáveis no painel da hospedagem.');
  }

  return { carregados, faltam };
}

module.exports = { carregarAmbiente, CANDIDATOS };
