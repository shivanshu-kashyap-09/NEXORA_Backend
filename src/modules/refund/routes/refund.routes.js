const express = require('express');
const router = express.Router();
const refundController = require('../controller/refund.controller');
const {
  createReturnSchema,
  updateRmaStatusSchema,
  inspectReturnSchema,
  returnQuerySchema,
} = require('../validation/refund.validation');
const validateRequest = require('../../../shared/validators/validateRequest');
const authGuard = require('../../../shared/middleware/authGuard');
const rbacGuard = require('../../../shared/middleware/rbacGuard');

// Require authentication for all return endpoints
router.use(authGuard);

/**
 * @openapi
 * /returns:
 *   post:
 *     summary: Ingest a return request (RMA Authorization)
 *     description: Registers a customer return request, generates unique RMA identifier, and creates prepaid reverse logistics label.
 *     tags:
 *       - Reverse Logistics & Returns (RMA)
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
 *               - reason
 *               - items
 *             properties:
 *               order_id:
 *                 type: string
 *                 format: uuid
 *               reason:
 *                 type: string
 *                 example: DEFECTIVE_ITEM
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
 *                       example: 1
 *     responses:
 *       201:
 *         description: RMA return authorized and created successfully
 *       400:
 *         description: Validation error
 */
router.post(
  '/',
  validateRequest({ body: createReturnSchema }),
  refundController.createReturn
);

/**
 * @openapi
 * /returns:
 *   get:
 *     summary: List return authorizations (RMA)
 *     description: Retrieve all returns filtered by order ID, RMA number, or status.
 *     tags:
 *       - Reverse Logistics & Returns (RMA)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: order_id
 *         schema:
 *           type: string
 *           format: uuid
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [REQUESTED, APPROVED, PICKUP_SCHEDULED, IN_TRANSIT, RECEIVED, INSPECTED, REFUNDED, EXCHANGED, REJECTED]
 *       - in: query
 *         name: rma_number
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
 *         description: Returns retrieved successfully
 */
router.get(
  '/',
  validateRequest({ query: returnQuerySchema }),
  refundController.listReturns
);

/**
 * @openapi
 * /returns/{id}:
 *   get:
 *     summary: Get return authorization details
 *     description: Retrieve complete RMA record with reverse tracking, return items, and QA inspection statuses.
 *     tags:
 *       - Reverse Logistics & Returns (RMA)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Return record UUID
 *     responses:
 *       200:
 *         description: Return details retrieved successfully
 *       404:
 *         description: Return not found
 */
router.get('/:id', refundController.getReturn);

/**
 * @openapi
 * /returns/{id}/status:
 *   patch:
 *     summary: Advance RMA status through reverse lifecycle
 *     description: Updates reverse logistics status (APPROVED -> PICKUP_SCHEDULED -> IN_TRANSIT -> RECEIVED).
 *     tags:
 *       - Reverse Logistics & Returns (RMA)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Return record UUID
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
 *                 enum: [APPROVED, PICKUP_SCHEDULED, IN_TRANSIT, RECEIVED, INSPECTED, REFUNDED, EXCHANGED, REJECTED]
 *                 example: RECEIVED
 *               reverse_tracking_number:
 *                 type: string
 *                 example: REV-DEL-994821
 *               reverse_label_url:
 *                 type: string
 *                 format: uri
 *     responses:
 *       200:
 *         description: RMA status updated successfully
 *       400:
 *         description: Invalid status transition
 *       404:
 *         description: Return not found
 */
router.patch(
  '/:id/status',
  rbacGuard({ roles: ['owner', 'admin', 'warehouse_manager', 'order_operator'] }),
  validateRequest({ body: updateRmaStatusSchema }),
  refundController.updateRmaStatus
);

/**
 * @openapi
 * /returns/{id}/inspect:
 *   post:
 *     summary: Warehouse intake QA inspection & automated restocking
 *     description: Quality check intake of returned items. SELLABLE items are automatically credited back to on_hand inventory; DAMAGED_SCRAP items are credited to damaged quarantine ledger.
 *     tags:
 *       - Reverse Logistics & Returns (RMA)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Return record UUID
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
 *                 description: Destination facility receiving returned merchandise
 *               items:
 *                 type: array
 *                 items:
 *                   type: object
 *                   required:
 *                     - return_item_id
 *                     - qa_grade
 *                   properties:
 *                     return_item_id:
 *                       type: string
 *                       format: uuid
 *                     qa_grade:
 *                       type: string
 *                       enum: [SELLABLE, REFURBISHABLE, DAMAGED_SCRAP]
 *                       example: SELLABLE
 *     responses:
 *       200:
 *         description: Return inspected and stock disposition completed
 *       400:
 *         description: Validation error
 *       404:
 *         description: Return not found
 */
router.post(
  '/:id/inspect',
  rbacGuard({ roles: ['owner', 'admin', 'warehouse_manager'] }),
  validateRequest({ body: inspectReturnSchema }),
  refundController.inspectReturn
);

module.exports = router;

