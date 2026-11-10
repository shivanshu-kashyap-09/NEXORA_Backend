const { z } = require('zod');
const { PoStatus } = require('../constants/vendor.constants');

// 1. Create Vendor Schema
const createVendorSchema = z.object({
  code: z
    .string()
    .min(2, 'Vendor code must be at least 2 characters')
    .max(64)
    .regex(/^[A-Z0-9_-]+$/, 'Vendor code must be uppercase alphanumeric, dash, or underscore')
    .trim(),
  name: z.string().min(2, 'Vendor name is required').max(255).trim(),
  email: z.string().email('Valid email is required'),
  phone: z.string().max(32).optional(),
  commission_percentage: z.number().min(0).max(100).default(0),
  is_active: z.boolean().default(true),
});

// 2. Query Vendor Schema
const queryVendorSchema = z.object({
  search: z.string().optional(),
  is_active: z.enum(['true', 'false']).optional(),
  page: z.string().regex(/^\d+$/).default('1'),
  limit: z.string().regex(/^\d+$/).default('20'),
});

// 3. Create Purchase Order Schema
const createPoSchema = z.object({
  vendor_id: z.string().uuid('vendor_id must be a valid UUID'),
  po_number: z.string().max(64).optional(),
  total_cost: z.number().min(0, 'total_cost must be non-negative'),
  expected_delivery_date: z.string().date().optional(),
  items: z
    .array(
      z.object({
        product_id: z.string().uuid('product_id must be a valid UUID'),
        quantity: z.number().int().min(1, 'Quantity must be at least 1'),
        unit_cost: z.number().min(0, 'unit_cost must be non-negative'),
      })
    )
    .min(1, 'PO must contain at least one line item')
    .optional(),
});

// 4. Query Purchase Orders Schema
const queryPoSchema = z.object({
  vendor_id: z.string().uuid().optional(),
  status: z.enum([PoStatus.DRAFT, PoStatus.ISSUED, PoStatus.RECEIVED, PoStatus.CANCELLED]).optional(),
  search: z.string().optional(),
  page: z.string().regex(/^\d+$/).default('1'),
  limit: z.string().regex(/^\d+$/).default('20'),
});

// 5. Receive Purchase Order Goods Schema
const receivePoSchema = z.object({
  warehouse_id: z.string().uuid('warehouse_id must be a valid UUID'),
  items: z
    .array(
      z.object({
        product_id: z.string().uuid('product_id must be a valid UUID'),
        quantity_received: z.number().int().min(1, 'Quantity received must be at least 1'),
      })
    )
    .min(1, 'Must receive at least one product item'),
});

module.exports = {
  createVendorSchema,
  queryVendorSchema,
  createPoSchema,
  queryPoSchema,
  receivePoSchema,
};

