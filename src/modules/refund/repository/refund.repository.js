const { withTenantTransaction } = require('../../../infrastructure/database/tenantTransaction');
const logger = require('../../../config/logger');
const { RmaStatus, QaGrade } = require('../constants/refund.constants');

/**
 * Ingest a return request (RMA generation)
 */
const createReturn = async ({ tenantId, orderId, reason, items = [] }) => {
  return withTenantTransaction(tenantId, async (client) => {
    // 1. Generate RMA number and reverse logistics tracking
    const rmaNumber = `RMA-${Date.now().toString(36).toUpperCase()}-${Math.floor(1000 + Math.random() * 9000)}`;
    const reverseTracking = `REV-TRK-${Date.now().toString().slice(-6)}`;
    const reverseLabelUrl = `https://cdn.nexora.io/rma/labels/${rmaNumber}.pdf`;

    // 2. Insert into returns
    const rmaQuery = `
      INSERT INTO returns (
        tenant_id, order_id, rma_number, status, reason,
        reverse_tracking_number, reverse_label_url, created_at, updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())
      RETURNING *;
    `;
    const rmaRes = await client.query(rmaQuery, [
      tenantId,
      orderId,
      rmaNumber,
      RmaStatus.REQUESTED,
      reason,
      reverseTracking,
      reverseLabelUrl,
    ]);
    const returnRecord = rmaRes.rows[0];

    // 3. Batch insert return items
    const insertedItems = [];
    for (const item of items) {
      const itemQuery = `
        INSERT INTO return_items (
          tenant_id, return_id, order_item_id, quantity, is_restocked, created_at
        )
        VALUES ($1, $2, $3, $4, false, NOW())
        RETURNING *;
      `;
      const itemRes = await client.query(itemQuery, [
        tenantId,
        returnRecord.id,
        item.order_item_id,
        item.quantity,
      ]);
      insertedItems.push(itemRes.rows[0]);
    }

    return {
      ...returnRecord,
      items: insertedItems,
    };
  });
};

/**
 * Get return details by ID with items, product info, and order
 */
const findReturnById = async (tenantId, id) => {
  return withTenantTransaction(tenantId, async (client) => {
    // 1. Fetch return
    const rmaQuery = `
      SELECT r.*, o.order_number, o.status AS order_status
      FROM returns r
      JOIN orders o ON o.id = r.order_id
      WHERE r.tenant_id = $1 AND r.id = $2;
    `;
    const rmaRes = await client.query(rmaQuery, [tenantId, id]);
    const returnRecord = rmaRes.rows[0];
    if (!returnRecord) return null;

    // 2. Fetch items
    const itemsQuery = `
      SELECT ri.*, oi.sku, oi.title, oi.product_id, oi.unit_price
      FROM return_items ri
      JOIN order_items oi ON oi.id = ri.order_item_id
      WHERE ri.tenant_id = $1 AND ri.return_id = $2;
    `;
    const itemsRes = await client.query(itemsQuery, [tenantId, id]);

    return {
      ...returnRecord,
      items: itemsRes.rows,
    };
  });
};

/**
 * List returns with filters and pagination
 */
const listReturns = async (tenantId, { orderId, status, rmaNumber, page = 1, limit = 20 }) => {
  return withTenantTransaction(tenantId, async (client) => {
    const offset = (page - 1) * limit;
    const params = [tenantId];
    let whereClauses = ['r.tenant_id = $1'];

    if (orderId) {
      params.push(orderId);
      whereClauses.push(`r.order_id = $${params.length}`);
    }

    if (status) {
      params.push(status);
      whereClauses.push(`r.status = $${params.length}`);
    }

    if (rmaNumber) {
      params.push(`%${rmaNumber}%`);
      whereClauses.push(`r.rma_number ILIKE $${params.length}`);
    }

    const whereStr = whereClauses.join(' AND ');

    // Total count
    const countQuery = `
      SELECT COUNT(*) AS total
      FROM returns r
      WHERE ${whereStr};
    `;
    const countRes = await client.query(countQuery, params);
    const total = parseInt(countRes.rows[0].total, 10);

    // Data query
    params.push(limit, offset);
    const dataQuery = `
      SELECT r.*, o.order_number, (SELECT COUNT(*) FROM return_items WHERE return_id = r.id) AS item_count
      FROM returns r
      JOIN orders o ON o.id = r.order_id
      WHERE ${whereStr}
      ORDER BY r.created_at DESC
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
 * Update RMA status in lifecycle
 */
const updateRmaStatus = async (tenantId, id, { status, reverseTrackingNumber, reverseLabelUrl }) => {
  return withTenantTransaction(tenantId, async (client) => {
    // 1. Lock return row
    const lockQuery = `
      SELECT *
      FROM returns
      WHERE tenant_id = $1 AND id = $2
      FOR UPDATE;
    `;
    const lockRes = await client.query(lockQuery, [tenantId, id]);
    const current = lockRes.rows[0];

    if (!current) {
      const err = new Error(`Return record not found with ID: ${id}`);
      err.statusCode = 404;
      throw err;
    }

    // 2. Update status
    const updateQuery = `
      UPDATE returns
      SET 
        status = $1,
        reverse_tracking_number = COALESCE($2, reverse_tracking_number),
        reverse_label_url = COALESCE($3, reverse_label_url),
        updated_at = NOW()
      WHERE tenant_id = $4 AND id = $5
      RETURNING *;
    `;
    const updateRes = await client.query(updateQuery, [
      status,
      reverseTrackingNumber || null,
      reverseLabelUrl || null,
      tenantId,
      id,
    ]);

    return updateRes.rows[0];
  });
};

/**
 * Inspect returned items and execute automated stock disposition (Restock sellable vs damaged scrap)
 */
const inspectAndRestock = async ({ tenantId, returnId, warehouseId, items = [] }) => {
  return withTenantTransaction(tenantId, async (client) => {
    // 1. Lock return
    const lockRes = await client.query(
      `SELECT * FROM returns WHERE tenant_id = $1 AND id = $2 FOR UPDATE;`,
      [tenantId, returnId]
    );
    const rma = lockRes.rows[0];
    if (!rma) {
      const err = new Error(`Return not found with ID: ${returnId}`);
      err.statusCode = 404;
      throw err;
    }

    const inspectedResults = [];

    for (const item of items) {
      const isSellable = item.qa_grade === QaGrade.SELLABLE;
      const isDamaged = item.qa_grade === QaGrade.DAMAGED_SCRAP;

      // 2. Update return item
      const itemUpdateQuery = `
        UPDATE return_items
        SET 
          qa_grade = $1,
          is_restocked = $2,
          inspected_at = NOW()
        WHERE tenant_id = $3 AND id = $4 AND return_id = $5
        RETURNING *;
      `;
      const itemRes = await client.query(itemUpdateQuery, [
        item.qa_grade,
        isSellable,
        tenantId,
        item.return_item_id,
        returnId,
      ]);
      const updatedItem = itemRes.rows[0];

      if (updatedItem) {
        // 3. Find product_id from order_items
        const oiRes = await client.query(
          `SELECT product_id FROM order_items WHERE id = $1;`,
          [updatedItem.order_item_id]
        );
        const productId = oiRes.rows[0]?.product_id;

        if (productId) {
          if (isSellable) {
            // Restock to sellable on_hand inventory
            await client.query(
              `
              INSERT INTO inventory_items (tenant_id, warehouse_id, product_id, on_hand, reserved, safety_stock, damaged, updated_at)
              VALUES ($1, $2, $3, $4, 0, 0, 0, NOW())
              ON CONFLICT (tenant_id, warehouse_id, product_id)
              DO UPDATE SET on_hand = inventory_items.on_hand + $4, updated_at = NOW();
            `,
              [tenantId, warehouseId, productId, updatedItem.quantity]
            );

            // Append adjustment ledger
            await client.query(
              `
              INSERT INTO inventory_adjustments (tenant_id, warehouse_id, product_id, quantity_delta, reason, created_at)
              VALUES ($1, $2, $3, $4, 'RMA_RESTOCK', NOW());
            `,
              [tenantId, warehouseId, productId, updatedItem.quantity]
            );
          } else if (isDamaged) {
            // Add to damaged quarantine ledger
            await client.query(
              `
              INSERT INTO inventory_items (tenant_id, warehouse_id, product_id, on_hand, reserved, safety_stock, damaged, updated_at)
              VALUES ($1, $2, $3, 0, 0, 0, $4, NOW())
              ON CONFLICT (tenant_id, warehouse_id, product_id)
              DO UPDATE SET damaged = inventory_items.damaged + $4, updated_at = NOW();
            `,
              [tenantId, warehouseId, productId, updatedItem.quantity]
            );

            await client.query(
              `
              INSERT INTO inventory_adjustments (tenant_id, warehouse_id, product_id, quantity_delta, reason, created_at)
              VALUES ($1, $2, $3, $4, 'RMA_DAMAGED_SCRAP', NOW());
            `,
              [tenantId, warehouseId, productId, updatedItem.quantity]
            );
          }
        }

        inspectedResults.push(updatedItem);
      }
    }

    // 4. Update RMA status to INSPECTED
    const finalRmaRes = await client.query(
      `
      UPDATE returns
      SET status = 'INSPECTED', updated_at = NOW()
      WHERE tenant_id = $1 AND id = $2
      RETURNING *;
    `,
      [tenantId, returnId]
    );

    return {
      return: finalRmaRes.rows[0],
      warehouseId,
      inspectedItems: inspectedResults,
    };
  });
};

module.exports = {
  createReturn,
  findReturnById,
  listReturns,
  updateRmaStatus,
  inspectAndRestock,
};

