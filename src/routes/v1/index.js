const express = require('express');
const router = express.Router();
const identityModule = require('../../modules/identity');
const tenantModule = require('../../modules/tenant');
const catalogModule = require('../../modules/catalog');
const warehouseModule = require('../../modules/warehouse');
const inventoryModule = require('../../modules/inventory');
const customerModule = require('../../modules/customer');
const channelModule = require('../../modules/channel');
const orderModule = require('../../modules/order');
const paymentModule = require('../../modules/payment');
const fulfillmentModule = require('../../modules/fulfillment');
const shipmentModule = require('../../modules/shipment');
const refundModule = require('../../modules/refund');
const omnichannelModule = require('../../modules/omnichannel');
const promotionModule = require('../../modules/promotion');
const eventModule = require('../../modules/event');
const vendorModule = require('../../modules/vendor');
const backorderModule = require('../../modules/backorder');
const auditModule = require('../../modules/audit');
const reportingModule = require('../../modules/reporting');
const webhookModule = require('../../modules/webhook');

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

// Mount Customer Management Routes (/customers)
router.use('/customers', customerModule.routes);

// Mount Sales Channels & Connectors Routes (/channels)
router.use('/channels', channelModule.routes);

// Mount Order Orchestration Engine Routes (/orders)
router.use('/orders', orderModule.routes);

// Mount Payment Processing, Invoicing & Financial Reconciliation Routes (/payments)
router.use('/payments', paymentModule.routes);

// Mount Warehouse Fulfillment Orders Routes (/fulfillments)
router.use('/fulfillments', fulfillmentModule.routes);

// Mount 3PL Shipments & Tracking Routes (/shipments)
router.use('/shipments', shipmentModule.routes);

// Mount Reverse Logistics, Returns & RMA Routes (/returns)
router.use('/returns', refundModule.routes);

// Mount Omnichannel Retail Fulfillment Routes (/omnichannel)
router.use('/omnichannel', omnichannelModule.routes);

// Mount Advanced Promotions, Discounts & Coupons Routes (/promotions)
router.use('/promotions', promotionModule.routes);

// Mount Transactional Outbox & Event Bus Routes (/events)
router.use('/events', eventModule.routes);

// Mount Vendor Management Routes (/vendors)
router.use('/vendors', vendorModule.vendorRoutes);

// Mount Purchase Orders Routes (/purchase-orders)
router.use('/purchase-orders', vendorModule.poRoutes);

// Mount Pre-Orders, Backorders & Priority Allocation Routes (/backorders)
router.use('/backorders', backorderModule.routes);

// Mount Comprehensive Audit Logging Routes (/audit-logs)
router.use('/audit-logs', auditModule.routes);

// Mount Enterprise Analytics & Financial Reporting Routes (/reports)
router.use('/reports', reportingModule.routes);

// Mount System Webhook Subscriptions & Delivery Hub Routes (/webhooks)
router.use('/webhooks', webhookModule.webhookRoutes);

module.exports = router;
