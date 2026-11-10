const auditRepository = require('../repository/audit.repository');
const { NotFoundError } = require('../../../shared/errors');
const logger = require('../../../config/logger');

/**
 * Record an audit log
 */
const recordAuditLog = async (tenantId, auditData, req = null) => {
  const ipAddress = req?.ip || req?.socket?.remoteAddress || null;
  const userAgent = req?.get ? req.get('user-agent') : null;

  const log = await auditRepository.createAuditLog({
    tenantId,
    actorId: auditData.actor_id || req?.user?.id || null,
    actorType: auditData.actor_type || 'USER',
    action: auditData.action,
    resourceType: auditData.resource_type,
    resourceId: auditData.resource_id,
    ipAddress,
    userAgent,
    diffPayload: auditData.diff_payload || {},
    correlationId: auditData.correlation_id || req?.correlationId || null,
  });

  logger.info(`Audit log recorded: [${log.resource_type}:${log.resource_id}] ${log.action} by ${log.actor_type}`);
  return log;
};

/**
 * Query audit logs
 */
const listAuditLogs = async (tenantId, query) => {
  return auditRepository.listAuditLogs(tenantId, {
    resourceType: query.resource_type,
    resourceId: query.resource_id,
    action: query.action,
    actorId: query.actor_id,
    fromDate: query.from_date,
    toDate: query.to_date,
    page: query.page,
    limit: query.limit,
  });
};

/**
 * Get audit log by ID
 */
const getAuditLogById = async (tenantId, id) => {
  const log = await auditRepository.findAuditLogById(tenantId, id);
  if (!log) {
    throw new NotFoundError(`Audit log not found with ID: ${id}`);
  }
  return log;
};

/**
 * Get resource audit timeline
 */
const getResourceTimeline = async (tenantId, resourceType, resourceId) => {
  const timeline = await auditRepository.getResourceAuditTimeline(tenantId, resourceType, resourceId);
  return {
    resource_type: resourceType,
    resource_id: resourceId,
    total_events: timeline.length,
    timeline,
  };
};

module.exports = {
  recordAuditLog,
  listAuditLogs,
  getAuditLogById,
  getResourceTimeline,
};

