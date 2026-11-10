const catchAsync = require('../../../shared/utils/catchAsync');
const ApiResponse = require('../../../shared/utils/ApiResponse');
const auditService = require('../service/audit.service');

/**
 * Record an audit log
 */
const createAuditLog = catchAsync(async (req, res) => {
  const log = await auditService.recordAuditLog(req.user.tenantId, req.body, req);
  return ApiResponse.created(res, log, 'Audit log recorded successfully');
});

/**
 * List audit logs
 */
const listAuditLogs = catchAsync(async (req, res) => {
  const result = await auditService.listAuditLogs(req.user.tenantId, req.query);
  return ApiResponse.paginated(
    res,
    result.items,
    result.page,
    result.limit,
    result.total,
    'Audit logs retrieved successfully'
  );
});

/**
 * Get audit log details by ID
 */
const getAuditLog = catchAsync(async (req, res) => {
  const log = await auditService.getAuditLogById(req.user.tenantId, req.params.id);
  return ApiResponse.success(res, log, 'Audit log details retrieved successfully');
});

/**
 * Get resource audit timeline
 */
const getResourceTimeline = catchAsync(async (req, res) => {
  const timeline = await auditService.getResourceTimeline(
    req.user.tenantId,
    req.params.resource_type,
    req.params.resource_id
  );
  return ApiResponse.success(res, timeline, 'Resource audit timeline retrieved successfully');
});

module.exports = {
  createAuditLog,
  listAuditLogs,
  getAuditLog,
  getResourceTimeline,
};

