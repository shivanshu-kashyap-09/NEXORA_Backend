const catchAsync = require('../../../shared/utils/catchAsync');
const ApiResponse = require('../../../shared/utils/ApiResponse');
const promotionService = require('../service/promotion.service');

/**
 * Ingest a new promotion / coupon rule
 */
const createPromotion = catchAsync(async (req, res) => {
  const promo = await promotionService.createPromotion(req.user.tenantId, req.body);
  return ApiResponse.created(res, promo, 'Promotion coupon created successfully');
});

/**
 * List promotions with filters & pagination
 */
const listPromotions = catchAsync(async (req, res) => {
  const result = await promotionService.listPromotions(req.user.tenantId, req.query);
  return ApiResponse.paginated(
    res,
    result.items,
    result.page,
    result.limit,
    result.total,
    'Promotions retrieved successfully'
  );
});

/**
 * Get promotion details by ID
 */
const getPromotion = catchAsync(async (req, res) => {
  const promo = await promotionService.getPromotionById(req.user.tenantId, req.params.id);
  return ApiResponse.success(res, promo, 'Promotion details retrieved successfully');
});

/**
 * Update promotion rule
 */
const updatePromotion = catchAsync(async (req, res) => {
  const updated = await promotionService.updatePromotion(
    req.user.tenantId,
    req.params.id,
    req.body
  );
  return ApiResponse.success(res, updated, 'Promotion updated successfully');
});

/**
 * Validate / Preview Coupon Application against cart subtotal
 */
const validateCoupon = catchAsync(async (req, res) => {
  const calculation = await promotionService.validateAndCalculateDiscount(
    req.user.tenantId,
    req.body
  );
  return ApiResponse.success(res, calculation, 'Coupon validated successfully');
});

/**
 * Redeem Coupon on Order
 */
const redeemCoupon = catchAsync(async (req, res) => {
  const receipt = await promotionService.redeemCoupon(req.user.tenantId, req.body);
  return ApiResponse.created(res, receipt, 'Coupon redeemed successfully');
});

module.exports = {
  createPromotion,
  listPromotions,
  getPromotion,
  updatePromotion,
  validateCoupon,
  redeemCoupon,
};
