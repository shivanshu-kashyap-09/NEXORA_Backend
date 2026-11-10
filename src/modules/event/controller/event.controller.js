const catchAsync = require('../../../shared/utils/catchAsync');
const ApiResponse = require('../../../shared/utils/ApiResponse');
const eventService = require('../service/event.service');

/**
 * Emit a new domain event into the Outbox
 */
const emitEvent = catchAsync(async (req, res) => {
  const event = await eventService.emitEvent(req.user.tenantId, req.body);
  return ApiResponse.created(res, event, 'Outbox event created successfully');
});

/**
 * List outbox events with pagination and filters
 */
const listOutboxEvents = catchAsync(async (req, res) => {
  const result = await eventService.listOutboxEvents(req.user.tenantId, req.query);
  return ApiResponse.paginated(
    res,
    result.items,
    result.page,
    result.limit,
    result.total,
    'Outbox events retrieved successfully'
  );
});

/**
 * Get outbox event details by ID
 */
const getOutboxEvent = catchAsync(async (req, res) => {
  const event = await eventService.getOutboxEventById(req.user.tenantId, req.params.id);
  return ApiResponse.success(res, event, 'Outbox event retrieved successfully');
});

/**
 * Trigger batch dispatch of pending events
 */
const dispatchPendingEvents = catchAsync(async (req, res) => {
  const result = await eventService.dispatchPendingEvents({
    tenantId: req.user.tenantId,
    limit: req.body?.limit ? parseInt(req.body.limit, 10) : 20,
  });
  return ApiResponse.success(res, result, `Dispatched ${result.dispatchedCount} outbox events`);
});

/**
 * Replay a dead/failed event
 */
const replayEvent = catchAsync(async (req, res) => {
  const replayed = await eventService.replayEvent(req.user.tenantId, req.params.id);
  return ApiResponse.success(res, replayed, 'Outbox event replayed and set to PENDING');
});

module.exports = {
  emitEvent,
  listOutboxEvents,
  getOutboxEvent,
  dispatchPendingEvents,
  replayEvent,
};

