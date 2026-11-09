const { z } = require('zod');

// 1. Tenant Onboarding Schema
const onboardTenantSchema = z.object({
  company_name: z
    .string({ required_error: 'Company name is required' })
    .min(2, 'Company name must be at least 2 characters')
    .trim(),
  slug: z
    .string({ required_error: 'Tenant slug is required' })
    .min(2, 'Slug must be at least 2 characters')
    .max(64, 'Slug cannot exceed 64 characters')
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Slug must be URL-safe (lowercase letters, numbers, and hyphens only)')
    .toLowerCase()
    .trim(),
  primary_email: z
    .string({ required_error: 'Primary email is required' })
    .email('Invalid email address format')
    .toLowerCase()
    .trim(),
  password: z
    .string({ required_error: 'Admin password is required' })
    .min(8, 'Password must be at least 8 characters long'),
  first_name: z
    .string({ required_error: 'First name is required' })
    .min(2, 'First name must be at least 2 characters')
    .trim(),
  last_name: z
    .string()
    .trim()
    .optional(),
  primary_currency: z
    .string()
    .length(3, 'Currency must be 3-letter ISO code (e.g. USD, INR, EUR)')
    .toUpperCase()
    .default('USD'),
  timezone: z
    .string()
    .default('UTC'),
  tier: z
    .enum(['STARTER', 'GROWTH', 'ENTERPRISE', 'CUSTOM'])
    .default('STARTER'),
});

// 2. Update Tenant Profile Schema
const updateProfileSchema = z.object({
  brand_color_primary: z
    .string()
    .regex(/^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/, 'Invalid hex color code')
    .optional(),
  logo_url: z
    .string()
    .url('Invalid URL format')
    .optional(),
  tax_identifier: z
    .string()
    .trim()
    .optional(),
  support_email: z
    .string()
    .email('Invalid support email')
    .optional(),
  support_phone: z
    .string()
    .optional(),
  custom_domain: z
    .string()
    .regex(/^[a-z0-9.-]+\.[a-z]{2,}$/i, 'Invalid domain format')
    .optional(),
  registered_address: z
    .object({
      street: z.string().optional(),
      city: z.string().optional(),
      state: z.string().optional(),
      country: z.string().optional(),
      postal_code: z.string().optional(),
    })
    .optional(),
});

// 3. Update Tenant Configs Schema
const updateConfigsSchema = z.object({
  soft_hold_duration_minutes: z
    .number()
    .int()
    .min(1, 'Soft hold must be at least 1 minute')
    .max(60, 'Soft hold cannot exceed 60 minutes')
    .optional(),
  auto_capture_payment: z
    .boolean()
    .optional(),
  auto_route_fulfillment: z
    .boolean()
    .optional(),
  enable_cod: z
    .boolean()
    .optional(),
  enable_bopis: z
    .boolean()
    .optional(),
});

// 4. Invite Team Member Schema
const inviteUserSchema = z.object({
  email: z
    .string({ required_error: 'User email is required' })
    .email('Invalid email address')
    .toLowerCase()
    .trim(),
  role_name: z
    .enum(['admin', 'warehouse_manager', 'order_operator', 'support_agent', 'finance_manager'], {
      required_error: 'Valid role is required',
    }),
  first_name: z
    .string({ required_error: 'First name is required' })
    .min(2, 'First name must be at least 2 characters')
    .trim(),
  last_name: z
    .string()
    .trim()
    .optional(),
});

module.exports = {
  onboardTenantSchema,
  updateProfileSchema,
  updateConfigsSchema,
  inviteUserSchema,
};

