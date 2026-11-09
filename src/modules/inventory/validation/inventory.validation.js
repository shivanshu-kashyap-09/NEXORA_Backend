const { z } = require('zod');
const { InventoryAdjustmentReasons } = require('../constants/inventory.constants');

// 1. Adjust Inventory Stock Schema
const adjustInventorySchema = z.object({
  warehouse_id: z
    .string({ required_error: 'Warehouse ID is required' })
    .uuid('warehouse_id must be a valid UUID'),
  product_id: z
    .string({ required_error: 'Product ID is required' })
    .uuid('product_id must be a valid UUID'),
  quantity_delta: z
    .number({ required_error: 'Quantity delta is required' })
    .int('Quantity delta must be an integer'),
  reason: z
    .string({ required_error: 'Adjustment reason is required' })
    .min(2, 'Reason must be at least 2 characters')
    .max(128, 'Reason cannot exceed 128 characters')
    .trim(),
  safety_stock: z
    .number()
    .int('Safety stock must be an integer')
    .min(0, 'Safety stock cannot be negative')
    .optional(),
  damaged: z
    .number()
    .int('Damaged stock must be an integer')
    .min(0, 'Damaged stock cannot be negative')
    .optional(),
});

// 2. 15-Minute Soft Hold Reservation Schema
const reserveInventorySchema = z.object({
  warehouse_id: z
    .string({ required_error: 'Warehouse ID is required' })
    .uuid('warehouse_id must be a valid UUID'),
  product_id: z
    .string({ required_error: 'Product ID is required' })
    .uuid('product_id must be a valid UUID'),
  quantity: z
    .number({ required_error: 'Quantity is required' })
    .int('Quantity must be an integer')
    .min(1, 'Reservation quantity must be at least 1'),
  order_id: z
    .string()
    .uuid('order_id must be a valid UUID')
    .optional()
    .nullable(),
  duration_minutes: z
    .number()
    .int('Duration minutes must be an integer')
    .min(1, 'Hold duration must be at least 1 minute')
    .max(1440, 'Hold duration cannot exceed 24 hours')
    .optional(),
});

// 3. Query / Filter Inventory Schema
const inventoryQuerySchema = z.object({
  warehouse_id: z.string().uuid().optional(),
  product_id: z.string().uuid().optional(),
  low_stock: z.enum(['true', 'false']).optional(),
  page: z.string().regex(/^\d+$/).default('1'),
  limit: z.string().regex(/^\d+$/).default('50'),
});

module.exports = {
  adjustInventorySchema,
  reserveInventorySchema,
  inventoryQuerySchema,
};

