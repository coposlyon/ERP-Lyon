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
//
// CRM, QUALIDADE e MARKETING SAÍRAM DAQUI (e do menu) porque a Lyon não
// usa nenhum dos três. As telas e as tabelas continuam no repositório: o
// que sumiu foi o caminho até elas e a caixinha de permissão. Voltar é
// devolver a linha aqui e a entrada no menu.
//
// PRODUÇÃO SAIU E VOLTOU no mesmo dia (29/08/2026). Vale registrar por
// que a volta importa: `production` não é só a tela de Ordens de
// Produção. As oito fases de fábrica do pedido (vegetal, revelação,
// pintura, borda, produção, qualidade, embalagem e foto —
// lib/fluxoPedido.js) perguntam por ele para saber quem pode avançar a
// etapa. Sem o módulo, ninguém podia ser habilitado nele e essas etapas
// só andavam por gerente e admin. Com ele de volta, a divisão por área
// volta a valer.
const MODULOS = [
  { key: 'dashboard',        label: 'Dashboard',            grupo: 'Geral' },
  { key: 'vendedor',         label: 'Dashboard do Vendedor',   grupo: 'Área do vendedor' },
  { key: 'pedidos-vendedor', label: 'Pedidos (carteira)',   grupo: 'Área do vendedor' },
  { key: 'catalogo',         label: 'Site / Catálogo',      grupo: 'Área do vendedor' },
  { key: 'agenda',           label: 'Agenda',               grupo: 'Comunicação' },
  { key: 'comunicacao',      label: 'Comunicação',          grupo: 'Comunicação' },
  { key: 'sales',            label: 'Pedidos de Venda',     grupo: 'Comercial' },
  { key: 'pdv',              label: 'PDV',                  grupo: 'Comercial' },
  { key: 'quotes',           label: 'Orçamentos',           grupo: 'Comercial' },
  { key: 'customizations',   label: 'Personalizações',      grupo: 'Comercial' },
  { key: 'price-tables',     label: 'Tabelas de Preço',     grupo: 'Comercial' },
  { key: 'products',         label: 'Produtos',             grupo: 'Cadastros' },
  { key: 'customers',        label: 'Clientes',             grupo: 'Cadastros' },
  { key: 'suppliers',        label: 'Fornecedores',         grupo: 'Cadastros' },
  { key: 'employees',        label: 'Colaboradores',        grupo: 'Cadastros' },
  { key: 'stock',            label: 'Estoque',              grupo: 'Operação' },
  { key: 'purchases',        label: 'Compras',              grupo: 'Operação' },
  { key: 'production',       label: 'Produção',             grupo: 'Operação' },
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

// Sete módulos que NENHUM item do menu lateral alcança: ou a tela não
// está no menu (PDV, Compras), ou o item existe sem exigir módulo
// (Dashboard), ou pertence ao layout do vendedor, que é um menu à
// parte. Marcar páginas na árvore jamais liberaria estes.
//
// Eles aparecem na tela de Permissões numa seção própria, em vez de
// sumirem: um acesso que existe na API e não aparece em lugar nenhum
// para configurar é um acesso que ninguém revisa.
//
// AGENDA E COMUNICAÇÃO SAÍRAM DESTA LISTA. Elas estavam aqui enquanto
// só existiam dentro do layout do vendedor — um menu à parte, que a
// árvore de telas do ERP não alcança. Agora o módulo Comunicação tem
// dois itens no menu lateral (/comunicacao e /agenda), então marcá-los
// na árvore libera de verdade, e listá-los aqui os mandaria para a
// seção "sem tela" da tela de Permissões, onde ninguém procuraria.
const MODULOS_SEM_TELA = ['dashboard', 'pdv', 'purchases', 'vendedor', 'pedidos-vendedor', 'catalogo'];

// Dois jeitos de o ERP se apresentar. 'erp' é o sistema inteiro; 'vendedor'
// é a área enxuta de cinco itens do layout aprovado.
const LAYOUTS = ['erp', 'vendedor'];

/**
 * O QUE TODO MUNDO TEM, INDEPENDENTE DE SETOR.
 *
 * Comunicação é a sala da empresa: o mural do que aconteceu e os chats
 * dos setores. Um setor sem ela é um setor que ninguém consegue chamar
 * — o estoque não avisa que faltou copo, a produção não pergunta da
 * arte, e a conversa volta para o WhatsApp pessoal, onde nada fica
 * registrado no pedido.
 *
 * Por isso ela deixou de ser uma caixinha a marcar e passou a ser piso:
 * quem esquecer de marcar não tira ninguém da conversa. Continua sendo
 * possível ABRIR mais coisa para um setor; não é possível fechar esta.
 *
 * A tela entra junto pelo mesmo motivo — módulo sem tela liberada é um
 * acesso que existe na API e não aparece no menu.
 */
const MODULOS_DE_TODOS = ['comunicacao'];
const TELAS_DE_TODOS = ['/comunicacao'];

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
/**
 * As TELAS efetivas desta pessoa.
 *
 * Uma pergunta, três respostas possíveis, nesta ordem:
 *
 *   lista própria no usuário  → vale a dela, e só a dela
 *   senão, lista do setor      → herda do setor
 *   nenhuma das duas           → null: sem restrição por tela
 *
 * Herdar é o padrão de propósito. Copiar as telas do setor para dentro
 * de cada pessoa faria o setor virar decoração: mudar o setor depois
 * não mudaria ninguém, e o administrador descobriria isso tarde.
 *
 * Lista VAZIA é escolha, não ausência — por isso a comparação é com
 * Array.isArray e nunca com o valor ser falsy.
 */
function telasEfetivas(userProfile, setor) {
  // A tela da Comunicação entra em qualquer lista — ver MODULOS_DE_TODOS.
  const comAsDeTodos = lista => [...new Set([...lista, ...TELAS_DE_TODOS])];
  if (Array.isArray(userProfile?.allowed_screens)) return comAsDeTodos(userProfile.allowed_screens);
  if (Array.isArray(setor?.screens)) return comAsDeTodos(setor.screens);
  return null;
}

/** O usuário segue o setor ou tem lista própria? A tela precisa saber. */
function herdaDoSetor(userProfile) {
  return !Array.isArray(userProfile?.allowed_screens);
}

function resolverAcesso(userProfile, setor) {
  const telas = telasEfetivas(userProfile, setor);

  if (userProfile?.role === 'admin') {
    return { modules: null, screens: null, layout: 'erp', home: '/', setor: setor?.key || null, setorName: setor?.name || 'Administrador', herda: false };
  }

  const extras = Array.isArray(userProfile?.allowed_modules) ? userProfile.allowed_modules : null;

  if (!setor) {
    // Regra antiga, intocada: null = sem restrição, lista = só a lista.
    // A lista antiga também ganha o piso: quem foi cadastrado com cinco
    // módulos escolhidos a dedo, em 2025, não escolheu ficar fora da
    // conversa da empresa — a Comunicação nem existia.
    const modulesLegado = extras ? [...new Set([...extras, ...MODULOS_DE_TODOS])] : null;
    return { modules: modulesLegado, screens: telas, layout: 'erp', home: '/', setor: null, setorName: null, herda: false };
  }

  const doSetor = Array.isArray(setor.modules) ? setor.modules : [];
  const modules = [...new Set([...doSetor, ...(extras || []), ...MODULOS_DE_TODOS])]
    .filter(m => MODULO_KEYS.has(m));

  // A CASA DE QUEM NÃO PODE VER O DASHBOARD NÃO PODE SER O DASHBOARD.
  //
  // `home` caía em '/' para todo setor sem home_path — inclusive para os
  // que não têm '/' na lista de telas. O item sumia do menu e a pessoa
  // era jogada nele mesmo assim, todo login, porque ninguém tinha
  // perguntado se ela podia. A primeira tela liberada é a resposta certa
  // quando o Dashboard não é uma delas.
  const podeDashboard = !Array.isArray(telas) || telas.includes('/');
  const home = setor.home_path
    || (podeDashboard ? '/' : (telas.find(Boolean) || '/'));

  return {
    modules,
    screens: telas,
    layout: LAYOUTS.includes(setor.layout) ? setor.layout : 'erp',
    home,
    setor: setor.key,
    setorName: setor.name,
    herda: herdaDoSetor(userProfile),
  };
}

/** modules null = sem restrição. */
function podeModulo(acesso, ...modulos) {
  if (!acesso) return false;
  if (acesso.modules == null) return true;
  return modulos.some(m => acesso.modules.includes(m));
}

module.exports = {
  MODULOS, MODULO_KEYS, LAYOUTS, MODULOS_SEM_TELA, MODULOS_DE_TODOS, TELAS_DE_TODOS,
  loadSetor, listSetores, resolverAcesso, podeModulo, tabelaAusente,
  telasEfetivas, herdaDoSetor,
};
