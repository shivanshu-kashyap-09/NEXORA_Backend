const fulfillmentRepository = require('../repository/fulfillment.repository');
const { distributedLock } = require('../../../infrastructure/redis');
const { FulfillmentStatus, VALID_FULFILLMENT_TRANSITIONS } = require('../constants/fulfillment.constants');
const { NotFoundError, BadRequestError } = require('../../../shared/errors');
const logger = require('../../../config/logger');

/**
 * Create a new fulfillment assignment
 */
const createFulfillment = async (tenantId, fulfillmentData) => {
  const lockKey = `lock:ful:order:${tenantId}:${fulfillmentData.order_id}`;

  return distributedLock.withLock(lockKey, 10000, async () => {
    const fulfillment = await fulfillmentRepository.createFulfillment({
      tenantId,
      orderId: fulfillmentData.order_id,
      warehouseId: fulfillmentData.warehouse_id,
      items: fulfillmentData.items,
    });

    logger.info(`Fulfillment created: ${fulfillment.id} for order: ${fulfillmentData.order_id} at warehouse: ${fulfillmentData.warehouse_id}`);
    return fulfillment;
  });
};

/**
 * Get fulfillment details by ID
 */
const getFulfillmentById = async (tenantId, id) => {
  const fulfillment = await fulfillmentRepository.findFulfillmentById(tenantId, id);
  if (!fulfillment) {
    throw new NotFoundError(`Fulfillment not found with ID: ${id}`);
  }
  return fulfillment;
};

/**
 * List fulfillments with filters and pagination
 */
const listFulfillments = async (tenantId, query) => {
  return fulfillmentRepository.listFulfillments(tenantId, {
    orderId: query.order_id,
    warehouseId: query.warehouse_id,
    status: query.status,
    page: query.page,
    limit: query.limit,
  });
};

/**
 * Advance fulfillment status through FSM
 */
const updateFulfillmentStatus = async (tenantId, id, { status: newStatus }) => {
  const current = await getFulfillmentById(tenantId, id);

  // Validate FSM transition
  const allowed = VALID_FULFILLMENT_TRANSITIONS[current.status] || [];
  if (!allowed.includes(newStatus)) {
    throw new BadRequestError(
      `Invalid fulfillment status transition: Cannot move from '${current.status}' to '${newStatus}'. Allowed: [${allowed.join(', ')}]`
    );
  }

  const lockKey = `lock:ful:${tenantId}:${id}`;
  return distributedLock.withLock(lockKey, 10000, async () => {
    const updated = await fulfillmentRepository.updateFulfillmentStatus(tenantId, id, newStatus);
    logger.info(`Fulfillment status updated: ${id} [${current.status} -> ${newStatus}]`);
    return updated;
  });
};

module.exports = {
  createFulfillment,
  getFulfillmentById,
  listFulfillments,
  updateFulfillmentStatus,
};

