const express = require('express');
const router = express.Router();
const reportingController = require('../controller/reporting.controller');
const { dateRangeQuerySchema } = require('../validation/reporting.validation');
const validateRequest = require('../../../shared/validators/validateRequest');
const authGuard = require('../../../shared/middleware/authGuard');
const rbacGuard = require('../../../shared/middleware/rbacGuard');

// Require authentication for all reporting endpoints
router.use(authGuard);

/**
 * @openapi
 * /reports/sales-summary:
 *   get:
 *     summary: Aggregated Sales & Revenue Summary
 *     description: Retrieve enterprise-level financial metrics including gross revenue, discounts, taxes, and Average Order Value (AOV).
 *     tags:
 *       - Enterprise Analytics & Financial Reporting
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: from_date
 *         schema:
 *           type: string
 *           format: date-time
 *       - in: query
 *         name: to_date
 *         schema:
 *           type: string
 *           format: date-time
 *     responses:
 *       200:
 *         description: Sales summary report retrieved successfully
 */
router.get(
  '/sales-summary',
  rbacGuard({ roles: ['owner', 'admin', 'order_operator'] }),
  validateRequest({ query: dateRangeQuerySchema }),
  reportingController.getSalesSummary
);

/**
 * @openapi
 * /reports/inventory-valuation:
 *   get:
 *     summary: Warehouse Inventory Valuation
 *     description: Retrieve total on-hand inventory units and aggregate monetary valuation ($) broken down by warehouse facility.
 *     tags:
 *       - Enterprise Analytics & Financial Reporting
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Inventory valuation report retrieved successfully
 */
router.get(
  '/inventory-valuation',
  rbacGuard({ roles: ['owner', 'admin', 'warehouse_manager'] }),
  reportingController.getInventoryValuation
);

/**
 * @openapi
 * /reports/return-rates:
 *   get:
 *     summary: Return Rates & Defect Reason Breakdown
 *     description: Computes overall return percentage and analyzes post-sale RMA defect reasons.
 *     tags:
 *       - Enterprise Analytics & Financial Reporting
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: from_date
 *         schema:
 *           type: string
 *           format: date-time
 *       - in: query
 *         name: to_date
 *         schema:
 *           type: string
 *           format: date-time
 *     responses:
 *       200:
 *         description: Return rates report retrieved successfully
 */
router.get(
  '/return-rates',
  rbacGuard({ roles: ['owner', 'admin', 'warehouse_manager'] }),
  validateRequest({ query: dateRangeQuerySchema }),
  reportingController.getReturnRates
);

/**
 * @openapi
 * /reports/channel-breakdown:
 *   get:
 *     summary: Sales Channel Performance
 *     description: Compares revenue and volume throughput across sales channels (Shopify, WooCommerce, Amazon, POS).
 *     tags:
 *       - Enterprise Analytics & Financial Reporting
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Channel performance report retrieved successfully
 */
router.get(
  '/channel-breakdown',
  rbacGuard({ roles: ['owner', 'admin'] }),
  reportingController.getChannelBreakdown
);

module.exports = router;
