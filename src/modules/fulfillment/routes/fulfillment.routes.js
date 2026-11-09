const express = require('express');
const router = express.Router();
const fulfillmentController = require('../controller/fulfillment.controller');
const {
  createFulfillmentSchema,
  updateFulfillmentStatusSchema,
  fulfillmentQuerySchema,
} = require('../validation/fulfillment.validation');
const validateRequest = require('../../../shared/validators/validateRequest');
const authGuard = require('../../../shared/middleware/authGuard');
const rbacGuard = require('../../../shared/middleware/rbacGuard');

// Require authentication for all fulfillment endpoints
router.use(authGuard);

/**
 * @openapi
 * /fulfillments:
 *   post:
 *     summary: Create warehouse fulfillment wave allocation
 *     description: Assigns order line items to a specific warehouse facility for picking, packing, and dispatch.
 *     tags:
 *       - Fulfillment & 3PL Logistics
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - order_id
 *               - warehouse_id
 *               - items
 *             properties:
 *               order_id:
 *                 type: string
 *                 format: uuid
 *               warehouse_id:
 *                 type: string
 *                 format: uuid
 *               items:
 *                 type: array
 *                 items:
 *                   type: object
 *                   required:
 *                     - order_item_id
 *                     - quantity
 *                   properties:
 *                     order_item_id:
 *                       type: string
 *                       format: uuid
 *                     quantity:
 *                       type: integer
 *                       example: 2
 *     responses:
 *       201:
 *         description: Fulfillment order allocated successfully
 *       400:
 *         description: Validation error
 *       403:
 *         description: Forbidden
 */
router.post(
  '/',
  rbacGuard({ roles: ['owner', 'admin', 'warehouse_manager', 'order_operator'] }),
  validateRequest({ body: createFulfillmentSchema }),
  fulfillmentController.createFulfillment
);

/**
 * @openapi
 * /fulfillments:
 *   get:
 *     summary: List fulfillment allocations
 *     description: Retrieve fulfillments filtered by order, warehouse node, or status.
 *     tags:
 *       - Fulfillment & 3PL Logistics
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: order_id
 *         schema:
 *           type: string
 *           format: uuid
 *       - in: query
 *         name: warehouse_id
 *         schema:
 *           type: string
 *           format: uuid
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [PENDING, ALLOCATED, PICKING, PACKED, SHIPPED, CANCELLED]
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 20
 *     responses:
 *       200:
 *         description: Fulfillments retrieved successfully
 */
router.get(
  '/',
  validateRequest({ query: fulfillmentQuerySchema }),
  fulfillmentController.listFulfillments
);

/**
 * @openapi
 * /fulfillments/{id}:
 *   get:
 *     summary: Get fulfillment details with items and shipments
 *     description: Retrieve fulfillment order status, allocated warehouse, item picklist, and carrier shipments.
 *     tags:
 *       - Fulfillment & 3PL Logistics
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Fulfillment UUID
 *     responses:
 *       200:
 *         description: Fulfillment details retrieved successfully
 *       404:
 *         description: Fulfillment not found
 */
router.get('/:id', fulfillmentController.getFulfillment);

/**
 * @openapi
 * /fulfillments/{id}/status:
 *   patch:
 *     summary: Update fulfillment status
 *     description: Advance fulfillment status (ALLOCATED -> PICKING -> PACKED -> SHIPPED). Automatically syncs parent order status.
 *     tags:
 *       - Fulfillment & 3PL Logistics
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Fulfillment UUID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - status
 *             properties:
 *               status:
 *                 type: string
 *                 enum: [ALLOCATED, PICKING, PACKED, SHIPPED, CANCELLED]
 *                 example: PACKED
 *     responses:
 *       200:
 *         description: Fulfillment status updated successfully
 *       400:
 *         description: Invalid status transition
 *       404:
 *         description: Fulfillment not found
 */
router.patch(
  '/:id/status',
  rbacGuard({ roles: ['owner', 'admin', 'warehouse_manager'] }),
  validateRequest({ body: updateFulfillmentStatusSchema }),
  fulfillmentController.updateFulfillmentStatus
);

module.exports = router;

