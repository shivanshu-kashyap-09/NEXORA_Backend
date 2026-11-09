const { z } = require('zod');

// 1. Create BOPIS In-Store Pickup Record
const createBopisSchema = z.object({
  order_id: z.string().uuid('order_id must be a valid UUID'),
  store_warehouse_id: z.string().uuid('store_warehouse_id must be a valid UUID'),
});

// 2. Mark BOPIS Pickup Staged in Holding Area
const stageBopisSchema = z.object({
  staging_bin: z.string().max(64).optional(),
  notes: z.string().max(255).optional(),
});

// 3. Customer Handover & PIN Verification
const handoverBopisSchema = z.object({
  pin: z.string().min(4, 'PIN must be at least 4 digits').max(10, 'PIN maximum 10 digits').trim(),
  picked_up_by_name: z.string().min(2, 'Name must be at least 2 characters').max(128).trim(),
});

// 4. Query BOPIS Pickups Schema
const queryBopisSchema = z.object({
  store_warehouse_id: z.string().uuid().optional(),
  order_id: z.string().uuid().optional(),
  is_staged: z.enum(['true', 'false']).optional(),
  page: z.string().regex(/^\d+$/).default('1'),
  limit: z.string().regex(/^\d+$/).default('20'),
});

// 5. In-Store Return Desk (BORIS - Buy Online Return In Store) Schema
const borisReturnSchema = z.object({
  order_id: z.string().uuid('order_id must be a valid UUID'),
  store_warehouse_id: z.string().uuid('store_warehouse_id must be a valid UUID'),
  reason: z.string().min(2, 'Return reason is required').trim(),
  items: z
    .array(
      z.object({
        order_item_id: z.string().uuid('order_item_id must be a valid UUID'),
        quantity: z.number().int().min(1, 'Quantity must be at least 1'),
        qa_grade: z.enum(['SELLABLE', 'REFURBISHABLE', 'DAMAGED_SCRAP']),
      })
    )
    .min(1, 'Must return at least one item'),
  customer_name: z.string().max(128).optional(),
  refund_method: z.enum(['ORIGINAL_PAYMENT', 'STORE_CREDIT', 'CASH']).default('ORIGINAL_PAYMENT'),
});

module.exports = {
  createBopisSchema,
  stageBopisSchema,
  handoverBopisSchema,
  queryBopisSchema,
  borisReturnSchema,
};
