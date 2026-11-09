const { z } = require('zod');
const { DiscountType } = require('../constants/promotion.constants');

// 1. Create Promotion Schema
const createPromotionSchema = z.object({
  code: z
    .string()
    .min(3, 'Code must be at least 3 characters')
    .max(64, 'Code cannot exceed 64 characters')
    .regex(/^[A-Z0-9_-]+$/, 'Code must contain uppercase letters, numbers, dashes, or underscores only')
    .trim(),
  title: z.string().min(2, 'Title is required').max(255).trim(),
  discount_type: z.enum([
    DiscountType.PERCENTAGE,
    DiscountType.FIXED_AMOUNT,
    DiscountType.BOGO,
    DiscountType.FREE_SHIPPING,
  ], {
    required_error: 'discount_type is required',
  }),
  discount_value: z.number().min(0, 'discount_value must be non-negative'),
  min_order_value: z.number().min(0).default(0),
  max_discount_amount: z.number().min(0).optional().nullable(),
  usage_limit_total: z.number().int().min(1).optional().nullable(),
  usage_limit_per_customer: z.number().int().min(1).default(1),
  starts_at: z.string().datetime().optional(),
  ends_at: z.string().datetime().optional().nullable(),
  is_active: z.boolean().default(true),
});

// 2. Validate / Preview Coupon Application Schema
const validateCouponSchema = z.object({
  code: z.string().min(2, 'Coupon code is required').trim(),
  order_amount: z.number().min(0, 'order_amount must be non-negative'),
  customer_id: z.string().uuid().optional(),
  shipping_amount: z.number().min(0).default(0),
});

// 3. Redeem Coupon Schema
const redeemCouponSchema = z.object({
  code: z.string().min(2, 'Coupon code is required').trim(),
  order_id: z.string().uuid('order_id must be a valid UUID'),
  order_amount: z.number().min(0, 'order_amount must be non-negative'),
  customer_id: z.string().uuid().optional(),
  shipping_amount: z.number().min(0).default(0),
});

// 4. Update Promotion Schema
const updatePromotionSchema = z.object({
  title: z.string().min(2).max(255).trim().optional(),
  discount_value: z.number().min(0).optional(),
  min_order_value: z.number().min(0).optional(),
  max_discount_amount: z.number().min(0).optional().nullable(),
  usage_limit_total: z.number().int().min(1).optional().nullable(),
  usage_limit_per_customer: z.number().int().min(1).optional(),
  ends_at: z.string().datetime().optional().nullable(),
  is_active: z.boolean().optional(),
});

// 5. Query Promotions Schema
const queryPromotionSchema = z.object({
  search: z.string().optional(),
  discount_type: z.string().optional(),
  is_active: z.enum(['true', 'false']).optional(),
  page: z.string().regex(/^\d+$/).default('1'),
  limit: z.string().regex(/^\d+$/).default('20'),
});

module.exports = {
  createPromotionSchema,
  validateCouponSchema,
  redeemCouponSchema,
  updatePromotionSchema,
  queryPromotionSchema,
};
