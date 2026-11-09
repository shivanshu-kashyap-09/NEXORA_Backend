const { pool } = require('../../../config/database');
const logger = require('../../../config/logger');

/**
 * Check if a tenant slug already exists
 * @param {string} slug
 * @returns {Promise<object|null>}
 */
const findTenantBySlug = async (slug) => {
  try {
    const query = `
      SELECT id, slug, name, status, tier, primary_email, primary_currency, timezone, created_at
      FROM tenants
      WHERE slug = $1 AND NOT is_deleted;
    `;
    const res = await pool.query(query, [slug.toLowerCase().trim()]);
    return res.rows[0] || null;
  } catch (error) {
    logger.error('Error in findTenantBySlug:', { slug, error: error.message });
    throw error;
  }
};

/**
 * Find tenant by ID including profile, quotas, and configs
 * @param {string} tenantId
 * @returns {Promise<object|null>}
 */
const findTenantById = async (tenantId) => {
  try {
    const query = `
      SELECT 
        t.id, t.slug, t.name, t.legal_name, t.status, t.tier, t.primary_email, t.primary_currency, t.timezone, t.created_at,
        row_to_json(tp.*) AS profile,
        row_to_json(tq.*) AS quotas,
        row_to_json(tc.*) AS configs
      FROM tenants t
      LEFT JOIN tenant_profiles tp ON tp.tenant_id = t.id
      LEFT JOIN tenant_quotas tq ON tq.tenant_id = t.id
      LEFT JOIN tenant_configs tc ON tc.tenant_id = t.id
      WHERE t.id = $1 AND NOT t.is_deleted;
    `;
    const res = await pool.query(query, [tenantId]);
    return res.rows[0] || null;
  } catch (error) {
    logger.error('Error in findTenantById:', { tenantId, error: error.message });
    throw error;
  }
};

/**
 * Atomic Tenant Onboarding Transaction
 * Provisions Tenant, Profile, Quotas, Configs, Admin User, and Owner Binding
 * @param {object} param0
 * @returns {Promise<object>}
 */
const createTenantWithAdmin = async ({
  companyName,
  slug,
  primaryEmail,
  primaryCurrency,
  timezone,
  tier,
  passwordHash,
  firstName,
  lastName,
}) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1. Insert Tenant
    const tenantInsertQuery = `
      INSERT INTO tenants (slug, name, primary_email, primary_currency, timezone, tier, status)
      VALUES ($1, $2, $3, $4, $5, $6, 'ACTIVE')
      RETURNING id, slug, name, status, tier, primary_email, primary_currency, timezone, created_at;
    `;
    const tenantRes = await client.query(tenantInsertQuery, [
      slug.toLowerCase().trim(),
      companyName.trim(),
      primaryEmail.toLowerCase().trim(),
      primaryCurrency || 'USD',
      timezone || 'UTC',
      tier || 'STARTER',
    ]);
    const tenant = tenantRes.rows[0];

    // Set Tenant Context for subsequent RLS queries in this transaction
    await client.query('SELECT set_config($1, $2, true)', ['app.current_tenant_id', tenant.id]);

    // 2. Insert Default Profile
    const profileInsertQuery = `
      INSERT INTO tenant_profiles (tenant_id, support_email)
      VALUES ($1, $2)
      RETURNING *;
    `;
    const profileRes = await client.query(profileInsertQuery, [tenant.id, primaryEmail.toLowerCase().trim()]);

    // 3. Insert Default Quotas
    const quotasInsertQuery = `
      INSERT INTO tenant_quotas (tenant_id, max_orders_per_month, max_skus, max_warehouses, max_users)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING *;
    `;
    const quotaDefaults = tier === 'ENTERPRISE' ? [50000, 20000, 20, 50] : [10000, 5000, 5, 10];
    const quotasRes = await client.query(quotasInsertQuery, [tenant.id, ...quotaDefaults]);

    // 4. Insert Default Configs
    const configsInsertQuery = `
      INSERT INTO tenant_configs (tenant_id, soft_hold_duration_minutes, auto_capture_payment)
      VALUES ($1, 15, true)
      RETURNING *;
    `;
    const configsRes = await client.query(configsInsertQuery, [tenant.id]);

    // 5. Insert / Find Admin User
    let userId;
    const findUserQuery = 'SELECT id FROM users WHERE email = $1;';
    const existingUser = await client.query(findUserQuery, [primaryEmail.toLowerCase().trim()]);

    if (existingUser.rows.length > 0) {
      userId = existingUser.rows[0].id;
    } else {
      const userInsertQuery = `
        INSERT INTO users (email, password_hash, first_name, last_name, is_verified, is_active)
        VALUES ($1, $2, $3, $4, true, true)
        RETURNING id, email, first_name, last_name;
      `;
      const userRes = await client.query(userInsertQuery, [
        primaryEmail.toLowerCase().trim(),
        passwordHash,
        firstName.trim(),
        lastName?.trim() || null,
      ]);
      userId = userRes.rows[0].id;
    }

    // 6. Link User to Tenant as Owner
    const linkUserQuery = `
      INSERT INTO tenant_users (tenant_id, user_id, role_name, is_active)
      VALUES ($1, $2, 'owner', true)
      RETURNING id, tenant_id, user_id, role_name;
    `;
    const tenantUserRes = await client.query(linkUserQuery, [tenant.id, userId]);

    await client.query('COMMIT');

    return {
      tenant,
      profile: profileRes.rows[0],
      quotas: quotasRes.rows[0],
      configs: configsRes.rows[0],
      adminUser: {
        id: userId,
        email: primaryEmail,
        firstName,
        lastName,
        role: 'owner',
      },
    };
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('Error during createTenantWithAdmin transaction:', { slug, error: error.message });
    throw error;
  } finally {
    client.release();
  }
};

/**
 * Update tenant profile
 * @param {string} tenantId
 * @param {object} updates
 * @returns {Promise<object>}
 */
const updateProfile = async (tenantId, updates) => {
  const fields = [];
  const values = [tenantId];
  let idx = 2;

  for (const [key, val] of Object.entries(updates)) {
    if (val !== undefined) {
      fields.push(`${key} = $${idx}`);
      values.push(val);
      idx++;
    }
  }

  if (fields.length === 0) return null;

  const query = `
    UPDATE tenant_profiles
    SET ${fields.join(', ')}, updated_at = NOW()
    WHERE tenant_id = $1
    RETURNING *;
  `;
  const res = await pool.query(query, values);
  return res.rows[0];
};

/**
 * Update tenant business configurations
 * @param {string} tenantId
 * @param {object} updates
 * @returns {Promise<object>}
 */
const updateConfigs = async (tenantId, updates) => {
  const fields = [];
  const values = [tenantId];
  let idx = 2;

  for (const [key, val] of Object.entries(updates)) {
    if (val !== undefined) {
      fields.push(`${key} = $${idx}`);
      values.push(val);
      idx++;
    }
  }

  if (fields.length === 0) return null;

  const query = `
    UPDATE tenant_configs
    SET ${fields.join(', ')}, updated_at = NOW()
    WHERE tenant_id = $1
    RETURNING *;
  `;
  const res = await pool.query(query, values);
  return res.rows[0];
};

/**
 * Add or link a team member to a tenant
 * @param {object} param0
 * @returns {Promise<object>}
 */
const addTenantUser = async ({ tenantId, userId, roleName }) => {
  try {
    const query = `
      INSERT INTO tenant_users (tenant_id, user_id, role_name, is_active)
      VALUES ($1, $2, $3, true)
      ON CONFLICT (tenant_id, user_id) 
      DO UPDATE SET role_name = EXCLUDED.role_name, is_active = true
      RETURNING *;
    `;
    const res = await pool.query(query, [tenantId, userId, roleName]);
    return res.rows[0];
  } catch (error) {
    logger.error('Error in addTenantUser:', { tenantId, userId, error: error.message });
    throw error;
  }
};

/**
 * Get all team members of a tenant
 * @param {string} tenantId
 * @returns {Promise<Array>}
 */
const getTenantUsers = async (tenantId) => {
  try {
    const query = `
      SELECT 
        u.id AS user_id,
        u.email,
        u.first_name,
        u.last_name,
        u.phone,
        tu.role_name,
        tu.is_active,
        tu.created_at AS joined_at
      FROM tenant_users tu
      JOIN users u ON u.id = tu.user_id
      WHERE tu.tenant_id = $1
      ORDER BY tu.created_at ASC;
    `;
    const res = await pool.query(query, [tenantId]);
    return res.rows;
  } catch (error) {
    logger.error('Error in getTenantUsers:', { tenantId, error: error.message });
    throw error;
  }
};

module.exports = {
  findTenantBySlug,
  findTenantById,
  createTenantWithAdmin,
  updateProfile,
  updateConfigs,
  addTenantUser,
  getTenantUsers,
};

