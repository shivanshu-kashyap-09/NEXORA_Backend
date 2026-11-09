const express = require('express');
const router = express.Router();
const identityModule = require('../../modules/identity');
const tenantModule = require('../../modules/tenant');
const catalogModule = require('../../modules/catalog');
const warehouseModule = require('../../modules/warehouse');
const inventoryModule = require('../../modules/inventory');

// Mount Authentication & Identity Routes
router.use('/auth', identityModule.routes);

// Mount Multi-Tenant & Organization Routes
router.use('/tenants', tenantModule.routes);

// Mount Product Catalog Routes (/categories, /products, /products/bundles, etc.)
router.use('/', catalogModule.routes);

// Mount Warehouse Fulfillment Nodes Routes (/warehouses)
router.use('/warehouses', warehouseModule.routes);

// Mount Real-Time Inventory & Allocations Routes (/inventory)
router.use('/inventory', inventoryModule.routes);

module.exports = router;
