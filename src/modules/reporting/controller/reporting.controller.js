const catchAsync = require('../../../shared/utils/catchAsync');
const ApiResponse = require('../../../shared/utils/ApiResponse');
const reportingService = require('../service/reporting.service');

const getSalesSummary = catchAsync(async (req, res) => {
  const summary = await reportingService.getSalesSummary(req.user.tenantId, req.query);
  return ApiResponse.success(res, summary, 'Sales summary report retrieved successfully');
});

const getInventoryValuation = catchAsync(async (req, res) => {
  const valuation = await reportingService.getInventoryValuation(req.user.tenantId);
  return ApiResponse.success(res, valuation, 'Inventory valuation report retrieved successfully');
});

const getReturnRates = catchAsync(async (req, res) => {
  const rates = await reportingService.getReturnRates(req.user.tenantId, req.query);
  return ApiResponse.success(res, rates, 'Return rates and defects report retrieved successfully');
});

const getChannelBreakdown = catchAsync(async (req, res) => {
  const breakdown = await reportingService.getChannelBreakdown(req.user.tenantId);
  return ApiResponse.success(res, breakdown, 'Channel performance report retrieved successfully');
});

module.exports = {
  getSalesSummary,
  getInventoryValuation,
  getReturnRates,
  getChannelBreakdown,
};

