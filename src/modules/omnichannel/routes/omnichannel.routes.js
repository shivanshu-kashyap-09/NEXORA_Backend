const express = require('express');
const router = express.Router();
const omnichannelController = require('../controller/omnichannel.controller');
const {
  createBopisSchema,
  stageBopisSchema,
  handoverBopisSchema,
  queryBopisSchema,
  borisReturnSchema,
} = require('../validation/omnichannel.validation');
const validateRequest = require('../../../shared/validators/validateRequest');
const authGuard = require('../../../shared/middleware/authGuard');
const rbacGuard = require('../../../shared/middleware/rbacGuard');

// Require authentication for all omnichannel endpoints
router.use(authGuard);

/**
 * @openapi
 * /omnichannel/bopis:
 *   post:
 *     summary: Register BOPIS in-store pickup for an order
 *     description: Ingests a Buy Online, Pick Up In Store (BOPIS) record for a confirmed order, generates a secure 6-digit OTP/PIN, and notifies customer for collection.
 *     tags:
 *       - Omnichannel Retail Fulfillment (BOPIS / BORIS)
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
 *               - store_warehouse_id
 *             properties:
 *               order_id:
 *                 type: string
 *                 format: uuid
 *                 description: Order UUID designated for in-store collection
 *               store_warehouse_id:
 *                 type: string
 *                 format: uuid
 *                 description: Retail store facility UUID where goods will be picked
 *     responses:
 *       201:
 *         description: BOPIS pickup record registered successfully with generated PIN
 *       400:
 *         description: Validation error
 *       404:
 *         description: Order or Store facility not found
 *       409:
 *         description: BOPIS pickup already registered for this order
 */
router.post(
  '/bopis',
  rbacGuard({ roles: ['owner', 'admin', 'warehouse_manager', 'order_operator'] }),
  validateRequest({ body: createBopisSchema }),
  omnichannelController.createBopisPickup
);

/**
 * @openapi
 * /omnichannel/bopis:
 *   get:
 *     summary: List BOPIS in-store pickups
 *     description: Retrieve all store collection orders filtered by store warehouse node, order UUID, or staging status.
 *     tags:
 *       - Omnichannel Retail Fulfillment (BOPIS / BORIS)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: store_warehouse_id
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Filter by store facility UUID
 *       - in: query
 *         name: order_id
 *         schema:
 *           type: string
 *           format: uuid
 *       - in: query
 *         name: is_staged
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
 *         description: BOPIS pickups retrieved successfully
 */
router.get(
  '/bopis',
  validateRequest({ query: queryBopisSchema }),
  omnichannelController.listBopisPickups
);

/**
 * @openapi
 * /omnichannel/bopis/{id}:
 *   get:
 *     summary: Get BOPIS pickup details
 *     description: Retrieve full pickup details including staging status, customer handover info, and store address.
 *     tags:
 *       - Omnichannel Retail Fulfillment (BOPIS / BORIS)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: BOPIS pickup UUID
 *     responses:
 *       200:
 *         description: BOPIS pickup details retrieved successfully
 *       404:
 *         description: Pickup record not found
 */
router.get('/bopis/:id', omnichannelController.getBopisById);

/**
 * @openapi
 * /omnichannel/bopis/{id}/stage:
 *   post:
 *     summary: Mark BOPIS order staged in retail store holding area
 *     description: Store associate has picked items off retail shelves and staged them in the pickup hold area. Order status automatically transitions to READY.
 *     tags:
 *       - Omnichannel Retail Fulfillment (BOPIS / BORIS)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: BOPIS pickup UUID
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               staging_bin:
 *                 type: string
 *                 example: BIN-A-12
 *               notes:
 *                 type: string
 *                 example: Staged behind customer service counter
 *     responses:
 *       200:
 *         description: Pickup marked as staged, order status advanced to READY
 *       400:
 *         description: Invalid transition or already picked up
 *       404:
 *         description: Pickup not found
 */
router.post(
  '/bopis/:id/stage',
  rbacGuard({ roles: ['owner', 'admin', 'warehouse_manager', 'order_operator'] }),
  validateRequest({ body: stageBopisSchema }),
  omnichannelController.stageBopisPickup
);

/**
 * @openapi
 * /omnichannel/bopis/{id}/handover:
 *   post:
 *     summary: Secure customer handover & PIN verification
 *     description: Validates customer's 6-digit OTP/PIN, records customer receipt, and marks order as COMPLETED.
 *     tags:
 *       - Omnichannel Retail Fulfillment (BOPIS / BORIS)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: BOPIS pickup UUID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - pin
 *               - picked_up_by_name
 *             properties:
 *               pin:
 *                 type: string
 *                 example: "583921"
 *                 description: 6-digit verification PIN provided to customer
 *               picked_up_by_name:
 *                 type: string
 *                 example: Sarah Connor
 *                 description: Customer or designated proxy collector name
 *     responses:
 *       200:
 *         description: PIN verified and package handed over. Order status is now COMPLETED.
 *       400:
 *         description: Invalid PIN or order not yet staged
 *       404:
 *         description: Pickup not found
 *       409:
 *         description: Order already picked up
 */
router.post(
  '/bopis/:id/handover',
  rbacGuard({ roles: ['owner', 'admin', 'warehouse_manager', 'order_operator'] }),
  validateRequest({ body: handoverBopisSchema }),
  omnichannelController.completeBopisHandover
);

/**
 * @openapi
 * /omnichannel/boris:
 *   post:
 *     summary: Buy Online, Return In Store (BORIS counter return & instant restock)
 *     description: In-store return desk capability allowing customers to return online purchases at physical retail counters with instant QA inspection, localized restock, and payment refund.
 *     tags:
 *       - Omnichannel Retail Fulfillment (BOPIS / BORIS)
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
 *               - store_warehouse_id
 *               - reason
 *               - items
 *             properties:
 *               order_id:
 *                 type: string
 *                 format: uuid
 *               store_warehouse_id:
 *                 type: string
 *                 format: uuid
 *                 description: Physical retail store receiving the return
 *               reason:
 *                 type: string
 *                 example: WRONG_SIZE
 *               customer_name:
 *                 type: string
 *                 example: Sarah Connor
 *               refund_method:
 *                 type: string
 *                 enum: [ORIGINAL_PAYMENT, STORE_CREDIT, CASH]
 *                 default: ORIGINAL_PAYMENT
 *               items:
 *                 type: array
 *                 items:
 *                   type: object
 *                   required:
 *                     - order_item_id
 *                     - quantity
 *                     - qa_grade
 *                   properties:
 *                     order_item_id:
 *                       type: string
 *                       format: uuid
 *                     quantity:
 *                       type: integer
 *                       example: 1
 *                     qa_grade:
 *                       type: string
 *                       enum: [SELLABLE, REFURBISHABLE, DAMAGED_SCRAP]
 *                       example: SELLABLE
 *     responses:
 *       201:
 *         description: In-store return processed, items restocked to store inventory, and refund logged
 *       400:
 *         description: Validation error
 *       404:
 *         description: Order or line items not found
 */
router.post(
  '/boris',
  rbacGuard({ roles: ['owner', 'admin', 'warehouse_manager', 'order_operator'] }),
  validateRequest({ body: borisReturnSchema }),
  omnichannelController.processBorisReturn
);

module.exports = router;
