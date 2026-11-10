const express = require('express');
const router = express.Router();
const vendorController = require('../controller/vendor.controller');
const {
  createPoSchema,
  queryPoSchema,
  receivePoSchema,
} = require('../validation/vendor.validation');
const validateRequest = require('../../../shared/validators/validateRequest');
const authGuard = require('../../../shared/middleware/authGuard');
const rbacGuard = require('../../../shared/middleware/rbacGuard');

// Require authentication for all PO endpoints
router.use(authGuard);

/**
 * @openapi
 * /purchase-orders:
 *   post:
 *     summary: Create Purchase Order (PO)
 *     description: Issues a new replenishment or drop-shipping purchase order to an external supplier.
 *     tags:
 *       - Vendor Management & Purchase Orders
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - vendor_id
 *               - total_cost
 *             properties:
 *               vendor_id:
 *                 type: string
 *                 format: uuid
 *               po_number:
 *                 type: string
 *                 example: PO-2026-SUPPLY-001
 *               total_cost:
 *                 type: number
 *                 example: 4500.00
 *               expected_delivery_date:
 *                 type: string
 *                 format: date
 *     responses:
 *       201:
 *         description: Purchase Order created successfully
 *       400:
 *         description: Validation error
 *       404:
 *         description: Vendor not found
 */
router.post(
  '/',
  rbacGuard({ roles: ['owner', 'admin', 'warehouse_manager'] }),
  validateRequest({ body: createPoSchema }),
  vendorController.createPurchaseOrder
);

/**
 * @openapi
 * /purchase-orders:
 *   get:
 *     summary: List Purchase Orders
 *     description: Retrieve all purchase orders filtered by vendor UUID, status, or search query.
 *     tags:
 *       - Vendor Management & Purchase Orders
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: vendor_id
 *         schema:
 *           type: string
 *           format: uuid
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [DRAFT, ISSUED, RECEIVED, CANCELLED]
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
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
 *         description: Purchase Orders retrieved successfully
 */
router.get(
  '/',
  validateRequest({ query: queryPoSchema }),
  vendorController.listPurchaseOrders
);

/**
 * @openapi
 * /purchase-orders/{id}:
 *   get:
 *     summary: Get Purchase Order details
 *     description: Retrieve purchase order record with vendor details.
 *     tags:
 *       - Vendor Management & Purchase Orders
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Purchase Order UUID
 *     responses:
 *       200:
 *         description: Purchase Order details retrieved successfully
 *       404:
 *         description: Purchase Order not found
 */
router.get('/:id', vendorController.getPurchaseOrder);

/**
 * @openapi
 * /purchase-orders/{id}/receive:
 *   post:
 *     summary: Receive Purchase Order goods & automatically restock warehouse inventory
 *     description: Ingests supplier delivery at a designated warehouse facility. All received quantities are automatically credited to on_hand stock and logged in inventory_adjustments.
 *     tags:
 *       - Vendor Management & Purchase Orders
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Purchase Order UUID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - warehouse_id
 *               - items
 *             properties:
 *               warehouse_id:
 *                 type: string
 *                 format: uuid
 *                 description: Receiving warehouse facility
 *               items:
 *                 type: array
 *                 items:
 *                   type: object
 *                   required:
 *                     - product_id
 *                     - quantity_received
 *                   properties:
 *                     product_id:
 *                       type: string
 *                       format: uuid
 *                     quantity_received:
 *                       type: integer
 *                       example: 50
 *     responses:
 *       200:
 *         description: Goods received and warehouse inventory credited
 *       400:
 *         description: PO already received or invalid status
 *       404:
 *         description: PO or warehouse not found
 */
router.post(
  '/:id/receive',
  rbacGuard({ roles: ['owner', 'admin', 'warehouse_manager'] }),
  validateRequest({ body: receivePoSchema }),
  vendorController.receivePurchaseOrder
);

module.exports = router;

