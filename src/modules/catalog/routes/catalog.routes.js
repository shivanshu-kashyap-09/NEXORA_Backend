const express = require('express');
const router = express.Router();
const catalogController = require('../controller/catalog.controller');
const {
  createCategorySchema,
  createProductSchema,
  createVariantSchema,
  createBundleSchema,
  productQuerySchema,
} = require('../validation/catalog.validation');
const validateRequest = require('../../../shared/validators/validateRequest');
const authGuard = require('../../../shared/middleware/authGuard');
const rbacGuard = require('../../../shared/middleware/rbacGuard');

// Require authentication for all catalog endpoints
router.use(authGuard);

/**
 * @openapi
 * /categories:
 *   post:
 *     summary: Create a product taxonomy category
 *     tags:
 *       - Product Catalog
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - slug
 *               - name
 *             properties:
 *               slug:
 *                 type: string
 *                 example: mens-apparel
 *               name:
 *                 type: string
 *                 example: Men's Apparel
 *               description:
 *                 type: string
 *                 example: Clothing and outerwear for men
 *               parent_id:
 *                 type: string
 *                 format: uuid
 *                 nullable: true
 *     responses:
 *       201:
 *         description: Category created successfully
 *       403:
 *         description: Forbidden
 */
router.post(
  '/categories',
  rbacGuard({ roles: ['owner', 'admin'] }),
  validateRequest({ body: createCategorySchema }),
  catalogController.createCategory
);

/**
 * @openapi
 * /categories:
 *   get:
 *     summary: List all categories for the tenant
 *     tags:
 *       - Product Catalog
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Category tree retrieved successfully
 */
router.get('/categories', catalogController.listCategories);

/**
 * @openapi
 * /products:
 *   post:
 *     summary: Create a new product in the catalog
 *     tags:
 *       - Product Catalog
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - sku
 *               - name
 *               - price_base
 *             properties:
 *               sku:
 *                 type: string
 *                 example: SKU-TSHIRT-BLK
 *               name:
 *                 type: string
 *                 example: Classic Cotton Crewneck
 *               description:
 *                 type: string
 *                 example: 100% premium combed cotton t-shirt
 *               category_id:
 *                 type: string
 *                 format: uuid
 *               price_base:
 *                 type: number
 *                 example: 29.99
 *               currency:
 *                 type: string
 *                 example: USD
 *               weight_grams:
 *                 type: number
 *                 example: 220
 *               dimensions_cm:
 *                 type: object
 *                 properties:
 *                   length:
 *                     type: number
 *                     example: 30
 *                   width:
 *                     type: number
 *                     example: 20
 *                   height:
 *                     type: number
 *                     example: 2
 *               is_bundle:
 *                 type: boolean
 *                 example: false
 *     responses:
 *       201:
 *         description: Product created successfully
 *       409:
 *         description: SKU already exists
 */
router.post(
  '/products',
  rbacGuard({ roles: ['owner', 'admin', 'warehouse_manager'] }),
  validateRequest({ body: createProductSchema }),
  catalogController.createProduct
);

/**
 * @openapi
 * /products:
 *   get:
 *     summary: List products with pagination and filters
 *     tags:
 *       - Product Catalog
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         description: Search by product title or SKU
 *       - in: query
 *         name: category_id
 *         schema:
 *           type: string
 *           format: uuid
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 20
 *     responses:
 *       200:
 *         description: Paginated product list retrieved successfully
 */
router.get('/products', validateRequest({ query: productQuerySchema }), catalogController.listProducts);

/**
 * @openapi
 * /products/bundles:
 *   post:
 *     summary: Configure Bill-of-Materials (BOM) components for a bundle product
 *     tags:
 *       - Product Catalog
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - bundle_product_id
 *               - components
 *             properties:
 *               bundle_product_id:
 *                 type: string
 *                 format: uuid
 *               components:
 *                 type: array
 *                 items:
 *                   type: object
 *                   required:
 *                     - component_product_id
 *                     - quantity
 *                   properties:
 *                     component_product_id:
 *                       type: string
 *                       format: uuid
 *                     quantity:
 *                       type: integer
 *                       example: 2
 *     responses:
 *       201:
 *         description: Bundle BOM components configured successfully
 */
router.post(
  '/products/bundles',
  rbacGuard({ roles: ['owner', 'admin'] }),
  validateRequest({ body: createBundleSchema }),
  catalogController.createBundle
);

/**
 * @openapi
 * /products/{id}:
 *   get:
 *     summary: Get single product details including variants & bundle BOM
 *     tags:
 *       - Product Catalog
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Product details retrieved
 *       404:
 *         description: Product not found
 */
router.get('/products/:id', catalogController.getProduct);

/**
 * @openapi
 * /products/{id}/variants:
 *   post:
 *     summary: Add a variant under an existing product
 *     tags:
 *       - Product Catalog
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - variant_sku
 *               - title
 *               - attributes
 *             properties:
 *               variant_sku:
 *                 type: string
 *                 example: SKU-TSHIRT-BLK-XL
 *               title:
 *                 type: string
 *                 example: Black / XL
 *               attributes:
 *                 type: object
 *                 example:
 *                   color: Black
 *                   size: XL
 *               price_override:
 *                 type: number
 *                 example: 34.99
 *     responses:
 *       201:
 *         description: Product variant created
 */
router.post(
  '/products/:id/variants',
  rbacGuard({ roles: ['owner', 'admin', 'warehouse_manager'] }),
  validateRequest({ body: createVariantSchema }),
  catalogController.createVariant
);

module.exports = router;

