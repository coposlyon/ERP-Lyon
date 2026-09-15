#!/usr/bin/env node
/**
 * GERA O GOOGLE_REFRESH_TOKEN DO GOOGLE CONTATOS.
 *
 * O refresh token e a unica das tres variaveis do Google que NAO se
 * recupera de lugar nenhum: o Google mostra uma vez, na hora do
 * consentimento, e nunca mais. Perdeu o servidor onde ele estava, e
 * gerar outro — e ate hoje isso era feito a mao, no OAuth Playground,
 * sem ninguem anotar o caminho. Este script E o caminho.
 *
 *   node backend/scripts/google-token.js
 *
 * Precisa de GOOGLE_CLIENT_ID e GOOGLE_CLIENT_SECRET no backend/.env (ou
 * passados na linha: CLIENT_ID=... CLIENT_SECRET=... node ...). Os dois
 * vem do Google Cloud Console > APIs e servicos > Credenciais > o
 * cliente OAuth 2.0 do ERP.
 *
 * O QUE ELE FAZ: sobe um servidor local numa porta alta, imprime o
 * endereco de consentimento, voce abre no navegador LOGADO NA CONTA DO
 * DONO (e nela que os contatos vao aparecer), autoriza, e o Google
 * devolve o codigo para o servidor local — que troca pelo refresh
 * token e imprime a linha pronta para colar no .env e no Discloud.
 *
 * O CLIENTE OAUTH PRECISA ACEITAR O REDIRECIONAMENTO LOCAL. Cliente do
 * tipo "Aplicativo para computador" aceita http://localhost:<porta>
 * sozinho. Cliente do tipo "Aplicativo da Web" precisa ter
 * http://localhost:53682/callback cadastrado em "URIs de
 * redirecionamento autorizados" — o script avisa se o Google recusar.
 *
 * `prompt=consent` e `access_type=offline` nao sao enfeite: sem os
 * dois, o Google devolve so o access token (que morre em uma hora) e
 * nenhum refresh token — o erro classico de quem ja tinha autorizado
 * uma vez e tenta de novo.
 */
const path = require('path');
const http = require('http');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const CLIENT_ID = process.env.CLIENT_ID || process.env.GOOGLE_CLIENT_ID;
const CLIENT_SECRET = process.env.CLIENT_SECRET || process.env.GOOGLE_CLIENT_SECRET;
const PORTA = Number(process.env.GOOGLE_TOKEN_PORT) || 53682;
const REDIRECT = `http://localhost:${PORTA}/callback`;
const ESCOPO = 'https://www.googleapis.com/auth/contacts';

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error('\nFaltam GOOGLE_CLIENT_ID e/ou GOOGLE_CLIENT_SECRET.');
  console.error('Pegue os dois em: Google Cloud Console > APIs e servicos > Credenciais > cliente OAuth 2.0.');
  console.error('Coloque no backend/.env ou rode: CLIENT_ID=... CLIENT_SECRET=... node backend/scripts/google-token.js\n');
  process.exit(1);
}

const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
url.search = new URLSearchParams({
  client_id: CLIENT_ID,
  redirect_uri: REDIRECT,
  response_type: 'code',
  scope: ESCOPO,
  access_type: 'offline',
  prompt: 'consent',
}).toString();

const servidor = http.createServer(async (req, res) => {
  const u = new URL(req.url, `http://localhost:${PORTA}`);
  if (u.pathname !== '/callback') { res.writeHead(404); return res.end(); }

  const erro = u.searchParams.get('error');
  const code = u.searchParams.get('code');
  if (erro || !code) {
    res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(`<h2>O Google recusou: ${erro || 'sem codigo'}</h2><p>Volte ao terminal.</p>`);
    console.error('\nO Google recusou:', erro || 'sem codigo');
    if (erro === 'redirect_uri_mismatch') {
      console.error(`Cadastre ${REDIRECT} em "URIs de redirecionamento autorizados" no cliente OAuth e rode de novo.`);
    }
    return servidor.close(() => process.exit(1));
  }

  try {
    const r = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code, client_id: CLIENT_ID, client_secret: CLIENT_SECRET,
        redirect_uri: REDIRECT, grant_type: 'authorization_code',
      }),
    });
    const j = await r.json();
    if (!r.ok || !j.refresh_token) {
      throw new Error(j.error_description || j.error || 'resposta sem refresh_token');
    }

    // Conferencia: o token abre a agenda de quem autorizou?
    const quem = await fetch('https://people.googleapis.com/v1/people/me?personFields=emailAddresses', {
      headers: { Authorization: `Bearer ${j.access_token}` },
    }).then(x => x.json()).catch(() => null);
    const email = quem?.emailAddresses?.[0]?.value || '(nao consegui ler o e-mail)';

    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end('<h2>Pronto. Pode fechar esta aba e voltar ao terminal.</h2>');

    console.log('\n✔ Token gerado para a conta:', email);
    console.log('\nCole estas tres linhas no backend/.env E nas variaveis do Discloud:\n');
    console.log(`GOOGLE_CLIENT_ID=${CLIENT_ID}`);
    console.log(`GOOGLE_CLIENT_SECRET=${CLIENT_SECRET}`);
    console.log(`GOOGLE_REFRESH_TOKEN=${j.refresh_token}\n`);
    console.log('Guarde num lugar seguro: o Google nao mostra este token de novo.\n');
  } catch (e) {
    res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Falhou: ' + e.message);
    console.error('\nFalhou ao trocar o codigo pelo token:', e.message);
  } finally {
    servidor.close(() => process.exit(0));
  }
});

servidor.listen(PORTA, () => {
  console.log('\n1. Abra este endereco no navegador, LOGADO NA CONTA GOOGLE DO DONO (a que tem os contatos):\n');
  console.log('   ' + url.toString() + '\n');
  console.log('2. Autorize o acesso aos contatos.');
  console.log(`3. O Google vai voltar para ${REDIRECT} — este script esta escutando la.\n`);
  console.log('Aguardando...');
});
