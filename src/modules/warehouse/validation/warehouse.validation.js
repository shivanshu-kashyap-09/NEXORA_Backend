const { z } = require('zod');

// 1. Create Warehouse Schema
const createWarehouseSchema = z.object({
  code: z
    .string({ required_error: 'Warehouse code is required' })
    .min(2, 'Warehouse code must be at least 2 characters')
    .max(64, 'Warehouse code cannot exceed 64 characters')
    .toUpperCase()
    .trim(),
  name: z
    .string({ required_error: 'Warehouse name is required' })
    .min(2, 'Warehouse name must be at least 2 characters')
    .trim(),
  is_retail_store: z
    .boolean()
    .default(false),
  priority: z
    .number()
    .int()
    .min(1, 'Priority must be at least 1')
    .default(1),
  address: z.object({
    street: z.string().optional(),
    city: z.string({ required_error: 'City is required' }),
    state: z.string().optional(),
    country: z.string({ required_error: 'Country is required' }),
    postal_code: z.string({ required_error: 'Postal code is required' }),
  }),
});

// 2. Update Warehouse Schema
const updateWarehouseSchema = z.object({
  name: z.string().min(2).optional(),
  is_retail_store: z.boolean().optional(),
  priority: z.number().int().min(1).optional(),
  is_active: z.boolean().optional(),
  address: z
    .object({
      street: z.string().optional(),
      city: z.string().optional(),
      state: z.string().optional(),
      country: z.string().optional(),
      postal_code: z.string().optional(),
    })
    .optional(),
});

module.exports = {
  createWarehouseSchema,
  updateWarehouseSchema,
};

