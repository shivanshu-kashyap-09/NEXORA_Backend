const { withTenantTransaction } = require('../../../infrastructure/database/tenantTransaction');

/**
 * Aggregated Sales & Revenue Summary
 */
const getSalesSummary = async (tenantId, { fromDate, toDate } = {}) => {
  return withTenantTransaction(tenantId, async (client) => {
    const params = [tenantId];
    let whereClauses = ['tenant_id = $1'];

    if (fromDate) {
      params.push(fromDate);
      whereClauses.push(`created_at >= $${params.length}`);
    }

    if (toDate) {
      params.push(toDate);
      whereClauses.push(`created_at <= $${params.length}`);
    }

    const whereStr = whereClauses.join(' AND ');

    const query = `
      SELECT 
        COUNT(*)::int AS total_orders,
        COUNT(CASE WHEN status = 'COMPLETED' THEN 1 END)::int AS completed_orders,
        COUNT(CASE WHEN status = 'CANCELLED' THEN 1 END)::int AS cancelled_orders,
        COALESCE(SUM(total_amount), 0)::numeric(12, 2) AS gross_revenue,
        COALESCE(SUM(subtotal), 0)::numeric(12, 2) AS total_subtotal,
        COALESCE(SUM(discount_total), 0)::numeric(12, 2) AS total_discounts,
        COALESCE(SUM(tax_total), 0)::numeric(12, 2) AS total_taxes,
        COALESCE(SUM(shipping_total), 0)::numeric(12, 2) AS total_shipping,
        COALESCE(AVG(total_amount), 0)::numeric(12, 2) AS average_order_value
      FROM orders
      WHERE ${whereStr};
    `;
    const res = await client.query(query, params);
    return res.rows[0];
  });
};

/**
 * Total Inventory Valuation across warehouses
 */
const getInventoryValuation = async (tenantId) => {
  return withTenantTransaction(tenantId, async (client) => {
    const query = `
      SELECT 
        w.id AS warehouse_id,
        w.name AS warehouse_name,
        w.code AS warehouse_code,
        COALESCE(SUM(ii.on_hand), 0)::int AS total_on_hand,
        COALESCE(SUM(ii.reserved), 0)::int AS total_reserved,
        COALESCE(SUM(ii.damaged), 0)::int AS total_damaged,
        COALESCE(SUM(ii.on_hand * COALESCE(p.price_base, 0)), 0)::numeric(12, 2) AS on_hand_valuation,
        COALESCE(SUM(ii.damaged * COALESCE(p.price_base, 0)), 0)::numeric(12, 2) AS scrap_valuation
      FROM warehouses w
      LEFT JOIN inventory_items ii ON ii.warehouse_id = w.id AND ii.tenant_id = w.tenant_id
      LEFT JOIN products p ON p.id = ii.product_id AND p.tenant_id = w.tenant_id
      WHERE w.tenant_id = $1
      GROUP BY w.id, w.name, w.code
      ORDER BY w.name ASC;
    `;
    const res = await client.query(query, [tenantId]);

    let grandTotalValuation = 0;
    let grandTotalUnits = 0;
    for (const row of res.rows) {
      grandTotalValuation += Number(row.on_hand_valuation);
      grandTotalUnits += Number(row.total_on_hand);
    }

    return {
      grand_total_units: grandTotalUnits,
      grand_total_valuation: Number(grandTotalValuation.toFixed(2)),
      warehouses: res.rows,
    };
  });
};

/**
 * Return Rates & Defect Reason Breakdown
 */
const getReturnRates = async (tenantId, { fromDate, toDate } = {}) => {
  return withTenantTransaction(tenantId, async (client) => {
    // 1. Overall return rate
    const rateQuery = `
      SELECT 
        (SELECT COUNT(*)::int FROM orders WHERE tenant_id = $1) AS total_orders,
        (SELECT COUNT(*)::int FROM returns WHERE tenant_id = $1) AS total_returns;
    `;
    const rateRes = await client.query(rateQuery, [tenantId]);
    const { total_orders, total_returns } = rateRes.rows[0];
    const returnRatePct = total_orders > 0 ? Number(((total_returns / total_orders) * 100).toFixed(2)) : 0;

    // 2. Reason breakdown
    const reasonsQuery = `
      SELECT reason, COUNT(*)::int AS return_count
      FROM returns
      WHERE tenant_id = $1
      GROUP BY reason
      ORDER BY return_count DESC;
    `;
    const reasonsRes = await client.query(reasonsQuery, [tenantId]);

    return {
      total_orders,
      total_returns,
      return_rate_percentage: returnRatePct,
      reasons_breakdown: reasonsRes.rows,
    };
  });
};

/**
 * Sales Channel Performance Breakdown
 */
const getChannelBreakdown = async (tenantId) => {
  return withTenantTransaction(tenantId, async (client) => {
    const query = `
      SELECT 
        c.id AS channel_id,
        c.name AS channel_name,
        c.type AS channel_type,
        c.is_active,
        COUNT(o.id)::int AS total_orders,
        COALESCE(SUM(o.total_amount), 0)::numeric(12, 2) AS total_revenue
      FROM channels c
      LEFT JOIN orders o ON o.channel_id = c.id AND o.tenant_id = c.tenant_id
      WHERE c.tenant_id = $1
      GROUP BY c.id, c.name, c.type, c.is_active
      ORDER BY total_revenue DESC;
    `;
    const res = await client.query(query, [tenantId]);
    return res.rows;
  });
};

module.exports = {
  getSalesSummary,
  getInventoryValuation,
  getReturnRates,
  getChannelBreakdown,
};
