const channelRepository = require('../repository/channel.repository');
const { ConflictError, NotFoundError, BadRequestError, UnauthorizedError } = require('../../../shared/errors');
const logger = require('../../../config/logger');
const { verifyShopifyHmac, normalizeShopifyOrder } = require('../adapters/shopify.adapter');
const orderService = require('../../order/service/order.service');

/**
 * Mask sensitive credentials for safe API responses
 */
const maskCredentials = (channel) => {
  if (!channel) return channel;
  const clone = { ...channel };
  if (clone.credentials) {
    const masked = {};
    for (const [key, val] of Object.entries(clone.credentials)) {
      if (typeof val === 'string' && val.length > 6) {
        masked[key] = `${val.slice(0, 3)}****${val.slice(-3)}`;
      } else {
        masked[key] = '********';
      }
    }
    clone.credentials = masked;
  }
  return clone;
};

/**
 * Register a new sales channel connector
 */
const createChannel = async (tenantId, channelData) => {
  const existing = await channelRepository.findChannelByCode(tenantId, channelData.code);
  if (existing) {
    throw new ConflictError(`Channel with code '${channelData.code}' already exists`);
  }

  const channel = await channelRepository.createChannel({
    tenantId,
    code: channelData.code,
    name: channelData.name,
    type: channelData.type,
    isActive: channelData.is_active,
    credentials: channelData.credentials,
    settings: channelData.settings,
  });

  logger.info(`Channel registered: ${channel.code} (${channel.type}) for tenant: ${tenantId}`);
  return maskCredentials(channel);
};

/**
 * Get channel details by ID
 */
const getChannelById = async (tenantId, id) => {
  const channel = await channelRepository.getChannelById(tenantId, id);
  if (!channel) {
    throw new NotFoundError(`Channel not found with ID: ${id}`);
  }
  return maskCredentials(channel);
};

/**
 * List channels for tenant
 */
const listChannels = async (tenantId, query) => {
  return channelRepository.listChannels(tenantId, {
    type: query.type,
    isActive: query.is_active,
    page: query.page,
    limit: query.limit,
  });
};

/**
 * Update channel settings or credentials
 */
const updateChannel = async (tenantId, id, updateData) => {
  await getChannelById(tenantId, id);

  const updated = await channelRepository.updateChannel(tenantId, id, updateData);
  logger.info(`Channel updated: ${id} for tenant: ${tenantId}`);
  return maskCredentials(updated);
};

/**
 * Record channel synchronization event
 */
const recordSyncLog = async (tenantId, channelId, logData) => {
  await getChannelById(tenantId, channelId);

  const log = await channelRepository.recordSyncLog({
    tenantId,
    channelId,
    syncType: logData.sync_type,
    status: logData.status,
    details: logData.details,
  });

  logger.info(`Channel sync logged: ${channelId} [${logData.sync_type}] - ${logData.status}`);
  return log;
};

/**
 * Get sync logs for a channel
 */
const getChannelSyncLogs = async (tenantId, channelId, query) => {
  await getChannelById(tenantId, channelId);

  return channelRepository.getChannelSyncLogs(tenantId, channelId, {
    page: query.page,
    limit: query.limit,
  });
};

/**
 * Process incoming Shopify Webhook with HMAC signature verification and canonical order ingestion
 */
const handleShopifyWebhook = async (tenantId, { headers, rawBody, body }) => {
  const topic = headers['x-shopify-topic'] || 'orders/create';
  const hmacHeader = headers['x-shopify-hmac-sha256'];
  const shopDomain = headers['x-shopify-shop-domain'];

  logger.info(`Received Shopify webhook topic: '${topic}' from domain: '${shopDomain}' for tenant: ${tenantId}`);

  // Find active Shopify channel configuration for tenant
  const channel = await channelRepository.findActiveChannelByType(tenantId, 'shopify');
  if (!channel) {
    logger.warn(`No active Shopify channel configured for tenant ${tenantId}. Skipping order ingestion.`);
    return { status: 'skipped', message: 'No active Shopify channel registered for tenant' };
  }

  // Validate Shopify HMAC if secret is configured
  const webhookSecret = channel.credentials?.webhook_secret ||
    channel.credentials?.api_secret ||
    channel.credentials?.secret_key;

  if (webhookSecret && hmacHeader) {
    const isValid = verifyShopifyHmac(rawBody, hmacHeader, webhookSecret);
    if (!isValid) {
      logger.error(`Shopify HMAC verification failed for tenant: ${tenantId}, domain: ${shopDomain}`);
      throw new UnauthorizedError('Invalid Shopify HMAC signature');
    }
  } else if (!webhookSecret) {
    logger.warn(`No webhook_secret found in Shopify channel credentials for tenant: ${tenantId}. Proceeding in development mode.`);
  }

  // Process supported topics
  if (topic === 'orders/create' || topic === 'orders/paid') {
    const canonicalOrder = await normalizeShopifyOrder(tenantId, channel.id, body);
    const createdOrder = await orderService.createOrder(tenantId, null, canonicalOrder);

    // Record channel sync audit log
    await channelRepository.recordSyncLog({
      tenantId,
      channelId: channel.id,
      syncType: 'ORDER_INGEST',
      status: 'SUCCESS',
      details: {
        shopify_order_id: body.id,
        shopify_order_name: body.name,
        nexora_order_id: createdOrder.id,
        nexora_order_number: createdOrder.order_number,
      },
    });

    logger.info(`Shopify order ${body.name || body.id} ingested as NEXORA order ${createdOrder.order_number}`);
    return {
      status: 'success',
      order_id: createdOrder.id,
      order_number: createdOrder.order_number,
    };
  }

  return { status: 'acknowledged', topic };
};

module.exports = {
  createChannel,
  getChannelById,
  listChannels,
  updateChannel,
  recordSyncLog,
  getChannelSyncLogs,
  handleShopifyWebhook,
};

