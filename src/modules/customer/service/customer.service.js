const customerRepository = require('../repository/customer.repository');
const { ConflictError, NotFoundError, BadRequestError } = require('../../../shared/errors');
const logger = require('../../../config/logger');

/**
 * Create a new customer profile
 */
const createCustomer = async (tenantId, customerData) => {
  const existing = await customerRepository.findCustomerByEmail(tenantId, customerData.email);
  if (existing) {
    throw new ConflictError(`Customer with email '${customerData.email}' already exists`);
  }

  const customer = await customerRepository.createCustomer({
    tenantId,
    email: customerData.email,
    firstName: customerData.first_name,
    lastName: customerData.last_name,
    phone: customerData.phone,
    shippingAddresses: customerData.shipping_addresses,
  });

  logger.info(`Customer created: ${customer.email} (${customer.id}) for tenant: ${tenantId}`);
  return customer;
};

/**
 * Get customer by ID
 */
const getCustomerById = async (tenantId, id) => {
  const customer = await customerRepository.getCustomerById(tenantId, id);
  if (!customer) {
    throw new NotFoundError(`Customer not found with ID: ${id}`);
  }
  return customer;
};

/**
 * List customers with search and filters
 */
const listCustomers = async (tenantId, query) => {
  return customerRepository.listCustomers(tenantId, {
    search: query.search,
    isBlacklisted: query.is_blacklisted,
    page: query.page,
    limit: query.limit,
  });
};

/**
 * Update customer profile details
 */
const updateCustomer = async (tenantId, id, updateData) => {
  await getCustomerById(tenantId, id);

  const updated = await customerRepository.updateCustomer(tenantId, id, updateData);
  logger.info(`Customer updated: ${id} for tenant: ${tenantId}`);
  return updated;
};

/**
 * Add a shipping address to the customer's address book
 */
const addShippingAddress = async (tenantId, id, addressData) => {
  await getCustomerById(tenantId, id);

  const updated = await customerRepository.addShippingAddress(tenantId, id, addressData);
  logger.info(`Shipping address added for customer: ${id}`);
  return updated;
};

/**
 * Remove a shipping address from customer address book
 */
const deleteShippingAddress = async (tenantId, id, addressId) => {
  await getCustomerById(tenantId, id);

  const updated = await customerRepository.deleteShippingAddress(tenantId, id, addressId);
  logger.info(`Shipping address ${addressId} removed for customer: ${id}`);
  return updated;
};

module.exports = {
  createCustomer,
  getCustomerById,
  listCustomers,
  updateCustomer,
  addShippingAddress,
  deleteShippingAddress,
};

