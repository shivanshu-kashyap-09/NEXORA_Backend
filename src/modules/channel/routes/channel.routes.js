const express = require('express');
const router = express.Router();
const channelController = require('../controller/channel.controller');
const {
  createChannelSchema,
  updateChannelSchema,
  logSyncSchema,
  channelQuerySchema,
} = require('../validation/channel.validation');
const validateRequest = require('../../../shared/validators/validateRequest');
const authGuard = require('../../../shared/middleware/authGuard');
const rbacGuard = require('../../../shared/middleware/rbacGuard');

// Require authentication for all channel endpoints
router.use(authGuard);

/**
 * @openapi
 * /channels:
 *   post:
 *     summary: Register a sales channel connector
 *     description: Connect an external e-commerce channel (Shopify, WooCommerce, Amazon, or Custom Webhook) with credentials and stock buffer rules.
 *     tags:
 *       - Sales Channels & Storefront Connectors
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - code
 *               - name
 *               - type
 *             properties:
 *               code:
 *                 type: string
 *                 example: SHOPIFY-US
 *                 description: Unique channel code identifier for the tenant
 *               name:
 *                 type: string
 *                 example: US Flagship Shopify Store
 *               type:
 *                 type: string
 *                 enum: [shopify, woocommerce, amazon, magento, custom_webhook, pos]
 *                 example: shopify
 *               is_active:
 *                 type: boolean
 *                 default: true
 *               credentials:
 *                 type: object
 *                 example:
 *                   store_url: https://mybrand.myshopify.com
 *                   access_token: shpat_xxxxxxxxxxxxxxxx
 *                   webhook_secret: shpws_yyyyyyyyyyyy
 *               settings:
 *                 type: object
 *                 properties:
 *                   auto_sync_stock:
 *                     type: boolean
 *                     default: true
 *                   auto_fulfill:
 *                     type: boolean
 *                     default: true
 *                   stock_buffer_percentage:
 *                     type: integer
 *                     default: 0
 *                     example: 5
 *                     description: Percentage of inventory withheld from this channel
 *     responses:
 *       201:
 *         description: Sales channel registered successfully
 *       400:
 *         description: Validation error
 *       403:
 *         description: Forbidden - requires owner or admin role
 *       409:
 *         description: Channel code already exists for tenant
 */
router.post(
  '/',
  rbacGuard({ roles: ['owner', 'admin'] }),
  validateRequest({ body: createChannelSchema }),
  channelController.createChannel
);

/**
 * @openapi
 * /channels:
 *   get:
 *     summary: List connected sales channels
 *     description: Retrieve all active and inactive sales channels configured for this tenant.
 *     tags:
 *       - Sales Channels & Storefront Connectors
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: type
 *         schema:
 *           type: string
 *         description: Filter by connector type (shopify, amazon, etc.)
 *       - in: query
 *         name: is_active
 *         schema:
 *           type: boolean
 *         description: Filter active or paused channels
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
 *         description: Channels retrieved successfully
 *       401:
 *         description: Unauthorized
 */
router.get(
  '/',
  validateRequest({ query: channelQuerySchema }),
  channelController.listChannels
);

/**
 * @openapi
 * /channels/{id}:
 *   get:
 *     summary: Get sales channel details
 *     description: Retrieve configuration details, sync rules, and masked credentials for a specific channel connector.
 *     tags:
 *       - Sales Channels & Storefront Connectors
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Channel UUID
 *     responses:
 *       200:
 *         description: Channel details retrieved successfully
 *       404:
 *         description: Channel not found
 */
router.get('/:id', channelController.getChannel);

/**
 * @openapi
 * /channels/{id}:
 *   patch:
 *     summary: Update sales channel configuration
 *     description: Modify channel name, active state, credentials, or stock sync buffer percentages.
 *     tags:
 *       - Sales Channels & Storefront Connectors
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Channel UUID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *               is_active:
 *                 type: boolean
 *               credentials:
 *                 type: object
 *               settings:
 *                 type: object
 *     responses:
 *       200:
 *         description: Channel updated successfully
 *       403:
 *         description: Forbidden - requires owner or admin role
 *       404:
 *         description: Channel not found
 */
router.patch(
  '/:id',
  rbacGuard({ roles: ['owner', 'admin'] }),
  validateRequest({ body: updateChannelSchema }),
  channelController.updateChannel
);

/**
 * @openapi
 * /channels/{id}/sync-logs:
 *   post:
 *     summary: Record a channel sync event log
 *     description: Ingests an audit record of inventory pushes, catalog syncs, or order ingests.
 *     tags:
 *       - Sales Channels & Storefront Connectors
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Channel UUID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - sync_type
 *               - status
 *             properties:
 *               sync_type:
 *                 type: string
 *                 enum: [INVENTORY_PUSH, ORDER_INGEST, CATALOG_SYNC, FULFILLMENT_PUSH]
 *                 example: INVENTORY_PUSH
 *               status:
 *                 type: string
 *                 enum: [SUCCESS, FAILED, PARTIAL]
 *                 example: SUCCESS
 *               details:
 *                 type: object
 *                 example:
 *                   skus_synced: 142
 *                   latency_ms: 320
 *     responses:
 *       201:
 *         description: Sync log recorded successfully
 *       404:
 *         description: Channel not found
 */
router.post(
  '/:id/sync-logs',
  rbacGuard({ roles: ['owner', 'admin', 'warehouse_manager'] }),
  validateRequest({ body: logSyncSchema }),
  channelController.recordSyncLog
);

/**
 * @openapi
 * /channels/{id}/sync-logs:
 *   get:
 *     summary: Get channel synchronization history
 *     description: Retrieve audit logs of inventory syncs, order ingests, and error events for a channel.
 *     tags:
 *       - Sales Channels & Storefront Connectors
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Channel UUID
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
 *         description: Channel sync logs retrieved successfully
 *       404:
 *         description: Channel not found
 */
router.get('/:id/sync-logs', channelController.getChannelSyncLogs);

module.exports = router;

