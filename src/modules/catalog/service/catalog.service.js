const catalogRepository = require('../repository/catalog.repository');
const { ConflictError, NotFoundError, BadRequestError } = require('../../../shared/errors');
const logger = require('../../../config/logger');

/**
 * Create a new product category
 */
const createCategory = async (tenantId, payload) => {
  return await catalogRepository.createCategory({
    tenantId,
    slug: payload.slug,
    name: payload.name,
    description: payload.description,
    parentId: payload.parent_id,
  });
};

/**
 * List all categories
 */
const listCategories = async (tenantId) => {
  return await catalogRepository.getCategories(tenantId);
};

/**
 * Create a new catalog product
 */
const createProduct = async (tenantId, payload) => {
  // Ensure SKU is unique within this tenant
  const existingProduct = await catalogRepository.findProductBySku(tenantId, payload.sku);
  if (existingProduct) {
    throw new ConflictError(`Product SKU '${payload.sku}' already exists within your catalog.`);
  }

  const product = await catalogRepository.createProduct({
    tenantId,
    categoryId: payload.category_id,
    sku: payload.sku,
    name: payload.name,
    description: payload.description,
    priceBase: payload.price_base,
    currency: payload.currency,
    weightGrams: payload.weight_grams,
    dimensionsCm: payload.dimensions_cm,
    isBundle: payload.is_bundle,
    metadata: payload.metadata,
  });

  logger.info('Product created successfully:', { tenantId, sku: product.sku, id: product.id });
  return product;
};

/**
 * Query products with pagination & search
 */
const listProducts = async (tenantId, query) => {
  return await catalogRepository.getProducts({
    tenantId,
    categoryId: query.category_id,
    search: query.search,
    isActive: query.is_active,
    page: parseInt(query.page || 1, 10),
    limit: parseInt(query.limit || 20, 10),
  });
};

/**
 * Get detailed product info with variants and bundle components
 */
const getProductDetails = async (tenantId, productId) => {
  const product = await catalogRepository.getProductById(tenantId, productId);
  if (!product) {
    throw new NotFoundError('Product not found');
  }
  return product;
};

/**
 * Add a new variant under an existing product
 */
const createVariant = async (tenantId, productId, payload) => {
  const product = await catalogRepository.getProductById(tenantId, productId);
  if (!product) {
    throw new NotFoundError('Parent product not found');
  }

  const variant = await catalogRepository.createVariant({
    tenantId,
    productId,
    variantSku: payload.variant_sku,
    title: payload.title,
    attributes: payload.attributes,
    priceOverride: payload.price_override,
  });

  logger.info('Product variant created:', { tenantId, productId, variantSku: variant.variant_sku });
  return variant;
};

/**
 * Configure Bill-of-Materials (BOM) components for a composite bundle product
 */
const createBundle = async (tenantId, payload) => {
  const product = await catalogRepository.getProductById(tenantId, payload.bundle_product_id);
  if (!product) {
    throw new NotFoundError('Bundle product not found');
  }

  if (!product.is_bundle) {
    throw new BadRequestError(`Product '${product.sku}' is not designated as a bundle. Set is_bundle to true.`);
  }

  const components = await catalogRepository.setBundleComponents(
    tenantId,
    payload.bundle_product_id,
    payload.components
  );

  logger.info('Bundle BOM components configured:', { tenantId, bundleId: payload.bundle_product_id, count: components.length });
  return components;
};

module.exports = {
  createCategory,
  listCategories,
  createProduct,
  listProducts,
  getProductDetails,
  createVariant,
  createBundle,
};

