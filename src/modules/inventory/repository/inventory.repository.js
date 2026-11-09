const { withTenantTransaction } = require('../../../infrastructure/database/tenantTransaction');
const logger = require('../../../config/logger');

/**
 * Adjust stock level (Restock, Cycle Count, Damage, Correction) and record audit ledger
 */
const adjustStock = async ({
  tenantId,
  warehouseId,
  productId,
  quantityDelta,
  reason,
  safetyStock,
  damaged,
  adjustedBy,
}) => {
  return withTenantTransaction(tenantId, async (client) => {
    // 1. Upsert inventory_items
    const upsertQuery = `
      INSERT INTO inventory_items (
        tenant_id, warehouse_id, product_id, on_hand, reserved, safety_stock, damaged, updated_at
      )
      VALUES (
        $1, $2, $3, GREATEST(0, $4), 0, COALESCE($5, 0), COALESCE($6, 0), NOW()
      )
      ON CONFLICT (tenant_id, warehouse_id, product_id)
      DO UPDATE SET
        on_hand = GREATEST(0, inventory_items.on_hand + $4),
        safety_stock = CASE WHEN $5::int IS NOT NULL THEN $5::int ELSE inventory_items.safety_stock END,
        damaged = CASE WHEN $6::int IS NOT NULL THEN $6::int ELSE inventory_items.damaged END,
        updated_at = NOW()
      RETURNING *;
    `;
    const itemRes = await client.query(upsertQuery, [
      tenantId,
      warehouseId,
      productId,
      quantityDelta,
      safetyStock !== undefined ? safetyStock : null,
      damaged !== undefined ? damaged : null,
    ]);
    const inventoryItem = itemRes.rows[0];

    // 2. Append audit ledger entry into inventory_adjustments
    const ledgerQuery = `
      INSERT INTO inventory_adjustments (
        tenant_id, warehouse_id, product_id, quantity_delta, reason, adjusted_by, created_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, NOW())
      RETURNING *;
    `;
    const ledgerRes = await client.query(ledgerQuery, [
      tenantId,
      warehouseId,
      productId,
      quantityDelta,
      reason,
      adjustedBy || null,
    ]);

    return {
      inventoryItem: {
        ...inventoryItem,
        available_to_promise: Math.max(
          0,
          inventoryItem.on_hand - inventoryItem.reserved - inventoryItem.safety_stock
        ),
      },
      adjustmentLog: ledgerRes.rows[0],
    };
  });
};

/**
 * List inventory levels across fulfillment nodes with calculated ATP
 */
const getInventoryLevels = async (tenantId, { warehouseId, productId, lowStock, page = 1, limit = 50 }) => {
  return withTenantTransaction(tenantId, async (client) => {
    const offset = (page - 1) * limit;
    const params = [tenantId];
    let whereClauses = ['i.tenant_id = $1'];

    if (warehouseId) {
      params.push(warehouseId);
      whereClauses.push(`i.warehouse_id = $${params.length}`);
    }

    if (productId) {
      params.push(productId);
      whereClauses.push(`i.product_id = $${params.length}`);
    }

    if (lowStock === 'true') {
      whereClauses.push(`(i.on_hand - i.reserved - i.safety_stock) <= i.safety_stock`);
    }

    const whereStr = whereClauses.join(' AND ');

    // Total count query
    const countQuery = `
      SELECT COUNT(*) AS total
      FROM inventory_items i
      WHERE ${whereStr};
    `;
    const countRes = await client.query(countQuery, params);
    const total = parseInt(countRes.rows[0].total, 10);

    // Data query with joins
    params.push(limit, offset);
    const dataQuery = `
      SELECT 
        i.id,
        i.warehouse_id,
        w.code AS warehouse_code,
        w.name AS warehouse_name,
        w.priority AS warehouse_priority,
        w.is_retail_store,
        i.product_id,
        p.sku AS product_sku,
        p.name AS product_name,
        p.price_base,
        p.currency,
        i.on_hand,
        i.reserved,
        i.safety_stock,
        i.damaged,
        GREATEST(0, (i.on_hand - i.reserved - i.safety_stock)) AS available_to_promise,
        i.updated_at
      FROM inventory_items i
      JOIN warehouses w ON w.id = i.warehouse_id
      JOIN products p ON p.id = i.product_id
      WHERE ${whereStr}
      ORDER BY w.priority ASC, p.name ASC
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
 * Get aggregated inventory summary for a single product across all warehouses
 */
const getProductInventorySummary = async (tenantId, productId) => {
  return withTenantTransaction(tenantId, async (client) => {
    const query = `
      SELECT 
        i.id,
        i.warehouse_id,
        w.code AS warehouse_code,
        w.name AS warehouse_name,
        w.priority AS warehouse_priority,
        w.is_retail_store,
        i.on_hand,
        i.reserved,
        i.safety_stock,
        i.damaged,
        GREATEST(0, (i.on_hand - i.reserved - i.safety_stock)) AS available_to_promise,
        i.updated_at
      FROM inventory_items i
      JOIN warehouses w ON w.id = i.warehouse_id
      WHERE i.tenant_id = $1 AND i.product_id = $2
      ORDER BY w.priority ASC;
    `;
    const res = await client.query(query, [tenantId, productId]);
    const warehouses = res.rows;

    const summary = warehouses.reduce(
      (acc, curr) => {
        acc.total_on_hand += curr.on_hand;
        acc.total_reserved += curr.reserved;
        acc.total_safety_stock += curr.safety_stock;
        acc.total_damaged += curr.damaged;
        acc.total_available += parseInt(curr.available_to_promise, 10);
        return acc;
      },
      {
        total_on_hand: 0,
        total_reserved: 0,
        total_safety_stock: 0,
        total_damaged: 0,
        total_available: 0,
      }
    );

    return {
      productId,
      summary,
      warehouses,
    };
  });
};

/**
 * Atomically reserve inventory for a soft hold (Cart Checkout lock)
 */
const reserveStock = async ({
  tenantId,
  warehouseId,
  productId,
  quantity,
  orderId = null,
  durationMinutes = 15,
}) => {
  return withTenantTransaction(tenantId, async (client) => {
    // 1. Lock the inventory row using SELECT FOR UPDATE
    const lockQuery = `
      SELECT *
      FROM inventory_items
      WHERE tenant_id = $1 AND warehouse_id = $2 AND product_id = $3
      FOR UPDATE;
    `;
    const lockRes = await client.query(lockQuery, [tenantId, warehouseId, productId]);
    const item = lockRes.rows[0];

    if (!item) {
      const err = new Error(`No inventory record found for product in this warehouse`);
      err.statusCode = 404;
      err.code = 'INVENTORY_NOT_FOUND';
      throw err;
    }

    const available = item.on_hand - item.reserved - item.safety_stock;
    if (available < quantity) {
      const err = new Error(
        `Insufficient inventory: requested ${quantity}, but only ${Math.max(0, available)} available`
      );
      err.statusCode = 409;
      err.code = 'INSUFFICIENT_STOCK';
      err.details = { requested: quantity, available: Math.max(0, available), on_hand: item.on_hand };
      throw err;
    }

    // 2. Increment reserved count
    const updateQuery = `
      UPDATE inventory_items
      SET reserved = reserved + $1, updated_at = NOW()
      WHERE id = $2
      RETURNING *;
    `;
    const updateRes = await client.query(updateQuery, [quantity, item.id]);
    const updatedItem = updateRes.rows[0];

    // 3. Create reservation record with expiration timestamp
    const reservationQuery = `
      INSERT INTO inventory_reservations (
        tenant_id, order_id, product_id, warehouse_id, quantity, expires_at, is_released, created_at
      )
      VALUES (
        $1, $2, $3, $4, $5, NOW() + ($6 || ' minutes')::interval, false, NOW()
      )
      RETURNING *;
    `;
    const resRes = await client.query(reservationQuery, [
      tenantId,
      orderId,
      productId,
      warehouseId,
      quantity,
      durationMinutes,
    ]);

    return {
      reservation: resRes.rows[0],
      inventory: {
        ...updatedItem,
        available_to_promise: Math.max(
          0,
          updatedItem.on_hand - updatedItem.reserved - updatedItem.safety_stock
        ),
      },
    };
  });
};

/**
 * Release an active soft hold reservation
 */
const releaseReservation = async (tenantId, reservationId) => {
  return withTenantTransaction(tenantId, async (client) => {
    // 1. Lock and fetch reservation
    const resQuery = `
      SELECT *
      FROM inventory_reservations
      WHERE id = $1 AND tenant_id = $2
      FOR UPDATE;
    `;
    const res = await client.query(resQuery, [reservationId, tenantId]);
    const reservation = res.rows[0];

    if (!reservation) {
      const err = new Error(`Reservation not found with ID: ${reservationId}`);
      err.statusCode = 404;
      err.code = 'RESERVATION_NOT_FOUND';
      throw err;
    }

    if (reservation.is_released) {
      return { reservation, alreadyReleased: true };
    }

    // 2. Decrement reserved count in inventory_items
    const updateInvQuery = `
      UPDATE inventory_items
      SET reserved = GREATEST(0, reserved - $1), updated_at = NOW()
      WHERE tenant_id = $2 AND warehouse_id = $3 AND product_id = $4
      RETURNING *;
    `;
    const invRes = await client.query(updateInvQuery, [
      reservation.quantity,
      tenantId,
      reservation.warehouse_id,
      reservation.product_id,
    ]);

    // 3. Mark reservation as released
    const updateResQuery = `
      UPDATE inventory_reservations
      SET is_released = true
      WHERE id = $1
      RETURNING *;
    `;
    const releasedRes = await client.query(updateResQuery, [reservationId]);

    return {
      reservation: releasedRes.rows[0],
      inventory: invRes.rows[0],
      alreadyReleased: false,
    };
  });
};

/**
 * Release all expired soft hold reservations
 */
const releaseExpiredReservations = async (tenantId) => {
  return withTenantTransaction(tenantId, async (client) => {
    // 1. Select expired, unreleased reservations
    const expiredQuery = `
      SELECT id, warehouse_id, product_id, quantity
      FROM inventory_reservations
      WHERE tenant_id = $1 AND expires_at < NOW() AND is_released = false
      FOR UPDATE;
    `;
    const expiredRes = await client.query(expiredQuery, [tenantId]);
    const expiredList = expiredRes.rows;

    let releasedCount = 0;
    for (const item of expiredList) {
      await client.query(
        `
        UPDATE inventory_items
        SET reserved = GREATEST(0, reserved - $1), updated_at = NOW()
        WHERE tenant_id = $2 AND warehouse_id = $3 AND product_id = $4;
      `,
        [item.quantity, tenantId, item.warehouse_id, item.product_id]
      );

      await client.query(
        `
        UPDATE inventory_reservations
        SET is_released = true
        WHERE id = $1;
      `,
        [item.id]
      );
      releasedCount++;
    }

    return {
      releasedCount,
      expiredReservations: expiredList.map((e) => e.id),
    };
  });
};

module.exports = {
  adjustStock,
  getInventoryLevels,
  getProductInventorySummary,
  reserveStock,
  releaseReservation,
  releaseExpiredReservations,
};

