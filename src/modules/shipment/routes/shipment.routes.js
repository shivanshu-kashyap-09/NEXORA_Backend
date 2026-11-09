const express = require('express');
const router = express.Router();
const shipmentController = require('../controller/shipment.controller');
const {
  createShipmentSchema,
  addTrackingEventSchema,
  updateShipmentStatusSchema,
  shipmentQuerySchema,
} = require('../validation/shipment.validation');
const validateRequest = require('../../../shared/validators/validateRequest');
const authGuard = require('../../../shared/middleware/authGuard');
const rbacGuard = require('../../../shared/middleware/rbacGuard');

// Require authentication for all shipment endpoints
router.use(authGuard);

/**
 * @openapi
 * /shipments:
 *   post:
 *     summary: Create 3PL carrier shipment manifest
 *     description: Generates carrier tracking details (FedEx, DHL, Delhivery) for an allocated fulfillment order and marks order FULFILLED.
 *     tags:
 *       - Shipments & Carrier Logistics
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - fulfillment_id
 *               - carrier
 *             properties:
 *               fulfillment_id:
 *                 type: string
 *                 format: uuid
 *               carrier:
 *                 type: string
 *                 example: FedEx
 *               service_tier:
 *                 type: string
 *                 example: Priority Overnight
 *               tracking_number:
 *                 type: string
 *                 example: 794612348900
 *                 description: Optional. If omitted, NEXORA auto-generates a tracking number.
 *               tracking_url:
 *                 type: string
 *                 format: uri
 *                 example: https://www.fedex.com/fedextrack/?trknbr=794612348900
 *               shipping_label_url:
 *                 type: string
 *                 format: uri
 *                 example: https://cdn.nexora.io/labels/fedex_label_794612348900.pdf
 *     responses:
 *       201:
 *         description: Shipment created and dispatched successfully
 *       400:
 *         description: Validation error
 *       403:
 *         description: Forbidden
 */
router.post(
  '/',
  rbacGuard({ roles: ['owner', 'admin', 'warehouse_manager'] }),
  validateRequest({ body: createShipmentSchema }),
  shipmentController.createShipment
);

/**
 * @openapi
 * /shipments:
 *   get:
 *     summary: List shipments with carrier and status filters
 *     description: Retrieve all carrier shipments filtered by tracking number, carrier, or status.
 *     tags:
 *       - Shipments & Carrier Logistics
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: carrier
 *         schema:
 *           type: string
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [CREATED, PACKED, SHIPPED, IN_TRANSIT, OUT_FOR_DELIVERY, DELIVERED, FAILED, RTO, CANCELLED]
 *       - in: query
 *         name: tracking_number
 *         schema:
 *           type: string
 *       - in: query
 *         name: fulfillment_id
 *         schema:
 *           type: string
 *           format: uuid
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
 *         description: Shipments retrieved successfully
 */
router.get(
  '/',
  validateRequest({ query: shipmentQuerySchema }),
  shipmentController.listShipments
);

/**
 * @openapi
 * /shipments/{id}:
 *   get:
 *     summary: Get shipment details with live tracking checkpoints
 *     description: Retrieve carrier details, tracking history, and current delivery milestone.
 *     tags:
 *       - Shipments & Carrier Logistics
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Shipment UUID
 *     responses:
 *       200:
 *         description: Shipment details retrieved successfully
 *       404:
 *         description: Shipment not found
 */
router.get('/:id', shipmentController.getShipment);

/**
 * @openapi
 * /shipments/{id}/status:
 *   patch:
 *     summary: Update shipment status
 *     description: Update delivery status. Advancing to DELIVERED automatically sets delivered_at timestamp and marks parent order COMPLETED.
 *     tags:
 *       - Shipments & Carrier Logistics
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Shipment UUID
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
 *                 enum: [CREATED, PACKED, SHIPPED, IN_TRANSIT, OUT_FOR_DELIVERY, DELIVERED, FAILED, RTO, CANCELLED]
 *                 example: DELIVERED
 *     responses:
 *       200:
 *         description: Shipment status updated successfully
 *       404:
 *         description: Shipment not found
 */
router.patch(
  '/:id/status',
  rbacGuard({ roles: ['owner', 'admin', 'warehouse_manager'] }),
  validateRequest({ body: updateShipmentStatusSchema }),
  shipmentController.updateShipmentStatus
);

/**
 * @openapi
 * /shipments/{id}/events:
 *   post:
 *     summary: Ingest carrier tracking milestone event
 *     description: Ingests 3PL carrier webhook checkpoint (e.g. IN_TRANSIT, OUT_FOR_DELIVERY, DELIVERED). When DELIVERED is received, order is marked COMPLETED.
 *     tags:
 *       - Shipments & Carrier Logistics
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Shipment UUID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - checkpoint_status
 *             properties:
 *               checkpoint_status:
 *                 type: string
 *                 example: DELIVERED
 *               location:
 *                 type: string
 *                 example: "Austin Hub Facility, TX"
 *               event_timestamp:
 *                 type: string
 *                 format: date-time
 *               raw_payload:
 *                 type: object
 *     responses:
 *       201:
 *         description: Tracking checkpoint recorded successfully
 *       404:
 *         description: Shipment not found
 */
router.post(
  '/:id/events',
  rbacGuard({ roles: ['owner', 'admin', 'warehouse_manager'] }),
  validateRequest({ body: addTrackingEventSchema }),
  shipmentController.addTrackingEvent
);

module.exports = router;

