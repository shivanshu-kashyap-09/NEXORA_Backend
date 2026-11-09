const warehouseRepository = require('../repository/warehouse.repository');
const { ConflictError, NotFoundError, BadRequestError } = require('../../../shared/errors');
const logger = require('../../../config/logger');

/**
 * Create a new warehouse
 */
const createWarehouse = async (tenantId, warehouseData) => {
  const existing = await warehouseRepository.findWarehouseByCode(tenantId, warehouseData.code);
  if (existing) {
    throw new ConflictError(`Warehouse with code '${warehouseData.code}' already exists`);
  }

  const warehouse = await warehouseRepository.createWarehouse({
    tenantId,
    code: warehouseData.code,
    name: warehouseData.name,
    isRetailStore: warehouseData.is_retail_store,
    priority: warehouseData.priority,
    address: warehouseData.address,
  });

  logger.info(`Warehouse created: ${warehouse.code} (${warehouse.id}) for tenant: ${tenantId}`);
  return warehouse;
};

/**
 * List all warehouses for tenant
 */
const getWarehouses = async (tenantId, filters = {}) => {
  return warehouseRepository.getWarehouses(tenantId, filters);
};

/**
 * Get warehouse by ID
 */
const getWarehouseById = async (tenantId, id) => {
  const warehouse = await warehouseRepository.getWarehouseById(tenantId, id);
  if (!warehouse) {
    throw new NotFoundError(`Warehouse not found with ID: ${id}`);
  }
  return warehouse;
};

/**
 * Update warehouse
 */
const updateWarehouse = async (tenantId, id, updateData) => {
  await getWarehouseById(tenantId, id);

  const updated = await warehouseRepository.updateWarehouse(tenantId, id, updateData);
  logger.info(`Warehouse updated: ${id} for tenant: ${tenantId}`);
  return updated;
};

module.exports = {
  createWarehouse,
  getWarehouses,
  getWarehouseById,
  updateWarehouse,
};

