const express = require('express');
const router = express.Router();

const { authMiddleware } = require('../middleware/auth');
const { tenantMiddleware } = require('../middleware/tenant');

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
const returnsRoutes         = require('./returns');
const qualityRoutes         = require('./quality');
const crmRoutes             = require('./crm');
const hrRoutes              = require('./hr');

router.use('/auth', authRoutes);
router.use('/cnpj', cnpjRoutes);   // público — sem auth
router.use('/cep',  cepRoutes);    // público — sem auth

router.use(authMiddleware);
router.use(tenantMiddleware);

router.use('/dashboard', dashboardRoutes);
router.use('/products', productsRoutes);
router.use('/customers', customersRoutes);
router.use('/suppliers', suppliersRoutes);
router.use('/sales', salesRoutes);
router.use('/purchases', purchasesRoutes);
router.use('/stock', stockRoutes);
router.use('/financial', financialRoutes);
router.use('/fiscal', fiscalRoutes);
router.use('/reports', reportsRoutes);
router.use('/settings', settingsRoutes);
router.use('/quotes', quotesRoutes);
router.use('/customizations', customizationsRoutes);
router.use('/price-tables', priceTablesRoutes);
router.use('/financial-config', financialConfigRoutes);
router.use('/logistics',       logisticsRoutes);
router.use('/returns',         returnsRoutes);
router.use('/quality',         qualityRoutes);
router.use('/crm',             crmRoutes);
router.use('/hr',              hrRoutes);

module.exports = router;
