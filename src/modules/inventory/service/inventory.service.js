const inventoryRepository = require('../repository/inventory.repository');
const { distributedLock } = require('../../../infrastructure/redis');
const { ConflictError, NotFoundError, BadRequestError } = require('../../../shared/errors');
const logger = require('../../../config/logger');

/**
 * Adjust inventory level with distributed concurrency lock
 */
const adjustStock = async (tenantId, userId, adjustData) => {
  const lockKey = `lock:inv:${tenantId}:${adjustData.warehouse_id}:${adjustData.product_id}`;

  return distributedLock.withLock(lockKey, 10000, async () => {
    const result = await inventoryRepository.adjustStock({
      tenantId,
      warehouseId: adjustData.warehouse_id,
      productId: adjustData.product_id,
      quantityDelta: adjustData.quantity_delta,
      reason: adjustData.reason,
      safetyStock: adjustData.safety_stock,
      damaged: adjustData.damaged,
      adjustedBy: userId,
    });

    logger.info('Inventory stock adjusted:', {
      tenantId,
      warehouseId: adjustData.warehouse_id,
      productId: adjustData.product_id,
      delta: adjustData.quantity_delta,
      reason: adjustData.reason,
    });

    return result;
  });
};

/**
 * List inventory levels across fulfillment nodes
 */
const listInventory = async (tenantId, query) => {
  return inventoryRepository.getInventoryLevels(tenantId, {
    warehouseId: query.warehouse_id,
    productId: query.product_id,
    lowStock: query.low_stock,
    page: query.page,
    limit: query.limit,
  });
};

/**
 * Get aggregate inventory summary for a product across all warehouses
 */
const getProductInventorySummary = async (tenantId, productId) => {
  return inventoryRepository.getProductInventorySummary(tenantId, productId);
};

/**
 * Reserve stock for a 15-minute soft hold during cart checkout
 */
const reserveStock = async (tenantId, reserveData) => {
  const lockKey = `lock:inv:${tenantId}:${reserveData.warehouse_id}:${reserveData.product_id}`;

  return distributedLock.withLock(lockKey, 10000, async () => {
    try {
      const result = await inventoryRepository.reserveStock({
        tenantId,
        warehouseId: reserveData.warehouse_id,
        productId: reserveData.product_id,
        quantity: reserveData.quantity,
        orderId: reserveData.order_id,
        durationMinutes: reserveData.duration_minutes || 15,
      });

      logger.info('Inventory soft hold reserved:', {
        tenantId,
        reservationId: result.reservation.id,
        productId: reserveData.product_id,
        quantity: reserveData.quantity,
        expiresAt: result.reservation.expires_at,
      });

      return result;
    } catch (err) {
      if (err.code === 'INSUFFICIENT_STOCK') {
        throw new ConflictError(err.message, 'INSUFFICIENT_STOCK', err.details);
      }
      if (err.code === 'INVENTORY_NOT_FOUND') {
        throw new NotFoundError(err.message);
      }
      throw err;
    }
  });
};

/**
 * Release an active soft hold reservation
 */
const releaseReservation = async (tenantId, reservationId) => {
  try {
    const result = await inventoryRepository.releaseReservation(tenantId, reservationId);
    logger.info('Inventory reservation released:', {
      tenantId,
      reservationId,
      alreadyReleased: result.alreadyReleased,
    });
    return result;
  } catch (err) {
    if (err.code === 'RESERVATION_NOT_FOUND') {
      throw new NotFoundError(err.message);
    }
    throw err;
  }
};

/**
 * Release all expired soft hold reservations
 */
const releaseExpiredReservations = async (tenantId) => {
  const result = await inventoryRepository.releaseExpiredReservations(tenantId);
  logger.info('Expired inventory reservations released:', {
    tenantId,
    releasedCount: result.releasedCount,
  });
  return result;
};

module.exports = {
  adjustStock,
  listInventory,
  getProductInventorySummary,
  reserveStock,
  releaseReservation,
  releaseExpiredReservations,
};
