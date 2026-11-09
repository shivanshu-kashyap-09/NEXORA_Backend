const { withTenantTransaction } = require('../../../infrastructure/database/tenantTransaction');
const logger = require('../../../config/logger');

/**
 * Register BOPIS In-Store Pickup Record
 */
const createBopisPickup = async ({ tenantId, orderId, storeWarehouseId, pinHash }) => {
  return withTenantTransaction(tenantId, async (client) => {
    // 1. Verify order exists and lock it
    const orderRes = await client.query(
      `SELECT id, order_number, status FROM orders WHERE tenant_id = $1 AND id = $2 FOR UPDATE;`,
      [tenantId, orderId]
    );
    const order = orderRes.rows[0];
    if (!order) {
      const err = new Error(`Order not found with ID: ${orderId}`);
      err.statusCode = 404;
      throw err;
    }

    // 2. Check if BOPIS pickup already registered
    const existingRes = await client.query(
      `SELECT id FROM bopis_pickups WHERE tenant_id = $1 AND order_id = $2;`,
      [tenantId, orderId]
    );
    if (existingRes.rows.length > 0) {
      const err = new Error(`BOPIS pickup already registered for order: ${orderId}`);
      err.statusCode = 409;
      throw err;
    }

    // 3. Insert bopis_pickups
    const insertQuery = `
      INSERT INTO bopis_pickups (
        tenant_id, order_id, store_warehouse_id, pickup_pin_hash, is_staged, created_at
      )
      VALUES ($1, $2, $3, $4, false, NOW())
      RETURNING *;
    `;
    const insertRes = await client.query(insertQuery, [
      tenantId,
      orderId,
      storeWarehouseId,
      pinHash,
    ]);

    // 4. Update order status to PROCESSING if currently CONFIRMED
    if (order.status === 'CONFIRMED') {
      await client.query(
        `UPDATE orders SET status = 'PROCESSING', updated_at = NOW() WHERE tenant_id = $1 AND id = $2;`,
        [tenantId, orderId]
      );

      await client.query(
        `INSERT INTO order_state_history (tenant_id, order_id, previous_state, new_state, transition_reason, created_at)
         VALUES ($1, $2, 'CONFIRMED', 'PROCESSING', 'BOPIS Order Routed to Store for Picking', NOW());`,
        [tenantId, orderId]
      );
    }

    return insertRes.rows[0];
  });
};

/**
 * Find BOPIS Pickup by ID with store and order details
 */
const findBopisById = async (tenantId, id) => {
  return withTenantTransaction(tenantId, async (client) => {
    const query = `
      SELECT 
        bp.*,
        o.order_number,
        o.status AS order_status,
        o.total_amount,
        o.currency,
        o.customer_id,
        w.name AS store_name,
        w.code AS store_code,
        w.address AS store_address
      FROM bopis_pickups bp
      JOIN orders o ON o.id = bp.order_id
      JOIN warehouses w ON w.id = bp.store_warehouse_id
      WHERE bp.tenant_id = $1 AND bp.id = $2;
    `;
    const res = await client.query(query, [tenantId, id]);
    return res.rows[0] || null;
  });
};

/**
 * Find BOPIS Pickup by Order ID
 */
const findBopisByOrderId = async (tenantId, orderId) => {
  return withTenantTransaction(tenantId, async (client) => {
    const query = `
      SELECT 
        bp.*,
        o.order_number,
        o.status AS order_status,
        w.name AS store_name,
        w.code AS store_code
      FROM bopis_pickups bp
      JOIN orders o ON o.id = bp.order_id
      JOIN warehouses w ON w.id = bp.store_warehouse_id
      WHERE bp.tenant_id = $1 AND bp.order_id = $2;
    `;
    const res = await client.query(query, [tenantId, orderId]);
    return res.rows[0] || null;
  });
};

/**
 * List BOPIS Pickups with filters & pagination
 */
const listBopisPickups = async (tenantId, { storeWarehouseId, orderId, isStaged, page = 1, limit = 20 }) => {
  return withTenantTransaction(tenantId, async (client) => {
    const offset = (page - 1) * limit;
    const params = [tenantId];
    let whereClauses = ['bp.tenant_id = $1'];

    if (storeWarehouseId) {
      params.push(storeWarehouseId);
      whereClauses.push(`bp.store_warehouse_id = $${params.length}`);
    }

    if (orderId) {
      params.push(orderId);
      whereClauses.push(`bp.order_id = $${params.length}`);
    }

    if (isStaged !== undefined) {
      params.push(isStaged === 'true' || isStaged === true);
      whereClauses.push(`bp.is_staged = $${params.length}`);
    }

    const whereStr = whereClauses.join(' AND ');

    // Count
    const countQuery = `
      SELECT COUNT(*) AS total
      FROM bopis_pickups bp
      WHERE ${whereStr};
    `;
    const countRes = await client.query(countQuery, params);
    const total = parseInt(countRes.rows[0].total, 10);

    // List
    params.push(limit, offset);
    const dataQuery = `
      SELECT 
        bp.id, bp.tenant_id, bp.order_id, bp.store_warehouse_id,
        bp.is_staged, bp.picked_up_at, bp.picked_up_by_name, bp.created_at,
        o.order_number, o.status AS order_status, o.total_amount,
        w.name AS store_name, w.code AS store_code
      FROM bopis_pickups bp
      JOIN orders o ON o.id = bp.order_id
      JOIN warehouses w ON w.id = bp.store_warehouse_id
      WHERE ${whereStr}
      ORDER BY bp.created_at DESC
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
 * Mark BOPIS pickup as Staged in holding area (Order -> READY for customer pickup)
 */
const markBopisStaged = async (tenantId, id) => {
  return withTenantTransaction(tenantId, async (client) => {
    // 1. Lock bopis_pickup
    const lockRes = await client.query(
      `SELECT * FROM bopis_pickups WHERE tenant_id = $1 AND id = $2 FOR UPDATE;`,
      [tenantId, id]
    );
    const pickup = lockRes.rows[0];
    if (!pickup) {
      const err = new Error(`BOPIS pickup not found with ID: ${id}`);
      err.statusCode = 404;
      throw err;
    }

    if (pickup.is_staged) {
      return pickup;
    }

    // 2. Mark is_staged = true
    const updateRes = await client.query(
      `UPDATE bopis_pickups SET is_staged = true WHERE tenant_id = $1 AND id = $2 RETURNING *;`,
      [tenantId, id]
    );

    // 3. Update order status to READY
    const orderRes = await client.query(
      `SELECT status FROM orders WHERE tenant_id = $1 AND id = $2 FOR UPDATE;`,
      [tenantId, pickup.order_id]
    );
    const currentStatus = orderRes.rows[0]?.status;

    await client.query(
      `UPDATE orders SET status = 'READY', updated_at = NOW() WHERE tenant_id = $1 AND id = $2;`,
      [tenantId, pickup.order_id]
    );

    await client.query(
      `INSERT INTO order_state_history (tenant_id, order_id, previous_state, new_state, transition_reason, created_at)
       VALUES ($1, $2, $3, 'READY', 'BOPIS Order Staged & Ready for Customer Pickup', NOW());`,
      [tenantId, pickup.order_id, currentStatus || 'PROCESSING']
    );

    return updateRes.rows[0];
  });
};

/**
 * Complete BOPIS Handover to Customer (PIN verified, Order -> COMPLETED)
 */
const completeBopisHandover = async (tenantId, id, { pickedUpByName }) => {
  return withTenantTransaction(tenantId, async (client) => {
    // 1. Lock bopis_pickup
    const lockRes = await client.query(
      `SELECT * FROM bopis_pickups WHERE tenant_id = $1 AND id = $2 FOR UPDATE;`,
      [tenantId, id]
    );
    const pickup = lockRes.rows[0];
    if (!pickup) {
      const err = new Error(`BOPIS pickup not found with ID: ${id}`);
      err.statusCode = 404;
      throw err;
    }

    if (pickup.picked_up_at) {
      const err = new Error(`Order was already handed over to customer on ${pickup.picked_up_at}`);
      err.statusCode = 409;
      throw err;
    }

    // 2. Update bopis_pickups
    const updateRes = await client.query(
      `UPDATE bopis_pickups
       SET picked_up_at = NOW(), picked_up_by_name = $1
       WHERE tenant_id = $2 AND id = $3
       RETURNING *;`,
      [pickedUpByName, tenantId, id]
    );

    // 3. Update order status to COMPLETED
    const orderRes = await client.query(
      `SELECT status FROM orders WHERE tenant_id = $1 AND id = $2 FOR UPDATE;`,
      [tenantId, pickup.order_id]
    );
    const currentStatus = orderRes.rows[0]?.status;

    await client.query(
      `UPDATE orders SET status = 'COMPLETED', updated_at = NOW() WHERE tenant_id = $1 AND id = $2;`,
      [tenantId, pickup.order_id]
    );

    await client.query(
      `INSERT INTO order_state_history (tenant_id, order_id, previous_state, new_state, transition_reason, created_at)
       VALUES ($1, $2, $3, 'COMPLETED', 'BOPIS In-Store Handover Completed with PIN Verification', NOW());`,
      [tenantId, pickup.order_id, currentStatus || 'READY']
    );

    return updateRes.rows[0];
  });
};

/**
 * In-Store Return Desk (BORIS - Buy Online Return In Store)
 * Customer returns online order at store desk: instant intake, QA grading, inventory restock, and refund
 */
const processBorisReturn = async ({
  tenantId,
  orderId,
  storeWarehouseId,
  reason,
  items = [],
  customerName,
  refundMethod,
}) => {
  return withTenantTransaction(tenantId, async (client) => {
    // 1. Fetch order
    const orderRes = await client.query(
      `SELECT * FROM orders WHERE tenant_id = $1 AND id = $2 FOR UPDATE;`,
      [tenantId, orderId]
    );
    const order = orderRes.rows[0];
    if (!order) {
      const err = new Error(`Order not found with ID: ${orderId}`);
      err.statusCode = 404;
      throw err;
    }

    // 2. Generate BORIS Return RMA Record
    const rmaNumber = `BORIS-${Date.now().toString(36).toUpperCase()}-${Math.floor(1000 + Math.random() * 9000)}`;
    const returnQuery = `
      INSERT INTO returns (
        tenant_id, order_id, rma_number, status, reason,
        reverse_tracking_number, reverse_label_url, created_at, updated_at
      )
      VALUES ($1, $2, $3, 'INSPECTED', $4, 'IN_STORE_DROP_OFF', 'IN_STORE_COUNTER', NOW(), NOW())
      RETURNING *;
    `;
    const rmaRes = await client.query(returnQuery, [
      tenantId,
      orderId,
      rmaNumber,
      `[BORIS In-Store Return] ${reason}`,
    ]);
    const returnRecord = rmaRes.rows[0];

    // 3. Process each returned line item
    let totalRefundAmount = 0;
    const processedItems = [];

    for (const item of items) {
      // Find order item price and product
      const oiRes = await client.query(
        `SELECT * FROM order_items WHERE id = $1 AND order_id = $2;`,
        [item.order_item_id, orderId]
      );
      const orderItem = oiRes.rows[0];
      if (!orderItem) {
        const err = new Error(`Order line item not found: ${item.order_item_id}`);
        err.statusCode = 404;
        throw err;
      }

      const itemTotalRefund = Number(orderItem.unit_price) * Number(item.quantity);
      totalRefundAmount += itemTotalRefund;

      const isSellable = item.qa_grade === 'SELLABLE';
      const isDamaged = item.qa_grade === 'DAMAGED_SCRAP';

      // Insert return_items
      const riQuery = `
        INSERT INTO return_items (
          tenant_id, return_id, order_item_id, quantity,
          qa_grade, is_restocked, inspected_at, created_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())
        RETURNING *;
      `;
      const riRes = await client.query(riQuery, [
        tenantId,
        returnRecord.id,
        item.order_item_id,
        item.quantity,
        item.qa_grade,
        isSellable,
      ]);
      const returnItemRecord = riRes.rows[0];

      // Update store inventory
      if (isSellable) {
        await client.query(
          `
          INSERT INTO inventory_items (tenant_id, warehouse_id, product_id, on_hand, reserved, safety_stock, damaged, updated_at)
          VALUES ($1, $2, $3, $4, 0, 0, 0, NOW())
          ON CONFLICT (tenant_id, warehouse_id, product_id)
          DO UPDATE SET on_hand = inventory_items.on_hand + $4, updated_at = NOW();
        `,
          [tenantId, storeWarehouseId, orderItem.product_id, item.quantity]
        );

        await client.query(
          `
          INSERT INTO inventory_adjustments (tenant_id, warehouse_id, product_id, quantity_delta, reason, created_at)
          VALUES ($1, $2, $3, $4, 'BORIS_IN_STORE_RESTOCK', NOW());
        `,
          [tenantId, storeWarehouseId, orderItem.product_id, item.quantity]
        );
      } else if (isDamaged) {
        await client.query(
          `
          INSERT INTO inventory_items (tenant_id, warehouse_id, product_id, on_hand, reserved, safety_stock, damaged, updated_at)
          VALUES ($1, $2, $3, 0, 0, 0, $4, NOW())
          ON CONFLICT (tenant_id, warehouse_id, product_id)
          DO UPDATE SET damaged = inventory_items.damaged + $4, updated_at = NOW();
        `,
          [tenantId, storeWarehouseId, orderItem.product_id, item.quantity]
        );

        await client.query(
          `
          INSERT INTO inventory_adjustments (tenant_id, warehouse_id, product_id, quantity_delta, reason, created_at)
          VALUES ($1, $2, $3, $4, 'BORIS_DAMAGED_SCRAP', NOW());
        `,
          [tenantId, storeWarehouseId, orderItem.product_id, item.quantity]
        );
      }

      processedItems.push({
        ...returnItemRecord,
        sku: orderItem.sku,
        title: orderItem.title,
        unit_price: orderItem.unit_price,
        refund_amount: itemTotalRefund,
      });
    }

    // 4. Record refund in payments ledger if payment exists
    const payRes = await client.query(
      `SELECT id FROM payments WHERE tenant_id = $1 AND order_id = $2 AND status = 'CAPTURED' ORDER BY created_at DESC LIMIT 1;`,
      [tenantId, orderId]
    );
    let refundRecord = null;
    if (payRes.rows.length > 0) {
      const primaryPaymentId = payRes.rows[0].id;
      const rfdInsert = await client.query(
        `
        INSERT INTO refunds (
          tenant_id, payment_id, order_id, amount, reason, status, created_at
        )
        VALUES ($1, $2, $3, $4, $5, 'SUCCEEDED', NOW())
        RETURNING *;
      `,
        [tenantId, primaryPaymentId, orderId, totalRefundAmount, `BORIS Store Return: ${reason}`]
      );
      refundRecord = rfdInsert.rows[0];

      // Update order payment_status to PARTIALLY_REFUNDED or REFUNDED
      const newPayStatus = totalRefundAmount >= Number(order.total_amount) ? 'REFUNDED' : 'PARTIALLY_REFUNDED';
      await client.query(
        `UPDATE orders SET payment_status = $1, updated_at = NOW() WHERE tenant_id = $2 AND id = $3;`,
        [newPayStatus, tenantId, orderId]
      );
    }

    return {
      return: returnRecord,
      rma_number: rmaNumber,
      store_warehouse_id: storeWarehouseId,
      refunded_amount: totalRefundAmount,
      refund_method: refundMethod,
      customer_name: customerName,
      items: processedItems,
      refund: refundRecord,
    };
  });
};

module.exports = {
  createBopisPickup,
  findBopisById,
  findBopisByOrderId,
  listBopisPickups,
  markBopisStaged,
  completeBopisHandover,
  processBorisReturn,
};
