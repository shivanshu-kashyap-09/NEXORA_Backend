const jwt = require('jsonwebtoken');
const config = require('../../../config/environment');
const logger = require('../../../config/logger');
const CryptoUtils = require('../../../shared/utils/cryptoUtils');
const { ConflictError, NotFoundError, BadRequestError } = require('../../../shared/errors');
const tenantRepository = require('../repository/tenant.repository');
const identityRepository = require('../../identity/repository/identity.repository');

/**
 * Onboard a new brand/tenant along with its initial owner admin account
 * @param {object} payload
 * @returns {Promise<object>}
 */
const onboardTenant = async (payload) => {
  // 1. Ensure Slug is available
  const existingTenant = await tenantRepository.findTenantBySlug(payload.slug);
  if (existingTenant) {
    throw new ConflictError(`Tenant slug '${payload.slug}' is already taken. Please choose a different identifier.`);
  }

  // 2. Hash owner admin password
  const passwordHash = await CryptoUtils.hashPassword(payload.password);

  // 3. Execute atomic creation transaction
  const result = await tenantRepository.createTenantWithAdmin({
    companyName: payload.company_name,
    slug: payload.slug,
    primaryEmail: payload.primary_email,
    primaryCurrency: payload.primary_currency,
    timezone: payload.timezone,
    tier: payload.tier,
    passwordHash,
    firstName: payload.first_name,
    lastName: payload.last_name,
  });

  // 4. Generate immediate authenticated JWT & Refresh Token for the new owner
  const tokenPayload = {
    userId: result.adminUser.id,
    email: result.adminUser.email,
    tenantId: result.tenant.id,
    role: 'owner',
  };

  const accessToken = jwt.sign(tokenPayload, config.jwt.access_secret, {
    expiresIn: config.jwt.expires_in,
  });

  const refreshToken = CryptoUtils.randomString(40);
  const crypto = require('crypto');
  const refreshTokenHash = crypto.createHash('sha256').update(refreshToken).digest('hex');

  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 7);

  await identityRepository.createUserSession({
    userId: result.adminUser.id,
    refreshTokenHash,
    userAgent: payload.userAgent || null,
    ipAddress: payload.ipAddress || null,
    expiresAt,
  });

  logger.info('New tenant onboarded successfully:', { tenantId: result.tenant.id, slug: result.tenant.slug });

  return {
    tenant: result.tenant,
    profile: result.profile,
    quotas: result.quotas,
    configs: result.configs,
    adminUser: result.adminUser,
    tokens: {
      accessToken,
      refreshToken,
      expiresIn: config.jwt.expires_in,
    },
  };
};

/**
 * Fetch current authenticated tenant details
 * @param {string} tenantId
 * @returns {Promise<object>}
 */
const getCurrentTenant = async (tenantId) => {
  const tenant = await tenantRepository.findTenantById(tenantId);
  if (!tenant) {
    throw new NotFoundError('Tenant organization not found or inactive');
  }
  return tenant;
};

/**
 * Update tenant profile metadata
 * @param {string} tenantId
 * @param {object} updates
 * @returns {Promise<object>}
 */
const updateProfile = async (tenantId, updates) => {
  const profile = await tenantRepository.updateProfile(tenantId, updates);
  if (!profile) {
    throw new NotFoundError('Tenant profile not found');
  }
  return profile;
};

/**
 * Update tenant configurations
 * @param {string} tenantId
 * @param {object} updates
 * @returns {Promise<object>}
 */
const updateConfigs = async (tenantId, updates) => {
  const configs = await tenantRepository.updateConfigs(tenantId, updates);
  if (!configs) {
    throw new NotFoundError('Tenant configurations not found');
  }
  return configs;
};

/**
 * Invite a team member to the tenant
 * @param {string} tenantId
 * @param {object} param1
 * @returns {Promise<object>}
 */
const inviteTeamMember = async (tenantId, { email, role_name, first_name, last_name }) => {
  let user = await identityRepository.findUserByEmail(email);

  if (!user) {
    // Create provisional user account with random initial password
    const tempPassword = CryptoUtils.randomString(16);
    const passwordHash = await CryptoUtils.hashPassword(tempPassword);

    user = await identityRepository.createUser({
      email,
      passwordHash,
      firstName: first_name,
      lastName: last_name,
    });
  }

  // Link user to tenant with designated role
  const membership = await tenantRepository.addTenantUser({
    tenantId,
    userId: user.id,
    roleName: role_name,
  });

  logger.info('Team member invited to tenant:', { tenantId, userId: user.id, role: role_name });

  return {
    user: {
      id: user.id,
      email: user.email,
      firstName: user.first_name,
      lastName: user.last_name,
    },
    membership,
  };
};

/**
 * List all team members within a tenant
 * @param {string} tenantId
 * @returns {Promise<Array>}
 */
const listTeamMembers = async (tenantId) => {
  return await tenantRepository.getTenantUsers(tenantId);
};

module.exports = {
  onboardTenant,
  getCurrentTenant,
  updateProfile,
  updateConfigs,
  inviteTeamMember,
  listTeamMembers,
};

