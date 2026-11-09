const { z } = require('zod');
const { RmaStatus, QaGrade } = require('../constants/refund.constants');

// 1. Create Return (RMA Request) Schema
const createReturnSchema = z.object({
  order_id: z.string().uuid('order_id must be a valid UUID'),
  reason: z.string().min(2, 'Return reason is required').trim(),
  items: z
    .array(
      z.object({
        order_item_id: z.string().uuid('order_item_id must be a valid UUID'),
        quantity: z.number().int().min(1, 'Quantity must be at least 1'),
      })
    )
    .min(1, 'Return must contain at least one line item'),
});

// 2. Update RMA Status Schema
const updateRmaStatusSchema = z.object({
  status: z.enum([
    RmaStatus.APPROVED,
    RmaStatus.PICKUP_SCHEDULED,
    RmaStatus.IN_TRANSIT,
    RmaStatus.RECEIVED,
    RmaStatus.INSPECTED,
    RmaStatus.REFUNDED,
    RmaStatus.EXCHANGED,
    RmaStatus.REJECTED,
  ], {
    required_error: 'Status is required',
  }),
  reverse_tracking_number: z.string().optional(),
  reverse_label_url: z.string().url().optional().nullable(),
});

// 3. Warehouse Intake & QA Inspection Schema
const inspectReturnSchema = z.object({
  warehouse_id: z.string().uuid('warehouse_id must be a valid UUID'),
  items: z
    .array(
      z.object({
        return_item_id: z.string().uuid('return_item_id must be a valid UUID'),
        qa_grade: z.enum([QaGrade.SELLABLE, QaGrade.REFURBISHABLE, QaGrade.DAMAGED_SCRAP], {
          required_error: 'qa_grade is required',
        }),
      })
    )
    .min(1, 'Must inspect at least one return item'),
});

// 4. Query Returns Schema
const returnQuerySchema = z.object({
  order_id: z.string().uuid().optional(),
  status: z.string().optional(),
  rma_number: z.string().optional(),
  page: z.string().regex(/^\d+$/).default('1'),
  limit: z.string().regex(/^\d+$/).default('20'),
});

module.exports = {
  createReturnSchema,
  updateRmaStatusSchema,
  inspectReturnSchema,
  returnQuerySchema,
};
