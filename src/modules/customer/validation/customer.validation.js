const { z } = require('zod');

// Single Address Schema
const addressSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().min(1, 'Recipient name is required').trim(),
  street: z.string().min(1, 'Street address is required').trim(),
  city: z.string().min(1, 'City is required').trim(),
  state: z.string().optional(),
  country: z.string().length(2, 'Country must be a 2-letter ISO code (e.g. US, IN)').toUpperCase(),
  postal_code: z.string().min(2, 'Postal code is required').trim(),
  phone: z.string().optional(),
  is_default: z.boolean().default(false),
});

// 1. Create Customer Schema
const createCustomerSchema = z.object({
  email: z
    .string({ required_error: 'Customer email is required' })
    .email('Invalid email address')
    .toLowerCase()
    .trim(),
  first_name: z.string().min(1).trim().optional(),
  last_name: z.string().min(1).trim().optional(),
  phone: z.string().trim().optional(),
  shipping_addresses: z.array(addressSchema).default([]),
});

// 2. Update Customer Schema
const updateCustomerSchema = z.object({
  first_name: z.string().min(1).trim().optional(),
  last_name: z.string().min(1).trim().optional(),
  phone: z.string().trim().optional(),
  is_blacklisted: z.boolean().optional(),
});

// 3. Add Shipping Address Schema
const addAddressSchema = addressSchema;

// 4. Query / List Customers Schema
const customerQuerySchema = z.object({
  search: z.string().optional(),
  is_blacklisted: z.enum(['true', 'false']).optional(),
  page: z.string().regex(/^\d+$/).default('1'),
  limit: z.string().regex(/^\d+$/).default('20'),
});

module.exports = {
  addressSchema,
  createCustomerSchema,
  updateCustomerSchema,
  addAddressSchema,
  customerQuerySchema,
};

