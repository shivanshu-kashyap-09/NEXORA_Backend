const { withTenantTransaction } = require('../../../infrastructure/database/tenantTransaction');
const logger = require('../../../config/logger');
const { PaymentStatus, ReconciliationStatus } = require('../constants/payment.constants');

/**
 * Record a payment transaction and auto-generate invoice if captured
 */
const createPayment = async ({
  tenantId,
  orderId,
  paymentMethod,
  gateway,
  gatewayTransactionId,
  amount,
  currency = 'USD',
  idempotencyKey,
  metadata = {},
  autoCapture = true,
}) => {
  return withTenantTransaction(tenantId, async (client) => {
    // 1. Check idempotency
    const idempQuery = `
      SELECT *
      FROM payments
      WHERE tenant_id = $1 AND idempotency_key = $2;
    `;
    const idempRes = await client.query(idempQuery, [tenantId, idempotencyKey]);
    if (idempRes.rows[0]) {
      return { payment: idempRes.rows[0], isExisting: true };
    }

    const initialStatus = autoCapture ? PaymentStatus.CAPTURED : PaymentStatus.AUTHORIZED;

    // 2. Insert into payments
    const paymentQuery = `
      INSERT INTO payments (
        tenant_id, order_id, payment_method, gateway, gateway_transaction_id,
        amount, currency, status, idempotency_key, metadata, created_at, updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW(), NOW())
      RETURNING *;
    `;
    const paymentRes = await client.query(paymentQuery, [
      tenantId,
      orderId,
      paymentMethod,
      gateway,
      gatewayTransactionId || null,
      amount,
      currency,
      initialStatus,
      idempotencyKey,
      JSON.stringify(metadata),
    ]);
    const payment = paymentRes.rows[0];

    let invoice = null;

    // 3. If captured, update order payment status and auto-generate invoice
    if (autoCapture) {
      // Update order
      const updateOrderQuery = `
        UPDATE orders
        SET 
          payment_status = $1,
          status = CASE WHEN status = 'PENDING' THEN 'CONFIRMED' ELSE status END,
          updated_at = NOW()
        WHERE tenant_id = $2 AND id = $3
        RETURNING *;
      `;
      const orderRes = await client.query(updateOrderQuery, [PaymentStatus.CAPTURED, tenantId, orderId]);
      const updatedOrder = orderRes.rows[0];

      // Auto-generate invoice
      const now = new Date();
      const yearMonth = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`;
      const invNumber = `INV-${yearMonth}-${Math.floor(1000 + Math.random() * 9000)}`;

      const taxBreakdown = {
        tax_total: updatedOrder ? Number(updatedOrder.tax_total) : 0,
        subtotal: updatedOrder ? Number(updatedOrder.subtotal) : amount,
      };

      const invQuery = `
        INSERT INTO invoices (
          tenant_id, order_id, invoice_number, pdf_url, tax_breakdown, total_amount, currency, created_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
        ON CONFLICT (tenant_id, invoice_number) DO NOTHING
        RETURNING *;
      `;
      const invRes = await client.query(invQuery, [
        tenantId,
        orderId,
        invNumber,
        `https://cdn.nexora.io/invoices/${tenantId}/${invNumber}.pdf`,
        JSON.stringify(taxBreakdown),
        amount,
        currency,
      ]);
      invoice = invRes.rows[0] || null;
    }

    return {
      payment,
      invoice,
      isExisting: false,
    };
  });
};

/**
 * Capture an authorized payment and generate invoice
 */
const capturePayment = async (tenantId, paymentId, gatewayTransactionId) => {
  return withTenantTransaction(tenantId, async (client) => {
    // 1. Lock payment
    const lockQuery = `
      SELECT *
      FROM payments
      WHERE tenant_id = $1 AND id = $2
      FOR UPDATE;
    `;
    const lockRes = await client.query(lockQuery, [tenantId, paymentId]);
    const payment = lockRes.rows[0];

    if (!payment) {
      const err = new Error(`Payment not found with ID: ${paymentId}`);
      err.statusCode = 404;
      throw err;
    }

    // 2. Update payment status
    const updatePayQuery = `
      UPDATE payments
      SET 
        status = $1,
        gateway_transaction_id = COALESCE($2, gateway_transaction_id),
        updated_at = NOW()
      WHERE tenant_id = $3 AND id = $4
      RETURNING *;
    `;
    const payRes = await client.query(updatePayQuery, [
      PaymentStatus.CAPTURED,
      gatewayTransactionId || null,
      tenantId,
      paymentId,
    ]);
    const updatedPayment = payRes.rows[0];

    // 3. Update order status
    const updateOrderQuery = `
      UPDATE orders
      SET 
        payment_status = $1,
        status = CASE WHEN status = 'PENDING' THEN 'CONFIRMED' ELSE status END,
        updated_at = NOW()
      WHERE tenant_id = $2 AND id = $3
      RETURNING *;
    `;
    const orderRes = await client.query(updateOrderQuery, [
      PaymentStatus.CAPTURED,
      tenantId,
      payment.order_id,
    ]);
    const order = orderRes.rows[0];

    // 4. Generate invoice
    const now = new Date();
    const yearMonth = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`;
    const invNumber = `INV-${yearMonth}-${Math.floor(1000 + Math.random() * 9000)}`;

    const invQuery = `
      INSERT INTO invoices (
        tenant_id, order_id, invoice_number, pdf_url, tax_breakdown, total_amount, currency, created_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
      RETURNING *;
    `;
    const invRes = await client.query(invQuery, [
      tenantId,
      payment.order_id,
      invNumber,
      `https://cdn.nexora.io/invoices/${tenantId}/${invNumber}.pdf`,
      JSON.stringify({ tax_total: order?.tax_total || 0, subtotal: order?.subtotal || payment.amount }),
      payment.amount,
      payment.currency,
    ]);

    return {
      payment: updatedPayment,
      invoice: invRes.rows[0],
    };
  });
};

/**
 * Find payment by ID with refunds
 */
const findPaymentById = async (tenantId, id) => {
  return withTenantTransaction(tenantId, async (client) => {
    const payQuery = `
      SELECT p.*, o.order_number, o.status AS order_status
      FROM payments p
      JOIN orders o ON o.id = p.order_id
      WHERE p.tenant_id = $1 AND p.id = $2;
    `;
    const payRes = await client.query(payQuery, [tenantId, id]);
    const payment = payRes.rows[0];
    if (!payment) return null;

    const refQuery = `
      SELECT *
      FROM refunds
      WHERE tenant_id = $1 AND payment_id = $2
      ORDER BY created_at DESC;
    `;
    const refRes = await client.query(refQuery, [tenantId, id]);

    return {
      ...payment,
      refunds: refRes.rows,
    };
  });
};

/**
 * List payments with filters and pagination
 */
const listPayments = async (tenantId, { orderId, status, page = 1, limit = 20 }) => {
  return withTenantTransaction(tenantId, async (client) => {
    const offset = (page - 1) * limit;
    const params = [tenantId];
    let whereClauses = ['p.tenant_id = $1'];

    if (orderId) {
      params.push(orderId);
      whereClauses.push(`p.order_id = $${params.length}`);
    }

    if (status) {
      params.push(status);
      whereClauses.push(`p.status = $${params.length}`);
    }

    const whereStr = whereClauses.join(' AND ');

    // Total count
    const countQuery = `
      SELECT COUNT(*) AS total
      FROM payments p
      WHERE ${whereStr};
    `;
    const countRes = await client.query(countQuery, params);
    const total = parseInt(countRes.rows[0].total, 10);

    // Data query
    params.push(limit, offset);
    const dataQuery = `
      SELECT p.*, o.order_number
      FROM payments p
      JOIN orders o ON o.id = p.order_id
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
 * Issue refund against captured payment with balance validation
 */
const createRefund = async ({
  tenantId,
  paymentId,
  amount,
  reason,
  gatewayRefundId,
}) => {
  return withTenantTransaction(tenantId, async (client) => {
    // 1. Lock payment row
    const lockQuery = `
      SELECT *
      FROM payments
      WHERE tenant_id = $1 AND id = $2
      FOR UPDATE;
    `;
    const lockRes = await client.query(lockQuery, [tenantId, paymentId]);
    const payment = lockRes.rows[0];

    if (!payment) {
      const err = new Error(`Payment not found with ID: ${paymentId}`);
      err.statusCode = 404;
      throw err;
    }

    if (payment.status !== PaymentStatus.CAPTURED && payment.status !== PaymentStatus.PARTIALLY_REFUNDED) {
      const err = new Error(`Cannot refund payment with status: ${payment.status}`);
      err.statusCode = 400;
      throw err;
    }

    // 2. Sum existing refunds
    const sumQuery = `
      SELECT COALESCE(SUM(amount), 0) AS total_refunded
      FROM refunds
      WHERE tenant_id = $1 AND payment_id = $2;
    `;
    const sumRes = await client.query(sumQuery, [tenantId, paymentId]);
    const totalPreviouslyRefunded = Number(sumRes.rows[0].total_refunded);

    const remainingRefundable = Number(payment.amount) - totalPreviouslyRefunded;
    if (Number(amount) > remainingRefundable) {
      const err = new Error(
        `Refund amount (${amount}) exceeds remaining refundable balance (${remainingRefundable.toFixed(2)})`
      );
      err.statusCode = 400;
      throw err;
    }

    // 3. Insert refund record
    const refundQuery = `
      INSERT INTO refunds (
        tenant_id, payment_id, order_id, amount, reason, gateway_refund_id, status, created_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, 'SUCCEEDED', NOW())
      RETURNING *;
    `;
    const refundRes = await client.query(refundQuery, [
      tenantId,
      paymentId,
      payment.order_id,
      amount,
      reason || null,
      gatewayRefundId || null,
    ]);
    const refund = refundRes.rows[0];

    const newTotalRefunded = totalPreviouslyRefunded + Number(amount);
    const isFullRefund = newTotalRefunded >= Number(payment.amount);
    const newPaymentStatus = isFullRefund ? PaymentStatus.REFUNDED : PaymentStatus.PARTIALLY_REFUNDED;

    // 4. Update payment status
    await client.query(
      `UPDATE payments SET status = $1, updated_at = NOW() WHERE tenant_id = $2 AND id = $3;`,
      [newPaymentStatus, tenantId, paymentId]
    );

    // 5. Update order payment status
    await client.query(
      `UPDATE orders SET payment_status = $1, updated_at = NOW() WHERE tenant_id = $2 AND id = $3;`,
      [newPaymentStatus, tenantId, payment.order_id]
    );

    return {
      refund,
      paymentStatus: newPaymentStatus,
      totalRefunded: newTotalRefunded,
      remainingBalance: Math.max(0, Number(payment.amount) - newTotalRefunded),
    };
  });
};

/**
 * Get tax invoice for an order
 */
const getInvoiceByOrderId = async (tenantId, orderId) => {
  return withTenantTransaction(tenantId, async (client) => {
    const query = `
      SELECT i.*, o.order_number
      FROM invoices i
      JOIN orders o ON o.id = i.order_id
      WHERE i.tenant_id = $1 AND i.order_id = $2;
    `;
    const res = await client.query(query, [tenantId, orderId]);
    return res.rows[0] || null;
  });
};

/**
 * Record a financial gateway settlement reconciliation
 */
const createReconciliation = async ({
  tenantId,
  gateway,
  settlementId,
  totalExpected,
  totalSettled,
}) => {
  return withTenantTransaction(tenantId, async (client) => {
    const discrepancy = Number(totalSettled) - Number(totalExpected);
    const status = Math.abs(discrepancy) < 0.001 ? ReconciliationStatus.MATCHED : ReconciliationStatus.DISCREPANCY;

    const query = `
      INSERT INTO payment_reconciliations (
        tenant_id, gateway, settlement_id, total_expected, total_settled, discrepancy, status, reconciled_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
      RETURNING *;
    `;
    const res = await client.query(query, [
      tenantId,
      gateway,
      settlementId,
      totalExpected,
      totalSettled,
      discrepancy,
      status,
    ]);
    return res.rows[0];
  });
};

/**
 * List reconciliation batches
 */
const listReconciliations = async (tenantId, { gateway, status, page = 1, limit = 20 }) => {
  return withTenantTransaction(tenantId, async (client) => {
    const offset = (page - 1) * limit;
    const params = [tenantId];
    let whereClauses = ['tenant_id = $1'];

    if (gateway) {
      params.push(gateway);
      whereClauses.push(`gateway = $${params.length}`);
    }

    if (status) {
      params.push(status);
      whereClauses.push(`status = $${params.length}`);
    }

    const whereStr = whereClauses.join(' AND ');

    // Total count
    const countQuery = `
      SELECT COUNT(*) AS total
      FROM payment_reconciliations
      WHERE ${whereStr};
    `;
    const countRes = await client.query(countQuery, params);
    const total = parseInt(countRes.rows[0].total, 10);

    // Data query
    params.push(limit, offset);
    const dataQuery = `
      SELECT *
      FROM payment_reconciliations
      WHERE ${whereStr}
      ORDER BY reconciled_at DESC
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

module.exports = {
  createPayment,
  capturePayment,
  findPaymentById,
  listPayments,
  createRefund,
  getInvoiceByOrderId,
  createReconciliation,
  listReconciliations,
};

