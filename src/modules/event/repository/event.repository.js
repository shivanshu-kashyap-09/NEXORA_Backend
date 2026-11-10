const { withTenantTransaction } = require('../../../infrastructure/database/tenantTransaction');
const { pool } = require('../../../infrastructure/database');
const { OutboxStatus } = require('../constants/event.constants');
const logger = require('../../../config/logger');

/**
 * Append an event to the Transactional Outbox (can accept existing client transaction)
 */
const createOutboxEvent = async ({
  tenantId,
  aggregateType,
  aggregateId,
  eventType,
  payload,
  scheduledAt = null,
}, externalClient = null) => {
  const executor = async (client) => {
    const query = `
      INSERT INTO outbox_events (
        tenant_id, aggregate_type, aggregate_id, event_type,
        payload, status, retry_count, scheduled_at, created_at, updated_at
      )
      VALUES (
        $1, $2, $3, $4,
        $5, $6, 0, COALESCE($7, NOW()), NOW(), NOW()
      )
      RETURNING *;
    `;
    const res = await client.query(query, [
      tenantId,
      aggregateType,
      aggregateId.toString(),
      eventType,
      JSON.stringify(payload),
      OutboxStatus.PENDING,
      scheduledAt,
    ]);
    return res.rows[0];
  };

  if (externalClient) {
    return executor(externalClient);
  }
  return withTenantTransaction(tenantId, executor);
};

/**
 * Fetch a batch of pending events ready for dispatch with row-level locking
 */
const fetchPendingEvents = async ({ tenantId = null, limit = 20 }) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN;');

    const params = [limit];
    let query = `
      SELECT *
      FROM outbox_events
      WHERE status = 'PENDING' AND scheduled_at <= NOW()
    `;

    if (tenantId) {
      params.unshift(tenantId);
      query += ` AND tenant_id = $1`;
      query += ` ORDER BY created_at ASC LIMIT $2 FOR UPDATE SKIP LOCKED;`;
    } else {
      query += ` ORDER BY created_at ASC LIMIT $1 FOR UPDATE SKIP LOCKED;`;
    }

    const res = await client.query(query, params);
    await client.query('COMMIT;');
    return res.rows;
  } catch (error) {
    await client.query('ROLLBACK;');
    throw error;
  } finally {
    client.release();
  }
};

/**
 * Mark event as PROCESSING
 */
const markEventProcessing = async (id) => {
  const query = `
    UPDATE outbox_events
    SET status = 'PROCESSING', updated_at = NOW()
    WHERE id = $1
    RETURNING *;
  `;
  const res = await pool.query(query, [id]);
  return res.rows[0];
};

/**
 * Mark event as PUBLISHED
 */
const markEventPublished = async (id) => {
  const query = `
    UPDATE outbox_events
    SET status = 'PUBLISHED', updated_at = NOW()
    WHERE id = $1
    RETURNING *;
  `;
  const res = await pool.query(query, [id]);
  return res.rows[0];
};

/**
 * Mark event as FAILED or DEAD (if max retries exceeded)
 */
const markEventFailed = async (id, errorMessage, maxRetries = 5) => {
  const query = `
    UPDATE outbox_events
    SET 
      retry_count = retry_count + 1,
      last_error = $1,
      status = CASE WHEN retry_count + 1 >= $2 THEN 'DEAD'::outbox_status ELSE 'FAILED'::outbox_status END,
      updated_at = NOW()
    WHERE id = $3
    RETURNING *;
  `;
  const res = await pool.query(query, [errorMessage, maxRetries, id]);
  return res.rows[0];
};

/**
 * Replay a DEAD or FAILED event back into PENDING state
 */
const replayDeadEvent = async (tenantId, id) => {
  return withTenantTransaction(tenantId, async (client) => {
    const query = `
      UPDATE outbox_events
      SET 
        status = 'PENDING',
        retry_count = 0,
        last_error = NULL,
        scheduled_at = NOW(),
        updated_at = NOW()
      WHERE tenant_id = $1 AND id = $2
      RETURNING *;
    `;
    const res = await client.query(query, [tenantId, id]);
    return res.rows[0] || null;
  });
};

/**
 * List outbox events with filters and pagination
 */
const listOutboxEvents = async (tenantId, { aggregateType, eventType, status, page = 1, limit = 20 }) => {
  return withTenantTransaction(tenantId, async (client) => {
    const offset = (page - 1) * limit;
    const params = [tenantId];
    let whereClauses = ['tenant_id = $1'];

    if (aggregateType) {
      params.push(aggregateType);
      whereClauses.push(`aggregate_type = $${params.length}`);
    }

    if (eventType) {
      params.push(eventType);
      whereClauses.push(`event_type = $${params.length}`);
    }

    if (status) {
      params.push(status);
      whereClauses.push(`status = $${params.length}`);
    }

    const whereStr = whereClauses.join(' AND ');

    // Total count
    const countQuery = `
      SELECT COUNT(*) AS total
      FROM outbox_events
      WHERE ${whereStr};
    `;
    const countRes = await client.query(countQuery, params);
    const total = parseInt(countRes.rows[0].total, 10);

    // Data query
    params.push(limit, offset);
    const dataQuery = `
      SELECT *
      FROM outbox_events
      WHERE ${whereStr}
      ORDER BY created_at DESC
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
 * Find outbox event by ID
 */
const findOutboxEventById = async (tenantId, id) => {
  return withTenantTransaction(tenantId, async (client) => {
    const query = `
      SELECT *
      FROM outbox_events
      WHERE tenant_id = $1 AND id = $2;
    `;
    const res = await client.query(query, [tenantId, id]);
    return res.rows[0] || null;
  });
};

module.exports = {
  createOutboxEvent,
  fetchPendingEvents,
  markEventProcessing,
  markEventPublished,
  markEventFailed,
  replayDeadEvent,
  listOutboxEvents,
  findOutboxEventById,
};

