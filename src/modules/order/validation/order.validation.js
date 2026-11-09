const { z } = require('zod');
const { OrderStatus } = require('../constants/order.constants');

// Address Schema for Orders
const orderAddressSchema = z.object({
  name: z.string().min(1, 'Name is required').trim(),
  street: z.string().min(1, 'Street is required').trim(),
  city: z.string().min(1, 'City is required').trim(),
  state: z.string().optional(),
  country: z.string().length(2, 'Country must be 2-letter ISO code').toUpperCase(),
  postal_code: z.string().min(2, 'Postal code is required').trim(),
  phone: z.string().optional(),
});

// Order Line Item Schema
const createOrderItemSchema = z.object({
  product_id: z.string().uuid('product_id must be a valid UUID'),
  sku: z.string().min(1, 'SKU is required').trim(),
  title: z.string().min(1, 'Title is required').trim(),
  quantity: z.number().int().min(1, 'Quantity must be at least 1'),
  unit_price: z.number().min(0, 'Unit price cannot be negative'),
  tax_amount: z.number().min(0, 'Tax amount cannot be negative').default(0),
  discount_amount: z.number().min(0, 'Discount amount cannot be negative').default(0),
});

// 1. Ingest Order Schema
const createOrderSchema = z.object({
  channel_id: z.string().uuid().optional().nullable(),
  channel_order_id: z.string().trim().optional().nullable(),
  customer_id: z.string().uuid().optional().nullable(),
  currency: z.string().length(3, 'Currency must be 3-letter ISO code').toUpperCase().default('USD'),
  items: z.array(createOrderItemSchema).min(1, 'Order must contain at least one line item'),
  shipping_address: orderAddressSchema,
  billing_address: orderAddressSchema,
  is_cod: z.boolean().default(false),
  shipping_total: z.number().min(0).default(0),
  discount_total: z.number().min(0).default(0),
  idempotency_key: z.string().trim().optional().nullable(),
  metadata: z.record(z.any()).default({}),
});

// 2. Transition Order State Schema
const transitionOrderStateSchema = z.object({
  status: z.enum([
    OrderStatus.PENDING,
    OrderStatus.CONFIRMED,
    OrderStatus.PROCESSING,
    OrderStatus.READY,
    OrderStatus.FULFILLED,
    OrderStatus.COMPLETED,
    OrderStatus.CANCELLED,
    OrderStatus.ON_HOLD,
  ], {
    required_error: 'Target status is required',
  }),
  reason: z.string().min(2, 'Transition reason is required').trim(),
});

// 3. Place Order Hold Schema
const placeHoldSchema = z.object({
  reason: z.string().min(2, 'Hold reason is required').trim(),
});

// 4. Resolve Order Hold Schema
const resolveHoldSchema = z.object({
  target_status: z
    .enum([OrderStatus.PENDING, OrderStatus.CONFIRMED, OrderStatus.PROCESSING, OrderStatus.READY, OrderStatus.CANCELLED])
    .default(OrderStatus.CONFIRMED),
  resolution_notes: z.string().optional(),
});

// 5. Query / List Orders Schema
const orderQuerySchema = z.object({
  status: z.string().optional(),
  customer_id: z.string().uuid().optional(),
  channel_id: z.string().uuid().optional(),
  search: z.string().optional(),
  page: z.string().regex(/^\d+$/).default('1'),
  limit: z.string().regex(/^\d+$/).default('20'),
});

module.exports = {
  orderAddressSchema,
  createOrderItemSchema,
  createOrderSchema,
  transitionOrderStateSchema,
  placeHoldSchema,
  resolveHoldSchema,
  orderQuerySchema,
};

