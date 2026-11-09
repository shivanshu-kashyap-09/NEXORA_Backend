const catchAsync = require('../../../shared/utils/catchAsync');
const ApiResponse = require('../../../shared/utils/ApiResponse');
const fulfillmentService = require('../service/fulfillment.service');

/**
 * Create a new fulfillment assignment
 */
const createFulfillment = catchAsync(async (req, res) => {
  const fulfillment = await fulfillmentService.createFulfillment(req.user.tenantId, req.body);
  return ApiResponse.created(res, fulfillment, 'Fulfillment created successfully');
});

/**
 * List fulfillments with filters and pagination
 */
const listFulfillments = catchAsync(async (req, res) => {
  const result = await fulfillmentService.listFulfillments(req.user.tenantId, req.query);
  return ApiResponse.paginated(
    res,
    result.items,
    result.page,
    result.limit,
    result.total,
    'Fulfillments retrieved successfully'
  );
});

/**
 * Get fulfillment details by ID
 */
const getFulfillment = catchAsync(async (req, res) => {
  const fulfillment = await fulfillmentService.getFulfillmentById(req.user.tenantId, req.params.id);
  return ApiResponse.success(res, fulfillment, 'Fulfillment details retrieved successfully');
});

/**
 * Advance fulfillment status through lifecycle
 */
const updateFulfillmentStatus = catchAsync(async (req, res) => {
  const updated = await fulfillmentService.updateFulfillmentStatus(
    req.user.tenantId,
    req.params.id,
    req.body
  );
  return ApiResponse.success(res, updated, 'Fulfillment status updated successfully');
});

module.exports = {
  createFulfillment,
  listFulfillments,
  getFulfillment,
  updateFulfillmentStatus,
};

