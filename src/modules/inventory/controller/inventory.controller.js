const catchAsync = require('../../../shared/utils/catchAsync');
const ApiResponse = require('../../../shared/utils/ApiResponse');
const inventoryService = require('../service/inventory.service');

/**
 * Adjust stock level (Restock, Cycle Count, Damage write-off)
 */
const adjustStock = catchAsync(async (req, res) => {
  const result = await inventoryService.adjustStock(
    req.user.tenantId,
    req.user.id,
    req.body
  );
  return ApiResponse.created(res, result, 'Inventory adjusted successfully');
});

/**
 * List inventory levels across fulfillment nodes
 */
const listInventory = catchAsync(async (req, res) => {
  const result = await inventoryService.listInventory(req.user.tenantId, req.query);
  return ApiResponse.paginated(
    res,
    result.items,
    result.page,
    result.limit,
    result.total,
    'Inventory levels retrieved successfully'
  );
});

/**
 * Get aggregate inventory breakdown for a specific product
 */
const getProductInventory = catchAsync(async (req, res) => {
  const summary = await inventoryService.getProductInventorySummary(
    req.user.tenantId,
    req.params.productId
  );
  return ApiResponse.success(res, summary, 'Product inventory summary retrieved successfully');
});

/**
 * Reserve stock for a 15-minute soft hold
 */
const reserveStock = catchAsync(async (req, res) => {
  const reservation = await inventoryService.reserveStock(req.user.tenantId, req.body);
  return ApiResponse.created(res, reservation, 'Inventory soft hold reserved successfully');
});

/**
 * Release an active soft hold reservation
 */
const releaseReservation = catchAsync(async (req, res) => {
  const result = await inventoryService.releaseReservation(req.user.tenantId, req.params.id);
  return ApiResponse.success(res, result, 'Inventory reservation released successfully');
});

/**
 * Trigger cleanup of expired soft hold reservations
 */
const releaseExpiredReservations = catchAsync(async (req, res) => {
  const result = await inventoryService.releaseExpiredReservations(req.user.tenantId);
  return ApiResponse.success(
    res,
    result,
    `Successfully released ${result.releasedCount} expired reservation(s)`
  );
});

module.exports = {
  adjustStock,
  listInventory,
  getProductInventory,
  reserveStock,
  releaseReservation,
  releaseExpiredReservations,
};

