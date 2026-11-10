const { withTenantTransaction } = require('../../../infrastructure/database/tenantTransaction');

/**
 * Create a new webhook subscription
 */
const createWebhook = async (tenantId, { url, secret, events, description, headers }) => {
  return withTenantTransaction(tenantId, async (client) => {
    const query = `
      INSERT INTO webhooks (
        tenant_id,
        url,
        secret,
        events,
        description,
        headers
      )
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *;
    `;
    const res = await client.query(query, [
      tenantId,
      url,
      secret,
      events,
      description || null,
      JSON.stringify(headers || {}),
    ]);
    return res.rows[0];
  });
};

/**
 * List webhooks for a tenant
 */
const getWebhooks = async (tenantId, { page = 1, limit = 20, is_active } = {}) => {
  return withTenantTransaction(tenantId, async (client) => {
    const offset = (page - 1) * limit;
    const conditions = ['tenant_id = $1'];
    const params = [tenantId];

    if (is_active !== undefined) {
      params.push(is_active);
      conditions.push(`is_active = $${params.length}`);
    }

    const whereClause = conditions.join(' AND ');

    const countQuery = `SELECT COUNT(*)::int as total FROM webhooks WHERE ${whereClause};`;
    const countRes = await client.query(countQuery, params);
    const total = countRes.rows[0].total;

    params.push(limit, offset);
    const query = `
      SELECT id, tenant_id, url, events, description, is_active, headers, created_at, updated_at
      FROM webhooks
      WHERE ${whereClause}
      ORDER BY created_at DESC
      LIMIT $${params.length - 1} OFFSET $${params.length};
    `;
    const res = await client.query(query, params);

    return {
      data: res.rows,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  });
};

/**
 * Find webhook by ID
 */
const getWebhookById = async (tenantId, id) => {
  return withTenantTransaction(tenantId, async (client) => {
    const query = `
      SELECT * FROM webhooks
      WHERE id = $1 AND tenant_id = $2;
    `;
    const res = await client.query(query, [id, tenantId]);
    return res.rows[0] || null;
  });
};

/**
 * Update webhook subscription
 */
const updateWebhook = async (tenantId, id, fields) => {
  return withTenantTransaction(tenantId, async (client) => {
    const updates = [];
    const params = [id, tenantId];

    if (fields.url !== undefined) {
      params.push(fields.url);
      updates.push(`url = $${params.length}`);
    }
    if (fields.secret !== undefined) {
      params.push(fields.secret);
      updates.push(`secret = $${params.length}`);
    }
    if (fields.events !== undefined) {
      params.push(fields.events);
      updates.push(`events = $${params.length}`);
    }
    if (fields.description !== undefined) {
      params.push(fields.description);
      updates.push(`description = $${params.length}`);
    }
    if (fields.is_active !== undefined) {
      params.push(fields.is_active);
      updates.push(`is_active = $${params.length}`);
    }
    if (fields.headers !== undefined) {
      params.push(JSON.stringify(fields.headers));
      updates.push(`headers = $${params.length}`);
    }

    if (updates.length === 0) {
      return getWebhookById(tenantId, id);
    }

    updates.push(`updated_at = NOW()`);

    const query = `
      UPDATE webhooks
      SET ${updates.join(', ')}
      WHERE id = $1 AND tenant_id = $2
      RETURNING *;
    `;
    const res = await client.query(query, params);
    return res.rows[0] || null;
  });
};

/**
 * Delete webhook
 */
const deleteWebhook = async (tenantId, id) => {
  return withTenantTransaction(tenantId, async (client) => {
    const query = `
      DELETE FROM webhooks
      WHERE id = $1 AND tenant_id = $2
      RETURNING id;
    `;
    const res = await client.query(query, [id, tenantId]);
    return res.rowCount > 0;
  });
};

/**
 * Record a webhook delivery attempt
 */
const recordDelivery = async (tenantId, { webhookId, eventType, payload, responseStatus, responseBody, status, attempts, deliveredAt }) => {
  return withTenantTransaction(tenantId, async (client) => {
    const query = `
      INSERT INTO webhook_deliveries (
        tenant_id,
        webhook_id,
        event_type,
        payload,
        response_status,
        response_body,
        status,
        attempts,
        delivered_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING *;
    `;
    const res = await client.query(query, [
      tenantId,
      webhookId,
      eventType,
      JSON.stringify(payload),
      responseStatus || null,
      responseBody || null,
      status,
      attempts || 1,
      deliveredAt || new Date(),
    ]);
    return res.rows[0];
  });
};

/**
 * Get delivery history for a webhook
 */
const getDeliveries = async (tenantId, webhookId, { limit = 20 } = {}) => {
  return withTenantTransaction(tenantId, async (client) => {
    const query = `
      SELECT * FROM webhook_deliveries
      WHERE webhook_id = $1 AND tenant_id = $2
      ORDER BY created_at DESC
      LIMIT $3;
    `;
    const res = await client.query(query, [webhookId, tenantId, limit]);
    return res.rows;
  });
};

module.exports = {
  createWebhook,
  getWebhooks,
  getWebhookById,
  updateWebhook,
  deleteWebhook,
  recordDelivery,
  getDeliveries,
};

