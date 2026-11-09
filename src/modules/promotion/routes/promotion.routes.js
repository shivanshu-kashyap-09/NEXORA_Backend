const express = require('express');
const router = express.Router();
const promotionController = require('../controller/promotion.controller');
const {
  createPromotionSchema,
  validateCouponSchema,
  redeemCouponSchema,
  updatePromotionSchema,
  queryPromotionSchema,
} = require('../validation/promotion.validation');
const validateRequest = require('../../../shared/validators/validateRequest');
const authGuard = require('../../../shared/middleware/authGuard');
const rbacGuard = require('../../../shared/middleware/rbacGuard');

// Require authentication for all promotion endpoints
router.use(authGuard);

/**
 * @openapi
 * /promotions:
 *   post:
 *     summary: Create promotion campaign / voucher coupon
 *     description: Ingests a new promotion rule with spend threshold, discount mechanics (percentage, fixed, BOGO, free shipping), and usage caps.
 *     tags:
 *       - Promotions, Discounts & Coupons
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - code
 *               - title
 *               - discount_type
 *               - discount_value
 *             properties:
 *               code:
 *                 type: string
 *                 example: SUMMER25
 *                 description: Unique uppercase coupon code
 *               title:
 *                 type: string
 *                 example: 25% Off Summer Collection
 *               discount_type:
 *                 type: string
 *                 enum: [PERCENTAGE, FIXED_AMOUNT, BOGO, FREE_SHIPPING]
 *                 example: PERCENTAGE
 *               discount_value:
 *                 type: number
 *                 example: 25.0
 *               min_order_value:
 *                 type: number
 *                 example: 50.0
 *               max_discount_amount:
 *                 type: number
 *                 example: 100.0
 *               usage_limit_total:
 *                 type: integer
 *                 example: 500
 *               usage_limit_per_customer:
 *                 type: integer
 *                 example: 1
 *               starts_at:
 *                 type: string
 *                 format: date-time
 *               ends_at:
 *                 type: string
 *                 format: date-time
 *               is_active:
 *                 type: boolean
 *                 default: true
 *     responses:
 *       201:
 *         description: Promotion created successfully
 *       400:
 *         description: Validation error
 *       409:
 *         description: Promotion code already exists
 */
router.post(
  '/',
  rbacGuard({ roles: ['owner', 'admin', 'order_operator'] }),
  validateRequest({ body: createPromotionSchema }),
  promotionController.createPromotion
);

/**
 * @openapi
 * /promotions:
 *   get:
 *     summary: List promotions & coupons
 *     description: Retrieve all promotional campaigns filtered by search keyword, discount type, or active status.
 *     tags:
 *       - Promotions, Discounts & Coupons
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         description: Search by code or title
 *       - in: query
 *         name: discount_type
 *         schema:
 *           type: string
 *           enum: [PERCENTAGE, FIXED_AMOUNT, BOGO, FREE_SHIPPING]
 *       - in: query
 *         name: is_active
 *         schema:
 *           type: string
 *           enum: ['true', 'false']
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 20
 *     responses:
 *       200:
 *         description: Promotions retrieved successfully
 */
router.get(
  '/',
  validateRequest({ query: queryPromotionSchema }),
  promotionController.listPromotions
);

/**
 * @openapi
 * /promotions/validate:
 *   post:
 *     summary: Validate & preview coupon application
 *     description: Validates coupon eligibility against an order amount and returns calculated discount amount without mutating state.
 *     tags:
 *       - Promotions, Discounts & Coupons
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - code
 *               - order_amount
 *             properties:
 *               code:
 *                 type: string
 *                 example: SUMMER25
 *               order_amount:
 *                 type: number
 *                 example: 120.0
 *               customer_id:
 *                 type: string
 *                 format: uuid
 *               shipping_amount:
 *                 type: number
 *                 example: 15.0
 *     responses:
 *       200:
 *         description: Coupon validated and discount calculated
 *       400:
 *         description: Coupon invalid, expired, or min spend not reached
 *       404:
 *         description: Coupon code not found
 */
router.post(
  '/validate',
  validateRequest({ body: validateCouponSchema }),
  promotionController.validateCoupon
);

/**
 * @openapi
 * /promotions/redeem:
 *   post:
 *     summary: Atomically redeem coupon on order
 *     description: Validates coupon, records redemption in coupon_redemptions ledger, updates order discount total, and increments redemption count under distributed lock.
 *     tags:
 *       - Promotions, Discounts & Coupons
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - code
 *               - order_id
 *               - order_amount
 *             properties:
 *               code:
 *                 type: string
 *                 example: SUMMER25
 *               order_id:
 *                 type: string
 *                 format: uuid
 *               order_amount:
 *                 type: number
 *                 example: 120.0
 *               customer_id:
 *                 type: string
 *                 format: uuid
 *               shipping_amount:
 *                 type: number
 *                 example: 15.0
 *     responses:
 *       201:
 *         description: Coupon successfully redeemed and applied
 *       400:
 *         description: Coupon not eligible or usage limit reached
 *       404:
 *         description: Coupon code not found
 */
router.post(
  '/redeem',
  validateRequest({ body: redeemCouponSchema }),
  promotionController.redeemCoupon
);

/**
 * @openapi
 * /promotions/{id}:
 *   get:
 *     summary: Get promotion details
 *     description: Retrieve promotion configuration, usage metrics, and redemption count.
 *     tags:
 *       - Promotions, Discounts & Coupons
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Promotion UUID
 *     responses:
 *       200:
 *         description: Promotion details retrieved successfully
 *       404:
 *         description: Promotion not found
 */
router.get('/:id', promotionController.getPromotion);

/**
 * @openapi
 * /promotions/{id}:
 *   patch:
 *     summary: Update promotion configuration
 *     description: Modify discount value, minimum order value, validity window, or toggle active status.
 *     tags:
 *       - Promotions, Discounts & Coupons
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Promotion UUID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               title:
 *                 type: string
 *               discount_value:
 *                 type: number
 *               min_order_value:
 *                 type: number
 *               max_discount_amount:
 *                 type: number
 *               usage_limit_total:
 *                 type: integer
 *               usage_limit_per_customer:
 *                 type: integer
 *               ends_at:
 *                 type: string
 *                 format: date-time
 *               is_active:
 *                 type: boolean
 *     responses:
 *       200:
 *         description: Promotion updated successfully
 *       404:
 *         description: Promotion not found
 */
router.patch(
  '/:id',
  rbacGuard({ roles: ['owner', 'admin'] }),
  validateRequest({ body: updatePromotionSchema }),
  promotionController.updatePromotion
);

module.exports = router;

