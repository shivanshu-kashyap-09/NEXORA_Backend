const { withTenantTransaction } = require('../../../infrastructure/database/tenantTransaction');
const logger = require('../../../config/logger');
const { FulfillmentStatus } = require('../constants/fulfillment.constants');

/**
 * Create a new fulfillment assignment with line items
 */
const createFulfillment = async ({ tenantId, orderId, warehouseId, items = [] }) => {
  return withTenantTransaction(tenantId, async (client) => {
    // 1. Insert into fulfillments
    const fulQuery = `
      INSERT INTO fulfillments (tenant_id, order_id, warehouse_id, status, created_at, updated_at)
      VALUES ($1, $2, $3, $4, NOW(), NOW())
      RETURNING *;
    `;
    const fulRes = await client.query(fulQuery, [
      tenantId,
      orderId,
      warehouseId,
      FulfillmentStatus.ALLOCATED,
    ]);
    const fulfillment = fulRes.rows[0];

    // 2. Insert items
    const insertedItems = [];
    for (const item of items) {
      const itemQuery = `
        INSERT INTO fulfillment_items (tenant_id, fulfillment_id, order_item_id, quantity, created_at)
        VALUES ($1, $2, $3, $4, NOW())
        RETURNING *;
      `;
      const itemRes = await client.query(itemQuery, [
        tenantId,
        fulfillment.id,
        item.order_item_id,
        item.quantity,
      ]);
      insertedItems.push(itemRes.rows[0]);
    }

    // 3. Advance order status to PROCESSING if it was CONFIRMED
    await client.query(
      `
      UPDATE orders
      SET status = 'PROCESSING', updated_at = NOW()
      WHERE tenant_id = $1 AND id = $2 AND status = 'CONFIRMED';
    `,
      [tenantId, orderId]
    );

    return {
      ...fulfillment,
      items: insertedItems,
    };
  });
};

/**
 * Get fulfillment details by ID with items, warehouse, order, and shipments
 */
const findFulfillmentById = async (tenantId, id) => {
  return withTenantTransaction(tenantId, async (client) => {
    // 1. Fetch fulfillment
    const fulQuery = `
      SELECT f.*, w.name AS warehouse_name, w.code AS warehouse_code, o.order_number, o.status AS order_status
      FROM fulfillments f
      JOIN warehouses w ON w.id = f.warehouse_id
      JOIN orders o ON o.id = f.order_id
      WHERE f.tenant_id = $1 AND f.id = $2;
    `;
    const fulRes = await client.query(fulQuery, [tenantId, id]);
    const fulfillment = fulRes.rows[0];
    if (!fulfillment) return null;

    // 2. Fetch items
    const itemsQuery = `
      SELECT fi.*, oi.sku, oi.title
      FROM fulfillment_items fi
      JOIN order_items oi ON oi.id = fi.order_item_id
      WHERE fi.tenant_id = $1 AND fi.fulfillment_id = $2;
    `;
    const itemsRes = await client.query(itemsQuery, [tenantId, id]);

    // 3. Fetch shipments
    const shipQuery = `
      SELECT *
      FROM shipments
      WHERE tenant_id = $1 AND fulfillment_id = $2;
    `;
    const shipRes = await client.query(shipQuery, [tenantId, id]);

    return {
      ...fulfillment,
      items: itemsRes.rows,
      shipments: shipRes.rows,
    };
  });
};

/**
 * List fulfillments with filters and pagination
 */
const listFulfillments = async (tenantId, { orderId, warehouseId, status, page = 1, limit = 20 }) => {
  return withTenantTransaction(tenantId, async (client) => {
    const offset = (page - 1) * limit;
    const params = [tenantId];
    let whereClauses = ['f.tenant_id = $1'];

    if (orderId) {
      params.push(orderId);
      whereClauses.push(`f.order_id = $${params.length}`);
    }

    if (warehouseId) {
      params.push(warehouseId);
      whereClauses.push(`f.warehouse_id = $${params.length}`);
    }

    if (status) {
      params.push(status);
      whereClauses.push(`f.status = $${params.length}`);
    }

    const whereStr = whereClauses.join(' AND ');

    // Total count
    const countQuery = `
      SELECT COUNT(*) AS total
      FROM fulfillments f
      WHERE ${whereStr};
    `;
    const countRes = await client.query(countQuery, params);
    const total = parseInt(countRes.rows[0].total, 10);

    // Data query
    params.push(limit, offset);
    const dataQuery = `
      SELECT 
        f.*,
        w.name AS warehouse_name,
        w.code AS warehouse_code,
        o.order_number,
        (SELECT COUNT(*) FROM fulfillment_items WHERE fulfillment_id = f.id) AS item_count
      FROM fulfillments f
      JOIN warehouses w ON w.id = f.warehouse_id
      JOIN orders o ON o.id = f.order_id
      WHERE ${whereStr}
      ORDER BY f.created_at DESC
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
 * Update fulfillment status in FSM lifecycle
 */
const updateFulfillmentStatus = async (tenantId, id, newStatus) => {
  return withTenantTransaction(tenantId, async (client) => {
    // 1. Lock row
    const lockQuery = `
      SELECT *
      FROM fulfillments
      WHERE tenant_id = $1 AND id = $2
      FOR UPDATE;
    `;
    const lockRes = await client.query(lockQuery, [tenantId, id]);
    const current = lockRes.rows[0];

    if (!current) {
      const err = new Error(`Fulfillment not found with ID: ${id}`);
      err.statusCode = 404;
      throw err;
    }

    // 2. Update fulfillment
    const updateQuery = `
      UPDATE fulfillments
      SET status = $1, updated_at = NOW()
      WHERE tenant_id = $2 AND id = $3
      RETURNING *;
    `;
    const updateRes = await client.query(updateQuery, [newStatus, tenantId, id]);
    const updated = updateRes.rows[0];

    // 3. Advance order status based on fulfillment progression
    if (newStatus === FulfillmentStatus.PACKED) {
      await client.query(
        `
        UPDATE orders
        SET status = 'READY', updated_at = NOW()
        WHERE tenant_id = $1 AND id = $2 AND status = 'PROCESSING';
      `,
        [tenantId, current.order_id]
      );
    } else if (newStatus === FulfillmentStatus.SHIPPED) {
      await client.query(
        `
        UPDATE orders
        SET status = 'FULFILLED', updated_at = NOW()
        WHERE tenant_id = $1 AND id = $2 AND (status = 'READY' OR status = 'PROCESSING');
      `,
        [tenantId, current.order_id]
      );
    }

    return updated;
  });
};

module.exports = {
  createFulfillment,
  findFulfillmentById,
  listFulfillments,
  updateFulfillmentStatus,
};

