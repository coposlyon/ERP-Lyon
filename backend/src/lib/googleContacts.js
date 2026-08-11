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

// Monta o corpo do contato (nome "0004 Nome de Cadastro", telefones, e-mail, ORG).
// Retorna null se o cliente não tem telefone (contato sem telefone é inútil).
function buildContact(c) {
  const phones = [...new Set([e164(c.phone), e164(c.mobile)].filter(Boolean))];
  if (!phones.length) return null;
  // Código (0013) na frente + nome de cadastro → "0013 Regina Santos de Oliveira"
  const fn = `${c.display_id != null ? code4(c.display_id) + ' ' : ''}${c.name}`;
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
async function upsert(supabase, tenantId, customer, sharedToken) {
  const body = buildContact(customer);
  if (!body) return; // sem telefone

  const token = sharedToken || await getAccessToken();
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

// ── Sincronização em massa (backfill) ────────────────────────────────
//
// O sync acima só dispara quando o cliente é cadastrado/editado — quem
// já estava na base antes da integração nunca foi para o Google. O
// syncAll empurra TODOS os clientes ativos com telefone de uma vez.
//
// É idempotente: antes de criar qualquer coisa, lê os contatos que já
// existem no Google e casa pelo telefone. Assim, contato que veio da
// importação do .vcf é ATUALIZADO e vinculado ao cliente, não duplicado.

const CHUNK = 150;              // limite da People API é 200 por lote
const PAGE  = 1000;             // paginação do Supabase e das connections

// Lê a agenda do Google inteira. Devolve dois índices: por telefone
// (para casar com o cliente) e por resourceName (para pegar o etag, que
// o update exige). Se a leitura falhar, devolve mapas vazios — aí o
// sync cai no caminho de criar.
async function readConnections(token) {
  const byPhone = new Map();
  const byResource = new Map();
  let pageToken;
  do {
    const url = new URL('https://people.googleapis.com/v1/people/me/connections');
    url.searchParams.set('personFields', 'names,phoneNumbers');
    url.searchParams.set('pageSize', String(PAGE));
    if (pageToken) url.searchParams.set('pageToken', pageToken);
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) break;
    const data = await res.json().catch(() => null);
    for (const p of data?.connections || []) {
      if (!p.resourceName) continue;
      byResource.set(p.resourceName, p.etag);
      for (const ph of p.phoneNumbers || []) {
        const k = e164(ph.canonicalForm || ph.value);
        if (k && !byPhone.has(k)) byPhone.set(k, { resourceName: p.resourceName, etag: p.etag });
      }
    }
    pageToken = data?.nextPageToken;
  } while (pageToken);
  return { byPhone, byResource };
}

const chunks = (arr, n) => Array.from({ length: Math.ceil(arr.length / n) }, (_, i) => arr.slice(i * n, i * n + n));

// Grava os resourceName nos clientes (em blocos, pra não abrir 500 conexões).
async function saveResourceNames(supabase, tenantId, pairs) {
  for (const block of chunks(pairs, 25)) {
    await Promise.all(block.map(({ id, resourceName }) =>
      supabase.from('CLIENTES').update({ google_resource_name: resourceName })
        .eq('id', id).eq('tenant_id', tenantId)));
  }
}

async function syncAll(supabase, tenantId) {
  if (!configured()) {
    const err = new Error('Google Contatos não configurado (GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET / GOOGLE_REFRESH_TOKEN)');
    err.code = 'NOT_CONFIGURED';
    throw err;
  }

  // 1. Todos os clientes ativos PF/PJ do tenant (paginado).
  const customers = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase.from('CLIENTES')
      .select('id, name, phone, mobile, email, display_id, google_resource_name')
      .eq('tenant_id', tenantId).in('type', ['PF', 'PJ']).eq('is_active', true)
      .order('display_id', { ascending: true }).range(from, from + PAGE - 1);
    if (error) throw error;
    customers.push(...(data || []));
    if (!data || data.length < PAGE) break;
  }

  const token = await getAccessToken();
  const auth  = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
  const { byPhone, byResource } = await readConnections(token);

  // 2. Decide, cliente a cliente: atualizar, vincular ou criar.
  const toCreate = [];                 // { customer, body }
  const toUpdate = [];                 // { customer, body, resourceName, etag, isLink }
  const errors = [];
  let skipped = 0;

  for (const c of customers) {
    const body = buildContact(c);
    if (!body) { skipped++; continue; }             // sem telefone

    // já vinculado e o contato ainda existe no Google
    if (c.google_resource_name && byResource.has(c.google_resource_name)) {
      toUpdate.push({ customer: c, body, resourceName: c.google_resource_name, etag: byResource.get(c.google_resource_name) });
      continue;
    }

    // não vinculado, mas o telefone já está na agenda (ex.: veio do .vcf)
    const hit = body.phoneNumbers.map(p => byPhone.get(p.value)).find(Boolean);
    if (hit) {
      toUpdate.push({ customer: c, body, resourceName: hit.resourceName, etag: hit.etag, isLink: true });
      continue;
    }

    toCreate.push({ customer: c, body });
  }

  // 3. Atualiza em lote (batchUpdateContacts, até 200 por chamada).
  let updated = 0, linked = 0;
  for (const block of chunks(toUpdate, CHUNK)) {
    const contacts = {};
    for (const it of block) contacts[it.resourceName] = { etag: it.etag, ...it.body };
    try {
      const res = await fetch('https://people.googleapis.com/v1/people:batchUpdateContacts', {
        method: 'POST', headers: auth,
        body: JSON.stringify({ contacts, updateMask: PERSON_FIELDS, readMask: 'names' }),
      });
      if (!res.ok) throw new Error(`batchUpdateContacts: ${res.status} ${(await res.text()).slice(0, 200)}`);
      updated += block.length;
      const links = block.filter(it => it.isLink);
      linked += links.length;
      await saveResourceNames(supabase, tenantId, links.map(it => ({ id: it.customer.id, resourceName: it.resourceName })));
    } catch (e) {
      errors.push(e.message);
    }
  }

  // 4. Cria em lote (batchCreateContacts). O casamento da resposta é
  //    pelo nome, que carrega o código do cliente (#0004) e é único.
  let created = 0;
  for (const block of chunks(toCreate, CHUNK)) {
    try {
      const res = await fetch('https://people.googleapis.com/v1/people:batchCreateContacts', {
        method: 'POST', headers: auth,
        body: JSON.stringify({
          contacts: block.map(it => ({ contactPerson: it.body })),
          readMask: 'names',
        }),
      });
      if (!res.ok) throw new Error(`batchCreateContacts: ${res.status} ${(await res.text()).slice(0, 200)}`);
      const data = await res.json().catch(() => null);
      const people = data?.createdPeople || [];
      const byName = new Map(block.map(it => [it.body.names[0].givenName, it.customer.id]));
      const pairs = [];
      people.forEach((p, i) => {
        const rn = p?.person?.resourceName;
        if (!rn) return;
        const name = p?.person?.names?.[0]?.givenName;
        const id = (name && byName.get(name)) || block[i]?.customer.id;
        if (id) pairs.push({ id, resourceName: rn });
      });
      created += pairs.length;
      await saveResourceNames(supabase, tenantId, pairs);
    } catch (e) {
      errors.push(e.message);
    }
  }

  return { total: customers.length, created, updated, linked, skipped, errors };
}

module.exports = { sync, syncAll, configured };
