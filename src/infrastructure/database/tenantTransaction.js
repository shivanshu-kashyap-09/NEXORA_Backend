const { pool } = require('../../config/database');
const logger = require('../../config/logger');

/**
 * Execute a callback within an isolated PostgreSQL transaction with Tenant Context (RLS)
 * @param {string} tenantId - UUID of the tenant
 * @param {Function} callback - Async function receiving client: async (client) => { ... }
 */
const withTenantTransaction = async (tenantId, callback) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    if (tenantId) {
      // Set session-level tenant variable for PostgreSQL Row Level Security (RLS)
      await client.query('SELECT set_config($1, $2, true)', ['app.current_tenant_id', tenantId]);
    }

    const result = await callback(client);

    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('Transaction rolled back due to error:', { tenantId, error: error.message });
    throw error;
  } finally {
    client.release();
  }
};

/**
 * Execute a single query with tenant context
 */
const withTenantQuery = async (tenantId, queryText, params = []) => {
  return withTenantTransaction(tenantId, async (client) => {
    return await client.query(queryText, params);
  });
};

module.exports = {
  withTenantTransaction,
  withTenantQuery,
};
