const { pool } = require('../../../config/database');
const logger = require('../../../config/logger');

/**
 * Find user by email (used during authentication & registration checks)
 * @param {string} email
 * @returns {Promise<object|null>}
 */
const findUserByEmail = async (email) => {
  try {
    const query = `
      SELECT id, email, password_hash, first_name, last_name, is_active, is_verified, failed_login_attempts, locked_until
      FROM users
      WHERE email = $1;
    `;
    const res = await pool.query(query, [email.toLowerCase().trim()]);
    return res.rows[0] || null;
  } catch (error) {
    logger.error('Error occurred in findUserByEmail:', { email, error: error.message });
    throw error;
  }
};

/**
 * Find user by ID (for profile / token checks)
 * @param {string} userId
 * @returns {Promise<object|null>}
 */
const findUserById = async (userId) => {
  try {
    const query = `
      SELECT id, email, first_name, last_name, phone, is_active, is_verified, created_at, updated_at
      FROM users
      WHERE id = $1;
    `;
    const res = await pool.query(query, [userId]);
    return res.rows[0] || null;
  } catch (error) {
    logger.error('Error occurred in findUserById:', { userId, error: error.message });
    throw error;
  }
};

/**
 * Create a new user record in the database
 * @param {object} userData
 * @returns {Promise<object>}
 */
const createUser = async ({ email, passwordHash, firstName, lastName, phone }) => {
  try {
    const query = `
      INSERT INTO users (email, password_hash, first_name, last_name, phone)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING id, email, first_name, last_name, phone, is_active, is_verified, created_at;
    `;
    const values = [email.toLowerCase().trim(), passwordHash, firstName.trim(), lastName?.trim() || null, phone?.trim() || null];
    const res = await pool.query(query, values);
    return res.rows[0];
  } catch (error) {
    logger.error('Error occurred in createUser:', { email, error: error.message });
    throw error;
  }
};

/**
 * Get all affiliated active tenants and roles for a specific user
 * @param {string} userId
 * @returns {Promise<Array>}
 */
const getUserTenantsAndRoles = async (userId) => {
  try {
    const query = `
      SELECT 
        tu.tenant_id,
        t.name AS tenant_name,
        t.slug AS tenant_slug,
        t.status AS tenant_status,
        tu.role_name
      FROM tenant_users tu
      JOIN tenants t ON t.id = tu.tenant_id
      WHERE tu.user_id = $1 AND tu.is_active = true AND t.status = 'ACTIVE';
    `;
    const res = await pool.query(query, [userId]);
    return res.rows;
  } catch (error) {
    logger.error('Error occurred in getUserTenantsAndRoles:', { userId, error: error.message });
    throw error;
  }
};

/**
 * Create an active user session in the database for refresh token tracking
 * @param {object} sessionData
 * @returns {Promise<object>}
 */
const createUserSession = async ({ userId, refreshTokenHash, userAgent, ipAddress, expiresAt }) => {
  try {
    const query = `
      INSERT INTO user_sessions (user_id, refresh_token_hash, user_agent, ip_address, expires_at)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING id, user_id, expires_at, created_at;
    `;
    const res = await pool.query(query, [userId, refreshTokenHash, userAgent || null, ipAddress || null, expiresAt]);
    return res.rows[0];
  } catch (error) {
    logger.error('Error occurred in createUserSession:', { userId, error: error.message });
    throw error;
  }
};

/**
 * Find active session by hashed refresh token
 * @param {string} refreshTokenHash
 * @returns {Promise<object|null>}
 */
const findSessionByTokenHash = async (refreshTokenHash) => {
  try {
    const query = `
      SELECT id, user_id, refresh_token_hash, expires_at, is_revoked
      FROM user_sessions
      WHERE refresh_token_hash = $1 AND is_revoked = false AND expires_at > NOW();
    `;
    const res = await pool.query(query, [refreshTokenHash]);
    return res.rows[0] || null;
  } catch (error) {
    logger.error('Error occurred in findSessionByTokenHash:', { error: error.message });
    throw error;
  }
};

/**
 * Revoke a specific session (single-use token invalidation / logout)
 * @param {string} sessionId
 * @returns {Promise<boolean>}
 */
const revokeSession = async (sessionId) => {
  try {
    const query = `
      UPDATE user_sessions
      SET is_revoked = true
      WHERE id = $1;
    `;
    await pool.query(query, [sessionId]);
    return true;
  } catch (error) {
    logger.error('Error occurred in revokeSession:', { sessionId, error: error.message });
    throw error;
  }
};

/**
 * Revoke all sessions for a user (security lockout / global logout)
 * @param {string} userId
 * @returns {Promise<boolean>}
 */
const revokeAllUserSessions = async (userId) => {
  try {
    const query = `
      UPDATE user_sessions
      SET is_revoked = true
      WHERE user_id = $1;
    `;
    await pool.query(query, [userId]);
    return true;
  } catch (error) {
    logger.error('Error occurred in revokeAllUserSessions:', { userId, error: error.message });
    throw error;
  }
};

module.exports = {
  findUserByEmail,
  findUserById,
  createUser,
  getUserTenantsAndRoles,
  createUserSession,
  findSessionByTokenHash,
  revokeSession,
  revokeAllUserSessions,
};
