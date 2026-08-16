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
router.use('/webhooks', require('./webhooks')); // webhooks externos — sem auth

router.use(authMiddleware);
router.use(tenantMiddleware);

// Dashboard, marcação de ponto e busca global: disponíveis a todo
// usuário logado, sem restrição de módulo.
router.use('/dashboard', dashboardRoutes);
router.use('/me', pontoAppRoutes);
router.use('/search', require('./search'));
router.use('/ai', require('./ai'));

// Rotas usadas por vários módulos aceitam qualquer um deles (basta ter um).
router.use('/products',  requireModules('products','sales','pdv','quotes','purchases','stock','customizations','price-tables','returns'), productsRoutes);
router.use('/customers', requireModules('customers','sales','pdv','quotes','crm','customizations','employees','hr','returns'), customersRoutes);
router.use('/suppliers', requireModules('suppliers','purchases','logistics'), suppliersRoutes);
router.use('/sales',     requireModules('sales','pdv','returns'), salesRoutes);
// Painel do Vendedor — quem vende entra pelo módulo 'vendedor'; gerente
// e admin também chegam pelos módulos comerciais que já têm.
router.use('/vendedor',  requireModules('vendedor','sales','pdv','crm'), require('./vendedor'));
// Fila de pedidos do site aguardando o PIX (vira venda ao confirmar)
router.use('/store-payments', requireModules('sales'), require('./store-payments'));
router.use('/purchases', requireModules('purchases'), purchasesRoutes);
router.use('/stock',     requireModules('stock','purchases'), stockRoutes);
router.use('/financial', requireModules('financial'), financialRoutes);
router.use('/contas',    requireModules('financial'), require('./contas'));
router.use('/pricing',   requireModules('financial','products','settings'), require('./pricing'));
router.use('/rateio',    requireModules('financial','products','settings'), require('./rateio'));
router.use('/insumos',   requireModules('financial','products','settings','production'), require('./insumos'));
router.use('/contabil',  requireModules('financial','fiscal','settings'), require('./contabil'));
router.use('/fiscal',    requireModules('fiscal'), fiscalRoutes);
router.use('/reports',   requireModules('reports'), reportsRoutes);
router.use('/settings',  requireModules('settings'), settingsRoutes);
router.use('/quotes',    requireModules('quotes','sales'), quotesRoutes);
router.use('/customizations', requireModules('customizations','sales'), customizationsRoutes);
router.use('/price-tables',   requireModules('price-tables','sales','pdv'), priceTablesRoutes);
router.use('/coupons',   requireModules('sales','pdv','price-tables','settings'), require('./coupons'));
router.use('/financial-config', requireModules('financial','settings'), financialConfigRoutes);
router.use('/logistics', requireModules('logistics'), logisticsRoutes);
router.use('/shipping',  requireModules('logistics','sales','pdv','settings'), require('./shipping'));
router.use('/returns',   requireModules('returns','sales'), returnsRoutes);
router.use('/quality',   requireModules('quality'), qualityRoutes);
router.use('/crm',       requireModules('crm'), crmRoutes);
router.use('/marketing', requireModules('marketing','crm'), require('./marketing'));
router.use('/production', requireModules('production','quality','stock'), require('./production'));
router.use('/hr',        requireModules('hr'), hrRoutes);
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
