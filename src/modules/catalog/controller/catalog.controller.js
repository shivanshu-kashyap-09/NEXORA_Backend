const catchAsync = require('../../../shared/utils/catchAsync');
const ApiResponse = require('../../../shared/utils/ApiResponse');
const catalogService = require('../service/catalog.service');

/**
 * Create a new product category
 */
const createCategory = catchAsync(async (req, res) => {
  const category = await catalogService.createCategory(req.user.tenantId, req.body);
  return ApiResponse.created(res, category, 'Category created successfully');
});

/**
 * List all product categories
 */
const listCategories = catchAsync(async (req, res) => {
  const categories = await catalogService.listCategories(req.user.tenantId);
  return ApiResponse.success(res, categories, 'Categories retrieved successfully');
});

/**
 * Create a new product in the catalog
 */
const createProduct = catchAsync(async (req, res) => {
  const product = await catalogService.createProduct(req.user.tenantId, req.body);
  return ApiResponse.created(res, product, 'Product created successfully');
});

/**
 * List products with filters and pagination
 */
const listProducts = catchAsync(async (req, res) => {
  const result = await catalogService.listProducts(req.user.tenantId, req.query);
  return ApiResponse.paginated(
    res,
    result.items,
    result.page,
    result.limit,
    result.total,
    'Products retrieved successfully'
  );
});

/**
 * Get product details by ID
 */
const getProduct = catchAsync(async (req, res) => {
  const product = await catalogService.getProductDetails(req.user.tenantId, req.params.id);
  return ApiResponse.success(res, product, 'Product details retrieved successfully');
});

/**
 * Add a new variant to an existing product
 */
const createVariant = catchAsync(async (req, res) => {
  const variant = await catalogService.createVariant(req.user.tenantId, req.params.id, req.body);
  return ApiResponse.created(res, variant, 'Product variant created successfully');
});

/**
 * Create / link Bill-of-Materials (BOM) components for a bundle
 */
const createBundle = catchAsync(async (req, res) => {
  const bundle = await catalogService.createBundle(req.user.tenantId, req.body);
  return ApiResponse.created(res, bundle, 'Bundle components configured successfully');
});

module.exports = {
  createCategory,
  listCategories,
  createProduct,
  listProducts,
  getProduct,
  createVariant,
  createBundle,
};

