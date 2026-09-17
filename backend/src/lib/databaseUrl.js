// ============================================================
// O ENDEREÇO DO POSTGRES QUE FUNCIONA NO DISCLOUD.
//
// O Supabase oferece dois endereços para o mesmo banco:
//
//   direto   db.<projeto>.supabase.co:5432         — só IPv6
//   pooler   aws-1-sa-east-1.pooler.supabase.com   — IPv4
//            usuário postgres.<projeto>
//
// O Discloud não tem IPv6. Com o endereço direto na variável, a conexão
// morre em "getaddrinfo ENOTFOUND db.<projeto>.supabase.co" — e com ela
// o backup automático e as migrações da subida, em silêncio. Foi o que
// aconteceu em 17/09/2026: três backups manuais com erro e nenhum
// automático desde 15/09.
//
// Em vez de depender de alguém trocar a variável no painel, a conexão
// converte sozinha o endereço direto para o pooler, com a mesma senha.
// Endereço que já é do pooler (ou de outro servidor) passa intacto.
// ============================================================
const POOLER_HOST = process.env.SUPABASE_POOLER_HOST || 'aws-1-sa-east-1.pooler.supabase.com';

function urlDoBanco(url = process.env.DATABASE_URL) {
  if (!url) return url;
  let u;
  try { u = new URL(url); } catch { return url; }
  const m = u.hostname.match(/^db\.([a-z0-9]+)\.supabase\.co$/i);
  if (!m) return url;
  const projeto = m[1];
  u.hostname = POOLER_HOST;
  u.port = '5432';   // sessão: as migrações usam lock de sessão
  if (!u.username || u.username === 'postgres') u.username = `postgres.${projeto}`;
  return u.toString();
}

module.exports = { urlDoBanco };
