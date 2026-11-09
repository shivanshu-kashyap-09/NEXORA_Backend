const catchAsync = require('../../../shared/utils/catchAsync');
const ApiResponse = require('../../../shared/utils/ApiResponse');
const orderService = require('../service/order.service');

/**
 * Ingest a new order
 */
const createOrder = catchAsync(async (req, res) => {
  const order = await orderService.createOrder(req.user.tenantId, req.user.id, req.body);
  return ApiResponse.created(res, order, 'Order ingested successfully');
});

/**
 * List orders with search, customer, channel, and status filters
 */
const listOrders = catchAsync(async (req, res) => {
  const result = await orderService.listOrders(req.user.tenantId, req.query);
  return ApiResponse.paginated(
    res,
    result.items,
    result.page,
    result.limit,
    result.total,
    'Orders retrieved successfully'
  );
});

/**
 * Get single order details including line items, state history, and active holds
 */
const getOrder = catchAsync(async (req, res) => {
  const order = await orderService.getOrderById(req.user.tenantId, req.params.id);
  return ApiResponse.success(res, order, 'Order details retrieved successfully');
});

/**
 * Execute a valid state transition in the forward-only FSM
 */
const transitionOrderState = catchAsync(async (req, res) => {
  const result = await orderService.transitionOrderState(
    req.user.tenantId,
    req.user.id,
    req.params.id,
    req.body
  );
  return ApiResponse.success(res, result, 'Order state transitioned successfully');
});

/**
 * Place order on hold
 */
const placeHold = catchAsync(async (req, res) => {
  const result = await orderService.placeHold(
    req.user.tenantId,
    req.user.id,
    req.params.id,
    req.body
  );
  return ApiResponse.created(res, result, 'Order placed on hold successfully');
});

/**
 * Resolve an active order hold
 */
const resolveHold = catchAsync(async (req, res) => {
  const result = await orderService.resolveHold(
    req.user.tenantId,
    req.user.id,
    req.params.id,
    req.params.holdId,
    req.body
  );
  return ApiResponse.success(res, result, 'Order hold resolved successfully');
});

/**
 * Get order state transition audit history
 */
const getOrderHistory = catchAsync(async (req, res) => {
  const history = await orderService.getOrderStateHistory(req.user.tenantId, req.params.id);
  return ApiResponse.success(res, history, 'Order state history retrieved successfully');
});

module.exports = {
  createOrder,
  listOrders,
  getOrder,
  transitionOrderState,
  placeHold,
  resolveHold,
  getOrderHistory,
};

