/**
 * Google Contatos (People API).
 *
 * Quando um cliente é cadastrado/editado, cria ou atualiza o contato no
 * Google Contacts do DONO. Como o celular sincroniza o Google Contacts,
 * o WhatsApp passa a mostrar o nome certo — sem precisar da API do
 * WhatsApp.
 *
 * Autenticação: OAuth 2.0 com refresh token (do próprio dono). Configura
 * por variável de ambiente, igual às outras integrações — sem UI de
 * OAuth. Sem as variáveis, tudo vira no-op (nada quebra).
 *
 *   GOOGLE_CLIENT_ID
 *   GOOGLE_CLIENT_SECRET
 *   GOOGLE_REFRESH_TOKEN   (escopo https://www.googleapis.com/auth/contacts)
 */

function configured() {
  return !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET && process.env.GOOGLE_REFRESH_TOKEN);
}

// Telefone BR → E.164 (+55DDDNUMERO)
function e164(v) {
  let d = String(v || '').replace(/\D/g, '');
  if (!d) return null;
  if (d.length === 10 || d.length === 11) d = '55' + d;
  return '+' + d;
}
const code4 = n => (n == null ? '' : String(n).padStart(4, '0'));

// Access token a partir do refresh token (curto, ~1h; pedimos a cada uso).
async function getAccessToken() {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id:     process.env.GOOGLE_CLIENT_ID,
      client_secret: process.env.GOOGLE_CLIENT_SECRET,
      refresh_token: process.env.GOOGLE_REFRESH_TOKEN,
      grant_type:    'refresh_token',
    }),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok || !data?.access_token) {
    throw new Error(`Google OAuth falhou: ${data?.error_description || data?.error || res.status}`);
  }
  return data.access_token;
}

// Monta o corpo do contato (nome "NOME #0004", telefones, e-mail, ORG).
// Retorna null se o cliente não tem telefone (contato sem telefone é inútil).
function buildContact(c) {
  const phones = [...new Set([e164(c.phone), e164(c.mobile)].filter(Boolean))];
  if (!phones.length) return null;
  const fn = `${c.name}${c.display_id != null ? ` #${code4(c.display_id)}` : ''}`;
  return {
    names:        [{ givenName: fn }],
    phoneNumbers: phones.map(p => ({ value: p })),
    ...(c.email ? { emailAddresses: [{ value: c.email }] } : {}),
    organizations: [{ name: 'Lyon Copos' }],
  };
}

const PERSON_FIELDS = 'names,phoneNumbers,emailAddresses,organizations';

// Cria ou atualiza o contato no Google. Salva o resourceName no cliente
// para, da próxima vez, ATUALIZAR em vez de duplicar.
async function upsert(supabase, tenantId, customer) {
  const body = buildContact(customer);
  if (!body) return; // sem telefone

  const token = await getAccessToken();
  const auth  = { Authorization: `Bearer ${token}` };
  const rn    = customer.google_resource_name;

  // Já tem contato ligado → atualiza (precisa do etag atual).
  if (rn) {
    try {
      const cur = await fetch(`https://people.googleapis.com/v1/${rn}?personFields=metadata`, { headers: auth });
      if (cur.ok) {
        const { etag } = await cur.json();
        const upd = await fetch(
          `https://people.googleapis.com/v1/${rn}:updateContact?updatePersonFields=${PERSON_FIELDS}`,
          { method: 'PATCH', headers: { ...auth, 'Content-Type': 'application/json' }, body: JSON.stringify({ etag, ...body }) },
        );
        if (upd.ok) return;
        // 404 = contato apagado no Google → cai pra criar de novo
      }
    } catch { /* cai pra criar */ }
  }

  // Cria novo e guarda o resourceName.
  const res = await fetch('https://people.googleapis.com/v1/people:createContact', {
    method: 'POST', headers: { ...auth, 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`People API createContact: ${res.status}`);
  const created = await res.json().catch(() => null);
  if (created?.resourceName) {
    await supabase.from('CLIENTES').update({ google_resource_name: created.resourceName })
      .eq('id', customer.id).eq('tenant_id', tenantId);
  }
}

// Fire-and-forget: NUNCA derruba o cadastro do cliente. Só clientes
// (PF/PJ) ativos com telefone viram contato.
function sync(supabase, tenantId, customer) {
  if (!configured() || !customer || !customer.id) return;
  if (customer.is_active === false) return;
  if (customer.type && !['PF', 'PJ'].includes(customer.type)) return;
  upsert(supabase, tenantId, customer).catch(err => {
    console.error('[googleContacts]', err.message);
  });
}

module.exports = { sync, configured };
