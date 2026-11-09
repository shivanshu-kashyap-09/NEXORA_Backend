const catchAsync = require('../../../shared/utils/catchAsync');
const ApiResponse = require('../../../shared/utils/ApiResponse');
const refundService = require('../service/refund.service');

/**
 * Ingest a return request (RMA generation)
 */
const createReturn = catchAsync(async (req, res) => {
  const returnRecord = await refundService.createReturn(req.user.tenantId, req.body);
  return ApiResponse.created(res, returnRecord, 'Return request (RMA) created successfully');
});

/**
 * List returns with filters and pagination
 */
const listReturns = catchAsync(async (req, res) => {
  const result = await refundService.listReturns(req.user.tenantId, req.query);
  return ApiResponse.paginated(
    res,
    result.items,
    result.page,
    result.limit,
    result.total,
    'Returns retrieved successfully'
  );
});

/**
 * Get return details by ID
 */
const getReturn = catchAsync(async (req, res) => {
  const returnRecord = await refundService.getReturnById(req.user.tenantId, req.params.id);
  return ApiResponse.success(res, returnRecord, 'Return details retrieved successfully');
});

/**
 * Update RMA status in reverse logistics lifecycle
 */
const updateRmaStatus = catchAsync(async (req, res) => {
  const updated = await refundService.updateRmaStatus(
    req.user.tenantId,
    req.params.id,
    req.body
  );
  return ApiResponse.success(res, updated, 'RMA status updated successfully');
});

/**
 * Execute warehouse intake inspection and stock disposition
 */
const inspectReturn = catchAsync(async (req, res) => {
  const result = await refundService.inspectReturn(
    req.user.tenantId,
    req.params.id,
    req.body
  );
  return ApiResponse.success(res, result, 'Return inspected and stock disposition completed successfully');
});

module.exports = {
  createReturn,
  listReturns,
  getReturn,
  updateRmaStatus,
  inspectReturn,
};
