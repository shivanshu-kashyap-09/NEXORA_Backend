const express = require('express');
const router = express.Router();
const orderController = require('../controller/order.controller');
const {
  createOrderSchema,
  transitionOrderStateSchema,
  placeHoldSchema,
  resolveHoldSchema,
  orderQuerySchema,
} = require('../validation/order.validation');
const validateRequest = require('../../../shared/validators/validateRequest');
const authGuard = require('../../../shared/middleware/authGuard');
const rbacGuard = require('../../../shared/middleware/rbacGuard');

// Require authentication for all order endpoints
router.use(authGuard);

/**
 * @openapi
 * /orders:
 *   post:
 *     summary: Ingest a new multi-channel order
 *     description: Ingests an order from a connected storefront or direct API, performs item pricing calculations, and initializes forward-only state machine.
 *     tags:
 *       - Order Orchestration Engine
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - items
 *               - shipping_address
 *               - billing_address
 *             properties:
 *               channel_id:
 *                 type: string
 *                 format: uuid
 *               channel_order_id:
 *                 type: string
 *                 example: "#1001-SHOPIFY"
 *               customer_id:
 *                 type: string
 *                 format: uuid
 *               currency:
 *                 type: string
 *                 default: USD
 *                 example: USD
 *               items:
 *                 type: array
 *                 items:
 *                   type: object
 *                   required:
 *                     - product_id
 *                     - sku
 *                     - title
 *                     - quantity
 *                     - unit_price
 *                   properties:
 *                     product_id:
 *                       type: string
 *                       format: uuid
 *                     sku:
 *                       type: string
 *                       example: HOODIE-BLK-XL
 *                     title:
 *                       type: string
 *                       example: Nexora Heavyweight Hoodie
 *                     quantity:
 *                       type: integer
 *                       example: 2
 *                     unit_price:
 *                       type: number
 *                       example: 79.99
 *                     tax_amount:
 *                       type: number
 *                       example: 16.00
 *                     discount_amount:
 *                       type: number
 *                       example: 5.00
 *               shipping_address:
 *                 type: object
 *                 required:
 *                   - name
 *                   - street
 *                   - city
 *                   - country
 *                   - postal_code
 *                 properties:
 *                   name:
 *                     type: string
 *                     example: Jane Doe
 *                   street:
 *                     type: string
 *                     example: 742 Evergreen Terrace
 *                   city:
 *                     type: string
 *                     example: Springfield
 *                   state:
 *                     type: string
 *                     example: OR
 *                   country:
 *                     type: string
 *                     example: US
 *                   postal_code:
 *                     type: string
 *                     example: "97477"
 *               billing_address:
 *                 type: object
 *                 required:
 *                   - name
 *                   - street
 *                   - city
 *                   - country
 *                   - postal_code
 *                 properties:
 *                   name:
 *                     type: string
 *                     example: Jane Doe
 *                   street:
 *                     type: string
 *                     example: 742 Evergreen Terrace
 *                   city:
 *                     type: string
 *                     example: Springfield
 *                   state:
 *                     type: string
 *                     example: OR
 *                   country:
 *                     type: string
 *                     example: US
 *                   postal_code:
 *                     type: string
 *                     example: "97477"
 *               is_cod:
 *                 type: boolean
 *                 default: false
 *               shipping_total:
 *                 type: number
 *                 default: 0
 *                 example: 9.99
 *               discount_total:
 *                 type: number
 *                 default: 0
 *                 example: 10.00
 *               idempotency_key:
 *                 type: string
 *                 example: "idemp_ord_abc123"
 *     responses:
 *       201:
 *         description: Order ingested successfully
 *       400:
 *         description: Validation error
 */
router.post(
  '/',
  validateRequest({ body: createOrderSchema }),
  orderController.createOrder
);

/**
 * @openapi
 * /orders:
 *   get:
 *     summary: List orders with search and status filters
 *     description: Retrieve a paginated list of orders filtered by status, channel, or customer.
 *     tags:
 *       - Order Orchestration Engine
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [PENDING, CONFIRMED, PROCESSING, READY, FULFILLED, COMPLETED, CANCELLED, ON_HOLD]
 *       - in: query
 *         name: customer_id
 *         schema:
 *           type: string
 *           format: uuid
 *       - in: query
 *         name: channel_id
 *         schema:
 *           type: string
 *           format: uuid
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         description: Matches order_number or channel_order_id
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
 *         description: Orders list retrieved successfully
 *       401:
 *         description: Unauthorized
 */
router.get(
  '/',
  validateRequest({ query: orderQuerySchema }),
  orderController.listOrders
);

/**
 * @openapi
 * /orders/{id}:
 *   get:
 *     summary: Get complete order details
 *     description: Retrieve full order details including line items, state history, channel context, and active holds.
 *     tags:
 *       - Order Orchestration Engine
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Order UUID
 *     responses:
 *       200:
 *         description: Order details retrieved successfully
 *       404:
 *         description: Order not found
 */
router.get('/:id', orderController.getOrder);

/**
 * @openapi
 * /orders/{id}/status:
 *   patch:
 *     summary: Transition order state in Forward-Only FSM
 *     description: Atomically advances or cancels order status following strict state transition rules. Illegal transitions return 400.
 *     tags:
 *       - Order Orchestration Engine
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Order UUID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - status
 *               - reason
 *             properties:
 *               status:
 *                 type: string
 *                 enum: [PENDING, CONFIRMED, PROCESSING, READY, FULFILLED, COMPLETED, CANCELLED, ON_HOLD]
 *                 example: CONFIRMED
 *               reason:
 *                 type: string
 *                 example: "Payment captured successfully via Stripe"
 *     responses:
 *       200:
 *         description: Order status transitioned successfully
 *       400:
 *         description: Invalid state transition
 *       404:
 *         description: Order not found
 */
router.patch(
  '/:id/status',
  rbacGuard({ roles: ['owner', 'admin', 'order_operator', 'warehouse_manager'] }),
  validateRequest({ body: transitionOrderStateSchema }),
  orderController.transitionOrderState
);

/**
 * @openapi
 * /orders/{id}/holds:
 *   post:
 *     summary: Place an order on hold
 *     description: Flags an order as ON_HOLD due to fraud risk, address issue, or manual review. Halts fulfillment until resolved.
 *     tags:
 *       - Order Orchestration Engine
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Order UUID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - reason
 *             properties:
 *               reason:
 *                 type: string
 *                 example: "Fraud alert: Billing address mismatch"
 *     responses:
 *       201:
 *         description: Order placed on hold successfully
 *       404:
 *         description: Order not found
 */
router.post(
  '/:id/holds',
  rbacGuard({ roles: ['owner', 'admin', 'order_operator'] }),
  validateRequest({ body: placeHoldSchema }),
  orderController.placeHold
);

/**
 * @openapi
 * /orders/{id}/holds/{holdId}/resolve:
 *   post:
 *     summary: Resolve an active order hold
 *     description: Clears a specific hold on an order. If all holds are resolved, restores order to target status.
 *     tags:
 *       - Order Orchestration Engine
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Order UUID
 *       - in: path
 *         name: holdId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Hold record UUID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               target_status:
 *                 type: string
 *                 enum: [PENDING, CONFIRMED, PROCESSING, READY, CANCELLED]
 *                 default: CONFIRMED
 *                 example: CONFIRMED
 *               resolution_notes:
 *                 type: string
 *                 example: "Customer verified identification via phone"
 *     responses:
 *       200:
 *         description: Order hold resolved successfully
 *       404:
 *         description: Order or hold not found
 */
router.post(
  '/:id/holds/:holdId/resolve',
  rbacGuard({ roles: ['owner', 'admin', 'order_operator'] }),
  validateRequest({ body: resolveHoldSchema }),
  orderController.resolveHold
);

/**
 * @openapi
 * /orders/{id}/history:
 *   get:
 *     summary: Get complete order state audit trail
 *     description: Retrieve immutable chronological log of all state transitions, reasons, timestamps, and actors.
 *     tags:
 *       - Order Orchestration Engine
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Order UUID
 *     responses:
 *       200:
 *         description: Order state history retrieved successfully
 *       404:
 *         description: Order not found
 */
router.get('/:id/history', orderController.getOrderHistory);

module.exports = router;

