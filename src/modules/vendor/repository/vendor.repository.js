const { withTenantTransaction } = require('../../../infrastructure/database/tenantTransaction');
const logger = require('../../../config/logger');

/**
 * Register a new vendor / drop-shipper
 */
const createVendor = async ({
  tenantId,
  code,
  name,
  email,
  phone = null,
  commissionPercentage = 0,
  isActive = true,
}) => {
  return withTenantTransaction(tenantId, async (client) => {
    const query = `
      INSERT INTO vendors (
        tenant_id, code, name, email, phone, commission_percentage, is_active, created_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
      RETURNING *;
    `;
    const res = await client.query(query, [
      tenantId,
      code.toUpperCase().trim(),
      name.trim(),
      email.toLowerCase().trim(),
      phone,
      commissionPercentage,
      isActive,
    ]);
    return res.rows[0];
  });
};

/**
 * Find vendor by ID
 */
const findVendorById = async (tenantId, id) => {
  return withTenantTransaction(tenantId, async (client) => {
    const query = `
      SELECT v.*,
        (SELECT COUNT(*) FROM purchase_orders WHERE vendor_id = v.id) AS po_count
      FROM vendors v
      WHERE v.tenant_id = $1 AND v.id = $2;
    `;
    const res = await client.query(query, [tenantId, id]);
    return res.rows[0] || null;
  });
};

/**
 * Find vendor by code
 */
const findVendorByCode = async (tenantId, code) => {
  return withTenantTransaction(tenantId, async (client) => {
    const query = `
      SELECT *
      FROM vendors
      WHERE tenant_id = $1 AND code = $2;
    `;
    const res = await client.query(query, [tenantId, code.toUpperCase().trim()]);
    return res.rows[0] || null;
  });
};

/**
 * List vendors with filters and pagination
 */
const listVendors = async (tenantId, { search, isActive, page = 1, limit = 20 }) => {
  return withTenantTransaction(tenantId, async (client) => {
    const offset = (page - 1) * limit;
    const params = [tenantId];
    let whereClauses = ['v.tenant_id = $1'];

    if (search) {
      params.push(`%${search}%`);
      whereClauses.push(`(v.name ILIKE $${params.length} OR v.code ILIKE $${params.length})`);
    }

    if (isActive !== undefined) {
      params.push(isActive === 'true' || isActive === true);
      whereClauses.push(`v.is_active = $${params.length}`);
    }

    const whereStr = whereClauses.join(' AND ');

    // Count
    const countQuery = `SELECT COUNT(*) AS total FROM vendors v WHERE ${whereStr};`;
    const countRes = await client.query(countQuery, params);
    const total = parseInt(countRes.rows[0].total, 10);

    // List
    params.push(limit, offset);
    const dataQuery = `
      SELECT v.*,
        (SELECT COUNT(*) FROM purchase_orders WHERE vendor_id = v.id) AS po_count
      FROM vendors v
      WHERE ${whereStr}
      ORDER BY v.created_at DESC
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
 * Create a new Purchase Order
 */
const createPurchaseOrder = async ({
  tenantId,
  vendorId,
  poNumber = null,
  totalCost,
  expectedDeliveryDate = null,
}) => {
  return withTenantTransaction(tenantId, async (client) => {
    const generatedPo = poNumber || `PO-${Date.now().toString(36).toUpperCase()}-${Math.floor(1000 + Math.random() * 9000)}`;

    const query = `
      INSERT INTO purchase_orders (
        tenant_id, vendor_id, po_number, status, total_cost, expected_delivery_date, created_at
      )
      VALUES ($1, $2, $3, 'ISSUED', $4, $5, NOW())
      RETURNING *;
    `;
    const res = await client.query(query, [
      tenantId,
      vendorId,
      generatedPo,
      totalCost,
      expectedDeliveryDate,
    ]);
    return res.rows[0];
  });
};

/**
 * Find Purchase Order by ID with vendor info
 */
const findPoById = async (tenantId, id) => {
  return withTenantTransaction(tenantId, async (client) => {
    const query = `
      SELECT po.*, v.name AS vendor_name, v.code AS vendor_code, v.email AS vendor_email
      FROM purchase_orders po
      JOIN vendors v ON v.id = po.vendor_id
      WHERE po.tenant_id = $1 AND po.id = $2;
    `;
    const res = await client.query(query, [tenantId, id]);
    return res.rows[0] || null;
  });
};

/**
 * List Purchase Orders with filters
 */
const listPurchaseOrders = async (tenantId, { vendorId, status, search, page = 1, limit = 20 }) => {
  return withTenantTransaction(tenantId, async (client) => {
    const offset = (page - 1) * limit;
    const params = [tenantId];
    let whereClauses = ['po.tenant_id = $1'];

    if (vendorId) {
      params.push(vendorId);
      whereClauses.push(`po.vendor_id = $${params.length}`);
    }

    if (status) {
      params.push(status);
      whereClauses.push(`po.status = $${params.length}`);
    }

    if (search) {
      params.push(`%${search}%`);
      whereClauses.push(`po.po_number ILIKE $${params.length}`);
    }

    const whereStr = whereClauses.join(' AND ');

    // Count
    const countQuery = `SELECT COUNT(*) AS total FROM purchase_orders po WHERE ${whereStr};`;
    const countRes = await client.query(countQuery, params);
    const total = parseInt(countRes.rows[0].total, 10);

    // List
    params.push(limit, offset);
    const dataQuery = `
      SELECT po.*, v.name AS vendor_name, v.code AS vendor_code
      FROM purchase_orders po
      JOIN vendors v ON v.id = po.vendor_id
      WHERE ${whereStr}
      ORDER BY po.created_at DESC
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
 * Receive Purchase Order goods at warehouse and automatically restock on_hand inventory
 */
const receivePurchaseOrder = async ({
  tenantId,
  poId,
  warehouseId,
  items = [],
}) => {
  return withTenantTransaction(tenantId, async (client) => {
    // 1. Lock PO row
    const lockRes = await client.query(
      `SELECT * FROM purchase_orders WHERE tenant_id = $1 AND id = $2 FOR UPDATE;`,
      [tenantId, poId]
    );
    const po = lockRes.rows[0];
    if (!po) {
      const err = new Error(`Purchase Order not found with ID: ${poId}`);
      err.statusCode = 404;
      throw err;
    }

    if (po.status === 'RECEIVED') {
      const err = new Error(`Purchase Order ${po.po_number} has already been received.`);
      err.statusCode = 400;
      throw err;
    }

    // 2. Restock each product item into inventory_items at warehouseId
    const receivedItems = [];
    for (const item of items) {
      // Upsert into inventory_items
      await client.query(
        `
        INSERT INTO inventory_items (tenant_id, warehouse_id, product_id, on_hand, reserved, safety_stock, damaged, updated_at)
        VALUES ($1, $2, $3, $4, 0, 0, 0, NOW())
        ON CONFLICT (tenant_id, warehouse_id, product_id)
        DO UPDATE SET on_hand = inventory_items.on_hand + $4, updated_at = NOW();
      `,
        [tenantId, warehouseId, item.product_id, item.quantity_received]
      );

      // Log in inventory_adjustments
      await client.query(
        `
        INSERT INTO inventory_adjustments (tenant_id, warehouse_id, product_id, quantity_delta, reason, created_at)
        VALUES ($1, $2, $3, $4, 'PO_RECEIPT', NOW());
      `,
        [tenantId, warehouseId, item.product_id, item.quantity_received]
      );

      receivedItems.push({
        product_id: item.product_id,
        quantity_received: item.quantity_received,
      });
    }

    // 3. Update PO status to RECEIVED
    const updateRes = await client.query(
      `UPDATE purchase_orders SET status = 'RECEIVED' WHERE tenant_id = $1 AND id = $2 RETURNING *;`,
      [tenantId, poId]
    );

    return {
      purchase_order: updateRes.rows[0],
      warehouse_id: warehouseId,
      received_items: receivedItems,
    };
  });
};

module.exports = {
  createVendor,
  findVendorById,
  findVendorByCode,
  listVendors,
  createPurchaseOrder,
  findPoById,
  listPurchaseOrders,
  receivePurchaseOrder,
};

