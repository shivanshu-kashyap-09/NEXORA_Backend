const catchAsync = require('../../../shared/utils/catchAsync');
const ApiResponse = require('../../../shared/utils/ApiResponse');
const identityService = require('../service/identity.service');
const identityRepository = require('../repository/identity.repository');
const { NotFoundError } = require('../../../shared/errors');

/**
 * Handle new user registration
 */
const register = catchAsync(async (req, res) => {
  const user = await identityService.register(req.body);
  return ApiResponse.created(res, user, 'User registered successfully');
});

/**
 * Handle user authentication and token issuance
 */
const login = catchAsync(async (req, res) => {
  const userAgent = req.headers['user-agent'] || null;
  const ipAddress = req.ip || req.connection.remoteAddress || null;
  const { email, password, tenant_slug } = req.body;

  const result = await identityService.login({
    email,
    password,
    userAgent,
    ipAddress,
    tenantSlug: tenant_slug,
  });

  return ApiResponse.success(res, result, 'Authentication successful');
});

/**
 * Handle refresh token rotation
 */
const refreshToken = catchAsync(async (req, res) => {
  const userAgent = req.headers['user-agent'] || null;
  const ipAddress = req.ip || req.connection.remoteAddress || null;
  const { refreshToken: token } = req.body;

  const tokens = await identityService.refreshToken({
    refreshToken: token,
    userAgent,
    ipAddress,
  });

  return ApiResponse.success(res, tokens, 'Token refreshed successfully');
});

/**
 * Handle user logout and session invalidation
 */
const logout = catchAsync(async (req, res) => {
  const { refreshToken: token } = req.body;
  await identityService.logout(token);
  return ApiResponse.success(res, null, 'Logged out successfully');
});

/**
 * Get current authenticated user profile
 */
const getProfile = catchAsync(async (req, res) => {
  const user = await identityRepository.findUserById(req.user.userId);
  if (!user) {
    throw new NotFoundError('User profile not found');
  }

  const tenants = await identityRepository.getUserTenantsAndRoles(user.id);

  return ApiResponse.success(
    res,
    {
      user,
      tenants,
      activeTenantId: req.user.tenantId,
      currentRole: req.user.role,
    },
    'User profile retrieved successfully'
  );
});

module.exports = {
  register,
  login,
  refreshToken,
  logout,
  getProfile,
};
