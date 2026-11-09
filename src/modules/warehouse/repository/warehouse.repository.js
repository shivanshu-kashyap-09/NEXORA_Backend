const { withTenantTransaction } = require('../../../infrastructure/database/tenantTransaction');
const logger = require('../../../config/logger');

/**
 * Create a new warehouse fulfillment node
 */
const createWarehouse = async ({
  tenantId,
  code,
  name,
  isRetailStore = false,
  priority = 1,
  address,
}) => {
  return withTenantTransaction(tenantId, async (client) => {
    const query = `
      INSERT INTO warehouses (tenant_id, code, name, is_retail_store, priority, address)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *;
    `;
    const res = await client.query(query, [
      tenantId,
      code,
      name,
      isRetailStore,
      priority,
      JSON.stringify(address),
    ]);
    return res.rows[0];
  });
};

/**
 * Find warehouse by code within tenant
 */
const findWarehouseByCode = async (tenantId, code) => {
  return withTenantTransaction(tenantId, async (client) => {
    const query = `
      SELECT *
      FROM warehouses
      WHERE code = $1;
    `;
    const res = await client.query(query, [code]);
    return res.rows[0] || null;
  });
};

/**
 * List warehouses for tenant
 */
const getWarehouses = async (tenantId, { isActive } = {}) => {
  return withTenantTransaction(tenantId, async (client) => {
    let query = `
      SELECT *
      FROM warehouses
      WHERE 1=1
    `;
    const params = [];

    if (typeof isActive === 'boolean') {
      params.push(isActive);
      query += ` AND is_active = $${params.length}`;
    }

    query += ` ORDER BY priority ASC, created_at ASC;`;

    const res = await client.query(query, params);
    return res.rows;
  });
};

/**
 * Get warehouse by ID
 */
const getWarehouseById = async (tenantId, id) => {
  return withTenantTransaction(tenantId, async (client) => {
    const query = `
      SELECT *
      FROM warehouses
      WHERE id = $1;
    `;
    const res = await client.query(query, [id]);
    return res.rows[0] || null;
  });
};

/**
 * Update warehouse
 */
const updateWarehouse = async (tenantId, id, updates) => {
  return withTenantTransaction(tenantId, async (client) => {
    const fields = [];
    const values = [];
    let idx = 1;

    if (updates.name !== undefined) {
      fields.push(`name = $${idx++}`);
      values.push(updates.name);
    }
    if (updates.is_retail_store !== undefined) {
      fields.push(`is_retail_store = $${idx++}`);
      values.push(updates.is_retail_store);
    }
    if (updates.priority !== undefined) {
      fields.push(`priority = $${idx++}`);
      values.push(updates.priority);
    }
    if (updates.is_active !== undefined) {
      fields.push(`is_active = $${idx++}`);
      values.push(updates.is_active);
    }
    if (updates.address !== undefined) {
      fields.push(`address = $${idx++}`);
      values.push(JSON.stringify(updates.address));
    }

    if (fields.length === 0) {
      return getWarehouseById(tenantId, id);
    }

    values.push(id);
    const query = `
      UPDATE warehouses
      SET ${fields.join(', ')}
      WHERE id = $${idx}
      RETURNING *;
    `;

    const res = await client.query(query, values);
    return res.rows[0] || null;
  });
};

module.exports = {
  createWarehouse,
  findWarehouseByCode,
  getWarehouses,
  getWarehouseById,
  updateWarehouse,
};

