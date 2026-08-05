// Fila de aprovação dos cadastros vindos dos links públicos.
//
// Quando o CPF/CNPJ informado no link público JÁ tem cadastro, nada é
// alterado direto: os dados propostos e os documentos anexados entram em
// CADASTRO_SOLICITACOES com status "pendente" e um administrador aprova ou
// rejeita dentro do sistema (migration 062).
//
// Regra de ouro: o link público não devolve NENHUM dado do cadastro
// existente — quem solicita envia às cegas. Por isso o diff (`changes`) é
// calculado aqui no servidor e só o administrador o enxerga.

const supabase = require('../config/supabase');

// ── Mapa das entidades ────────────────────────────────────
// docField: coluna do documento na tabela
// fields:   [chave do payload, rótulo] — a ordem vale para a tela do admin
const ENTIDADES = {
  cliente: {
    table: 'FALLBACK', // definido abaixo (evita repetir string)
    label: 'Cliente',
    docField: 'cpf_cnpj',
    fields: [
      ['type', 'Tipo'],
      ['name', 'Nome / Razão Social'],
      ['cpf_cnpj', 'CPF / CNPJ'],
      ['rg_ie', 'RG / IE'],
      ['birth_date', 'Data de nascimento'],
      ['email', 'E-mail'],
      ['phone', 'Telefone'],
      ['mobile', 'Telefone p/ recado'],
      ['instagram', 'Instagram'],
    ],
  },
  fornecedor: {
    label: 'Fornecedor',
    docField: 'cnpj',
    fields: [
      ['name', 'Razão Social'],
      ['cnpj', 'CNPJ'],
      ['ie', 'Inscrição Estadual'],
      ['contact_name', 'Contato / Vendedor(a)'],
      ['email', 'E-mail'],
      ['phone', 'Telefone'],
    ],
  },
  transportadora: {
    label: 'Transportadora',
    docField: 'cnpj',
    fields: [
      ['name', 'Razão Social'],
      ['trade_name', 'Nome Fantasia'],
      ['cnpj', 'CNPJ'],
      ['ie', 'Inscrição Estadual'],
      ['contact_name', 'Contato'],
      ['email', 'E-mail'],
      ['phone', 'Telefone'],
      ['whatsapp', 'WhatsApp'],
    ],
  },
};
ENTIDADES.cliente.table = 'CLIENTES';
ENTIDADES.fornecedor.table = 'FORNECEDORES';
ENTIDADES.transportadora.table = 'TRANSPORTADORAS';

const ADDR_FIELDS = [
  ['zip', 'CEP'], ['street', 'Rua'], ['number', 'Número'], ['complement', 'Complemento'],
  ['neighborhood', 'Bairro'], ['city', 'Cidade'], ['state', 'Estado'],
  ['nome_fantasia', 'Nome Fantasia'], ['mobile', 'Telefone comercial'], ['instagram', 'Instagram'],
];

function soDigitos(s) { return String(s || '').replace(/\D/g, ''); }

// Normaliza p/ comparação: null/undefined viram '', datas ficam só AAAA-MM-DD
function norm(v) {
  if (v == null) return '';
  if (typeof v === 'object') return JSON.stringify(v);
  const s = String(v).trim();
  return /^\d{4}-\d{2}-\d{2}T/.test(s) ? s.slice(0, 10) : s;
}

/**
 * Diff entre o cadastro atual e o payload proposto.
 * Só entram no resultado os campos realmente presentes no payload —
 * campo ausente significa "não mexer", não "apagar".
 */
function calcularMudancas(entity, atual, payload) {
  const cfg = ENTIDADES[entity];
  if (!cfg) return [];
  const changes = [];
  for (const [key, label] of cfg.fields) {
    if (payload[key] === undefined) continue;
    const from = norm(atual?.[key]);
    const to = norm(payload[key]);
    if (from !== to) changes.push({ field: key, label, from, to });
  }
  const addrAtual = (atual && typeof atual.address === 'object' && atual.address) || {};
  const addrNovo = (payload && typeof payload.address === 'object' && payload.address) || null;
  if (addrNovo) {
    for (const [key, label] of ADDR_FIELDS) {
      if (addrNovo[key] === undefined) continue;
      const from = norm(addrAtual[key]);
      const to = norm(addrNovo[key]);
      if (from !== to) changes.push({ field: `address.${key}`, label, from, to });
    }
  }
  return changes;
}

/**
 * Localiza o cadastro existente pelo documento (só dígitos).
 * Usa a coluna doc_digits quando existe (migration 015); senão compara na mão.
 */
async function acharPorDocumento(entity, tenantId, docDigits) {
  const cfg = ENTIDADES[entity];
  if (!cfg || !docDigits) return null;
  if (entity === 'cliente') {
    const { data, error } = await supabase.from(cfg.table).select('*')
      .eq('tenant_id', tenantId).eq('doc_digits', docDigits).limit(1).maybeSingle();
    if (!error) return data || null;
  }
  const { data: todos } = await supabase.from(cfg.table).select('*')
    .eq('tenant_id', tenantId).limit(5000);
  return (todos || []).find(r => soDigitos(r[cfg.docField]) === docDigits) || null;
}

/**
 * Cria a solicitação e sobe os documentos anexados.
 * `files` = [{ kind, file }] com `file` no formato do multer.
 * Se o upload falhar, a solicitação é removida — não fica pedido
 * prometendo documento que não subiu.
 */
async function criarSolicitacao({ tenantId, entity, atual, payload, files = [], requestedBy = {}, note }) {
  const cfg = ENTIDADES[entity];
  if (!cfg) throw new Error('Entidade inválida');

  const docDigits = soDigitos(payload[cfg.docField] || atual?.[cfg.docField]);
  const changes = calcularMudancas(entity, atual, payload);

  const { data: sol, error } = await supabase.from('CADASTRO_SOLICITACOES').insert({
    tenant_id: tenantId,
    entity,
    entity_id: atual?.id || null,
    entity_name: atual?.name || payload.name || null,
    doc_digits: docDigits,
    status: 'pendente',
    payload,
    changes,
    attachments: [],
    requested_by: requestedBy,
    note: String(note || '').trim() || null,
  }).select('*').single();
  if (error) throw error;

  const validos = files.filter(f => f && f.file);
  if (!validos.length) return sol;

  try {
    const now = new Date().toISOString();
    const attachments = [];
    for (const [i, { kind, file }] of validos.entries()) {
      const safeName = String(file.originalname || 'documento').replace(/[^a-zA-Z0-9.\-_]/g, '_');
      const filePath = `${tenantId}/solicitacoes/${sol.id}/${Date.now()}_${i}_${kind}_${safeName}`;
      const { error: upErr } = await supabase.storage.from('DOCUMENTOS')
        .upload(filePath, file.buffer, { contentType: file.mimetype, upsert: false });
      if (upErr) throw upErr;
      const { data: { publicUrl } } = supabase.storage.from('DOCUMENTOS').getPublicUrl(filePath);
      attachments.push({
        id: `${Date.now()}_${i}_${kind}`,
        kind, name: file.originalname, url: publicUrl, path: filePath,
        type: file.mimetype, size: file.size, uploaded_at: now,
        uploaded_by: requestedBy,
      });
    }
    const { data: comAnexos } = await supabase.from('CADASTRO_SOLICITACOES')
      .update({ attachments }).eq('id', sol.id).select('*').single();
    return comAnexos || { ...sol, attachments };
  } catch (err) {
    await supabase.from('CADASTRO_SOLICITACOES').delete().eq('id', sol.id);
    throw err;
  }
}

/**
 * Aplica a solicitação no cadastro: grava os dados propostos e junta os
 * documentos anexados aos que o registro já tinha.
 */
async function aplicarSolicitacao(sol) {
  const cfg = ENTIDADES[sol.entity];
  if (!cfg) throw new Error('Entidade inválida');
  if (!sol.entity_id) throw new Error('Solicitação sem cadastro vinculado');

  const { data: atual } = await supabase.from(cfg.table).select('*')
    .eq('id', sol.entity_id).eq('tenant_id', sol.tenant_id).maybeSingle();
  if (!atual) throw new Error('Cadastro não encontrado — pode ter sido excluído');

  const payload = sol.payload || {};
  const update = {};
  for (const [key] of cfg.fields) if (payload[key] !== undefined) update[key] = payload[key];
  if (payload.address && typeof payload.address === 'object') {
    update.address = { ...(atual.address || {}), ...payload.address };
  }
  // admission_data é mesclado: o link público só manda ie_isento/can_publish e
  // não pode apagar o que o administrador ajustou por dentro.
  if (payload.admission_data && typeof payload.admission_data === 'object') {
    update.admission_data = { ...(atual.admission_data || {}), ...payload.admission_data };
  }

  // Documentos aprovados entram no cadastro. Cliente guarda os anexos em
  // admission_data.attachments (formato de /api/customers/:id/attachments);
  // fornecedor e transportadora, em documents (migrations 054/055).
  const anexos = Array.isArray(sol.attachments) ? sol.attachments : [];
  if (anexos.length) {
    if (sol.entity === 'cliente') {
      const ad = { ...(atual.admission_data || {}), ...(update.admission_data || {}) };
      update.admission_data = { ...ad, attachments: [...(ad.attachments || []), ...anexos] };
    } else {
      const docs = (atual.documents && typeof atual.documents === 'object') ? atual.documents : {};
      update.documents = {
        ...docs,
        attachments: [...(docs.attachments || []), ...anexos],
        responsible: { ...(sol.requested_by || {}), at: new Date().toISOString() },
      };
    }
  }

  // Colunas novas (updated_at/birth_date/documents) podem faltar se a migração
  // ainda não rodou. Tenta do mais completo ao mais enxuto em vez de falhar tudo.
  const enxuto = { ...update };
  for (const k of ['birth_date', 'documents']) delete enxuto[k];
  const tentativas = [{ ...update, updated_at: new Date().toISOString() }, update, enxuto];
  let error = null;
  for (const tentativa of tentativas) {
    ({ error } = await supabase.from(cfg.table).update(tentativa)
      .eq('id', sol.entity_id).eq('tenant_id', sol.tenant_id));
    if (!error) return tentativa;
  }
  throw error;
}

// Remove do Storage os documentos de uma solicitação rejeitada
async function apagarAnexos(sol) {
  const paths = (Array.isArray(sol.attachments) ? sol.attachments : []).map(a => a.path).filter(Boolean);
  if (paths.length) {
    try { await supabase.storage.from('DOCUMENTOS').remove(paths); }
    catch (err) { console.error('[cadastroSolicitacoes:apagarAnexos]', err.message || err); }
  }
}

module.exports = {
  ENTIDADES, ADDR_FIELDS, soDigitos,
  calcularMudancas, acharPorDocumento, criarSolicitacao, aplicarSolicitacao, apagarAnexos,
};
