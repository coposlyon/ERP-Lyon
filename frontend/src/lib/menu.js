// ============================================================
// O MENU E O REGISTRO DE TELAS DO ERP.
//
// Esta lista era privada do Sidebar, e isso custava caro: a tela de
// permissões tinha a própria cópia dos módulos, escrita à mão. Duas
// listas para a mesma verdade significam que a tela nova de amanhã
// aparece no menu e some da permissão — e ninguém descobre até alguém
// reclamar que não consegue liberar acesso a ela.
//
// Agora é uma lista só. O menu desenha a partir dela, e TELAS é a mesma
// lista achatada: toda tela que existe no menu pode ser liberada ou
// bloqueada pessoa a pessoa, no cadastro do colaborador.
//
// O QUE PERMISSÃO POR TELA É E O QUE NÃO É. Ela decide o que a pessoa
// VÊ e por onde consegue navegar. O que o servidor entrega continua
// preso ao MÓDULO (a coluna `module` de cada tela): esconder a tela de
// Estoque de quem tem o módulo 'stock' tira o caminho, não o direito.
// Para cortar o direito de verdade, tire o módulo também — as duas
// coisas ficam lado a lado na mesma tela de cadastro.
// ============================================================
import {
  LayoutDashboard, Package, Users, Truck, ShoppingCart,
  ShoppingBag, BarChart3, FileText, Settings,
  Boxes, Wallet, Receipt, ChevronDown, ChevronRight,
  Monitor, ClipboardList, Palette, Tag,
  Building2, Percent, PenLine, Briefcase, X, MapPin,
  RotateCcw, FlaskConical, Target, UserCog,
  Clock, Umbrella, DollarSign, ScrollText, Fingerprint, CalendarDays, Box, LineChart, Factory, ShieldCheck,
  Calculator, PieChart, Home, Landmark, Star, Trophy,
  MessageSquare, LogOut, LayoutGrid, Globe, CloudUpload, UserPlus, UserMinus,
} from 'lucide-react';
import { SITES } from '@/pages/Sites/registro';

export const menuItems = [
  {
    label: 'Dashboard',
    icon: LayoutDashboard,
    path: '/',
    exact: true,
    // sem module: visível para todos
  },

  // --- Módulos com submenu (agrupados) ---
  {
    label: 'Comercial',
    icon: ShoppingCart,
    children: [
      { label: 'Painel do Vendedor', path: '/vendedor', icon: Target, module: 'vendedor' },
      { label: 'Pedidos de Venda', path: '/sales', icon: ShoppingCart, module: 'sales' },
      // ORÇAMENTOS SAIU DAQUI e virou uma aba de Pagamentos da Loja, ao
      // lado de Cancelados. As duas telas respondem a mesma pergunta —
      // "o que ainda não virou pedido?" — e como itens vizinhos no menu
      // obrigavam a escolher entre elas antes de saber qual das duas
      // tinha a resposta. A rota /quotes continua de pé para quem tem o
      // link salvo e para o F6 do Pedido de Venda.
      { label: 'Pagamentos da Loja', path: '/store-payments', icon: Wallet, module: 'sales' },
      // ESTÚDIO 3D e CUPONS DE DESCONTO saíram do menu. Nenhum dos dois
      // entrou na rotina da loja: o estúdio nunca passou de protótipo e
      // desconto quem dá é o vendedor, no pedido. As rotas seguem
      // existindo — o que saiu foi o convite a abri-las todo dia.
      { label: 'Lyon Prime', path: '/lyon-prime', icon: Star, module: 'customers' },
      // A tela onde as METAS sao definidas. Ela existia so como
      // endereco: nenhum item de menu e nenhum botao levavam ate ela, e
      // quem precisasse subir a meta de 15 para 20 mil tinha que saber
      // digitar /vendedor/config de cabeca.
      //
      // Fica no PE do grupo de proposito: e configuracao, nao rotina. O
      // comercial abre Pedidos dez vezes por dia e o Plano de Metas dez
      // vezes por ano — deixa-lo no topo custava um item de leitura em
      // toda vez que alguem procurava o que realmente usa.
      { label: 'Plano de Metas', path: '/vendedor/config', icon: Trophy, adminOnly: true },
    ],
  },
  // PRODUÇÃO VEM LOGO DEPOIS DO COMERCIAL, e não lá embaixo com o
  // Estoque. É a ordem em que o pedido acontece: vende-se, produz-se. Quem
  // trabalha no dia a dia salta de Pedidos de Venda para Ordens de
  // Produção o tempo todo, e cada salto passava por oito grupos de menu.
  //
  // DEVOLUÇÕES vem junto: a devolução é o pedido voltando para a fábrica,
  // e quem trata dela é quem produz.
  {
    label: 'Produção',
    icon: Factory,
    children: [
      { label: 'Ordens de Produção', path: '/production', icon: Factory, module: 'production' },
      { label: 'Devoluções',         path: '/returns',    icon: RotateCcw, module: 'returns' },
    ],
  },

  // MARKETING SAIU DO MENU, pelo mesmo caminho que CRM e Qualidade: a
  // Lyon não vai usar por enquanto, e item de menu que ninguém abre é
  // uma linha que todo mundo lê todo dia para pular.
  //
  // O QUE SAIU foi só o caminho: o item aqui e a caixinha de permissão
  // (lib/setores.js). A tela, a rota /marketing, as rotas do servidor e
  // as tabelas de campanha continuam de pé — as campanhas já publicadas
  // seguem aparecendo para o vendedor montar oferta, que é o único
  // lugar que consome esse dado.
  //
  // PARA VOLTAR: devolva este item e a linha `marketing` em
  // lib/setores.js. Nada mais precisa ser refeito.
  {
    label: 'Cadastros',
    icon: Package,
    children: [
      { label: 'Produtos', path: '/products', icon: Package, module: 'products' },
      { label: 'Clientes', path: '/customers', icon: Users, module: 'customers' },
      { label: 'Aprovações de Cadastro', path: '/cadastro-aprovacoes', icon: ShieldCheck, adminOnly: true },
      { label: 'Fornecedores', path: '/suppliers', icon: Truck, module: 'suppliers' },
      { label: 'Tabelas de Preço', path: '/price-tables', icon: Percent, module: 'price-tables' },
    ],
  },
  {
    label: 'Logística',
    icon: MapPin,
    children: [
      { label: 'Transportadoras', path: '/logistics', icon: Truck, module: 'logistics' },
    ],
  },
  {
    label: 'Financeiro',
    icon: Wallet,
    children: [
      { label: 'Central de Contas', path: '/contas', icon: CalendarDays, module: 'financial' },
      { label: 'Contas a Receber/Pagar', path: '/financial', icon: Wallet, module: 'financial' },
      { label: 'Config. Financeira', path: '/financial-config', icon: Building2, module: 'financial' },
      // Nota fiscal e contabilidade são o mesmo assunto do dinheiro:
      // dois grupos separados obrigavam quem fecha o mês a passear pelo
      // menu inteiro para juntar o que sempre foi uma coisa só.
      { label: 'Fiscal / NF-e', path: '/fiscal', icon: Receipt, module: 'fiscal' },
      { label: 'Contábil / Fiscal', path: '/contabil', icon: Landmark, module: 'financial' },
    ],
  },
  // PREÇO E CUSTO VIRARAM UM GRUPO SÓ.
  //
  // "Precificação" e "Engenharia de Custos" eram dois menus para a
  // mesma conta: a despesa fixa cadastrada num vira o rateio por
  // unidade do outro. Separados, quem ia formar preço não achava de
  // onde saía o rateio, e quem cadastrava despesa não via o efeito.
  //
  // O Simulador de Preço e os Relatórios de Preço saíram: o simulador
  // já mora dentro da própria Formação de Preço, e o relatório é o
  // botão de imprimir a ficha. Dois caminhos para a mesma coisa é o
  // que fazia o menu parecer maior do que o sistema.
  {
    label: 'Engenharia de Custos',
    icon: PieChart,
    children: [
      { label: 'Formação de Preço', path: '/pricing/formacao', icon: Calculator, module: 'financial' },
      { label: 'Análise de Produtos', path: '/pricing', icon: LineChart, module: 'financial', exact: true },
      { label: 'Insumos', path: '/engenharia/insumos', icon: FlaskConical, module: 'financial' },
      { label: 'Despesas Fixas', path: '/rateio/despesas-fixas', icon: Home, module: 'financial' },
      { label: 'Despesas Variáveis', path: '/rateio/despesas-variaveis', icon: Percent, module: 'financial' },
      { label: 'Rateio por Produto', path: '/rateio/produto', icon: Package, module: 'financial' },
      { label: 'Rateio por Pedido', path: '/rateio/pedido', icon: ShoppingCart, module: 'financial' },
      { label: 'Painel de Rentabilidade', path: '/rateio/rentabilidade', icon: LineChart, module: 'financial' },
      { label: 'Simulador de Metas', path: '/rateio/metas', icon: Target, module: 'financial' },
      { label: 'Histórico de Rateios', path: '/rateio/historico', icon: ScrollText, module: 'financial' },
    ],
  },
  {
    label: 'Relatórios',
    icon: BarChart3,
    children: [
      { label: 'Relatórios', path: '/reports', icon: BarChart3, module: 'reports' },
      { label: 'Previsão de Demanda', path: '/forecast', icon: LineChart, module: 'reports' },
    ],
  },
  {
    label: 'Recursos Humanos',
    icon: UserCog,
    children: [
      // Bater o próprio ponto NÃO pede módulo: todo colaborador marca o
      // dele. Por isso este item aparece para qualquer pessoa — e, com
      // ele aqui dentro, o grupo Recursos Humanos também aparece, ainda
      // que com um item só, para quem não é do RH.
      { label: 'Painel RH',           path: '/hr/painel',     icon: LayoutDashboard, module: 'hr' },
      // O cadastro do colaborador estava em Cadastros, ao lado de
      // Produtos e Fornecedores. Quem admite, demite e mexe em salário
      // trabalha aqui — e era daqui que a pessoa tinha que sair toda vez.
      { label: 'Colaboradores',       path: '/employees',     icon: Briefcase,  module: 'employees' },
      { label: 'Estrutura da Empresa', path: '/hr/estrutura', icon: Building2,      module: 'hr' },
      { label: 'Bater Ponto',         path: '/marcacao',      icon: Fingerprint },
      { label: 'Jornada / Ponto',     path: '/hr/ponto',      icon: Clock,      module: 'hr' },
      { label: 'Ocorrências',         path: '/hr/ocorrencias', icon: ShieldCheck, module: 'hr' },
      { label: 'Férias / Afastamentos', path: '/hr/ferias',   icon: Umbrella,   module: 'hr' },
      { label: 'Folha e Benefícios',  path: '/hr/folha',      icon: DollarSign, module: 'hr' },
      { label: 'Documentos',          path: '/hr/documentos', icon: FileText,   module: 'hr' },
      { label: 'eSocial / FGTS',      path: '/hr/esocial',    icon: CloudUpload, module: 'hr' },
      { label: 'Admissões',           path: '/hr/admissoes',  icon: UserPlus,  module: 'hr' },
      { label: 'Desligamentos',       path: '/hr/desligamentos', icon: UserMinus, module: 'hr' },
      { label: 'Conformidade Trab.',  path: '/hr/conformidade', icon: ShieldCheck, module: 'hr' },
    ],
  },

  // PORTAIS SAIU DO MENU (Meu Portal, Portal do Gestor, Portal do
  // Contador). A Lyon não vai usar por enquanto.
  //
  // ATENÇÃO AO QUE ISSO MUDA, porque estes três não eram como os outros:
  // eles não pediam módulo — quem entrava era a PESSOA, liberada uma a
  // uma em Permissões. Sumindo daqui, somem também da árvore de
  // permissões (TELAS nasce desta lista), e as liberações individuais
  // que já existirem deixam de ter onde ser revistas.
  //
  // O QUE NÃO QUEBRA: as rotas /portal/eu, /portal/gestor e
  // /portal/contador continuam de pé, e os avisos do sino que apontam
  // para /portal/gestor (solicitação, justificativa e férias esperando
  // decisão — lib/avisos.js) continuam levando a uma tela que abre. A
  // fila de aprovação do gestor também vive em RH → Férias /
  // Afastamentos, que segue no menu: nenhum pedido fica sem quem decida.
  //
  // PARA VOLTAR: devolva este bloco. As telas nunca saíram do lugar.

  // --- Módulos diretos (sem submenu) ---
  {
    // Compras estava fora do menu: a tela existia, a rota existia, e
    // só se chegava nela digitando o endereço. Fora do menu, ela
    // também ficava fora da tela de permissões — acesso que ninguém
    // consegue revisar. Entra aqui porque compra é o que alimenta o
    // estoque.
    label: 'Estoque',
    icon: Boxes,
    children: [
      { label: 'Estoque',  path: '/stock',     icon: Boxes,        module: 'stock' },
      { label: 'Compras',  path: '/purchases', icon: ShoppingCart, module: 'purchases' },
    ],
  },

  // Sites — um submenu por endereço público. A lista NÃO é escrita aqui:
  // vem do catálogo em pages/Sites/registro.js, o mesmo que desenha o painel.
  // Endereço novo registrado lá aparece no menu sozinho.
  {
    label: 'Sites',
    icon: Globe,
    children: [
      { label: 'Todos os sites', path: '/sites', icon: LayoutGrid, module: ['sites', 'settings'], exact: true },
      ...SITES.map(s => ({ label: s.nome, path: `/sites/${s.key}`, icon: s.icone, module: ['sites', 'settings'] })),
    ],
  },

  // --- Sempre por último ---
  {
    label: 'Configurações',
    icon: Settings,
    children: [
      { label: 'Geral',     path: '/settings', icon: Settings,     module: 'settings' },
      { label: 'Permissões por setor', path: '/permissoes', icon: ShieldCheck, module: 'settings' },
      { label: 'Feriados',  path: '/feriados', icon: CalendarDays, module: 'settings' },
      // O que o cliente vê no catálogo público: famílias, gabaritos da
      // arte, caixa do liso, ocasiões e o banco de artes.
      { label: 'Catálogo',  path: '/catalogo-admin', icon: LayoutGrid, module: 'settings' },
      { label: 'Usuários',  path: '/users',    icon: Users,        adminOnly: true },
      { label: 'Auditoria', path: '/audit',    icon: ScrollText,   adminOnly: true },
    ],
  },
];

export const menuVendedor = [
  { label: 'Dashboard',        sub: 'Acompanhar metas etc.',        path: '/vendedor',          icon: LayoutDashboard, exact: true },
  { label: 'Pedidos de Venda', sub: 'Controle do fluxo dos clientes', path: '/vendedor/pedidos', icon: ClipboardList },
  { label: 'Site / Catálogo',  sub: 'Enviar link para clientes',    path: '/vendedor/catalogo', icon: Box },
  { label: 'Agenda',           sub: 'Anotações e compromissos',     path: '/vendedor/agenda',   icon: CalendarDays },
  { label: 'Comunicação',      sub: 'Mensagens com o gerente',      path: '/vendedor/comunicacao', icon: MessageSquare },
];

// ── O registro de telas ─────────────────────────────────────
// O menu achatado: cada linha é uma tela que alguém pode abrir.
function achatar(itens, grupo = null) {
  const out = [];
  for (const item of itens) {
    if (item.children) { out.push(...achatar(item.children, item.label)); continue; }
    if (!item.path) continue;
    out.push({
      path: item.path,
      label: item.label,
      grupo: grupo || 'Geral',
      module: item.module || null,
      adminOnly: !!item.adminOnly,
      exact: !!item.exact,
    });
  }
  return out;
}

export const TELAS = [
  ...achatar(menuItems),
  // A área do vendedor é um layout à parte, mas as telas dela também
  // se liberam uma a uma.
  ...menuVendedor.map(t => ({
    path: t.path, label: t.label, grupo: 'Área do vendedor',
    module: 'vendedor', adminOnly: false, exact: !!t.exact,
  })),
  { path: '/vendedor/perfil', label: 'Dados do vendedor', grupo: 'Área do vendedor', module: 'vendedor' },
  { path: '/vendedor/config', label: 'Configuração do vendedor', grupo: 'Área do vendedor', module: 'vendedor' },
];

/** As telas agrupadas, na ordem do menu — é assim que a tela de permissões desenha. */
export function telasPorGrupo() {
  const g = new Map();
  for (const t of TELAS) {
    if (!g.has(t.grupo)) g.set(t.grupo, []);
    g.get(t.grupo).push(t);
  }
  return [...g.entries()].map(([grupo, telas]) => ({ grupo, telas }));
}

export const TELA_POR_PATH = Object.fromEntries(TELAS.map(t => [t.path, t]));

/**
 * A pessoa pode abrir esta tela?
 *
 * `screens` é a lista de telas liberadas para ela. `null`/`undefined`
 * significa "nunca foi escolhido nada", e aí vale a regra antiga: o
 * módulo decide sozinho. Lista vazia é escolha — ninguém vê nada.
 */
/**
 * A tela dona deste endereço.
 *
 * /customers/123 e /sales/9/detalhe não estão no menu — são o DETALHE de
 * uma tela que está. Sem esta resolução por prefixo, quem tivesse a
 * lista de telas veria a lista de clientes e levaria um chute na cara ao
 * clicar num cliente.
 */
export function telaDoCaminho(path) {
  if (TELA_POR_PATH[path]) return TELA_POR_PATH[path];
  let achada = null;
  for (const t of TELAS) {
    if (t.path === '/') continue;
    if (path === t.path || path.startsWith(t.path + '/')) {
      if (!achada || t.path.length > achada.path.length) achada = t;
    }
  }
  return achada;
}

export function podeVerTela(path, { isAdmin, hasModule, screens }) {
  if (isAdmin) return true;
  const tela = telaDoCaminho(path);
  if (tela?.adminOnly) return false;
  if (tela?.module && !hasModule(tela.module)) return false;
  if (screens == null) return true;
  // Endereço que não pertence a tela nenhuma do menu (uma rota solta)
  // continua valendo pelo módulo — a lista de telas não é uma lista de
  // rotas, e negar o desconhecido travaria o sistema a cada rota nova.
  if (!tela) return true;
  return screens.includes(tela.path);
}
