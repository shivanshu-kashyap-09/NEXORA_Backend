const vendorRepository = require('../repository/vendor.repository');
const { distributedLock } = require('../../../infrastructure/redis');
const { NotFoundError, BadRequestError, ConflictError } = require('../../../shared/errors');
const logger = require('../../../config/logger');

/**
 * Register a new Vendor / Drop-Shipper
 */
const createVendor = async (tenantId, vendorData) => {
  const existing = await vendorRepository.findVendorByCode(tenantId, vendorData.code);
  if (existing) {
    throw new ConflictError(`Vendor code '${vendorData.code.toUpperCase()}' already exists for this tenant`);
  }

  const vendor = await vendorRepository.createVendor({
    tenantId,
    code: vendorData.code,
    name: vendorData.name,
    email: vendorData.email,
    phone: vendorData.phone,
    commissionPercentage: vendorData.commission_percentage,
    isActive: vendorData.is_active,
  });

  logger.info(`Vendor registered: ${vendor.name} (${vendor.code})`);
  return vendor;
};

/**
 * Get vendor details by ID
 */
const getVendorById = async (tenantId, id) => {
  const vendor = await vendorRepository.findVendorById(tenantId, id);
  if (!vendor) {
    throw new NotFoundError(`Vendor not found with ID: ${id}`);
  }
  return vendor;
};

/**
 * List vendors
 */
const listVendors = async (tenantId, query) => {
  return vendorRepository.listVendors(tenantId, {
    search: query.search,
    isActive: query.is_active,
    page: query.page,
    limit: query.limit,
  });
};

/**
 * Create a new Purchase Order
 */
const createPurchaseOrder = async (tenantId, poData) => {
  const vendor = await vendorRepository.findVendorById(tenantId, poData.vendor_id);
  if (!vendor) {
    throw new NotFoundError(`Vendor not found with ID: ${poData.vendor_id}`);
  }

  const po = await vendorRepository.createPurchaseOrder({
    tenantId,
    vendorId: poData.vendor_id,
    poNumber: poData.po_number,
    totalCost: poData.total_cost,
    expectedDeliveryDate: poData.expected_delivery_date,
  });

  logger.info(`Purchase Order created: ${po.po_number} (Vendor: ${vendor.name})`);
  return po;
};

/**
 * Get Purchase Order details by ID
 */
const getPoById = async (tenantId, id) => {
  const po = await vendorRepository.findPoById(tenantId, id);
  if (!po) {
    throw new NotFoundError(`Purchase Order not found with ID: ${id}`);
  }
  return po;
};

/**
 * List Purchase Orders
 */
const listPurchaseOrders = async (tenantId, query) => {
  return vendorRepository.listPurchaseOrders(tenantId, {
    vendorId: query.vendor_id,
    status: query.status,
    search: query.search,
    page: query.page,
    limit: query.limit,
  });
};

/**
 * Receive Purchase Order at warehouse and restock stock
 */
const receivePurchaseOrder = async (tenantId, id, receiveData) => {
  const lockKey = `lock:po:${tenantId}:${id}`;

  return distributedLock.withLock(lockKey, 10000, async () => {
    const po = await getPoById(tenantId, id);

    const result = await vendorRepository.receivePurchaseOrder({
      tenantId,
      poId: id,
      warehouseId: receiveData.warehouse_id,
      items: receiveData.items,
    });

    logger.info(`Purchase Order received: ${po.po_number} at warehouse ${receiveData.warehouse_id}`);
    return result;
  });
};

module.exports = {
  createVendor,
  getVendorById,
  listVendors,
  createPurchaseOrder,
  getPoById,
  listPurchaseOrders,
  receivePurchaseOrder,
};

