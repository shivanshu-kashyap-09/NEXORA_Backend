const express = require('express');
const router = express.Router();
const eventController = require('../controller/event.controller');
const {
  createEventSchema,
  queryOutboxSchema,
  dispatchBatchSchema,
} = require('../validation/event.validation');
const validateRequest = require('../../../shared/validators/validateRequest');
const authGuard = require('../../../shared/middleware/authGuard');
const rbacGuard = require('../../../shared/middleware/rbacGuard');

// Require authentication for all outbox event endpoints
router.use(authGuard);

/**
 * @openapi
 * /events/outbox:
 *   post:
 *     summary: Ingest domain event into Transactional Outbox
 *     description: Emits an event to the outbox table for at-least-once asynchronous message delivery.
 *     tags:
 *       - Transactional Outbox & Event Bus
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - aggregate_type
 *               - aggregate_id
 *               - event_type
 *               - payload
 *             properties:
 *               aggregate_type:
 *                 type: string
 *                 example: ORDER
 *               aggregate_id:
 *                 type: string
 *                 example: ord_982410294
 *               event_type:
 *                 type: string
 *                 example: order.created
 *               payload:
 *                 type: object
 *                 example: { "order_number": "ORD-1234", "total": 150.0 }
 *               scheduled_at:
 *                 type: string
 *                 format: date-time
 *     responses:
 *       201:
 *         description: Outbox event recorded successfully
 *       400:
 *         description: Validation error
 */
router.post(
  '/outbox',
  rbacGuard({ roles: ['owner', 'admin', 'order_operator'] }),
  validateRequest({ body: createEventSchema }),
  eventController.emitEvent
);

/**
 * @openapi
 * /events/outbox:
 *   get:
 *     summary: List outbox events
 *     description: Retrieve all outbox events filtered by aggregate type, event type, or delivery status.
 *     tags:
 *       - Transactional Outbox & Event Bus
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: aggregate_type
 *         schema:
 *           type: string
 *           example: ORDER
 *       - in: query
 *         name: event_type
 *         schema:
 *           type: string
 *           example: order.created
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [PENDING, PROCESSING, PUBLISHED, FAILED, DEAD]
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
 *         description: Outbox events retrieved successfully
 */
router.get(
  '/outbox',
  validateRequest({ query: queryOutboxSchema }),
  eventController.listOutboxEvents
);

/**
 * @openapi
 * /events/outbox/dispatch:
 *   post:
 *     summary: Trigger batch dispatch of pending outbox events
 *     description: Processes a batch of PENDING outbox events, atomically updates them to PROCESSING, and broadcasts to Redis Pub/Sub channels.
 *     tags:
 *       - Transactional Outbox & Event Bus
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               limit:
 *                 type: integer
 *                 default: 20
 *     responses:
 *       200:
 *         description: Batch dispatch completed successfully
 */
router.post(
  '/outbox/dispatch',
  rbacGuard({ roles: ['owner', 'admin'] }),
  validateRequest({ body: dispatchBatchSchema }),
  eventController.dispatchPendingEvents
);

/**
 * @openapi
 * /events/outbox/{id}:
 *   get:
 *     summary: Get outbox event details
 *     description: Inspect complete event payload, retry metrics, and delivery trace.
 *     tags:
 *       - Transactional Outbox & Event Bus
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Outbox event UUID
 *     responses:
 *       200:
 *         description: Event details retrieved successfully
 *       404:
 *         description: Event not found
 */
router.get('/outbox/:id', eventController.getOutboxEvent);

/**
 * @openapi
 * /events/outbox/{id}/replay:
 *   post:
 *     summary: Replay dead or failed outbox event
 *     description: Resets retry counter, clears error log, and returns event status to PENDING for immediate redispatch.
 *     tags:
 *       - Transactional Outbox & Event Bus
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Outbox event UUID
 *     responses:
 *       200:
 *         description: Event replayed successfully and queued as PENDING
 *       404:
 *         description: Event not found
 */
router.post(
  '/outbox/:id/replay',
  rbacGuard({ roles: ['owner', 'admin'] }),
  eventController.replayEvent
);

module.exports = router;
