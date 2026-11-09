const bcrypt = require('bcryptjs');
const omnichannelRepository = require('../repository/omnichannel.repository');
const { distributedLock } = require('../../../infrastructure/redis');
const { NotFoundError, BadRequestError, ConflictError } = require('../../../shared/errors');
const logger = require('../../../config/logger');

/**
 * Register BOPIS In-Store Pickup for an Order
 * Generates secure 6-digit pickup PIN, stores hash, returns plain PIN once for SMS/Email
 */
const createBopisPickup = async (tenantId, { order_id, store_warehouse_id }) => {
  const lockKey = `lock:bopis:order:${tenantId}:${order_id}`;

  return distributedLock.withLock(lockKey, 10000, async () => {
    // 1. Generate 6-digit PIN
    const plainPin = Math.floor(100000 + Math.random() * 900000).toString();
    const pinHash = await bcrypt.hash(plainPin, 10);

    // 2. Persist in database
    const pickupRecord = await omnichannelRepository.createBopisPickup({
      tenantId,
      orderId: order_id,
      storeWarehouseId: store_warehouse_id,
      pinHash,
    });

    logger.info(`BOPIS pickup registered: Order ${order_id} at Store ${store_warehouse_id}`);

    return {
      ...pickupRecord,
      pickup_pin: plainPin, // Returned once for customer notification
    };
  });
};

/**
 * Get BOPIS Pickup details by ID
 */
const getBopisById = async (tenantId, id) => {
  const pickup = await omnichannelRepository.findBopisById(tenantId, id);
  if (!pickup) {
    throw new NotFoundError(`BOPIS pickup not found with ID: ${id}`);
  }
  // Exclude pin hash from response
  const { pickup_pin_hash, ...safePickup } = pickup;
  return safePickup;
};

/**
 * List BOPIS Pickups with filters & pagination
 */
const listBopisPickups = async (tenantId, query) => {
  return omnichannelRepository.listBopisPickups(tenantId, {
    storeWarehouseId: query.store_warehouse_id,
    orderId: query.order_id,
    isStaged: query.is_staged,
    page: query.page,
    limit: query.limit,
  });
};

/**
 * Mark BOPIS pickup as Staged in holding area (Order -> READY)
 */
const stageBopisPickup = async (tenantId, id, stageData = {}) => {
  const lockKey = `lock:bopis:${tenantId}:${id}`;

  return distributedLock.withLock(lockKey, 10000, async () => {
    const pickup = await omnichannelRepository.findBopisById(tenantId, id);
    if (!pickup) {
      throw new NotFoundError(`BOPIS pickup not found with ID: ${id}`);
    }

    if (pickup.picked_up_at) {
      throw new BadRequestError(`Cannot stage an order that is already picked up`);
    }

    const updated = await omnichannelRepository.markBopisStaged(tenantId, id);
    logger.info(`BOPIS pickup staged: ${id} (Order: ${pickup.order_number} marked READY)`);

    const { pickup_pin_hash, ...safeUpdated } = updated;
    return safeUpdated;
  });
};

/**
 * Complete BOPIS Handover to Customer with secure PIN verification (Order -> COMPLETED)
 */
const completeBopisHandover = async (tenantId, id, { pin, picked_up_by_name }) => {
  const lockKey = `lock:bopis:${tenantId}:${id}`;

  return distributedLock.withLock(lockKey, 10000, async () => {
    // 1. Fetch raw pickup record with hash
    const pickup = await omnichannelRepository.findBopisById(tenantId, id);
    if (!pickup) {
      throw new NotFoundError(`BOPIS pickup not found with ID: ${id}`);
    }

    if (pickup.picked_up_at) {
      throw new ConflictError(`BOPIS order was already collected on ${pickup.picked_up_at}`);
    }

    if (!pickup.is_staged) {
      throw new BadRequestError(`Cannot hand over package: Order has not been staged yet`);
    }

    // 2. Verify 6-digit PIN
    const isPinValid = await bcrypt.compare(pin, pickup.pickup_pin_hash);
    if (!isPinValid) {
      throw new BadRequestError('Invalid pickup PIN provided. Handover authorization failed.');
    }

    // 3. Complete handover
    const completed = await omnichannelRepository.completeBopisHandover(tenantId, id, {
      pickedUpByName: picked_up_by_name,
    });

    logger.info(`BOPIS handover completed: ${id} verified for ${picked_up_by_name} (Order: ${pickup.order_number} COMPLETED)`);

    const { pickup_pin_hash, ...safeCompleted } = completed;
    return safeCompleted;
  });
};

/**
 * In-Store Return Desk (BORIS - Buy Online Return In Store)
 */
const processBorisReturn = async (tenantId, returnData) => {
  const lockKey = `lock:boris:${tenantId}:${returnData.order_id}`;

  return distributedLock.withLock(lockKey, 10000, async () => {
    const result = await omnichannelRepository.processBorisReturn({
      tenantId,
      orderId: returnData.order_id,
      storeWarehouseId: returnData.store_warehouse_id,
      reason: returnData.reason,
      items: returnData.items,
      customerName: returnData.customer_name,
      refundMethod: returnData.refund_method,
    });

    logger.info(`BORIS in-store return processed: ${result.rma_number} for order ${returnData.order_id} at Store ${returnData.store_warehouse_id}`);
    return result;
  });
};

module.exports = {
  createBopisPickup,
  getBopisById,
  listBopisPickups,
  stageBopisPickup,
  completeBopisHandover,
  processBorisReturn,
};

