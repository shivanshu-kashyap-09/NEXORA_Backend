const { z } = require('zod');

// 1. Process Payment Schema
const createPaymentSchema = z.object({
  order_id: z.string().uuid('order_id must be a valid UUID'),
  payment_method: z.string().min(2, 'Payment method is required').trim(),
  gateway: z.string().min(2, 'Payment gateway is required').trim(),
  gateway_transaction_id: z.string().optional().nullable(),
  amount: z.number().min(0.01, 'Amount must be greater than zero'),
  currency: z.string().length(3, 'Currency must be 3-letter ISO code').toUpperCase().default('USD'),
  idempotency_key: z.string().min(4, 'idempotency_key must be at least 4 characters').trim(),
  metadata: z.record(z.any()).default({}),
  auto_capture: z.boolean().default(true),
});

// 2. Capture Payment Schema
const capturePaymentSchema = z.object({
  gateway_transaction_id: z.string().optional(),
});

// 3. Issue Refund Schema
const createRefundSchema = z.object({
  amount: z.number().min(0.01, 'Refund amount must be greater than zero'),
  reason: z.string().min(2, 'Refund reason is required').trim(),
  gateway_refund_id: z.string().optional().nullable(),
});

// 4. Financial Reconciliation Schema
const createReconciliationSchema = z.object({
  gateway: z.string().min(2, 'Gateway is required').trim(),
  settlement_id: z.string().min(2, 'Settlement ID is required').trim(),
  total_expected: z.number().min(0, 'total_expected must be non-negative'),
  total_settled: z.number().min(0, 'total_settled must be non-negative'),
});

// 5. Query Payments Schema
const paymentQuerySchema = z.object({
  order_id: z.string().uuid().optional(),
  status: z.string().optional(),
  page: z.string().regex(/^\d+$/).default('1'),
  limit: z.string().regex(/^\d+$/).default('20'),
});

// 6. Query Reconciliations Schema
const reconciliationQuerySchema = z.object({
  gateway: z.string().optional(),
  status: z.string().optional(),
  page: z.string().regex(/^\d+$/).default('1'),
  limit: z.string().regex(/^\d+$/).default('20'),
});

module.exports = {
  createPaymentSchema,
  capturePaymentSchema,
  createRefundSchema,
  createReconciliationSchema,
  paymentQuerySchema,
  reconciliationQuerySchema,
};

