const express = require('express');
const router = express.Router();
const backorderController = require('../controller/backorder.controller');
const {
  enqueueBackorderSchema,
  queryBackorderSchema,
  allocateBackorderSchema,
  updatePrioritySchema,
} = require('../validation/backorder.validation');
const validateRequest = require('../../../shared/validators/validateRequest');
const authGuard = require('../../../shared/middleware/authGuard');
const rbacGuard = require('../../../shared/middleware/rbacGuard');

// Require authentication for all backorder endpoints
router.use(authGuard);

/**
 * @openapi
 * /backorders:
 *   post:
 *     summary: Enqueue order item into backorder queue
 *     description: Places an order with zero inventory into the prioritized backorder fulfillment queue and marks order status as ON_HOLD.
 *     tags:
 *       - Pre-Orders, Backorders & Priority Allocation
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
 *               - product_id
 *               - quantity
 *             properties:
 *               order_id:
 *                 type: string
 *                 format: uuid
 *               product_id:
 *                 type: string
 *                 format: uuid
 *               quantity:
 *                 type: integer
 *                 example: 3
 *               priority:
 *                 type: integer
 *                 example: 1
 *                 description: Priority weight (1 = standard, 2 = expedited, 3+ = VIP)
 *     responses:
 *       201:
 *         description: Order item successfully enqueued to backorder queue
 *       400:
 *         description: Validation error
 *       404:
 *         description: Order not found
 */
router.post(
  '/',
  rbacGuard({ roles: ['owner', 'admin', 'order_operator'] }),
  validateRequest({ body: enqueueBackorderSchema }),
  backorderController.enqueueBackorder
);

/**
 * @openapi
 * /backorders:
 *   get:
 *     summary: List backorders in queue
 *     description: Retrieve all queued backorders sorted by priority descending and FIFO arrival ascending.
 *     tags:
 *       - Pre-Orders, Backorders & Priority Allocation
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: product_id
 *         schema:
 *           type: string
 *           format: uuid
 *       - in: query
 *         name: is_allocated
 *         schema:
 *           type: string
 *           enum: ['true', 'false']
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
 *         description: Backorders retrieved successfully
 */
router.get(
  '/',
  validateRequest({ query: queryBackorderSchema }),
  backorderController.listBackorders
);

/**
 * @openapi
 * /backorders/allocate:
 *   post:
 *     summary: Allocate incoming stock to queued backorders
 *     description: Discharges backorder queues in strict priority/FIFO order against newly arrived inventory, reserves stock, and releases held orders to CONFIRMED.
 *     tags:
 *       - Pre-Orders, Backorders & Priority Allocation
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - product_id
 *               - warehouse_id
 *               - quantity
 *             properties:
 *               product_id:
 *                 type: string
 *                 format: uuid
 *               warehouse_id:
 *                 type: string
 *                 format: uuid
 *               quantity:
 *                 type: integer
 *                 example: 50
 *     responses:
 *       200:
 *         description: Stock allocated and orders released successfully
 *       400:
 *         description: Validation error
 */
router.post(
  '/allocate',
  rbacGuard({ roles: ['owner', 'admin', 'warehouse_manager'] }),
  validateRequest({ body: allocateBackorderSchema }),
  backorderController.allocateStock
);

/**
 * @openapi
 * /backorders/{id}:
 *   get:
 *     summary: Get backorder queue details
 *     description: Inspect backordered order line item, allocation status, and priority weight.
 *     tags:
 *       - Pre-Orders, Backorders & Priority Allocation
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Backorder UUID
 *     responses:
 *       200:
 *         description: Backorder details retrieved successfully
 *       404:
 *         description: Backorder item not found
 */
router.get('/:id', backorderController.getBackorder);

/**
 * @openapi
 * /backorders/{id}/priority:
 *   patch:
 *     summary: Update backorder priority ranking
 *     description: Boost or demote priority level of a queued backorder item.
 *     tags:
 *       - Pre-Orders, Backorders & Priority Allocation
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Backorder UUID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - priority
 *             properties:
 *               priority:
 *                 type: integer
 *                 example: 5
 *     responses:
 *       200:
 *         description: Priority updated successfully
 *       400:
 *         description: Cannot update priority of already allocated item
 *       404:
 *         description: Backorder not found
 */
router.patch(
  '/:id/priority',
  rbacGuard({ roles: ['owner', 'admin'] }),
  validateRequest({ body: updatePrioritySchema }),
  backorderController.updatePriority
);

module.exports = router;

