const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const config = require('../../../config/environment');
const logger = require('../../../config/logger');
const CryptoUtils = require('../../../shared/utils/cryptoUtils');
const { ConflictError, UnauthorizedError, ForbiddenError, NotFoundError } = require('../../../shared/errors');
const identityRepository = require('../repository/identity.repository');

/**
 * Hash refresh token using SHA-256 for secure database storage
 * @param {string} token
 * @returns {string}
 */
const hashToken = (token) => {
  return crypto.createHash('sha256').update(token).digest('hex');
};

/**
 * Helper to generate Access Token (JWT) and Refresh Token (Random Hex)
 * @param {object} user
 * @param {object} tenantContext
 * @returns {object}
 */
const generateAuthTokens = (user, tenantContext = null) => {
  const payload = {
    userId: user.id,
    email: user.email,
    tenantId: tenantContext?.tenant_id || null,
    role: tenantContext?.role_name || null,
  };

  const accessToken = jwt.sign(payload, config.jwt.access_secret, {
    expiresIn: config.jwt.expires_in,
  });

  const refreshToken = CryptoUtils.randomString(40);
  const refreshTokenHash = hashToken(refreshToken);

  // Calculate 7-day expiration date
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 7);

  return {
    accessToken,
    refreshToken,
    refreshTokenHash,
    expiresAt,
    expiresIn: config.jwt.expires_in,
  };
};

/**
 * Register a new user
 * @param {object} registerData
 * @returns {Promise<object>}
 */
const register = async (registerData) => {
  const existingUser = await identityRepository.findUserByEmail(registerData.email);
  if (existingUser) {
    throw new ConflictError('A user with this email address already exists');
  }

  const passwordHash = await CryptoUtils.hashPassword(registerData.password);

  const newUser = await identityRepository.createUser({
    email: registerData.email,
    passwordHash,
    firstName: registerData.first_name,
    lastName: registerData.last_name,
    phone: registerData.phone,
  });

  logger.info('New user registered successfully:', { userId: newUser.id, email: newUser.email });
  return newUser;
};

/**
 * Authenticate user and issue access + refresh tokens
 * @param {object} credentials
 * @returns {Promise<object>}
 */
const login = async ({ email, password, userAgent, ipAddress, tenantSlug }) => {
  const user = await identityRepository.findUserByEmail(email);
  if (!user) {
    throw new UnauthorizedError('Invalid email or password credentials');
  }

  if (!user.is_active) {
    throw new ForbiddenError('User account is suspended or deactivated');
  }

  if (user.locked_until && new Date(user.locked_until) > new Date()) {
    throw new ForbiddenError('Account is temporarily locked. Please try again later.');
  }

  const isPasswordValid = await CryptoUtils.comparePassword(password, user.password_hash);
  if (!isPasswordValid) {
    logger.warn('Failed login attempt for user:', { email });
    throw new UnauthorizedError('Invalid email or password credentials');
  }

  // Fetch associated tenants and roles
  const tenants = await identityRepository.getUserTenantsAndRoles(user.id);

  // Resolve active tenant context
  let activeTenant = null;
  if (tenants.length > 0) {
    if (tenantSlug) {
      activeTenant = tenants.find((t) => t.tenant_slug === tenantSlug) || tenants[0];
    } else {
      activeTenant = tenants[0];
    }
  }

  // Generate tokens
  const tokenData = generateAuthTokens(user, activeTenant);

  // Store refresh session in database
  await identityRepository.createUserSession({
    userId: user.id,
    refreshTokenHash: tokenData.refreshTokenHash,
    userAgent,
    ipAddress,
    expiresAt: tokenData.expiresAt,
  });

  logger.info('User authenticated successfully:', { userId: user.id, tenantId: activeTenant?.tenant_id });

  return {
    user: {
      id: user.id,
      email: user.email,
      firstName: user.first_name,
      lastName: user.last_name,
    },
    tenants,
    activeTenant,
    tokens: {
      accessToken: tokenData.accessToken,
      refreshToken: tokenData.refreshToken,
      expiresIn: tokenData.expiresIn,
    },
  };
};

/**
 * Refresh access token using single-use refresh token rotation
 * @param {object} params
 * @returns {Promise<object>}
 */
const refreshToken = async ({ refreshToken: token, userAgent, ipAddress }) => {
  const tokenHash = hashToken(token);
  const session = await identityRepository.findSessionByTokenHash(tokenHash);

  if (!session) {
    throw new UnauthorizedError('Invalid, expired, or already used refresh token');
  }

  // Single-use token rotation: Invalidate old session
  await identityRepository.revokeSession(session.id);

  const user = await identityRepository.findUserById(session.user_id);
  if (!user || !user.is_active) {
    throw new UnauthorizedError('User account is invalid or no longer active');
  }

  const tenants = await identityRepository.getUserTenantsAndRoles(user.id);
  const activeTenant = tenants.length > 0 ? tenants[0] : null;

  // Issue new token pair
  const tokenData = generateAuthTokens(user, activeTenant);

  // Save new session
  await identityRepository.createUserSession({
    userId: user.id,
    refreshTokenHash: tokenData.refreshTokenHash,
    userAgent,
    ipAddress,
    expiresAt: tokenData.expiresAt,
  });

  logger.info('Access token refreshed via rotation:', { userId: user.id });

  return {
    accessToken: tokenData.accessToken,
    refreshToken: tokenData.refreshToken,
    expiresIn: tokenData.expiresIn,
  };
};

/**
 * Log out user by revoking active refresh token session
 * @param {string} token
 * @returns {Promise<boolean>}
 */
const logout = async (token) => {
  if (!token) return true;
  const tokenHash = hashToken(token);
  const session = await identityRepository.findSessionByTokenHash(tokenHash);
  if (session) {
    await identityRepository.revokeSession(session.id);
    logger.info('User session revoked on logout:', { sessionId: session.id });
  }
  return true;
};

module.exports = {
  register,
  login,
  refreshToken,
  logout,
};

