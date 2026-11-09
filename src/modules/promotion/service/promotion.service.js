const promotionRepository = require('../repository/promotion.repository');
const { distributedLock } = require('../../../infrastructure/redis');
const { DiscountType } = require('../constants/promotion.constants');
const { NotFoundError, BadRequestError, ConflictError } = require('../../../shared/errors');
const logger = require('../../../config/logger');

/**
 * Ingest a new promotion / coupon rule
 */
const createPromotion = async (tenantId, promoData) => {
  const existing = await promotionRepository.findPromotionByCode(tenantId, promoData.code);
  if (existing) {
    throw new ConflictError(`Promotion code '${promoData.code.toUpperCase()}' already exists for this tenant`);
  }

  const promo = await promotionRepository.createPromotion({
    tenantId,
    code: promoData.code,
    title: promoData.title,
    discountType: promoData.discount_type,
    discountValue: promoData.discount_value,
    minOrderValue: promoData.min_order_value,
    maxDiscountAmount: promoData.max_discount_amount,
    usageLimitTotal: promoData.usage_limit_total,
    usageLimitPerCustomer: promoData.usage_limit_per_customer,
    startsAt: promoData.starts_at,
    endsAt: promoData.ends_at,
    isActive: promoData.is_active,
  });

  logger.info(`Promotion created: ${promo.code} (${promo.discount_type} - ${promo.discount_value})`);
  return promo;
};

/**
 * Get promotion by ID
 */
const getPromotionById = async (tenantId, id) => {
  const promo = await promotionRepository.findPromotionById(tenantId, id);
  if (!promo) {
    throw new NotFoundError(`Promotion not found with ID: ${id}`);
  }
  return promo;
};

/**
 * List promotions with filters & pagination
 */
const listPromotions = async (tenantId, query) => {
  return promotionRepository.listPromotions(tenantId, {
    search: query.search,
    discountType: query.discount_type,
    isActive: query.is_active,
    page: query.page,
    limit: query.limit,
  });
};

/**
 * Update promotion rule
 */
const updatePromotion = async (tenantId, id, updateData) => {
  await getPromotionById(tenantId, id);
  const updated = await promotionRepository.updatePromotion(tenantId, id, updateData);
  logger.info(`Promotion updated: ${id}`);
  return updated;
};

/**
 * Core Rule Engine: Validate Coupon & Calculate Discount Amount
 */
const validateAndCalculateDiscount = async (tenantId, { code, order_amount, customer_id, shipping_amount = 0 }) => {
  const promo = await promotionRepository.findPromotionByCode(tenantId, code);
  if (!promo) {
    throw new NotFoundError(`Promotion coupon code '${code}' not found`);
  }

  const now = new Date();

  // 1. Active check
  if (!promo.is_active) {
    throw new BadRequestError(`Promotion coupon '${promo.code}' is currently inactive`);
  }

  // 2. Date window check
  if (promo.starts_at && new Date(promo.starts_at) > now) {
    throw new BadRequestError(`Promotion coupon '${promo.code}' has not started yet (starts ${promo.starts_at})`);
  }

  if (promo.ends_at && new Date(promo.ends_at) < now) {
    throw new BadRequestError(`Promotion coupon '${promo.code}' expired on ${promo.ends_at}`);
  }

  // 3. Minimum order spend check
  const orderSubtotal = Number(order_amount);
  if (promo.min_order_value && orderSubtotal < Number(promo.min_order_value)) {
    throw new BadRequestError(
      `Order subtotal of $${orderSubtotal.toFixed(2)} does not meet minimum spend threshold of $${Number(promo.min_order_value).toFixed(2)} for coupon '${promo.code}'`
    );
  }

  // 4. Platform usage limit check
  if (promo.usage_limit_total && promo.current_redemptions >= promo.usage_limit_total) {
    throw new BadRequestError(`Promotion coupon '${promo.code}' has reached its total usage limit (${promo.usage_limit_total})`);
  }

  // 5. Customer usage limit check
  if (customer_id && promo.usage_limit_per_customer) {
    const customerUsage = await promotionRepository.getCustomerRedemptionCount(tenantId, promo.id, customer_id);
    if (customerUsage >= promo.usage_limit_per_customer) {
      throw new BadRequestError(
        `Customer has already reached the maximum redemption limit (${promo.usage_limit_per_customer}) for coupon '${promo.code}'`
      );
    }
  }

  // 6. Calculate discount amount
  let discountApplied = 0;
  const value = Number(promo.discount_value);

  switch (promo.discount_type) {
    case DiscountType.PERCENTAGE: {
      const rawDiscount = (orderSubtotal * value) / 100;
      if (promo.max_discount_amount) {
        discountApplied = Math.min(rawDiscount, Number(promo.max_discount_amount));
      } else {
        discountApplied = rawDiscount;
      }
      break;
    }

    case DiscountType.FIXED_AMOUNT: {
      discountApplied = Math.min(value, orderSubtotal);
      break;
    }

    case DiscountType.FREE_SHIPPING: {
      discountApplied = Number(shipping_amount || 0);
      break;
    }

    case DiscountType.BOGO: {
      discountApplied = Math.min(value, orderSubtotal);
      break;
    }

    default:
      discountApplied = 0;
  }

  discountApplied = Math.round(discountApplied * 100) / 100;
  const netAmount = Math.max(0, Math.round((orderSubtotal - discountApplied) * 100) / 100);

  return {
    is_valid: true,
    promotion_id: promo.id,
    code: promo.code,
    title: promo.title,
    discount_type: promo.discount_type,
    discount_value: Number(promo.discount_value),
    order_amount: orderSubtotal,
    discount_applied: discountApplied,
    net_amount: netAmount,
  };
};

/**
 * Atomically Redeem Coupon & Record Ledger Entry
 */
const redeemCoupon = async (tenantId, { code, order_id, order_amount, customer_id, shipping_amount }) => {
  const promo = await promotionRepository.findPromotionByCode(tenantId, code);
  if (!promo) {
    throw new NotFoundError(`Promotion coupon code '${code}' not found`);
  }

  const lockKey = `lock:promo:redeem:${tenantId}:${promo.id}`;

  return distributedLock.withLock(lockKey, 10000, async () => {
    // 1. Run full validation
    const calculation = await validateAndCalculateDiscount(tenantId, {
      code,
      order_amount,
      customer_id,
      shipping_amount,
    });

    // 2. Record redemption
    const redemption = await promotionRepository.recordRedemption({
      tenantId,
      promotionId: promo.id,
      orderId: order_id,
      customerId: customer_id || null,
      discountApplied: calculation.discount_applied,
    });

    logger.info(`Coupon redeemed: ${promo.code} on Order ${order_id} (Discount: $${calculation.discount_applied})`);

    return {
      redemption_id: redemption.id,
      order_id,
      code: promo.code,
      discount_applied: calculation.discount_applied,
      net_amount: calculation.net_amount,
      redeemed_at: redemption.redeemed_at,
    };
  });
};

module.exports = {
  createPromotion,
  getPromotionById,
  listPromotions,
  updatePromotion,
  validateAndCalculateDiscount,
  redeemCoupon,
};

