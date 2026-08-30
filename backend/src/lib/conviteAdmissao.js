// ============================================================
// O CONVITE DE ADMISSÃO.
//
// Duas portas usam estas regras e elas precisam concordar: a do RH
// (autenticada, gera e aprova) e a pública (o colaborador preenche, sem
// login). Se cada lado decidisse por conta o que é "ainda válido", um
// link expirado abriria de um lado e fecharia do outro.
//
// O QUE O COLABORADOR PODE MANDAR — e o que ele não pode.
//
// Ele preenche a vida dele: identificação, endereço, contato, cônjuge,
// filhos e a conta onde recebe. NÃO preenche salário, cargo,
// departamento, escala, benefícios, data de admissão nem acesso ao
// sistema. Isso não é desconfiança, é
// competência: quem define quanto alguém ganha é a empresa, e um campo
// de salário num formulário anônimo é um convite para o problema.
//
// A LISTA BRANCA ABAIXO É A FRONTEIRA. Tudo que chega pelo link e não
// está nela é descartado em silêncio. Sem isso, bastaria alguém mandar
// `{"salary": 90000}` no corpo para a proposta chegar ao RH com um
// salário que ninguém ofereceu — e o RH aprova olhando o nome.
// ============================================================

const crypto = require('crypto');
const supabase = require('../config/supabase');

const TABELA = 'RH_CONVITES_ADMISSAO';

// Prazo: quem gera escolhe, dentro do razoável. Menos de uma hora não
// dá tempo de a pessoa achar os documentos; mais de uma semana é um
// link esquecido num WhatsApp.
const HORAS_MIN = 1;
const HORAS_MAX = 168;      // 7 dias
const HORAS_PADRAO = 48;

// O que o colaborador tem direito de declarar sobre si.
// Os nomes SAO os do formulario real (EmployeeFull.jsx, const VAZIO).
// Escrevi esta lista de cabeca na primeira versao e inventei metade
// ('nome_mae', 'banco_agencia', 'cnh_numero'): o colaborador teria
// preenchido campos que o recorte descartaria em silencio, e o RH
// receberia a ficha pela metade sem ninguem entender por que.
const CAMPOS_PERMITIDOS = [
  // identificacao
  'name', 'nome_social', 'cpf_cnpj', 'birth_date', 'rg_ie', 'rg_emissao',
  'nacionalidade', 'estado_civil', 'genero', 'mother_name', 'father_name',
  // documentos que a folha exige
  'pis', 'ctps_numero', 'ctps_serie', 'ctps_uf', 'titulo_eleitor', 'reservista',
  'cnh', 'cnh_categoria',
  // contato
  'email', 'phone', 'mobile', 'whatsapp_notificacoes',
  // conjuge e filhos
  'conjuge_nome', 'conjuge_cpf', 'conjuge_nascimento', 'conjuge_telefone', 'filhos',
  // conta para o deposito do salario. O VALOR e do RH; a CONTA e da pessoa.
  'banco', 'agencia', 'conta', 'tipo_conta', 'pix', 'titular_conta',
];

/** Só o que a lista branca permite, e nada mais. */
function apenasPermitido(dados) {
  const limpo = {};
  if (!dados || typeof dados !== 'object') return limpo;
  for (const k of CAMPOS_PERMITIDOS) {
    if (dados[k] === undefined) continue;
    limpo[k] = dados[k];
  }
  // `address` é objeto e entra com os campos dele conferidos um a um.
  const a = dados.address;
  if (a && typeof a === 'object') {
    limpo.address = {};
    for (const k of ['zip', 'street', 'number', 'complement', 'neighborhood', 'city', 'state']) {
      if (a[k] !== undefined) limpo.address[k] = a[k];
    }
  }
  // Filho é lista de objetos: cada um também passa por recorte.
  if (Array.isArray(dados.filhos)) {
    limpo.filhos = dados.filhos.slice(0, 20).map(f => ({
      nome: f?.nome ?? null,
      nascimento: f?.nascimento ?? null,
      genero: f?.genero ?? null,
      cpf: f?.cpf ?? null,
    }));
  }
  return limpo;
}

/** Endereço aleatório. 32 bytes em base64url = impossível de adivinhar. */
const novoToken = () => crypto.randomBytes(32).toString('base64url');

/**
 * Por que este convite não abre.
 * Devolve null quando está tudo certo — quem chama responde o erro.
 */
function porQueNaoAbre(c) {
  if (!c) return 'Este link não existe. Confira o endereço com quem enviou.';
  if (c.status === 'cancelado') return 'Este link foi cancelado pela empresa.';
  if (c.status === 'aprovado')  return 'Esta ficha já foi enviada e aprovada. Não é preciso preencher de novo.';
  if (c.status === 'enviado')   return 'Esta ficha já foi enviada e está aguardando conferência do RH.';
  if (new Date(c.expires_at) < new Date()) return 'Este link expirou. Peça um novo para o RH.';
  return null;
}

async function porToken(token) {
  if (!token || typeof token !== 'string' || token.length < 20) return null;
  const { data } = await supabase.from(TABELA).select('*').eq('token', token).maybeSingle();
  return data || null;
}

/** Cria o convite e devolve a linha (o caminho público é montado fora). */
async function criar({ tenantId, horas, nome, email, actor = {} }) {
  const h = Math.min(HORAS_MAX, Math.max(HORAS_MIN, Number(horas) || HORAS_PADRAO));
  const expira = new Date(Date.now() + h * 3600 * 1000).toISOString();

  const { data, error } = await supabase.from(TABELA).insert({
    tenant_id: tenantId,
    token: novoToken(),
    expires_at: expira,
    convidado_nome: (nome || '').trim() || null,
    convidado_email: (email || '').trim() || null,
    status: 'aberto',
    created_by: actor.userId || null,
    created_by_name: actor.userName || null,
  }).select('*').single();

  if (error) throw error;
  return { convite: data, horas: h };
}

/**
 * O colaborador enviou a ficha.
 *
 * Não cria colaborador nenhum: só carimba a proposta. Quem transforma
 * isso em gente contratada é o RH, na aprovação.
 */
async function receber(token, dados) {
  const c = await porToken(token);
  const impedimento = porQueNaoAbre(c);
  if (impedimento) return { ok: false, error: impedimento };

  const limpo = apenasPermitido(dados);
  if (!limpo.name || !String(limpo.name).trim()) {
    return { ok: false, error: 'Informe o seu nome completo.' };
  }

  const { error } = await supabase.from(TABELA).update({
    dados: limpo,
    status: 'enviado',
    submitted_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }).eq('id', c.id);

  if (error) return { ok: false, error: 'Não foi possível enviar a ficha agora.' };
  return { ok: true };
}

/**
 * O RH aprovou: agora sim nasce o colaborador.
 *
 * O que vai para as colunas de CLIENTES é o que CLIENTES tem; o resto da
 * ficha vira `admission_data`, exatamente como a tela de admissão grava.
 * Assim o colaborador criado por aqui é indistinguível do criado à mão.
 */
async function aprovar(id, tenantId, actor = {}) {
  const { data: c } = await supabase.from(TABELA).select('*')
    .eq('id', id).eq('tenant_id', tenantId).maybeSingle();
  if (!c) return { ok: false, error: 'Convite não encontrado.' };
  if (c.status !== 'enviado') return { ok: false, error: 'Só dá para aprovar uma ficha que foi enviada.' };

  const d = c.dados || {};
  const adm = { ...d };
  // Estes moram em coluna própria, não em admission_data.
  for (const k of ['name', 'cpf_cnpj', 'rg_ie', 'email', 'phone', 'mobile', 'birth_date', 'address']) delete adm[k];
  adm.origem_cadastro = 'convite';
  adm.convite_id = c.id;

  const { data: novo, error } = await supabase.from('CLIENTES').insert({
    tenant_id: tenantId,
    type: 'CO',
    name: d.name,
    cpf_cnpj: d.cpf_cnpj || null,
    rg_ie: d.rg_ie || null,
    email: d.email || null,
    phone: d.phone || null,
    mobile: d.mobile || null,
    birth_date: d.birth_date || null,
    address: d.address || {},
    admission_data: adm,
    is_active: true,
  }).select('id').single();

  if (error) return { ok: false, error: error.message };

  await supabase.from(TABELA).update({
    status: 'aprovado',
    employee_id: novo.id,
    reviewed_at: new Date().toISOString(),
    reviewed_by: actor.userId || null,
    reviewed_by_name: actor.userName || null,
    updated_at: new Date().toISOString(),
  }).eq('id', c.id);

  return { ok: true, employee_id: novo.id };
}

/**
 * Recusar devolve o link para 'aberto'.
 *
 * O motivo é obrigatório e a pessoa PRECISA poder corrigir: recusar sem
 * reabrir obrigaria o RH a gerar outro link e o colaborador a digitar
 * tudo de novo por causa de um dígito de CPF. Os dados ficam, para ele
 * achar o que estava errado.
 */
async function recusar(id, tenantId, motivo, actor = {}) {
  const texto = String(motivo || '').trim();
  if (!texto) return { ok: false, error: 'Escreva o que precisa ser corrigido — é o que a pessoa vai ler.' };

  const { data: c } = await supabase.from(TABELA).select('id, status, expires_at')
    .eq('id', id).eq('tenant_id', tenantId).maybeSingle();
  if (!c) return { ok: false, error: 'Convite não encontrado.' };
  if (c.status !== 'enviado') return { ok: false, error: 'Só dá para recusar uma ficha que foi enviada.' };

  // Link vencido não adianta reabrir: dá mais 24 horas para a correção.
  const expirou = new Date(c.expires_at) < new Date();
  const patch = {
    status: 'aberto',
    motivo_recusa: texto,
    reviewed_at: new Date().toISOString(),
    reviewed_by: actor.userId || null,
    reviewed_by_name: actor.userName || null,
    updated_at: new Date().toISOString(),
  };
  if (expirou) patch.expires_at = new Date(Date.now() + 24 * 3600 * 1000).toISOString();

  await supabase.from(TABELA).update(patch).eq('id', c.id);
  return { ok: true, prazo_renovado: expirou };
}

module.exports = {
  TABELA, HORAS_MIN, HORAS_MAX, HORAS_PADRAO,
  criar, receber, aprovar, recusar, porToken, porQueNaoAbre, apenasPermitido,
};
