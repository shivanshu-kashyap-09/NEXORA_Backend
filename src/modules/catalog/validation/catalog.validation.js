const { z } = require('zod');

// 1. Category Creation Schema
const createCategorySchema = z.object({
  slug: z
    .string({ required_error: 'Category slug is required' })
    .min(2, 'Slug must be at least 2 characters')
    .max(128, 'Slug cannot exceed 128 characters')
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Slug must be URL-safe (lowercase letters, numbers, and hyphens only)')
    .toLowerCase()
    .trim(),
  name: z
    .string({ required_error: 'Category name is required' })
    .min(2, 'Category name must be at least 2 characters')
    .trim(),
  description: z
    .string()
    .trim()
    .optional(),
  parent_id: z
    .string()
    .uuid('parent_id must be a valid UUID')
    .optional()
    .nullable(),
});

// 2. Product Creation Schema
const createProductSchema = z.object({
  sku: z
    .string({ required_error: 'Product SKU is required' })
    .min(2, 'SKU must be at least 2 characters')
    .max(128, 'SKU cannot exceed 128 characters')
    .trim(),
  name: z
    .string({ required_error: 'Product name is required' })
    .min(2, 'Product name must be at least 2 characters')
    .trim(),
  description: z
    .string()
    .trim()
    .optional(),
  category_id: z
    .string()
    .uuid('category_id must be a valid UUID')
    .optional()
    .nullable(),
  price_base: z
    .number({ required_error: 'Base price is required' })
    .min(0, 'Base price cannot be negative'),
  currency: z
    .string()
    .length(3, 'Currency must be 3-letter ISO code')
    .toUpperCase()
    .default('USD'),
  weight_grams: z
    .number()
    .min(0, 'Weight cannot be negative')
    .default(0),
  dimensions_cm: z
    .object({
      length: z.number().default(0),
      width: z.number().default(0),
      height: z.number().default(0),
    })
    .default({ length: 0, width: 0, height: 0 }),
  is_bundle: z
    .boolean()
    .default(false),
  metadata: z
    .record(z.any())
    .default({}),
});

// 3. Variant Creation Schema
const createVariantSchema = z.object({
  variant_sku: z
    .string({ required_error: 'Variant SKU is required' })
    .min(2, 'Variant SKU must be at least 2 characters')
    .trim(),
  title: z
    .string({ required_error: 'Variant title is required' })
    .min(1, 'Title cannot be empty')
    .trim(),
  attributes: z
    .record(z.any(), { required_error: 'Variant attributes are required (e.g. { color: "Red", size: "XL" })' }),
  price_override: z
    .number()
    .min(0, 'Price override cannot be negative')
    .optional()
    .nullable(),
});

// 4. Bundle / Bill-of-Materials (BOM) Creation Schema
const createBundleSchema = z.object({
  bundle_product_id: z
    .string({ required_error: 'Bundle product ID is required' })
    .uuid('bundle_product_id must be a valid UUID'),
  components: z
    .array(
      z.object({
        component_product_id: z.string().uuid('component_product_id must be a valid UUID'),
        quantity: z.number().int().min(1, 'Component quantity must be at least 1'),
      })
    )
    .min(1, 'A bundle must contain at least one component SKU'),
});

// 5. Query Filter Schema
const productQuerySchema = z.object({
  category_id: z.string().uuid().optional(),
  search: z.string().optional(),
  is_active: z.enum(['true', 'false']).optional(),
  page: z.string().regex(/^\d+$/).default('1'),
  limit: z.string().regex(/^\d+$/).default('20'),
});

module.exports = {
  createCategorySchema,
  createProductSchema,
  createVariantSchema,
  createBundleSchema,
  productQuerySchema,
};

