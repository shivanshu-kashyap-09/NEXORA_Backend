const catchAsync = require('../../../shared/utils/catchAsync');
const ApiResponse = require('../../../shared/utils/ApiResponse');
const warehouseService = require('../service/warehouse.service');

/**
 * Create a new warehouse
 */
const createWarehouse = catchAsync(async (req, res) => {
  const warehouse = await warehouseService.createWarehouse(req.user.tenantId, req.body);
  return ApiResponse.created(res, warehouse, 'Warehouse created successfully');
});

/**
 * List all warehouses for the authenticated tenant
 */
const listWarehouses = catchAsync(async (req, res) => {
  const isActive = req.query.is_active !== undefined ? req.query.is_active === 'true' : undefined;
  const warehouses = await warehouseService.getWarehouses(req.user.tenantId, { isActive });
  return ApiResponse.success(res, warehouses, 'Warehouses retrieved successfully');
});

/**
 * Get warehouse details by ID
 */
const getWarehouse = catchAsync(async (req, res) => {
  const warehouse = await warehouseService.getWarehouseById(req.user.tenantId, req.params.id);
  return ApiResponse.success(res, warehouse, 'Warehouse retrieved successfully');
});

/**
 * Update warehouse configuration or address
 */
const updateWarehouse = catchAsync(async (req, res) => {
  const warehouse = await warehouseService.updateWarehouse(
    req.user.tenantId,
    req.params.id,
    req.body
  );
  return ApiResponse.success(res, warehouse, 'Warehouse updated successfully');
});

module.exports = {
  createWarehouse,
  listWarehouses,
  getWarehouse,
  updateWarehouse,
};

