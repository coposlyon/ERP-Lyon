// ============================================================
// Perfis de acesso por setor.
//
// Antes, permissão era uma lista de módulos colada em cada usuário:
// contratar um vendedor significava lembrar de marcar exatamente cinco
// caixinhas, e esquecer uma deixava alguém vendo custo de produto.
// Agora o SETOR carrega o acesso e o usuário aponta para o setor.
//
// A conta dos módulos efetivos:
//
//   admin                       → tudo, sempre
//   sem setor + allowed null    → tudo (usuário legado, regra antiga)
//   sem setor + allowed lista   → só a lista (regra antiga)
//   com setor                   → módulos do setor ∪ extras do usuário
//
// A união com os extras é de propósito: dá para abrir um módulo a mais
// para uma pessoa sem inventar um setor novo para ela sozinha.
// ============================================================
const supabase = require('../config/supabase');

// Todo módulo que existe no ERP. É esta lista que a tela de Configurações
// desenha como colunas da matriz — módulo fora daqui não aparece para
// ninguém marcar, então acrescentar módulo novo começa aqui.
const MODULOS = [
  { key: 'dashboard',        label: 'Dashboard',            grupo: 'Geral' },
  { key: 'vendedor',         label: 'Painel do Vendedor',   grupo: 'Área do vendedor' },
  { key: 'pedidos-vendedor', label: 'Pedidos (carteira)',   grupo: 'Área do vendedor' },
  { key: 'catalogo',         label: 'Site / Catálogo',      grupo: 'Área do vendedor' },
  { key: 'agenda',           label: 'Agenda',               grupo: 'Área do vendedor' },
  { key: 'comunicacao',      label: 'Comunicação',          grupo: 'Área do vendedor' },
  { key: 'sales',            label: 'Pedidos de Venda',     grupo: 'Comercial' },
  { key: 'pdv',              label: 'PDV',                  grupo: 'Comercial' },
  { key: 'quotes',           label: 'Orçamentos',           grupo: 'Comercial' },
  { key: 'customizations',   label: 'Personalizações',      grupo: 'Comercial' },
  { key: 'price-tables',     label: 'Tabelas de Preço',     grupo: 'Comercial' },
  { key: 'crm',              label: 'CRM',                  grupo: 'Comercial' },
  { key: 'marketing',        label: 'Marketing',            grupo: 'Comercial' },
  { key: 'products',         label: 'Produtos',             grupo: 'Cadastros' },
  { key: 'customers',        label: 'Clientes',             grupo: 'Cadastros' },
  { key: 'suppliers',        label: 'Fornecedores',         grupo: 'Cadastros' },
  { key: 'employees',        label: 'Colaboradores',        grupo: 'Cadastros' },
  { key: 'stock',            label: 'Estoque',              grupo: 'Operação' },
  { key: 'purchases',        label: 'Compras',              grupo: 'Operação' },
  { key: 'production',       label: 'Produção',             grupo: 'Operação' },
  { key: 'quality',          label: 'Qualidade',            grupo: 'Operação' },
  { key: 'logistics',        label: 'Logística',            grupo: 'Operação' },
  { key: 'returns',          label: 'Devoluções',           grupo: 'Operação' },
  { key: 'financial',        label: 'Financeiro',           grupo: 'Administrativo' },
  { key: 'fiscal',           label: 'Fiscal / NF-e',        grupo: 'Administrativo' },
  { key: 'reports',          label: 'Relatórios',           grupo: 'Administrativo' },
  { key: 'hr',               label: 'RH',                   grupo: 'Administrativo' },
  { key: 'sites',            label: 'Sites (loja/catálogo)', grupo: 'Administrativo' },
  { key: 'settings',         label: 'Configurações',        grupo: 'Administrativo' },
];

const MODULO_KEYS = new Set(MODULOS.map(m => m.key));

// Dois jeitos de o ERP se apresentar. 'erp' é o sistema inteiro; 'vendedor'
// é a área enxuta de cinco itens do layout aprovado.
const LAYOUTS = ['erp', 'vendedor'];

// Migração 067 pendente ou indisponível: cai na regra antiga em vez de
// derrubar o login de todo mundo.
const tabelaAusente = err =>
  /42P01|PGRST(002|205)|does not exist|schema cache/i.test(`${err?.code || ''} ${err?.message || ''}`);

async function loadSetor(tenantId, key) {
  if (!key) return null;
  try {
    const { data, error } = await supabase
      .from('SETORES_PERFIS').select('*')
      .eq('tenant_id', tenantId).eq('key', key).maybeSingle();
    if (error) { if (tabelaAusente(error)) return null; throw error; }
    return data || null;
  } catch { return null; }
}

async function listSetores(tenantId) {
  try {
    const { data, error } = await supabase
      .from('SETORES_PERFIS').select('*')
      .eq('tenant_id', tenantId).order('sort').order('name');
    if (error) { if (tabelaAusente(error)) return { setores: [], missing: true }; throw error; }
    return { setores: data || [], missing: false };
  } catch (err) {
    if (tabelaAusente(err)) return { setores: [], missing: true };
    throw err;
  }
}

/**
 * Os módulos que este usuário realmente enxerga, mais o layout e a rota
 * inicial. Uma função só, usada pelo middleware e por /auth/me — assim
 * o servidor e a tela nunca discordam sobre quem pode o quê.
 */
function resolverAcesso(userProfile, setor) {
  // Telas liberadas para esta pessoa. `undefined` (coluna ainda não
  // criada) e `null` (ninguém escolheu) valem a mesma coisa: sem
  // restrição por tela. Lista vazia é escolha — não vê nada.
  const telas = Array.isArray(userProfile?.allowed_screens) ? userProfile.allowed_screens : null;

  if (userProfile?.role === 'admin') {
    return { modules: null, screens: null, layout: 'erp', home: '/', setor: setor?.key || null, setorName: setor?.name || 'Administrador' };
  }

  const extras = Array.isArray(userProfile?.allowed_modules) ? userProfile.allowed_modules : null;

  if (!setor) {
    // Regra antiga, intocada: null = sem restrição, lista = só a lista.
    return { modules: extras, screens: telas, layout: 'erp', home: '/', setor: null, setorName: null };
  }

  const doSetor = Array.isArray(setor.modules) ? setor.modules : [];
  const modules = [...new Set([...doSetor, ...(extras || [])])].filter(m => MODULO_KEYS.has(m));

  return {
    modules,
    screens: telas,
    layout: LAYOUTS.includes(setor.layout) ? setor.layout : 'erp',
    home: setor.home_path || '/',
    setor: setor.key,
    setorName: setor.name,
  };
}

/** modules null = sem restrição. */
function podeModulo(acesso, ...modulos) {
  if (!acesso) return false;
  if (acesso.modules == null) return true;
  return modulos.some(m => acesso.modules.includes(m));
}

module.exports = { MODULOS, MODULO_KEYS, LAYOUTS, loadSetor, listSetores, resolverAcesso, podeModulo, tabelaAusente };
