const backorderRepository = require('../repository/backorder.repository');
const { distributedLock } = require('../../../infrastructure/redis');
const { NotFoundError, BadRequestError } = require('../../../shared/errors');
const logger = require('../../../config/logger');

/**
 * Enqueue an order item into backorder queue
 */
const enqueueBackorder = async (tenantId, backorderData) => {
  const lockKey = `lock:backorder:${tenantId}:${backorderData.order_id}`;

  return distributedLock.withLock(lockKey, 10000, async () => {
    const item = await backorderRepository.enqueueBackorder({
      tenantId,
      orderId: backorderData.order_id,
      productId: backorderData.product_id,
      quantity: backorderData.quantity,
      priority: backorderData.priority,
    });

    logger.info(`Order enqueued to backorder: Order ${backorderData.order_id}, Product ${backorderData.product_id} (Priority: ${item.priority})`);
    return item;
  });
};

/**
 * Get backorder item by ID
 */
const getBackorderById = async (tenantId, id) => {
  const item = await backorderRepository.findBackorderById(tenantId, id);
  if (!item) {
    throw new NotFoundError(`Backorder queue item not found with ID: ${id}`);
  }
  return item;
};

/**
 * List backorders
 */
const listBackorders = async (tenantId, query) => {
  return backorderRepository.listBackorders(tenantId, {
    productId: query.product_id,
    orderId: query.order_id,
    isAllocated: query.is_allocated,
    page: query.page,
    limit: query.limit,
  });
};

/**
 * Update priority rank of a backorder item
 */
const updatePriority = async (tenantId, id, priority) => {
  const current = await getBackorderById(tenantId, id);
  if (current.is_allocated) {
    throw new BadRequestError(`Cannot change priority of an already allocated backorder item`);
  }

  const updated = await backorderRepository.updatePriority(tenantId, id, priority);
  logger.info(`Backorder priority updated: ${id} -> Priority ${priority}`);
  return updated;
};

/**
 * Allocate backorders against available inventory in priority/FIFO order
 */
const allocateStock = async (tenantId, { product_id, warehouse_id, quantity }) => {
  const lockKey = `lock:alloc:prod:${tenantId}:${product_id}`;

  return distributedLock.withLock(lockKey, 10000, async () => {
    const result = await backorderRepository.allocateAvailableStock({
      tenantId,
      productId: product_id,
      warehouseId: warehouse_id,
      quantityToAllocate: quantity,
    });

    logger.info(`Backorder allocation executed for Product ${product_id}: ${result.allocated_count} orders released`);
    return result;
  });
};

module.exports = {
  enqueueBackorder,
  getBackorderById,
  listBackorders,
  updatePriority,
  allocateStock,
};
