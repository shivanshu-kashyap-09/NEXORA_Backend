const { withTenantTransaction, withTenantQuery } = require('../../../infrastructure/database/tenantTransaction');
const logger = require('../../../config/logger');

/**
 * Create a new category
 */
const createCategory = async ({ tenantId, slug, name, description, parentId }) => {
  return withTenantTransaction(tenantId, async (client) => {
    const query = `
      INSERT INTO categories (tenant_id, slug, name, description, parent_id)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING *;
    `;
    const res = await client.query(query, [tenantId, slug, name, description || null, parentId || null]);
    return res.rows[0];
  });
};

/**
 * List all categories for a tenant
 */
const getCategories = async (tenantId) => {
  return withTenantTransaction(tenantId, async (client) => {
    const query = `
      SELECT 
        c.id, c.slug, c.name, c.description, c.parent_id, c.created_at,
        p.name AS parent_name
      FROM categories c
      LEFT JOIN categories p ON p.id = c.parent_id
      ORDER BY c.created_at ASC;
    `;
    const res = await client.query(query);
    return res.rows;
  });
};

/**
 * Find product by SKU within tenant
 */
const findProductBySku = async (tenantId, sku) => {
  return withTenantTransaction(tenantId, async (client) => {
    const query = `
      SELECT id, sku, name, is_active, price_base, currency
      FROM products
      WHERE sku = $1;
    `;
    const res = await client.query(query, [sku]);
    return res.rows[0] || null;
  });
};

/**
 * Create a new product
 */
const createProduct = async ({
  tenantId,
  categoryId,
  sku,
  name,
  description,
  priceBase,
  currency,
  weightGrams,
  dimensionsCm,
  isBundle,
  metadata,
}) => {
  return withTenantTransaction(tenantId, async (client) => {
    const query = `
      INSERT INTO products (
        tenant_id, category_id, sku, name, description, 
        price_base, currency, weight_grams, dimensions_cm, 
        is_bundle, metadata, is_active
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, true)
      RETURNING *;
    `;
    const res = await client.query(query, [
      tenantId,
      categoryId || null,
      sku,
      name,
      description || null,
      priceBase,
      currency || 'USD',
      weightGrams || 0,
      JSON.stringify(dimensionsCm || { length: 0, width: 0, height: 0 }),
      isBundle || false,
      JSON.stringify(metadata || {}),
    ]);
    return res.rows[0];
  });
};

/**
 * List products with filters and pagination
 */
const getProducts = async ({ tenantId, categoryId, search, isActive, page = 1, limit = 20 }) => {
  return withTenantTransaction(tenantId, async (client) => {
    const conditions = [];
    const values = [];
    let idx = 1;

    if (categoryId) {
      conditions.push(`p.category_id = $${idx++}`);
      values.push(categoryId);
    }

    if (isActive !== undefined) {
      conditions.push(`p.is_active = $${idx++}`);
      values.push(isActive === 'true');
    }

    if (search) {
      conditions.push(`(p.name ILIKE $${idx} OR p.sku ILIKE $${idx})`);
      values.push(`%${search}%`);
      idx++;
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    // Total count query
    const countQuery = `SELECT count(*) AS total FROM products p ${whereClause};`;
    const countRes = await client.query(countQuery, values);
    const total = parseInt(countRes.rows[0].total, 10);

    // Paginated items query
    const offset = (page - 1) * limit;
    const itemsQuery = `
      SELECT 
        p.id, p.sku, p.name, p.description, p.price_base, p.currency, 
        p.is_bundle, p.is_active, p.weight_grams, p.dimensions_cm, p.created_at,
        c.name AS category_name, c.slug AS category_slug,
        (SELECT count(*) FROM product_variants v WHERE v.product_id = p.id) AS variant_count
      FROM products p
      LEFT JOIN categories c ON c.id = p.category_id
      ${whereClause}
      ORDER BY p.created_at DESC
      LIMIT $${idx++} OFFSET $${idx++};
    `;
    const itemsRes = await client.query(itemsQuery, [...values, limit, offset]);

    return {
      items: itemsRes.rows,
      total,
      page: parseInt(page, 10),
      limit: parseInt(limit, 10),
    };
  });
};

/**
 * Get product by ID with full variants & bundle components
 */
const getProductById = async (tenantId, productId) => {
  return withTenantTransaction(tenantId, async (client) => {
    const prodQuery = `
      SELECT 
        p.*,
        c.name AS category_name,
        c.slug AS category_slug
      FROM products p
      LEFT JOIN categories c ON c.id = p.category_id
      WHERE p.id = $1;
    `;
    const prodRes = await client.query(prodQuery, [productId]);
    const product = prodRes.rows[0];
    if (!product) return null;

    // Fetch variants
    const variantsQuery = `
      SELECT id, variant_sku, title, attributes, price_override, created_at
      FROM product_variants
      WHERE product_id = $1
      ORDER BY created_at ASC;
    `;
    const varRes = await client.query(variantsQuery, [productId]);
    product.variants = varRes.rows;

    // If bundle, fetch components (BOM)
    if (product.is_bundle) {
      const bomQuery = `
        SELECT 
          b.id, b.quantity,
          p.id AS component_id, p.sku AS component_sku, p.name AS component_name, p.price_base
        FROM bundles b
        JOIN products p ON p.id = b.component_product_id
        WHERE b.bundle_product_id = $1;
      `;
      const bomRes = await client.query(bomQuery, [productId]);
      product.bundle_components = bomRes.rows;
    }

    return product;
  });
};

/**
 * Create a variant under a parent product
 */
const createVariant = async ({ tenantId, productId, variantSku, title, attributes, priceOverride }) => {
  return withTenantTransaction(tenantId, async (client) => {
    const query = `
      INSERT INTO product_variants (tenant_id, product_id, variant_sku, title, attributes, price_override)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *;
    `;
    const res = await client.query(query, [
      tenantId,
      productId,
      variantSku,
      title,
      JSON.stringify(attributes || {}),
      priceOverride || null,
    ]);
    return res.rows[0];
  });
};

/**
 * Configure Bill-of-Materials (BOM) for a bundle product
 */
const setBundleComponents = async (tenantId, bundleProductId, components) => {
  return withTenantTransaction(tenantId, async (client) => {
    // Clean existing components if updating
    await client.query('DELETE FROM bundles WHERE bundle_product_id = $1;', [bundleProductId]);

    const inserted = [];
    for (const comp of components) {
      const query = `
        INSERT INTO bundles (tenant_id, bundle_product_id, component_product_id, quantity)
        VALUES ($1, $2, $3, $4)
        RETURNING *;
      `;
      const res = await client.query(query, [tenantId, bundleProductId, comp.component_product_id, comp.quantity]);
      inserted.push(res.rows[0]);
    }
    return inserted;
  });
};

module.exports = {
  createCategory,
  getCategories,
  findProductBySku,
  createProduct,
  getProducts,
  getProductById,
  createVariant,
  setBundleComponents,
};

