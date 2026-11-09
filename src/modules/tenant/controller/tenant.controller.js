const catchAsync = require('../../../shared/utils/catchAsync');
const ApiResponse = require('../../../shared/utils/ApiResponse');
const tenantService = require('../service/tenant.service');

/**
 * Handle new tenant organization onboarding
 */
const onboard = catchAsync(async (req, res) => {
  const userAgent = req.headers['user-agent'] || null;
  const ipAddress = req.ip || req.connection.remoteAddress || null;

  const result = await tenantService.onboardTenant({
    ...req.body,
    userAgent,
    ipAddress,
  });

  return ApiResponse.created(res, result, 'Tenant organization onboarded successfully');
});

/**
 * Retrieve current active tenant details
 */
const getCurrent = catchAsync(async (req, res) => {
  const tenant = await tenantService.getCurrentTenant(req.user.tenantId);
  return ApiResponse.success(res, tenant, 'Tenant details retrieved successfully');
});

/**
 * Update tenant profile
 */
const updateProfile = catchAsync(async (req, res) => {
  const profile = await tenantService.updateProfile(req.user.tenantId, req.body);
  return ApiResponse.success(res, profile, 'Tenant profile updated successfully');
});

/**
 * Update tenant business configurations
 */
const updateConfigs = catchAsync(async (req, res) => {
  const configs = await tenantService.updateConfigs(req.user.tenantId, req.body);
  return ApiResponse.success(res, configs, 'Tenant configurations updated successfully');
});

/**
 * Invite / add a team member to the tenant
 */
const inviteUser = catchAsync(async (req, res) => {
  const result = await tenantService.inviteTeamMember(req.user.tenantId, req.body);
  return ApiResponse.created(res, result, 'Team member invited successfully');
});

/**
 * List all users within the current tenant
 */
const getUsers = catchAsync(async (req, res) => {
  const users = await tenantService.listTeamMembers(req.user.tenantId);
  return ApiResponse.success(res, users, 'Tenant users retrieved successfully');
});

module.exports = {
  onboard,
  getCurrent,
  updateProfile,
  updateConfigs,
  inviteUser,
  getUsers,
};

