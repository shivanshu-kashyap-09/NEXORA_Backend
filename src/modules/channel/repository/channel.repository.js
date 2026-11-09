const { withTenantTransaction } = require('../../../infrastructure/database/tenantTransaction');
const logger = require('../../../config/logger');

/**
 * Register a new sales channel
 */
const createChannel = async ({
  tenantId,
  code,
  name,
  type,
  isActive = true,
  credentials = {},
  settings = {},
}) => {
  return withTenantTransaction(tenantId, async (client) => {
    const query = `
      INSERT INTO channels (
        tenant_id, code, name, type, is_active, credentials, settings, created_at, updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())
      RETURNING *;
    `;
    const res = await client.query(query, [
      tenantId,
      code,
      name,
      type,
      isActive,
      JSON.stringify(credentials),
      JSON.stringify(settings),
    ]);
    return res.rows[0];
  });
};

/**
 * Find channel by code within tenant
 */
const findChannelByCode = async (tenantId, code) => {
  return withTenantTransaction(tenantId, async (client) => {
    const query = `
      SELECT *
      FROM channels
      WHERE tenant_id = $1 AND code = $2;
    `;
    const res = await client.query(query, [tenantId, code.toUpperCase().trim()]);
    return res.rows[0] || null;
  });
};

/**
 * Get channel by ID within tenant
 */
const getChannelById = async (tenantId, id) => {
  return withTenantTransaction(tenantId, async (client) => {
    const query = `
      SELECT *
      FROM channels
      WHERE tenant_id = $1 AND id = $2;
    `;
    const res = await client.query(query, [tenantId, id]);
    return res.rows[0] || null;
  });
};

/**
 * List channels for tenant
 */
const listChannels = async (tenantId, { type, isActive, page = 1, limit = 20 }) => {
  return withTenantTransaction(tenantId, async (client) => {
    const offset = (page - 1) * limit;
    const params = [tenantId];
    let whereClauses = ['tenant_id = $1'];

    if (type) {
      params.push(type);
      whereClauses.push(`type = $${params.length}`);
    }

    if (isActive !== undefined) {
      params.push(isActive === 'true');
      whereClauses.push(`is_active = $${params.length}`);
    }

    const whereStr = whereClauses.join(' AND ');

    // Total count
    const countQuery = `
      SELECT COUNT(*) AS total
      FROM channels
      WHERE ${whereStr};
    `;
    const countRes = await client.query(countQuery, params);
    const total = parseInt(countRes.rows[0].total, 10);

    // Data query
    params.push(limit, offset);
    const dataQuery = `
      SELECT id, tenant_id, code, name, type, is_active, settings, created_at, updated_at
      FROM channels
      WHERE ${whereStr}
      ORDER BY created_at ASC
      LIMIT $${params.length - 1} OFFSET $${params.length};
    `;
    const dataRes = await client.query(dataQuery, params);

    return {
      items: dataRes.rows,
      total,
      page: parseInt(page, 10),
      limit: parseInt(limit, 10),
    };
  });
};

/**
 * Update channel settings or credentials
 */
const updateChannel = async (tenantId, id, updates) => {
  return withTenantTransaction(tenantId, async (client) => {
    const fields = [];
    const values = [];
    let idx = 1;

    if (updates.name !== undefined) {
      fields.push(`name = $${idx++}`);
      values.push(updates.name);
    }
    if (updates.is_active !== undefined) {
      fields.push(`is_active = $${idx++}`);
      values.push(updates.is_active);
    }
    if (updates.credentials !== undefined) {
      fields.push(`credentials = $${idx++}`);
      values.push(JSON.stringify(updates.credentials));
    }
    if (updates.settings !== undefined) {
      fields.push(`settings = $${idx++}`);
      values.push(JSON.stringify(updates.settings));
    }

    if (fields.length === 0) {
      return getChannelById(tenantId, id);
    }

    fields.push('updated_at = NOW()');
    values.push(tenantId, id);

    const query = `
      UPDATE channels
      SET ${fields.join(', ')}
      WHERE tenant_id = $${idx++} AND id = $${idx++}
      RETURNING *;
    `;
    const res = await client.query(query, values);
    return res.rows[0] || null;
  });
};

/**
 * Record a channel synchronization audit log
 */
const recordSyncLog = async ({ tenantId, channelId, syncType, status, details = {} }) => {
  return withTenantTransaction(tenantId, async (client) => {
    const query = `
      INSERT INTO channel_sync_logs (
        tenant_id, channel_id, sync_type, status, details, created_at
      )
      VALUES ($1, $2, $3, $4, $5, NOW())
      RETURNING *;
    `;
    const res = await client.query(query, [
      tenantId,
      channelId,
      syncType,
      status,
      JSON.stringify(details),
    ]);
    return res.rows[0];
  });
};

/**
 * Get sync logs for a channel
 */
const getChannelSyncLogs = async (tenantId, channelId, { page = 1, limit = 20 }) => {
  return withTenantTransaction(tenantId, async (client) => {
    const offset = (page - 1) * limit;

    const countQuery = `
      SELECT COUNT(*) AS total
      FROM channel_sync_logs
      WHERE tenant_id = $1 AND channel_id = $2;
    `;
    const countRes = await client.query(countQuery, [tenantId, channelId]);
    const total = parseInt(countRes.rows[0].total, 10);

    const dataQuery = `
      SELECT *
      FROM channel_sync_logs
      WHERE tenant_id = $1 AND channel_id = $2
      ORDER BY created_at DESC
      LIMIT $3 OFFSET $4;
    `;
    const dataRes = await client.query(dataQuery, [tenantId, channelId, limit, offset]);

    return {
      items: dataRes.rows,
      total,
      page: parseInt(page, 10),
      limit: parseInt(limit, 10),
    };
  });
};

module.exports = {
  createChannel,
  findChannelByCode,
  getChannelById,
  listChannels,
  updateChannel,
  recordSyncLog,
  getChannelSyncLogs,
};

