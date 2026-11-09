const shipmentRepository = require('../repository/shipment.repository');
const { distributedLock } = require('../../../infrastructure/redis');
const { NotFoundError, BadRequestError } = require('../../../shared/errors');
const logger = require('../../../config/logger');

/**
 * Create a new shipment and advance fulfillment & order status
 */
const createShipment = async (tenantId, shipmentData) => {
  const lockKey = `lock:ship:ful:${tenantId}:${shipmentData.fulfillment_id}`;

  return distributedLock.withLock(lockKey, 10000, async () => {
    const shipment = await shipmentRepository.createShipment({
      tenantId,
      fulfillmentId: shipmentData.fulfillment_id,
      carrier: shipmentData.carrier,
      serviceTier: shipmentData.service_tier,
      trackingNumber: shipmentData.tracking_number,
      trackingUrl: shipmentData.tracking_url,
      shippingLabelUrl: shipmentData.shipping_label_url,
    });

    logger.info(`Shipment dispatched: ${shipment.tracking_number} via ${shipment.carrier} [ID: ${shipment.id}]`);
    return shipment;
  });
};

/**
 * Get shipment details by ID
 */
const getShipmentById = async (tenantId, id) => {
  const shipment = await shipmentRepository.findShipmentById(tenantId, id);
  if (!shipment) {
    throw new NotFoundError(`Shipment not found with ID: ${id}`);
  }
  return shipment;
};

/**
 * List shipments with filters and pagination
 */
const listShipments = async (tenantId, query) => {
  return shipmentRepository.listShipments(tenantId, {
    fulfillmentId: query.fulfillment_id,
    carrier: query.carrier,
    status: query.status,
    trackingNumber: query.tracking_number,
    page: query.page,
    limit: query.limit,
  });
};

/**
 * Add a carrier tracking checkpoint event
 */
const addTrackingEvent = async (tenantId, shipmentId, eventData) => {
  const event = await shipmentRepository.addTrackingEvent({
    tenantId,
    shipmentId,
    checkpointStatus: eventData.checkpoint_status,
    location: eventData.location,
    eventTimestamp: eventData.event_timestamp,
    rawPayload: eventData.raw_payload,
  });

  logger.info(`Tracking checkpoint added for shipment: ${shipmentId} [${eventData.checkpoint_status}]`);
  return event;
};

/**
 * Update shipment status
 */
const updateShipmentStatus = async (tenantId, id, { status: newStatus }) => {
  const updated = await shipmentRepository.updateShipmentStatus(tenantId, id, newStatus);
  logger.info(`Shipment status updated: ${id} -> ${newStatus}`);
  return updated;
};

module.exports = {
  createShipment,
  getShipmentById,
  listShipments,
  addTrackingEvent,
  updateShipmentStatus,
};

