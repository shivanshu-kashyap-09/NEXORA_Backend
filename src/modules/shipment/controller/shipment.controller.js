const catchAsync = require('../../../shared/utils/catchAsync');
const ApiResponse = require('../../../shared/utils/ApiResponse');
const shipmentService = require('../service/shipment.service');

/**
 * Create a new shipment
 */
const createShipment = catchAsync(async (req, res) => {
  const shipment = await shipmentService.createShipment(req.user.tenantId, req.body);
  return ApiResponse.created(res, shipment, 'Shipment created successfully');
});

/**
 * List shipments with filters and pagination
 */
const listShipments = catchAsync(async (req, res) => {
  const result = await shipmentService.listShipments(req.user.tenantId, req.query);
  return ApiResponse.paginated(
    res,
    result.items,
    result.page,
    result.limit,
    result.total,
    'Shipments retrieved successfully'
  );
});

/**
 * Get shipment details by ID
 */
const getShipment = catchAsync(async (req, res) => {
  const shipment = await shipmentService.getShipmentById(req.user.tenantId, req.params.id);
  return ApiResponse.success(res, shipment, 'Shipment details retrieved successfully');
});

/**
 * Add a carrier tracking checkpoint event
 */
const addTrackingEvent = catchAsync(async (req, res) => {
  const event = await shipmentService.addTrackingEvent(
    req.user.tenantId,
    req.params.id,
    req.body
  );
  return ApiResponse.created(res, event, 'Tracking event recorded successfully');
});

/**
 * Update shipment status
 */
const updateShipmentStatus = catchAsync(async (req, res) => {
  const updated = await shipmentService.updateShipmentStatus(
    req.user.tenantId,
    req.params.id,
    req.body
  );
  return ApiResponse.success(res, updated, 'Shipment status updated successfully');
});

module.exports = {
  createShipment,
  listShipments,
  getShipment,
  addTrackingEvent,
  updateShipmentStatus,
};

