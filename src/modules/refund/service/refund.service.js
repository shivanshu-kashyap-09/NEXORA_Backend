const refundRepository = require('../repository/refund.repository');
const { distributedLock } = require('../../../infrastructure/redis');
const { RmaStatus, VALID_RMA_TRANSITIONS } = require('../constants/refund.constants');
const { NotFoundError, BadRequestError } = require('../../../shared/errors');
const logger = require('../../../config/logger');

/**
 * Ingest a return request (RMA generation)
 */
const createReturn = async (tenantId, returnData) => {
  const lockKey = `lock:rma:order:${tenantId}:${returnData.order_id}`;

  return distributedLock.withLock(lockKey, 10000, async () => {
    const returnRecord = await refundRepository.createReturn({
      tenantId,
      orderId: returnData.order_id,
      reason: returnData.reason,
      items: returnData.items,
    });

    logger.info(`RMA return requested: ${returnRecord.rma_number} for order: ${returnData.order_id}`);
    return returnRecord;
  });
};

/**
 * Get return details by ID
 */
const getReturnById = async (tenantId, id) => {
  const returnRecord = await refundRepository.findReturnById(tenantId, id);
  if (!returnRecord) {
    throw new NotFoundError(`Return not found with ID: ${id}`);
  }
  return returnRecord;
};

/**
 * List returns with filters and pagination
 */
const listReturns = async (tenantId, query) => {
  return refundRepository.listReturns(tenantId, {
    orderId: query.order_id,
    status: query.status,
    rmaNumber: query.rma_number,
    page: query.page,
    limit: query.limit,
  });
};

/**
 * Advance RMA status through reverse logistics lifecycle
 */
const updateRmaStatus = async (tenantId, id, updateData) => {
  const current = await getReturnById(tenantId, id);

  // Validate FSM transition
  const allowed = VALID_RMA_TRANSITIONS[current.status] || [];
  if (!allowed.includes(updateData.status)) {
    throw new BadRequestError(
      `Invalid RMA status transition: Cannot move from '${current.status}' to '${updateData.status}'. Allowed: [${allowed.join(', ')}]`
    );
  }

  const lockKey = `lock:rma:${tenantId}:${id}`;
  return distributedLock.withLock(lockKey, 10000, async () => {
    const updated = await refundRepository.updateRmaStatus(tenantId, id, {
      status: updateData.status,
      reverseTrackingNumber: updateData.reverse_tracking_number,
      reverseLabelUrl: updateData.reverse_label_url,
    });

    logger.info(`RMA status updated: ${id} [${current.status} -> ${updateData.status}]`);
    return updated;
  });
};

/**
 * Execute warehouse intake inspection and automated stock restocking
 */
const inspectReturn = async (tenantId, returnId, inspectData) => {
  await getReturnById(tenantId, returnId);

  const lockKey = `lock:rma:${tenantId}:${returnId}`;
  return distributedLock.withLock(lockKey, 10000, async () => {
    const result = await refundRepository.inspectAndRestock({
      tenantId,
      returnId,
      warehouseId: inspectData.warehouse_id,
      items: inspectData.items,
    });

    logger.info(`RMA return inspected and restocked: ${returnId} at warehouse: ${inspectData.warehouse_id}`);
    return result;
  });
};

module.exports = {
  createReturn,
  getReturnById,
  listReturns,
  updateRmaStatus,
  inspectReturn,
};

