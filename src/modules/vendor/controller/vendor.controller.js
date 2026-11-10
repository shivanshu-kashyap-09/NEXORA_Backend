const catchAsync = require('../../../shared/utils/catchAsync');
const ApiResponse = require('../../../shared/utils/ApiResponse');
const vendorService = require('../service/vendor.service');

/**
 * Register a new vendor / drop-shipper
 */
const createVendor = catchAsync(async (req, res) => {
  const vendor = await vendorService.createVendor(req.user.tenantId, req.body);
  return ApiResponse.created(res, vendor, 'Vendor registered successfully');
});

/**
 * List vendors with filters and pagination
 */
const listVendors = catchAsync(async (req, res) => {
  const result = await vendorService.listVendors(req.user.tenantId, req.query);
  return ApiResponse.paginated(
    res,
    result.items,
    result.page,
    result.limit,
    result.total,
    'Vendors retrieved successfully'
  );
});

/**
 * Get vendor details by ID
 */
const getVendor = catchAsync(async (req, res) => {
  const vendor = await vendorService.getVendorById(req.user.tenantId, req.params.id);
  return ApiResponse.success(res, vendor, 'Vendor details retrieved successfully');
});

/**
 * Create a new Purchase Order
 */
const createPurchaseOrder = catchAsync(async (req, res) => {
  const po = await vendorService.createPurchaseOrder(req.user.tenantId, req.body);
  return ApiResponse.created(res, po, 'Purchase Order created successfully');
});

/**
 * List Purchase Orders
 */
const listPurchaseOrders = catchAsync(async (req, res) => {
  const result = await vendorService.listPurchaseOrders(req.user.tenantId, req.query);
  return ApiResponse.paginated(
    res,
    result.items,
    result.page,
    result.limit,
    result.total,
    'Purchase Orders retrieved successfully'
  );
});

/**
 * Get Purchase Order details by ID
 */
const getPurchaseOrder = catchAsync(async (req, res) => {
  const po = await vendorService.getPoById(req.user.tenantId, req.params.id);
  return ApiResponse.success(res, po, 'Purchase Order retrieved successfully');
});

/**
 * Receive Purchase Order at warehouse
 */
const receivePurchaseOrder = catchAsync(async (req, res) => {
  const result = await vendorService.receivePurchaseOrder(
    req.user.tenantId,
    req.params.id,
    req.body
  );
  return ApiResponse.success(res, result, 'Purchase Order goods received and inventory credited');
});

module.exports = {
  createVendor,
  listVendors,
  getVendor,
  createPurchaseOrder,
  listPurchaseOrders,
  getPurchaseOrder,
  receivePurchaseOrder,
};

