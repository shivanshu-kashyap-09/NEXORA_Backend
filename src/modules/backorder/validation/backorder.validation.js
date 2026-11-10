const { z } = require('zod');

// 1. Enqueue Backorder Schema
const enqueueBackorderSchema = z.object({
  order_id: z.string().uuid('order_id must be a valid UUID'),
  product_id: z.string().uuid('product_id must be a valid UUID'),
  quantity: z.number().int().min(1, 'Quantity must be at least 1'),
  priority: z.number().int().min(1).max(10).default(1),
});

// 2. Query Backorders Schema
const queryBackorderSchema = z.object({
  product_id: z.string().uuid().optional(),
  order_id: z.string().uuid().optional(),
  is_allocated: z.enum(['true', 'false']).optional(),
  page: z.string().regex(/^\d+$/).default('1'),
  limit: z.string().regex(/^\d+$/).default('20'),
});

// 3. Allocate Backorder Queue Schema
const allocateBackorderSchema = z.object({
  product_id: z.string().uuid('product_id must be a valid UUID'),
  warehouse_id: z.string().uuid('warehouse_id must be a valid UUID'),
  quantity: z.number().int().min(1, 'Quantity to allocate must be at least 1'),
});

// 4. Update Backorder Priority Schema
const updatePrioritySchema = z.object({
  priority: z.number().int().min(1).max(10, 'Priority must be between 1 and 10'),
});

module.exports = {
  enqueueBackorderSchema,
  queryBackorderSchema,
  allocateBackorderSchema,
  updatePrioritySchema,
};

