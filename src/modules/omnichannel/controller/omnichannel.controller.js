const catchAsync = require('../../../shared/utils/catchAsync');
const ApiResponse = require('../../../shared/utils/ApiResponse');
const omnichannelService = require('../service/omnichannel.service');

/**
 * Register BOPIS In-Store Pickup for an Order
 */
const createBopisPickup = catchAsync(async (req, res) => {
  const pickup = await omnichannelService.createBopisPickup(req.user.tenantId, req.body);
  return ApiResponse.created(res, pickup, 'BOPIS in-store pickup registered successfully');
});

/**
 * List BOPIS Pickups with filters & pagination
 */
const listBopisPickups = catchAsync(async (req, res) => {
  const result = await omnichannelService.listBopisPickups(req.user.tenantId, req.query);
  return ApiResponse.paginated(
    res,
    result.items,
    result.page,
    result.limit,
    result.total,
    'BOPIS pickups retrieved successfully'
  );
});

/**
 * Get BOPIS Pickup details by ID
 */
const getBopisById = catchAsync(async (req, res) => {
  const pickup = await omnichannelService.getBopisById(req.user.tenantId, req.params.id);
  return ApiResponse.success(res, pickup, 'BOPIS pickup details retrieved successfully');
});

/**
 * Mark BOPIS pickup as Staged in holding area (Order -> READY)
 */
const stageBopisPickup = catchAsync(async (req, res) => {
  const staged = await omnichannelService.stageBopisPickup(req.user.tenantId, req.params.id, req.body);
  return ApiResponse.success(res, staged, 'BOPIS pickup staged and ready for customer collection');
});

/**
 * Complete BOPIS Handover to Customer with PIN Verification (Order -> COMPLETED)
 */
const completeBopisHandover = catchAsync(async (req, res) => {
  const completed = await omnichannelService.completeBopisHandover(
    req.user.tenantId,
    req.params.id,
    req.body
  );
  return ApiResponse.success(res, completed, 'BOPIS package successfully handed over to customer');
});

/**
 * In-Store Return Desk (BORIS - Buy Online Return In Store)
 */
const processBorisReturn = catchAsync(async (req, res) => {
  const result = await omnichannelService.processBorisReturn(req.user.tenantId, req.body);
  return ApiResponse.created(res, result, 'In-store return (BORIS) processed and restocked successfully');
});

module.exports = {
  createBopisPickup,
  listBopisPickups,
  getBopisById,
  stageBopisPickup,
  completeBopisHandover,
  processBorisReturn,
};
