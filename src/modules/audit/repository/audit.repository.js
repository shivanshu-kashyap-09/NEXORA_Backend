const { withTenantTransaction } = require('../../../infrastructure/database/tenantTransaction');
const logger = require('../../../config/logger');

/**
 * Record an audit log entry
 */
const createAuditLog = async ({
  tenantId,
  actorId = null,
  actorType = 'USER',
  action,
  resourceType,
  resourceId,
  ipAddress = null,
  userAgent = null,
  diffPayload = {},
  correlationId = null,
}) => {
  return withTenantTransaction(tenantId, async (client) => {
    const query = `
      INSERT INTO audit_logs (
        tenant_id, actor_id, actor_type, action,
        resource_type, resource_id, ip_address, user_agent,
        diff_payload, correlation_id, created_at
      )
      VALUES (
        $1, $2, $3, $4,
        $5, $6, $7, $8,
        $9, $10, NOW()
      )
      RETURNING *;
    `;
    const res = await client.query(query, [
      tenantId,
      actorId,
      actorType,
      action,
      resourceType,
      resourceId.toString(),
      ipAddress,
      userAgent,
      JSON.stringify(diffPayload),
      correlationId,
    ]);
    return res.rows[0];
  });
};

/**
 * Find audit log by ID
 */
const findAuditLogById = async (tenantId, id) => {
  return withTenantTransaction(tenantId, async (client) => {
    const query = `
      SELECT al.*, u.email AS actor_email, u.first_name, u.last_name
      FROM audit_logs al
      LEFT JOIN users u ON u.id = al.actor_id
      WHERE al.tenant_id = $1 AND al.id = $2;
    `;
    const res = await client.query(query, [tenantId, id]);
    return res.rows[0] || null;
  });
};

/**
 * Query audit logs with multi-factor filters and pagination
 */
const listAuditLogs = async (tenantId, {
  resourceType,
  resourceId,
  action,
  actorId,
  fromDate,
  toDate,
  page = 1,
  limit = 20,
}) => {
  return withTenantTransaction(tenantId, async (client) => {
    const offset = (page - 1) * limit;
    const params = [tenantId];
    let whereClauses = ['al.tenant_id = $1'];

    if (resourceType) {
      params.push(resourceType);
      whereClauses.push(`al.resource_type = $${params.length}`);
    }

    if (resourceId) {
      params.push(resourceId);
      whereClauses.push(`al.resource_id = $${params.length}`);
    }

    if (action) {
      params.push(action);
      whereClauses.push(`al.action = $${params.length}`);
    }

    if (actorId) {
      params.push(actorId);
      whereClauses.push(`al.actor_id = $${params.length}`);
    }

    if (fromDate) {
      params.push(fromDate);
      whereClauses.push(`al.created_at >= $${params.length}`);
    }

    if (toDate) {
      params.push(toDate);
      whereClauses.push(`al.created_at <= $${params.length}`);
    }

    const whereStr = whereClauses.join(' AND ');

    // Total count
    const countQuery = `SELECT COUNT(*) AS total FROM audit_logs al WHERE ${whereStr};`;
    const countRes = await client.query(countQuery, params);
    const total = parseInt(countRes.rows[0].total, 10);

    // List query
    params.push(limit, offset);
    const dataQuery = `
      SELECT al.*, u.email AS actor_email, u.first_name, u.last_name
      FROM audit_logs al
      LEFT JOIN users u ON u.id = al.actor_id
      WHERE ${whereStr}
      ORDER BY al.created_at DESC
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
 * Get full historical diff timeline for a specific resource
 */
const getResourceAuditTimeline = async (tenantId, resourceType, resourceId) => {
  return withTenantTransaction(tenantId, async (client) => {
    const query = `
      SELECT al.*, u.email AS actor_email
      FROM audit_logs al
      LEFT JOIN users u ON u.id = al.actor_id
      WHERE al.tenant_id = $1 AND al.resource_type = $2 AND al.resource_id = $3
      ORDER BY al.created_at ASC;
    `;
    const res = await client.query(query, [tenantId, resourceType, resourceId.toString()]);
    return res.rows;
  });
};

module.exports = {
  createAuditLog,
  findAuditLogById,
  listAuditLogs,
  getResourceAuditTimeline,
};

