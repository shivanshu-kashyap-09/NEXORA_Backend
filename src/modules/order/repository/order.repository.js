const { withTenantTransaction } = require('../../../infrastructure/database/tenantTransaction');
const logger = require('../../../config/logger');
const { OrderStatus } = require('../constants/order.constants');

/**
 * Ingest a new order with line items and initial state history in a single transaction
 */
const createOrder = async ({
  tenantId,
  channelId,
  channelOrderId,
  customerId,
  currency = 'USD',
  items = [],
  shippingAddress,
  billingAddress,
  isCod = false,
  shippingTotal = 0,
  discountTotal = 0,
  idempotencyKey = null,
  metadata = {},
  triggeredBy = null,
}) => {
  return withTenantTransaction(tenantId, async (client) => {
    // 1. Calculate pricing totals
    let subtotal = 0;
    let taxTotal = 0;

    const formattedItems = items.map((item) => {
      const lineSubtotal = Number(item.unit_price) * Number(item.quantity);
      const lineTax = Number(item.tax_amount || 0);
      const lineDiscount = Number(item.discount_amount || 0);
      const lineTotal = lineSubtotal + lineTax - lineDiscount;

      subtotal += lineSubtotal;
      taxTotal += lineTax;

      return {
        ...item,
        subtotal: lineSubtotal,
        total_price: lineTotal,
      };
    });

    const totalAmount = subtotal + taxTotal + Number(shippingTotal) - Number(discountTotal);

    // 2. Generate unique order number
    const orderNumber = `ORD-${Date.now().toString(36).toUpperCase()}-${Math.floor(1000 + Math.random() * 9000)}`;

    // 3. Insert into orders
    const orderQuery = `
      INSERT INTO orders (
        tenant_id, channel_id, channel_order_id, order_number, customer_id, status, payment_status,
        currency, subtotal, tax_total, discount_total, shipping_total, total_amount,
        shipping_address, billing_address, is_cod, idempotency_key, metadata, created_at, updated_at
      )
      VALUES (
        $1, $2, $3, $4, $5, $6, $7,
        $8, $9, $10, $11, $12, $13,
        $14, $15, $16, $17, $18, NOW(), NOW()
      )
      RETURNING *;
    `;
    const orderRes = await client.query(orderQuery, [
      tenantId,
      channelId || null,
      channelOrderId || null,
      orderNumber,
      customerId || null,
      OrderStatus.PENDING,
      'PENDING',
      currency,
      subtotal,
      taxTotal,
      discountTotal,
      shippingTotal,
      totalAmount,
      JSON.stringify(shippingAddress),
      JSON.stringify(billingAddress),
      isCod,
      idempotencyKey || null,
      JSON.stringify(metadata),
    ]);
    const order = orderRes.rows[0];

    // 4. Batch insert line items
    const insertedItems = [];
    for (const item of formattedItems) {
      const itemQuery = `
        INSERT INTO order_items (
          tenant_id, order_id, product_id, sku, title, quantity, unit_price,
          tax_amount, discount_amount, total_price, created_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW())
        RETURNING *;
      `;
      const itemRes = await client.query(itemQuery, [
        tenantId,
        order.id,
        item.product_id,
        item.sku,
        item.title,
        item.quantity,
        item.unit_price,
        item.tax_amount || 0,
        item.discount_amount || 0,
        item.total_price,
      ]);
      insertedItems.push(itemRes.rows[0]);
    }

    // 5. Insert initial transition record into order_state_history
    const historyQuery = `
      INSERT INTO order_state_history (
        tenant_id, order_id, previous_state, new_state, transition_reason, triggered_by, created_at
      )
      VALUES ($1, $2, NULL, $3, $4, $5, NOW())
      RETURNING *;
    `;
    const historyRes = await client.query(historyQuery, [
      tenantId,
      order.id,
      OrderStatus.PENDING,
      'Order Ingested',
      triggeredBy || null,
    ]);

    return {
      ...order,
      items: insertedItems,
      state_history: [historyRes.rows[0]],
      holds: [],
    };
  });
};

/**
 * Find order by idempotency key
 */
const findOrderByIdempotencyKey = async (tenantId, idempotencyKey) => {
  return withTenantTransaction(tenantId, async (client) => {
    const query = `
      SELECT *
      FROM orders
      WHERE tenant_id = $1 AND idempotency_key = $2;
    `;
    const res = await client.query(query, [tenantId, idempotencyKey]);
    return res.rows[0] || null;
  });
};

/**
 * Find order details by ID including line items, active holds, and state history
 */
const findOrderById = async (tenantId, id) => {
  return withTenantTransaction(tenantId, async (client) => {
    // 1. Fetch order
    const orderQuery = `
      SELECT o.*, c.name AS channel_name, cust.email AS customer_email
      FROM orders o
      LEFT JOIN channels c ON c.id = o.channel_id
      LEFT JOIN customers cust ON cust.id = o.customer_id
      WHERE o.tenant_id = $1 AND o.id = $2;
    `;
    const orderRes = await client.query(orderQuery, [tenantId, id]);
    const order = orderRes.rows[0];
    if (!order) return null;

    // 2. Fetch items
    const itemsQuery = `
      SELECT *
      FROM order_items
      WHERE tenant_id = $1 AND order_id = $2
      ORDER BY created_at ASC;
    `;
    const itemsRes = await client.query(itemsQuery, [tenantId, id]);

    // 3. Fetch active holds
    const holdsQuery = `
      SELECT *
      FROM order_holds
      WHERE tenant_id = $1 AND order_id = $2
      ORDER BY created_at DESC;
    `;
    const holdsRes = await client.query(holdsQuery, [tenantId, id]);

    // 4. Fetch state history
    const historyQuery = `
      SELECT h.*, u.first_name AS triggered_by_first_name, u.last_name AS triggered_by_last_name
      FROM order_state_history h
      LEFT JOIN users u ON u.id = h.triggered_by
      WHERE h.tenant_id = $1 AND h.order_id = $2
      ORDER BY h.created_at ASC;
    `;
    const historyRes = await client.query(historyQuery, [tenantId, id]);

    return {
      ...order,
      items: itemsRes.rows,
      holds: holdsRes.rows,
      state_history: historyRes.rows,
    };
  });
};

/**
 * List orders with search and pagination
 */
const listOrders = async (tenantId, { status, customerId, channelId, search, page = 1, limit = 20 }) => {
  return withTenantTransaction(tenantId, async (client) => {
    const offset = (page - 1) * limit;
    const params = [tenantId];
    let whereClauses = ['o.tenant_id = $1'];

    if (status) {
      params.push(status);
      whereClauses.push(`o.status = $${params.length}`);
    }

    if (customerId) {
      params.push(customerId);
      whereClauses.push(`o.customer_id = $${params.length}`);
    }

    if (channelId) {
      params.push(channelId);
      whereClauses.push(`o.channel_id = $${params.length}`);
    }

    if (search) {
      params.push(`%${search}%`);
      whereClauses.push(`(o.order_number ILIKE $${params.length} OR o.channel_order_id ILIKE $${params.length})`);
    }

    const whereStr = whereClauses.join(' AND ');

    // Total count
    const countQuery = `
      SELECT COUNT(*) AS total
      FROM orders o
      WHERE ${whereStr};
    `;
    const countRes = await client.query(countQuery, params);
    const total = parseInt(countRes.rows[0].total, 10);

    // Data query
    params.push(limit, offset);
    const dataQuery = `
      SELECT 
        o.id, o.order_number, o.channel_id, o.channel_order_id, o.customer_id,
        o.status, o.payment_status, o.currency, o.total_amount, o.is_cod,
        o.created_at, o.updated_at,
        c.name AS channel_name,
        cust.email AS customer_email,
        (SELECT COUNT(*) FROM order_items WHERE order_id = o.id) AS item_count
      FROM orders o
      LEFT JOIN channels c ON c.id = o.channel_id
      LEFT JOIN customers cust ON cust.id = o.customer_id
      WHERE ${whereStr}
      ORDER BY o.created_at DESC
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
 * Atomically transition order state and record audit history
 */
const transitionState = async ({ tenantId, orderId, nextState, reason, triggeredBy }) => {
  return withTenantTransaction(tenantId, async (client) => {
    // 1. Lock order row
    const lockQuery = `
      SELECT *
      FROM orders
      WHERE tenant_id = $1 AND id = $2
      FOR UPDATE;
    `;
    const lockRes = await client.query(lockQuery, [tenantId, orderId]);
    const currentOrder = lockRes.rows[0];

    if (!currentOrder) {
      const err = new Error(`Order not found with ID: ${orderId}`);
      err.statusCode = 404;
      throw err;
    }

    const previousState = currentOrder.status;

    // 2. Update status in orders
    const updateQuery = `
      UPDATE orders
      SET status = $1, updated_at = NOW()
      WHERE tenant_id = $2 AND id = $3
      RETURNING *;
    `;
    const updateRes = await client.query(updateQuery, [nextState, tenantId, orderId]);
    const updatedOrder = updateRes.rows[0];

    // 3. Record audit history
    const historyQuery = `
      INSERT INTO order_state_history (
        tenant_id, order_id, previous_state, new_state, transition_reason, triggered_by, created_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, NOW())
      RETURNING *;
    `;
    const historyRes = await client.query(historyQuery, [
      tenantId,
      orderId,
      previousState,
      nextState,
      reason,
      triggeredBy || null,
    ]);

    return {
      order: updatedOrder,
      previous_state: previousState,
      new_state: nextState,
      transition: historyRes.rows[0],
    };
  });
};

/**
 * Place order on hold
 */
const placeHold = async ({ tenantId, orderId, reason, triggeredBy }) => {
  return withTenantTransaction(tenantId, async (client) => {
    // 1. Lock order
    const lockRes = await client.query(
      `SELECT * FROM orders WHERE tenant_id = $1 AND id = $2 FOR UPDATE;`,
      [tenantId, orderId]
    );
    const order = lockRes.rows[0];
    if (!order) {
      const err = new Error(`Order not found with ID: ${orderId}`);
      err.statusCode = 404;
      throw err;
    }

    const previousState = order.status;

    // 2. Insert hold record
    const holdQuery = `
      INSERT INTO order_holds (tenant_id, order_id, reason, is_resolved, created_at)
      VALUES ($1, $2, $3, false, NOW())
      RETURNING *;
    `;
    const holdRes = await client.query(holdQuery, [tenantId, orderId, reason]);

    // 3. Transition status to ON_HOLD
    await client.query(
      `UPDATE orders SET status = $1, updated_at = NOW() WHERE tenant_id = $2 AND id = $3;`,
      [OrderStatus.ON_HOLD, tenantId, orderId]
    );

    // 4. Record history
    await client.query(
      `
      INSERT INTO order_state_history (tenant_id, order_id, previous_state, new_state, transition_reason, triggered_by, created_at)
      VALUES ($1, $2, $3, $4, $5, $6, NOW());
    `,
      [tenantId, orderId, previousState, OrderStatus.ON_HOLD, `Hold Placed: ${reason}`, triggeredBy || null]
    );

    return {
      orderId,
      hold: holdRes.rows[0],
      status: OrderStatus.ON_HOLD,
    };
  });
};

/**
 * Resolve an active order hold
 */
const resolveHold = async ({ tenantId, orderId, holdId, targetStatus, resolutionNotes, resolvedBy }) => {
  return withTenantTransaction(tenantId, async (client) => {
    // 1. Mark hold resolved
    const updateHoldQuery = `
      UPDATE order_holds
      SET is_resolved = true, resolved_by = $1, resolved_at = NOW()
      WHERE tenant_id = $2 AND order_id = $3 AND id = $4
      RETURNING *;
    `;
    const holdRes = await client.query(updateHoldQuery, [resolvedBy, tenantId, orderId, holdId]);
    if (!holdRes.rows[0]) {
      const err = new Error(`Order hold not found with ID: ${holdId}`);
      err.statusCode = 404;
      throw err;
    }

    // 2. Check if any unresolved holds remain
    const remainingRes = await client.query(
      `SELECT COUNT(*) AS count FROM order_holds WHERE tenant_id = $1 AND order_id = $2 AND is_resolved = false;`,
      [tenantId, orderId]
    );
    const hasUnresolved = parseInt(remainingRes.rows[0].count, 10) > 0;

    let finalStatus = OrderStatus.ON_HOLD;
    if (!hasUnresolved) {
      finalStatus = targetStatus || OrderStatus.CONFIRMED;
      await client.query(
        `UPDATE orders SET status = $1, updated_at = NOW() WHERE tenant_id = $2 AND id = $3;`,
        [finalStatus, tenantId, orderId]
      );

      await client.query(
        `
        INSERT INTO order_state_history (tenant_id, order_id, previous_state, new_state, transition_reason, triggered_by, created_at)
        VALUES ($1, $2, $3, $4, $5, $6, NOW());
      `,
        [
          tenantId,
          orderId,
          OrderStatus.ON_HOLD,
          finalStatus,
          `Hold Resolved: ${resolutionNotes || 'All holds cleared'}`,
          resolvedBy || null,
        ]
      );
    }

    return {
      orderId,
      hold: holdRes.rows[0],
      status: finalStatus,
      hasRemainingHolds: hasUnresolved,
    };
  });
};

/**
 * Get state transition audit trail for order
 */
const getOrderStateHistory = async (tenantId, orderId) => {
  return withTenantTransaction(tenantId, async (client) => {
    const query = `
      SELECT h.*, u.first_name AS triggered_by_first_name, u.last_name AS triggered_by_last_name
      FROM order_state_history h
      LEFT JOIN users u ON u.id = h.triggered_by
      WHERE h.tenant_id = $1 AND h.order_id = $2
      ORDER BY h.created_at ASC;
    `;
    const res = await client.query(query, [tenantId, orderId]);
    return res.rows;
  });
};

module.exports = {
  createOrder,
  findOrderByIdempotencyKey,
  findOrderById,
  listOrders,
  transitionState,
  placeHold,
  resolveHold,
  getOrderStateHistory,
};

