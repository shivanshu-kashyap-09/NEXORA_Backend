const express = require('express');
const router = express.Router();
const inventoryController = require('../controller/inventory.controller');
const {
  adjustInventorySchema,
  reserveInventorySchema,
  inventoryQuerySchema,
} = require('../validation/inventory.validation');
const validateRequest = require('../../../shared/validators/validateRequest');
const authGuard = require('../../../shared/middleware/authGuard');
const rbacGuard = require('../../../shared/middleware/rbacGuard');

// Require authentication for all inventory endpoints
router.use(authGuard);

/**
 * @openapi
 * /inventory/adjust:
 *   post:
 *     summary: Adjust inventory stock level
 *     description: Increase or decrease on-hand stock, configure safety stock, log damaged units, and record immutable audit ledger.
 *     tags:
 *       - Real-Time Inventory & Allocations
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - warehouse_id
 *               - product_id
 *               - quantity_delta
 *               - reason
 *             properties:
 *               warehouse_id:
 *                 type: string
 *                 format: uuid
 *                 example: 1482b250-1be3-4457-a1b7-ebf63c5c5d5b
 *               product_id:
 *                 type: string
 *                 format: uuid
 *                 example: 0d19eb48-e528-4651-85ed-05b200ee8291
 *               quantity_delta:
 *                 type: integer
 *                 example: 100
 *                 description: Positive to add stock, negative to deduct stock
 *               reason:
 *                 type: string
 *                 example: RESTOCK
 *                 description: Reason for stock change (e.g. INITIAL_STOCK, RESTOCK, CYCLE_COUNT, DAMAGE, RETURN)
 *               safety_stock:
 *                 type: integer
 *                 example: 10
 *                 description: Threshold buffer withheld from Available-To-Promise (ATP)
 *               damaged:
 *                 type: integer
 *                 example: 0
 *                 description: Quantity marked unsellable or broken
 *     responses:
 *       201:
 *         description: Stock level adjusted and ledger recorded successfully
 *       400:
 *         description: Validation error
 *       403:
 *         description: Forbidden - requires owner, admin, or warehouse_manager role
 */
router.post(
  '/adjust',
  rbacGuard({ roles: ['owner', 'admin', 'warehouse_manager'] }),
  validateRequest({ body: adjustInventorySchema }),
  inventoryController.adjustStock
);

/**
 * @openapi
 * /inventory:
 *   get:
 *     summary: List inventory levels across fulfillment nodes
 *     description: Query stock levels, reserved units, safety stock, and calculated Available-to-Promise (ATP = on_hand - reserved - safety_stock).
 *     tags:
 *       - Real-Time Inventory & Allocations
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: warehouse_id
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Filter by specific warehouse facility
 *       - in: query
 *         name: product_id
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Filter by specific product
 *       - in: query
 *         name: low_stock
 *         schema:
 *           type: boolean
 *         description: When true, returns items whose ATP is at or below safety stock threshold
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 50
 *     responses:
 *       200:
 *         description: Inventory records retrieved successfully
 *       401:
 *         description: Unauthorized
 */
router.get(
  '/',
  validateRequest({ query: inventoryQuerySchema }),
  inventoryController.listInventory
);

/**
 * @openapi
 * /inventory/reservations/release-expired:
 *   post:
 *     summary: Clean up expired inventory soft holds
 *     description: Sweeper endpoint to release all reservations where expiration timestamp has elapsed and decrement reserved counts.
 *     tags:
 *       - Real-Time Inventory & Allocations
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Expired holds released successfully
 *       403:
 *         description: Forbidden - requires owner or admin role
 */
router.post(
  '/reservations/release-expired',
  rbacGuard({ roles: ['owner', 'admin', 'warehouse_manager'] }),
  inventoryController.releaseExpiredReservations
);

/**
 * @openapi
 * /inventory/reservations/{id}/release:
 *   post:
 *     summary: Release an active soft hold reservation
 *     description: Manually releases a cart hold before expiration, returning reserved units to Available-To-Promise (ATP).
 *     tags:
 *       - Real-Time Inventory & Allocations
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Soft hold reservation UUID
 *     responses:
 *       200:
 *         description: Reservation released successfully
 *       404:
 *         description: Reservation not found
 */
router.post(
  '/reservations/:id/release',
  rbacGuard({ roles: ['owner', 'admin', 'warehouse_manager'] }),
  inventoryController.releaseReservation
);

/**
 * @openapi
 * /inventory/reserve:
 *   post:
 *     summary: Reserve inventory soft hold (15-Minute Cart Lock)
 *     description: Atomically holds inventory for a checkout session using Redis distributed mutex and Postgres row lock to prevent overselling.
 *     tags:
 *       - Real-Time Inventory & Allocations
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - warehouse_id
 *               - product_id
 *               - quantity
 *             properties:
 *               warehouse_id:
 *                 type: string
 *                 format: uuid
 *                 example: 1482b250-1be3-4457-a1b7-ebf63c5c5d5b
 *               product_id:
 *                 type: string
 *                 format: uuid
 *                 example: 0d19eb48-e528-4651-85ed-05b200ee8291
 *               quantity:
 *                 type: integer
 *                 example: 2
 *                 description: Quantity to lock for customer cart
 *               order_id:
 *                 type: string
 *                 format: uuid
 *                 nullable: true
 *               duration_minutes:
 *                 type: integer
 *                 default: 15
 *                 example: 15
 *                 description: Soft hold lifespan before auto-expiration
 *     responses:
 *       201:
 *         description: Soft hold successfully reserved with expiration timestamp
 *       400:
 *         description: Validation error
 *       409:
 *         description: Insufficient stock - requested quantity exceeds ATP
 */
router.post(
  '/reserve',
  validateRequest({ body: reserveInventorySchema }),
  inventoryController.reserveStock
);

/**
 * @openapi
 * /inventory/{productId}:
 *   get:
 *     summary: Get cross-warehouse inventory summary for a product
 *     description: Aggregates total on-hand, total reserved, total safety stock, and total ATP across all tenant warehouse nodes.
 *     tags:
 *       - Real-Time Inventory & Allocations
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: productId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Product UUID
 *     responses:
 *       200:
 *         description: Product inventory summary retrieved successfully
 *       404:
 *         description: Product not found
 */
router.get('/:productId', inventoryController.getProductInventory);

module.exports = router;

