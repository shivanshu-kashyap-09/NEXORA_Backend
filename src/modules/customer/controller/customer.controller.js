const catchAsync = require('../../../shared/utils/catchAsync');
const ApiResponse = require('../../../shared/utils/ApiResponse');
const customerService = require('../service/customer.service');

/**
 * Create a new customer profile
 */
const createCustomer = catchAsync(async (req, res) => {
  const customer = await customerService.createCustomer(req.user.tenantId, req.body);
  return ApiResponse.created(res, customer, 'Customer created successfully');
});

/**
 * List customers with search and pagination
 */
const listCustomers = catchAsync(async (req, res) => {
  const result = await customerService.listCustomers(req.user.tenantId, req.query);
  return ApiResponse.paginated(
    res,
    result.items,
    result.page,
    result.limit,
    result.total,
    'Customers retrieved successfully'
  );
});

/**
 * Get customer details by ID
 */
const getCustomer = catchAsync(async (req, res) => {
  const customer = await customerService.getCustomerById(req.user.tenantId, req.params.id);
  return ApiResponse.success(res, customer, 'Customer details retrieved successfully');
});

/**
 * Update customer profile
 */
const updateCustomer = catchAsync(async (req, res) => {
  const customer = await customerService.updateCustomer(
    req.user.tenantId,
    req.params.id,
    req.body
  );
  return ApiResponse.success(res, customer, 'Customer updated successfully');
});

/**
 * Add shipping address to customer address book
 */
const addShippingAddress = catchAsync(async (req, res) => {
  const customer = await customerService.addShippingAddress(
    req.user.tenantId,
    req.params.id,
    req.body
  );
  return ApiResponse.created(res, customer, 'Shipping address added successfully');
});

/**
 * Remove shipping address from customer address book
 */
const deleteShippingAddress = catchAsync(async (req, res) => {
  const customer = await customerService.deleteShippingAddress(
    req.user.tenantId,
    req.params.id,
    req.params.addressId
  );
  return ApiResponse.success(res, customer, 'Shipping address deleted successfully');
});

module.exports = {
  createCustomer,
  listCustomers,
  getCustomer,
  updateCustomer,
  addShippingAddress,
  deleteShippingAddress,
};

