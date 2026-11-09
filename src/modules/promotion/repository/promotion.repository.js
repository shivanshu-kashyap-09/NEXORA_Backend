const { withTenantTransaction } = require('../../../infrastructure/database/tenantTransaction');
const logger = require('../../../config/logger');

/**
 * Ingest a new promotion / coupon campaign
 */
const createPromotion = async ({
  tenantId,
  code,
  title,
  discountType,
  discountValue,
  minOrderValue = 0,
  maxDiscountAmount = null,
  usageLimitTotal = null,
  usageLimitPerCustomer = 1,
  startsAt = null,
  endsAt = null,
  isActive = true,
}) => {
  return withTenantTransaction(tenantId, async (client) => {
    const query = `
      INSERT INTO promotions (
        tenant_id, code, title, discount_type, discount_value,
        min_order_value, max_discount_amount, usage_limit_total,
        usage_limit_per_customer, starts_at, ends_at, is_active, created_at
      )
      VALUES (
        $1, $2, $3, $4, $5,
        $6, $7, $8,
        $9, COALESCE($10, NOW()), $11, $12, NOW()
      )
      RETURNING *;
    `;
    const res = await client.query(query, [
      tenantId,
      code.toUpperCase().trim(),
      title.trim(),
      discountType,
      discountValue,
      minOrderValue,
      maxDiscountAmount,
      usageLimitTotal,
      usageLimitPerCustomer,
      startsAt,
      endsAt,
      isActive,
    ]);
    return res.rows[0];
  });
};

/**
 * Find promotion by ID
 */
const findPromotionById = async (tenantId, id) => {
  return withTenantTransaction(tenantId, async (client) => {
    const query = `
      SELECT p.*,
        (SELECT COUNT(*) FROM coupon_redemptions WHERE promotion_id = p.id) AS redemptions_count
      FROM promotions p
      WHERE p.tenant_id = $1 AND p.id = $2;
    `;
    const res = await client.query(query, [tenantId, id]);
    return res.rows[0] || null;
  });
};

/**
 * Find promotion by code
 */
const findPromotionByCode = async (tenantId, code) => {
  return withTenantTransaction(tenantId, async (client) => {
    const query = `
      SELECT *
      FROM promotions
      WHERE tenant_id = $1 AND code = $2;
    `;
    const res = await client.query(query, [tenantId, code.toUpperCase().trim()]);
    return res.rows[0] || null;
  });
};

/**
 * List promotions with filters & pagination
 */
const listPromotions = async (tenantId, { search, discountType, isActive, page = 1, limit = 20 }) => {
  return withTenantTransaction(tenantId, async (client) => {
    const offset = (page - 1) * limit;
    const params = [tenantId];
    let whereClauses = ['p.tenant_id = $1'];

    if (search) {
      params.push(`%${search}%`);
      whereClauses.push(`(p.code ILIKE $${params.length} OR p.title ILIKE $${params.length})`);
    }

    if (discountType) {
      params.push(discountType);
      whereClauses.push(`p.discount_type = $${params.length}`);
    }

    if (isActive !== undefined) {
      params.push(isActive === 'true' || isActive === true);
      whereClauses.push(`p.is_active = $${params.length}`);
    }

    const whereStr = whereClauses.join(' AND ');

    // Total count
    const countQuery = `
      SELECT COUNT(*) AS total
      FROM promotions p
      WHERE ${whereStr};
    `;
    const countRes = await client.query(countQuery, params);
    const total = parseInt(countRes.rows[0].total, 10);

    // List query
    params.push(limit, offset);
    const dataQuery = `
      SELECT p.*
      FROM promotions p
      WHERE ${whereStr}
      ORDER BY p.created_at DESC
      LIMIT $${params.length - 1} OFFSET $${params.length};
    `;
    const dataRes = await client.query(dataQuery, params);

    return {
      items: dataRes.rows,
      total,
      page: parseInt(page, 10),
      limit: parseInt(limit, 10),
    };
  });
};

/**
 * Update promotion fields
 */
const updatePromotion = async (tenantId, id, updateData) => {
  return withTenantTransaction(tenantId, async (client) => {
    const fields = [];
    const values = [tenantId, id];

    if (updateData.title !== undefined) {
      values.push(updateData.title.trim());
      fields.push(`title = $${values.length}`);
    }
    if (updateData.discount_value !== undefined) {
      values.push(updateData.discount_value);
      fields.push(`discount_value = $${values.length}`);
    }
    if (updateData.min_order_value !== undefined) {
      values.push(updateData.min_order_value);
      fields.push(`min_order_value = $${values.length}`);
    }
    if (updateData.max_discount_amount !== undefined) {
      values.push(updateData.max_discount_amount);
      fields.push(`max_discount_amount = $${values.length}`);
    }
    if (updateData.usage_limit_total !== undefined) {
      values.push(updateData.usage_limit_total);
      fields.push(`usage_limit_total = $${values.length}`);
    }
    if (updateData.usage_limit_per_customer !== undefined) {
      values.push(updateData.usage_limit_per_customer);
      fields.push(`usage_limit_per_customer = $${values.length}`);
    }
    if (updateData.ends_at !== undefined) {
      values.push(updateData.ends_at);
      fields.push(`ends_at = $${values.length}`);
    }
    if (updateData.is_active !== undefined) {
      values.push(updateData.is_active);
      fields.push(`is_active = $${values.length}`);
    }

    if (fields.length === 0) {
      const current = await findPromotionById(tenantId, id);
      return current;
    }

    const query = `
      UPDATE promotions
      SET ${fields.join(', ')}
      WHERE tenant_id = $1 AND id = $2
      RETURNING *;
    `;
    const res = await client.query(query, values);
    return res.rows[0];
  });
};

/**
 * Get customer's redemption count for a specific promotion
 */
const getCustomerRedemptionCount = async (tenantId, promotionId, customerId) => {
  return withTenantTransaction(tenantId, async (client) => {
    const query = `
      SELECT COUNT(*) AS total
      FROM coupon_redemptions
      WHERE tenant_id = $1 AND promotion_id = $2 AND customer_id = $3;
    `;
    const res = await client.query(query, [tenantId, promotionId, customerId]);
    return parseInt(res.rows[0].total, 10);
  });
};

/**
 * Atomically record coupon redemption and update usage ledger
 */
const recordRedemption = async ({
  tenantId,
  promotionId,
  orderId,
  customerId = null,
  discountApplied,
}) => {
  return withTenantTransaction(tenantId, async (client) => {
    // 1. Lock promotion row
    const lockRes = await client.query(
      `SELECT * FROM promotions WHERE tenant_id = $1 AND id = $2 FOR UPDATE;`,
      [tenantId, promotionId]
    );
    const promo = lockRes.rows[0];
    if (!promo) {
      const err = new Error(`Promotion not found with ID: ${promotionId}`);
      err.statusCode = 404;
      throw err;
    }

    // 2. Validate total usage limit
    if (promo.usage_limit_total && promo.current_redemptions >= promo.usage_limit_total) {
      const err = new Error(`Promotion coupon has reached its maximum total redemption limit (${promo.usage_limit_total})`);
      err.statusCode = 400;
      throw err;
    }

    // 3. Increment current_redemptions
    await client.query(
      `UPDATE promotions SET current_redemptions = current_redemptions + 1 WHERE tenant_id = $1 AND id = $2;`,
      [tenantId, promotionId]
    );

    // 4. Insert coupon_redemptions record
    const redemptionQuery = `
      INSERT INTO coupon_redemptions (
        tenant_id, promotion_id, order_id, customer_id, discount_applied, redeemed_at
      )
      VALUES ($1, $2, $3, $4, $5, NOW())
      RETURNING *;
    `;
    const redemptionRes = await client.query(redemptionQuery, [
      tenantId,
      promotionId,
      orderId,
      customerId,
      discountApplied,
    ]);

    // 5. If order exists, apportion discount on order record
    if (orderId) {
      await client.query(
        `
        UPDATE orders
        SET discount_total = discount_total + $1,
            total_amount = GREATEST(0, total_amount - $1),
            updated_at = NOW()
        WHERE tenant_id = $2 AND id = $3;
      `,
        [discountApplied, tenantId, orderId]
      );
    }

    return redemptionRes.rows[0];
  });
};

module.exports = {
  createPromotion,
  findPromotionById,
  findPromotionByCode,
  listPromotions,
  updatePromotion,
  getCustomerRedemptionCount,
  recordRedemption,
};
