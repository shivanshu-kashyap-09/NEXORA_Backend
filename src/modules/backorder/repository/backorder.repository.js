const { withTenantTransaction } = require('../../../infrastructure/database/tenantTransaction');
const logger = require('../../../config/logger');

/**
 * Enqueue an order item into the backorder priority queue
 */
const enqueueBackorder = async ({
  tenantId,
  orderId,
  productId,
  quantity,
  priority = 1,
}) => {
  return withTenantTransaction(tenantId, async (client) => {
    // 1. Verify order exists & set status to ON_HOLD if currently PENDING
    const ordRes = await client.query(
      `SELECT status FROM orders WHERE tenant_id = $1 AND id = $2 FOR UPDATE;`,
      [tenantId, orderId]
    );
    const order = ordRes.rows[0];
    if (!order) {
      const err = new Error(`Order not found with ID: ${orderId}`);
      err.statusCode = 404;
      throw err;
    }

    if (order.status === 'PENDING') {
      await client.query(
        `UPDATE orders SET status = 'ON_HOLD', updated_at = NOW() WHERE tenant_id = $1 AND id = $2;`,
        [tenantId, orderId]
      );
      await client.query(
        `INSERT INTO order_state_history (tenant_id, order_id, previous_state, new_state, transition_reason, created_at)
         VALUES ($1, $2, 'PENDING', 'ON_HOLD', 'Zero stock: Order queued for Backorder fulfillment', NOW());`,
        [tenantId, orderId]
      );
    }

    // 2. Insert into backorder_queues
    const query = `
      INSERT INTO backorder_queues (
        tenant_id, product_id, order_id, quantity, priority, is_allocated, created_at
      )
      VALUES ($1, $2, $3, $4, $5, false, NOW())
      RETURNING *;
    `;
    const res = await client.query(query, [
      tenantId,
      productId,
      orderId,
      quantity,
      priority,
    ]);
    return res.rows[0];
  });
};

/**
 * Find backorder item by ID with order & product info
 */
const findBackorderById = async (tenantId, id) => {
  return withTenantTransaction(tenantId, async (client) => {
    const query = `
      SELECT bq.*, o.order_number, o.status AS order_status, p.sku, p.name AS product_name
      FROM backorder_queues bq
      JOIN orders o ON o.id = bq.order_id
      JOIN products p ON p.id = bq.product_id
      WHERE bq.tenant_id = $1 AND bq.id = $2;
    `;
    const res = await client.query(query, [tenantId, id]);
    return res.rows[0] || null;
  });
};

/**
 * List backorder queue entries sorted by priority DESC, created_at ASC
 */
const listBackorders = async (tenantId, { productId, orderId, isAllocated, page = 1, limit = 20 }) => {
  return withTenantTransaction(tenantId, async (client) => {
    const offset = (page - 1) * limit;
    const params = [tenantId];
    let whereClauses = ['bq.tenant_id = $1'];

    if (productId) {
      params.push(productId);
      whereClauses.push(`bq.product_id = $${params.length}`);
    }

    if (orderId) {
      params.push(orderId);
      whereClauses.push(`bq.order_id = $${params.length}`);
    }

    if (isAllocated !== undefined) {
      params.push(isAllocated === 'true' || isAllocated === true);
      whereClauses.push(`bq.is_allocated = $${params.length}`);
    }

    const whereStr = whereClauses.join(' AND ');

    // Count
    const countQuery = `SELECT COUNT(*) AS total FROM backorder_queues bq WHERE ${whereStr};`;
    const countRes = await client.query(countQuery, params);
    const total = parseInt(countRes.rows[0].total, 10);

    // List
    params.push(limit, offset);
    const dataQuery = `
      SELECT bq.*, o.order_number, o.status AS order_status, p.sku, p.name AS product_name
      FROM backorder_queues bq
      JOIN orders o ON o.id = bq.order_id
      JOIN products p ON p.id = bq.product_id
      WHERE ${whereStr}
      ORDER BY bq.is_allocated ASC, bq.priority DESC, bq.created_at ASC
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
 * Update priority rank of a backordered item
 */
const updatePriority = async (tenantId, id, priority) => {
  return withTenantTransaction(tenantId, async (client) => {
    const query = `
      UPDATE backorder_queues
      SET priority = $1
      WHERE tenant_id = $2 AND id = $3
      RETURNING *;
    `;
    const res = await client.query(query, [priority, tenantId, id]);
    return res.rows[0] || null;
  });
};

/**
 * Allocate backorders against available inventory in priority/FIFO order
 */
const allocateAvailableStock = async ({
  tenantId,
  productId,
  warehouseId,
  quantityToAllocate,
}) => {
  return withTenantTransaction(tenantId, async (client) => {
    // 1. Fetch unallocated queue items for this product ordered by priority DESC, created_at ASC
    const queueQuery = `
      SELECT *
      FROM backorder_queues
      WHERE tenant_id = $1 AND product_id = $2 AND is_allocated = false
      ORDER BY priority DESC, created_at ASC
      FOR UPDATE;
    `;
    const queueRes = await client.query(queueQuery, [tenantId, productId]);
    const queueItems = queueRes.rows;

    let remainingStock = quantityToAllocate;
    const allocated = [];

    for (const item of queueItems) {
      if (remainingStock <= 0) break;

      if (remainingStock >= item.quantity) {
        // Fully allocate this order
        await client.query(
          `UPDATE backorder_queues SET is_allocated = true WHERE id = $1;`,
          [item.id]
        );

        // Reserve stock in inventory_items
        await client.query(
          `
          UPDATE inventory_items
          SET on_hand = GREATEST(0, on_hand - $1),
              reserved = reserved + $1,
              updated_at = NOW()
          WHERE tenant_id = $2 AND warehouse_id = $3 AND product_id = $4;
        `,
          [item.quantity, tenantId, warehouseId, productId]
        );

        // Transition order from ON_HOLD -> CONFIRMED
        const ordRes = await client.query(
          `SELECT status FROM orders WHERE tenant_id = $1 AND id = $2 FOR UPDATE;`,
          [tenantId, item.order_id]
        );
        const currentStatus = ordRes.rows[0]?.status;

        if (currentStatus === 'ON_HOLD') {
          await client.query(
            `UPDATE orders SET status = 'CONFIRMED', updated_at = NOW() WHERE tenant_id = $1 AND id = $2;`,
            [tenantId, item.order_id]
          );
          await client.query(
            `INSERT INTO order_state_history (tenant_id, order_id, previous_state, new_state, transition_reason, created_at)
             VALUES ($1, $2, 'ON_HOLD', 'CONFIRMED', 'Backorder stock allocated: Order released from hold', NOW());`,
            [tenantId, item.order_id]
          );
        }

        remainingStock -= item.quantity;
        allocated.push({
          backorder_id: item.id,
          order_id: item.order_id,
          quantity_allocated: item.quantity,
          status: 'FULLY_ALLOCATED',
        });
      }
    }

    return {
      product_id: productId,
      warehouse_id: warehouseId,
      initial_quantity: quantityToAllocate,
      remaining_unallocated_stock: remainingStock,
      allocated_count: allocated.length,
      allocations: allocated,
    };
  });
};

module.exports = {
  enqueueBackorder,
  findBackorderById,
  listBackorders,
  updatePriority,
  allocateAvailableStock,
};
