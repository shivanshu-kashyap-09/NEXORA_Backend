const crypto = require('crypto');
const webhookRepository = require('../repository/webhook.repository');
const { NotFoundError } = require('../../../shared/errors');
const logger = require('../../../config/logger');

/**
 * Generate HMAC SHA-256 signature for webhook payload
 */
const generateSignature = (payload, secret) => {
  const payloadString = typeof payload === 'string' ? payload : JSON.stringify(payload);
  return crypto.createHmac('sha256', secret).update(payloadString).digest('hex');
};

/**
 * Register a new webhook endpoint
 */
const registerWebhook = async (tenantId, data) => {
  const secret = data.secret || crypto.randomBytes(24).toString('hex');
  return webhookRepository.createWebhook(tenantId, {
    ...data,
    secret,
  });
};

/**
 * List tenant webhooks
 */
const listWebhooks = async (tenantId, query) => {
  return webhookRepository.getWebhooks(tenantId, query);
};

/**
 * Get webhook by ID
 */
const getWebhook = async (tenantId, id) => {
  const webhook = await webhookRepository.getWebhookById(tenantId, id);
  if (!webhook) {
    throw new NotFoundError('Webhook subscription not found');
  }
  return webhook;
};

/**
 * Update webhook
 */
const updateWebhook = async (tenantId, id, fields) => {
  await getWebhook(tenantId, id);
  return webhookRepository.updateWebhook(tenantId, id, fields);
};

/**
 * Remove webhook
 */
const removeWebhook = async (tenantId, id) => {
  await getWebhook(tenantId, id);
  return webhookRepository.deleteWebhook(tenantId, id);
};

/**
 * Test dispatch a webhook ping
 */
const testDispatchWebhook = async (tenantId, id, { event_type = 'ping', payload = {} } = {}) => {
  const webhook = await getWebhook(tenantId, id);

  const testPayload = {
    event: event_type,
    tenant_id: tenantId,
    timestamp: new Date().toISOString(),
    data: payload,
  };

  const signature = generateSignature(testPayload, webhook.secret);

  const requestHeaders = {
    'Content-Type': 'application/json',
    'User-Agent': 'NEXORA-Webhook-Engine/1.0',
    'X-Nexora-Event': event_type,
    'X-Nexora-Signature': signature,
    'X-Nexora-Delivery': crypto.randomUUID(),
    ...(webhook.headers || {}),
  };

  let responseStatus = null;
  let responseBody = null;
  let status = 'FAILED';

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    const res = await fetch(webhook.url, {
      method: 'POST',
      headers: requestHeaders,
      body: JSON.stringify(testPayload),
      signal: controller.signal,
    });
    clearTimeout(timeout);

    responseStatus = res.status;
    responseBody = await res.text().catch(() => '');
    status = res.ok ? 'SUCCESS' : 'FAILED';
  } catch (err) {
    responseBody = `Dispatch Error: ${err.message}`;
    status = 'FAILED';
    logger.warn(`Webhook test dispatch to ${webhook.url} failed: ${err.message}`);
  }

  const delivery = await webhookRepository.recordDelivery(tenantId, {
    webhookId: id,
    eventType: event_type,
    payload: testPayload,
    responseStatus,
    responseBody: responseBody ? responseBody.slice(0, 1000) : null,
    status,
    attempts: 1,
    deliveredAt: new Date(),
  });

  return {
    delivery,
    signature_used: signature,
  };
};

/**
 * Get delivery history
 */
const getWebhookDeliveries = async (tenantId, webhookId, query) => {
  await getWebhook(tenantId, webhookId);
  return webhookRepository.getDeliveries(tenantId, webhookId, query);
};

module.exports = {
  generateSignature,
  registerWebhook,
  listWebhooks,
  getWebhook,
  updateWebhook,
  removeWebhook,
  testDispatchWebhook,
  getWebhookDeliveries,
};
