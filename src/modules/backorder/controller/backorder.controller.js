const catchAsync = require('../../../shared/utils/catchAsync');
const ApiResponse = require('../../../shared/utils/ApiResponse');
const backorderService = require('../service/backorder.service');

/**
 * Enqueue backorder item
 */
const enqueueBackorder = catchAsync(async (req, res) => {
  const item = await backorderService.enqueueBackorder(req.user.tenantId, req.body);
  return ApiResponse.created(res, item, 'Order enqueued to backorder queue successfully');
});

/**
 * List backorders
 */
const listBackorders = catchAsync(async (req, res) => {
  const result = await backorderService.listBackorders(req.user.tenantId, req.query);
  return ApiResponse.paginated(
    res,
    result.items,
    result.page,
    result.limit,
    result.total,
    'Backorders retrieved successfully'
  );
});

/**
 * Get backorder details by ID
 */
const getBackorder = catchAsync(async (req, res) => {
  const item = await backorderService.getBackorderById(req.user.tenantId, req.params.id);
  return ApiResponse.success(res, item, 'Backorder details retrieved successfully');
});

/**
 * Update backorder priority
 */
const updatePriority = catchAsync(async (req, res) => {
  const updated = await backorderService.updatePriority(
    req.user.tenantId,
    req.params.id,
    req.body.priority
  );
  return ApiResponse.success(res, updated, 'Backorder priority updated successfully');
});

/**
 * Allocate stock to backorder queue
 */
const allocateStock = catchAsync(async (req, res) => {
  const result = await backorderService.allocateStock(req.user.tenantId, req.body);
  return ApiResponse.success(res, result, 'Stock allocated to backorder queue successfully');
});

module.exports = {
  enqueueBackorder,
  listBackorders,
  getBackorder,
  updatePriority,
  allocateStock,
};
