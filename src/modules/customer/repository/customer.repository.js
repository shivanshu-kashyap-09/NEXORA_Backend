const { withTenantTransaction } = require('../../../infrastructure/database/tenantTransaction');
const logger = require('../../../config/logger');
const { v4: uuidv4 } = require('uuid');

/**
 * Create a new customer profile
 */
const createCustomer = async ({
  tenantId,
  email,
  firstName,
  lastName,
  phone,
  shippingAddresses = [],
}) => {
  return withTenantTransaction(tenantId, async (client) => {
    // Ensure all addresses have a unique ID
    const formattedAddresses = shippingAddresses.map((addr) => ({
      id: addr.id || uuidv4(),
      ...addr,
    }));

    const query = `
      INSERT INTO customers (
        tenant_id, email, first_name, last_name, phone, shipping_addresses, is_blacklisted, created_at, updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, false, NOW(), NOW())
      RETURNING *;
    `;
    const res = await client.query(query, [
      tenantId,
      email,
      firstName || null,
      lastName || null,
      phone || null,
      JSON.stringify(formattedAddresses),
    ]);
    return res.rows[0];
  });
};

/**
 * Find customer by email within tenant
 */
const findCustomerByEmail = async (tenantId, email) => {
  return withTenantTransaction(tenantId, async (client) => {
    const query = `
      SELECT *
      FROM customers
      WHERE tenant_id = $1 AND email = $2;
    `;
    const res = await client.query(query, [tenantId, email.toLowerCase().trim()]);
    return res.rows[0] || null;
  });
};

/**
 * Get customer by ID within tenant
 */
const getCustomerById = async (tenantId, id) => {
  return withTenantTransaction(tenantId, async (client) => {
    const query = `
      SELECT *
      FROM customers
      WHERE tenant_id = $1 AND id = $2;
    `;
    const res = await client.query(query, [tenantId, id]);
    return res.rows[0] || null;
  });
};

/**
 * List customers with search and pagination
 */
const listCustomers = async (tenantId, { search, isBlacklisted, page = 1, limit = 20 }) => {
  return withTenantTransaction(tenantId, async (client) => {
    const offset = (page - 1) * limit;
    const params = [tenantId];
    let whereClauses = ['tenant_id = $1'];

    if (search) {
      params.push(`%${search}%`);
      whereClauses.push(
        `(email ILIKE $${params.length} OR first_name ILIKE $${params.length} OR last_name ILIKE $${params.length} OR phone ILIKE $${params.length})`
      );
    }

    if (isBlacklisted !== undefined) {
      params.push(isBlacklisted === 'true');
      whereClauses.push(`is_blacklisted = $${params.length}`);
    }

    const whereStr = whereClauses.join(' AND ');

    // Total count
    const countQuery = `
      SELECT COUNT(*) AS total
      FROM customers
      WHERE ${whereStr};
    `;
    const countRes = await client.query(countQuery, params);
    const total = parseInt(countRes.rows[0].total, 10);

    // Data query
    params.push(limit, offset);
    const dataQuery = `
      SELECT *
      FROM customers
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
 * Update customer details
 */
const updateCustomer = async (tenantId, id, updates) => {
  return withTenantTransaction(tenantId, async (client) => {
    const fields = [];
    const values = [];
    let idx = 1;

    if (updates.first_name !== undefined) {
      fields.push(`first_name = $${idx++}`);
      values.push(updates.first_name);
    }
    if (updates.last_name !== undefined) {
      fields.push(`last_name = $${idx++}`);
      values.push(updates.last_name);
    }
    if (updates.phone !== undefined) {
      fields.push(`phone = $${idx++}`);
      values.push(updates.phone);
    }
    if (updates.is_blacklisted !== undefined) {
      fields.push(`is_blacklisted = $${idx++}`);
      values.push(updates.is_blacklisted);
    }

    if (fields.length === 0) {
      return getCustomerById(tenantId, id);
    }

    fields.push('updated_at = NOW()');
    values.push(tenantId, id);

    const query = `
      UPDATE customers
      SET ${fields.join(', ')}
      WHERE tenant_id = $${idx++} AND id = $${idx++}
      RETURNING *;
    `;
    const res = await client.query(query, values);
    return res.rows[0] || null;
  });
};

/**
 * Add a shipping address to the customer's address book
 */
const addShippingAddress = async (tenantId, customerId, newAddress) => {
  return withTenantTransaction(tenantId, async (client) => {
    const addressWithId = {
      id: newAddress.id || uuidv4(),
      ...newAddress,
    };

    // If new address is marked as default, clear default from existing addresses
    const fetchQuery = `SELECT shipping_addresses FROM customers WHERE tenant_id = $1 AND id = $2;`;
    const fetchRes = await client.query(fetchQuery, [tenantId, customerId]);
    if (!fetchRes.rows[0]) return null;

    let addresses = fetchRes.rows[0].shipping_addresses || [];
    if (addressWithId.is_default) {
      addresses = addresses.map((a) => ({ ...a, is_default: false }));
    }
    addresses.push(addressWithId);

    const updateQuery = `
      UPDATE customers
      SET shipping_addresses = $1, updated_at = NOW()
      WHERE tenant_id = $2 AND id = $3
      RETURNING *;
    `;
    const updateRes = await client.query(updateQuery, [
      JSON.stringify(addresses),
      tenantId,
      customerId,
    ]);
    return updateRes.rows[0] || null;
  });
};

/**
 * Remove a shipping address from customer address book by address ID
 */
const deleteShippingAddress = async (tenantId, customerId, addressId) => {
  return withTenantTransaction(tenantId, async (client) => {
    const fetchQuery = `SELECT shipping_addresses FROM customers WHERE tenant_id = $1 AND id = $2;`;
    const fetchRes = await client.query(fetchQuery, [tenantId, customerId]);
    if (!fetchRes.rows[0]) return null;

    let addresses = fetchRes.rows[0].shipping_addresses || [];
    const filtered = addresses.filter((a) => a.id !== addressId);

    const updateQuery = `
      UPDATE customers
      SET shipping_addresses = $1, updated_at = NOW()
      WHERE tenant_id = $2 AND id = $3
      RETURNING *;
    `;
    const updateRes = await client.query(updateQuery, [
      JSON.stringify(filtered),
      tenantId,
      customerId,
    ]);
    return updateRes.rows[0] || null;
  });
};

module.exports = {
  createCustomer,
  findCustomerByEmail,
  getCustomerById,
  listCustomers,
  updateCustomer,
  addShippingAddress,
  deleteShippingAddress,
};

