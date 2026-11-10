const { Router } = require('express');
const webhookController = require('../controller/webhook.controller');
const validateRequest = require('../../../shared/validators/validateRequest');
const {
  createWebhookSchema,
  updateWebhookSchema,
  listWebhooksSchema,
  testWebhookSchema,
} = require('../validation/webhook.validation');

const router = Router();

/**
 * @openapi
 * /webhooks:
 *   post:
 *     summary: Register a new webhook subscription
 *     description: Register an HTTP endpoint URL to receive real-time asynchronous notifications signed with HMAC SHA-256.
 *     tags:
 *       - Webhooks
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - url
 *               - events
 *             properties:
 *               url:
 *                 type: string
 *                 format: uri
 *                 example: https://api.partner.com/webhooks/nexora
 *               secret:
 *                 type: string
 *                 description: Optional shared secret (minimum 16 characters). If omitted, an entropy secret is generated.
 *                 example: whsec_4b912c75a90d8ef31a29399cb1
 *               events:
 *                 type: array
 *                 items:
 *                   type: string
 *                 example: ["order.created", "order.cancelled", "inventory.depleted"]
 *               description:
 *                 type: string
 *                 example: ERP Primary Sync Webhook
 *               headers:
 *                 type: object
 *                 example: {"X-Custom-Auth": "secret-token"}
 *     responses:
 *       201:
 *         description: Webhook registered successfully
 *       400:
 *         description: Validation error
 *   get:
 *     summary: List webhook subscriptions
 *     description: Retrieve all registered webhooks for the tenant with pagination.
 *     tags:
 *       - Webhooks
 *     security:
 *       - bearerAuth: []
 *     parameters:
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
 *       - in: query
 *         name: is_active
 *         schema:
 *           type: boolean
 *     responses:
 *       200:
 *         description: List of webhooks
 */
router.post('/', validateRequest({ body: createWebhookSchema }), webhookController.createWebhook);
router.get('/', validateRequest({ query: listWebhooksSchema }), webhookController.getWebhooks);

/**
 * @openapi
 * /webhooks/{id}:
 *   get:
 *     summary: Get webhook details
 *     tags:
 *       - Webhooks
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Webhook subscription details
 *       404:
 *         description: Webhook not found
 *   put:
 *     summary: Update webhook subscription
 *     tags:
 *       - Webhooks
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               url:
 *                 type: string
 *                 format: uri
 *               events:
 *                 type: array
 *                 items:
 *                   type: string
 *               is_active:
 *                 type: boolean
 *               description:
 *                 type: string
 *     responses:
 *       200:
 *         description: Webhook updated successfully
 *       404:
 *         description: Webhook not found
 *   delete:
 *     summary: Delete webhook subscription
 *     tags:
 *       - Webhooks
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Webhook deleted successfully
 *       404:
 *         description: Webhook not found
 */
router.get('/:id', webhookController.getWebhookById);
router.put('/:id', validateRequest({ body: updateWebhookSchema }), webhookController.updateWebhook);
router.delete('/:id', webhookController.deleteWebhook);

/**
 * @openapi
 * /webhooks/{id}/test:
 *   post:
 *     summary: Test dispatch a webhook ping
 *     description: Fires a test event to the registered URL, computes the HMAC SHA-256 signature, logs the delivery record, and returns the response status.
 *     tags:
 *       - Webhooks
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               event_type:
 *                 type: string
 *                 default: ping
 *               payload:
 *                 type: object
 *     responses:
 *       200:
 *         description: Delivery attempt results
 */
router.post('/:id/test', validateRequest({ body: testWebhookSchema }), webhookController.testWebhook);

/**
 * @openapi
 * /webhooks/{id}/deliveries:
 *   get:
 *     summary: Get webhook delivery history
 *     description: Retrieve historical dispatch attempts, HTTP status codes, and latency logs for this webhook subscription.
 *     tags:
 *       - Webhooks
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 20
 *     responses:
 *       200:
 *         description: List of historical delivery records
 */
router.get('/:id/deliveries', webhookController.getWebhookDeliveries);

module.exports = router;
