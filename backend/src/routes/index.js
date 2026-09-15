const express = require('express');
const router = express.Router();

const { authMiddleware, requireRole } = require('../middleware/auth');
const { tenantMiddleware } = require('../middleware/tenant');
const { requireModules } = require('../middleware/permissions');

const authRoutes = require('./auth');
const dashboardRoutes = require('./dashboard');
const productsRoutes = require('./products');
const customersRoutes = require('./customers');
const suppliersRoutes = require('./suppliers');
const salesRoutes = require('./sales');
const purchasesRoutes = require('./purchases');
const stockRoutes = require('./stock');
const financialRoutes = require('./financial');
const fiscalRoutes = require('./fiscal');
const reportsRoutes = require('./reports');
const settingsRoutes = require('./settings');
const quotesRoutes = require('./quotes');
const customizationsRoutes = require('./customizations');
const priceTablesRoutes = require('./price-tables');
const financialConfigRoutes = require('./financial-config');
const logisticsRoutes       = require('./logistics');
const cnpjRoutes            = require('./cnpj');
const cepRoutes             = require('./cep');
const publicStoreRoutes     = require('./public-store');
const returnsRoutes         = require('./returns');
const qualityRoutes         = require('./quality');
const crmRoutes             = require('./crm');
const hrRoutes              = require('./hr');
const employeesRoutes       = require('./employees');
const escalasRoutes         = require('./escalas');
const situacoesRoutes       = require('./situacoes');
const feriadosRoutes        = require('./feriados');
const pontoAppRoutes        = require('./ponto-app');
const usersRoutes           = require('./users');
const auditRoutes           = require('./audit');

router.use('/auth', authRoutes);
router.use('/cnpj', cnpjRoutes);   // público — sem auth
router.use('/cep',  cepRoutes);    // público — sem auth
router.use('/public', publicStoreRoutes); // loja pública — sem auth
// Catálogo de produtos personalizados — o link que o vendedor manda
// pro cliente. Público e só de leitura: família, modelo, configuração e
// gabarito da arte saem daqui; carrinho e pagamento continuam em /public,
// que já é o caixa da loja.
router.use('/catalogo', require('./public-catalogo'));
// Acompanhamento do pedido pelo cliente (telas 3A/3B) — sem auth do ERP.
// O acesso é CPF + nº do pedido e o token emitido fica preso àquele
// pedido; a rota não enxerga nada do ERP além do que o cliente comprou.
router.use('/acompanhar', require('./public-pedido'));
router.use('/webhooks', require('./webhooks')); // webhooks externos — sem auth
// A ficha de admissao pelo link. Quem entra e alguem sendo contratado,
// que ainda nao tem conta - a credencial e o token, e ele tem prazo.
router.use('/admissao', require('./public-admissao')); // convite de admissao — sem auth
// Portal do fornecedor: ele responde a reposicao pelo link. A
// credencial e o token do endereco MAIS o CNPJ e o telefone do
// cadastro — link encaminhado sozinho nao mostra nada.
router.use('/fornecedor', require('./public-fornecedor')); // reposicao — sem auth

router.use(authMiddleware);
router.use(tenantMiddleware);

// Dashboard, marcação de ponto e busca global: disponíveis a todo
// usuário logado, sem restrição de módulo.
router.use('/dashboard', dashboardRoutes);
router.use('/me', pontoAppRoutes);
// O sininho. Sem módulo próprio: cada fonte de aviso confere o módulo
// dela lá dentro, e quem não tem estoque não recebe aviso de estoque.
router.use('/avisos', require('./avisos'));
router.use('/search', require('./search'));
router.use('/ai', require('./ai'));
router.use('/hr/convites', require('./hr-convites'));

// Rotas usadas por vários módulos aceitam qualquer um deles (basta ter um).
router.use('/products',  requireModules('products','sales','pdv','quotes','purchases','stock','customizations','price-tables','returns'), productsRoutes);
router.use('/customers', requireModules('customers','sales','pdv','quotes','crm','customizations','employees','hr','returns'), customersRoutes);
router.use('/suppliers', requireModules('suppliers','purchases','logistics'), suppliersRoutes);
router.use('/sales',     requireModules('sales','pdv','returns'), salesRoutes);
// Painel do Vendedor — quem vende entra pelo módulo 'vendedor'; gerente
// e admin também chegam pelos módulos comerciais que já têm.
router.use('/vendedor',  requireModules('vendedor','sales','pdv','crm'), require('./vendedor'));
// Área do vendedor: carteira de pedidos, agenda, comunicação com o
// gerente e o alerta que os outros setores também enxergam.
router.use('/area-vendedor', requireModules('pedidos-vendedor','agenda','comunicacao','vendedor','sales'), require('./area-vendedor'));

// O MÓDULO COMUNICAÇÃO — o mural do que aconteceu, o chat da empresa e
// o calendário. Aberto a quem tem comunicação OU agenda: são as duas
// telas do módulo, e quem tem uma costuma precisar da outra.
router.use('/comunicacao', requireModules('comunicacao', 'agenda'), require('./comunicacao'));
// Permissões por setor — leitura para todo usuário logado (a tela precisa
// saber o próprio layout); escrita só para admin, travada lá dentro.
router.use('/setores', require('./setores'));
// Fila de pedidos do site aguardando o PIX (vira venda ao confirmar)
// PAGAMENTOS DA LOJA MUDOU PARA O GRUPO FINANCEIRO no menu: quem
// confere o PIX no extrato e libera o pedido e o financeiro. Os DOIS
// modulos abrem — tirar 'sales' tiraria a tela de quem ja a usava.
router.use('/store-payments', requireModules('sales', 'financial'), require('./store-payments'));
router.use('/purchases', requireModules('purchases'), purchasesRoutes);
router.use('/stock',     requireModules('stock','purchases'), stockRoutes);
router.use('/financial', requireModules('financial'), financialRoutes);
router.use('/contas',    requireModules('financial'), require('./contas'));
router.use('/pricing',   requireModules('financial','products','settings'), require('./pricing'));
router.use('/rateio',    requireModules('financial','products','settings'), require('./rateio'));
router.use('/insumos',   requireModules('financial','products','settings','production'), require('./insumos'));
// O CADASTRO DE ITENS: canudo, tampa, borda metalizada, tinta,
// embalagem. É onde mora o que a peça leva — e os DOIS valores de cada
// coisa, o que se gasta e o que se cobra. Fica no mesmo recorte de
// insumos porque é a mesma pessoa que mexe nos dois.
router.use('/itens',     requireModules('financial','products','settings','production'), require('./itens'));

// AS LISTAS DO LANÇAMENTO DE PRODUTO — só leitura, e por isso aberta a
// quem vende. O modal do PDV lia bordas em `/itens` e tintas em
// `/settings`, duas rotas de CADASTRO: o setor Vendas levava 403 nas
// duas e os seletores abriam vazios, sem erro na tela. Abrir aquelas
// rotas resolveria e daria de brinde apagar borda e reescrever a
// configuração da empresa. Aqui só se lê as três listas.
router.use('/lancamento', requireModules('sales','pdv','products','settings','financial','production'), require('./lancamento'));
router.use('/contabil',  requireModules('financial','fiscal','settings'), require('./contabil'));
router.use('/contador',  requireModules('financial','fiscal','settings'), require('./contador'));
router.use('/fiscal',    requireModules('fiscal'), fiscalRoutes);
router.use('/reports',   requireModules('reports'), reportsRoutes);
router.use('/settings',  requireModules('settings'), settingsRoutes);
// O cadastro que alimenta o catálogo: famílias, gabaritos, caixa do
// liso, ocasiões e o banco de artes. Quem mexe em produto mexe aqui.
router.use('/catalogo-admin', requireModules('settings','products'), require('./catalogo-admin'));
router.use('/quotes',    requireModules('quotes','sales'), quotesRoutes);
router.use('/customizations', requireModules('customizations','sales'), customizationsRoutes);
router.use('/price-tables',   requireModules('price-tables','sales','pdv'), priceTablesRoutes);
router.use('/coupons',   requireModules('sales','pdv','price-tables','settings'), require('./coupons'));
router.use('/financial-config', requireModules('financial','settings'), financialConfigRoutes);
router.use('/logistics', requireModules('logistics'), logisticsRoutes);
// Caixas, regras de embalagem e simulador do frete (Logística → Caixas e frete).
router.use('/logistica-caixas', requireModules('logistics'), require('./logisticaCaixas'));
// A FILA DA EXPEDICAO. Mora ao lado do cadastro de transportadoras
// porque e a mesma pessoa que abre as duas — mas e outro trabalho:
// quais pedidos estao prontos, quais ja foram avisados, qual espera
// coleta. Vendas tambem entra: e o vendedor que o cliente liga
// perguntando se ja pode buscar.
router.use('/expedicao', requireModules('logistics', 'sales'), require('./expedicao'));
router.use('/shipping',  requireModules('logistics','sales','pdv','settings'), require('./shipping'));
router.use('/returns',   requireModules('returns','sales'), returnsRoutes);
router.use('/quality',   requireModules('quality'), qualityRoutes);
router.use('/crm',       requireModules('crm'), crmRoutes);
router.use('/marketing', requireModules('marketing','crm'), require('./marketing'));
/**
 * UM MOTOR DE ETAPAS, TRES MODULOS.
 *
 * Designer, Producao e Logistica sao a mesma tela lendo fatias diferentes
 * da regua (ver MODULOS_DO_FLUXO em lib/atencao.js). routes/production.js
 * exporta uma FABRICA de router; aqui ela e montada tres vezes, cada uma
 * presa ao seu modulo e a sua permissao.
 *
 *   /production  revelacao ... embalagem   (status 10-23)
 *   /designer    vegetal                   (status 8-9)
 *   /logistica   coleta, transito, entrega (status 24-28)
 */
const criarFilaDeEtapas = require('./production');
router.use('/production', requireModules('production','quality','stock'), criarFilaDeEtapas('producao'));
router.use('/designer',   requireModules('designer','production'),        criarFilaDeEtapas('designer'));
router.use('/logistica',  requireModules('logistics','sales'),            criarFilaDeEtapas('logistica'));
router.use('/hr',        requireModules('hr'), hrRoutes);
// O painel do RH e a estrutura da empresa: leitura agregada, tudo
// calculado do cadastro mestre (migração 080).
router.use('/rh', requireModules('hr'), require('./rh-painel'));
router.use('/rh', requireModules('hr'), require('./rh-ferias'));
router.use('/rh', requireModules('hr'), require('./rh-ponto'));
router.use('/rh', requireModules('hr'), require('./rh-folha'));
router.use('/rh', requireModules('hr'), require('./rh-documentos'));
router.use('/rh', requireModules('hr'), require('./rh-esocial'));
router.use('/rh', requireModules('hr'), require('./rh-ciclo'));
// Os portais NÃO passam por requireModules('hr'): o colaborador vê a
// própria vida, o gestor a própria equipe e o contador só o fiscal.
// O recorte é por quem você é, não por módulo liberado (item 14).
router.use('/portal', require('./rh-portais'));
router.use('/esocial',   requireModules('hr','settings'), require('./esocial'));
router.use('/escalas',   requireModules('hr','employees','settings'), escalasRoutes);
router.use('/situacoes', requireModules('hr','settings'), situacoesRoutes);
router.use('/feriados',  requireModules('hr','settings'), feriadosRoutes);

// Gestão de acessos/usuários e auditoria — somente administradores
router.use('/cadastro-requests', requireRole(['admin']), require('./cadastro-requests'));
router.use('/employees', requireRole(['admin']), employeesRoutes);
router.use('/users',     requireRole(['admin']), usersRoutes);
router.use('/audit',     requireRole(['admin']), auditRoutes);

module.exports = router;
