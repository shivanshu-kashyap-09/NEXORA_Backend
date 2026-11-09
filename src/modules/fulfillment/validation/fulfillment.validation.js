const { z } = require('zod');
const { FulfillmentStatus } = require('../constants/fulfillment.constants');

// 1. Create Fulfillment Order Schema
const createFulfillmentSchema = z.object({
  order_id: z.string().uuid('order_id must be a valid UUID'),
  warehouse_id: z.string().uuid('warehouse_id must be a valid UUID'),
  items: z
    .array(
      z.object({
        order_item_id: z.string().uuid('order_item_id must be a valid UUID'),
        quantity: z.number().int().min(1, 'Quantity must be at least 1'),
      })
    )
    .min(1, 'Fulfillment must contain at least one item'),
});

// 2. Update Fulfillment Status Schema
const updateFulfillmentStatusSchema = z.object({
  status: z.enum([
    FulfillmentStatus.ALLOCATED,
    FulfillmentStatus.PICKING,
    FulfillmentStatus.PACKED,
    FulfillmentStatus.SHIPPED,
    FulfillmentStatus.CANCELLED,
  ], {
    required_error: 'Status is required',
  }),
});

// 3. Query Fulfillments Schema
const fulfillmentQuerySchema = z.object({
  order_id: z.string().uuid().optional(),
  warehouse_id: z.string().uuid().optional(),
  status: z.string().optional(),
  page: z.string().regex(/^\d+$/).default('1'),
  limit: z.string().regex(/^\d+$/).default('20'),
});

module.exports = {
  createFulfillmentSchema,
  updateFulfillmentStatusSchema,
  fulfillmentQuerySchema,
};

