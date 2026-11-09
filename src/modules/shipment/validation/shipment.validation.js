const { z } = require('zod');
const { ShipmentStatus } = require('../constants/shipment.constants');

// 1. Create Shipment Schema
const createShipmentSchema = z.object({
  fulfillment_id: z.string().uuid('fulfillment_id must be a valid UUID'),
  carrier: z.string().min(2, 'Carrier name is required').trim(),
  service_tier: z.string().default('Standard'),
  tracking_number: z.string().optional(),
  tracking_url: z.string().url().optional().nullable(),
  shipping_label_url: z.string().url().optional().nullable(),
});

// 2. Add Tracking Checkpoint Event Schema
const addTrackingEventSchema = z.object({
  checkpoint_status: z.string().min(2, 'checkpoint_status is required').trim(),
  location: z.string().optional(),
  event_timestamp: z.string().datetime().optional(),
  raw_payload: z.record(z.any()).default({}),
});

// 3. Update Shipment Status Schema
const updateShipmentStatusSchema = z.object({
  status: z.enum([
    ShipmentStatus.CREATED,
    ShipmentStatus.PACKED,
    ShipmentStatus.SHIPPED,
    ShipmentStatus.IN_TRANSIT,
    ShipmentStatus.OUT_FOR_DELIVERY,
    ShipmentStatus.DELIVERED,
    ShipmentStatus.FAILED,
    ShipmentStatus.RTO,
    ShipmentStatus.CANCELLED,
  ], {
    required_error: 'Status is required',
  }),
});

// 4. Query Shipments Schema
const shipmentQuerySchema = z.object({
  fulfillment_id: z.string().uuid().optional(),
  carrier: z.string().optional(),
  status: z.string().optional(),
  tracking_number: z.string().optional(),
  page: z.string().regex(/^\d+$/).default('1'),
  limit: z.string().regex(/^\d+$/).default('20'),
});

module.exports = {
  createShipmentSchema,
  addTrackingEventSchema,
  updateShipmentStatusSchema,
  shipmentQuerySchema,
};

