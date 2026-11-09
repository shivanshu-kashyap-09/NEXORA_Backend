const paymentRepository = require('../repository/payment.repository');
const { distributedLock } = require('../../../infrastructure/redis');
const { NotFoundError, BadRequestError } = require('../../../shared/errors');
const logger = require('../../../config/logger');

/**
 * Process a payment transaction with idempotency and distributed lock
 */
const createPayment = async (tenantId, paymentData) => {
  const lockKey = `lock:pay:order:${tenantId}:${paymentData.order_id}`;

  return distributedLock.withLock(lockKey, 10000, async () => {
    const result = await paymentRepository.createPayment({
      tenantId,
      orderId: paymentData.order_id,
      paymentMethod: paymentData.payment_method,
      gateway: paymentData.gateway,
      gatewayTransactionId: paymentData.gateway_transaction_id,
      amount: paymentData.amount,
      currency: paymentData.currency,
      idempotencyKey: paymentData.idempotency_key,
      metadata: paymentData.metadata,
      autoCapture: paymentData.auto_capture,
    });

    if (result.isExisting) {
      logger.info(`Idempotent payment detected for key: ${paymentData.idempotency_key}`);
      return result.payment;
    }

    logger.info(`Payment recorded: ${result.payment.id} for order: ${paymentData.order_id} status: ${result.payment.status}`);
    return result;
  });
};

/**
 * Capture an authorized payment
 */
const capturePayment = async (tenantId, paymentId, captureData) => {
  const lockKey = `lock:pay:${tenantId}:${paymentId}`;

  return distributedLock.withLock(lockKey, 10000, async () => {
    const result = await paymentRepository.capturePayment(
      tenantId,
      paymentId,
      captureData.gateway_transaction_id
    );

    logger.info(`Payment captured: ${paymentId}`);
    return result;
  });
};

/**
 * Get payment by ID
 */
const getPaymentById = async (tenantId, id) => {
  const payment = await paymentRepository.findPaymentById(tenantId, id);
  if (!payment) {
    throw new NotFoundError(`Payment not found with ID: ${id}`);
  }
  return payment;
};

/**
 * List payments with filters and pagination
 */
const listPayments = async (tenantId, query) => {
  return paymentRepository.listPayments(tenantId, {
    orderId: query.order_id,
    status: query.status,
    page: query.page,
    limit: query.limit,
  });
};

/**
 * Issue refund against captured payment
 */
const createRefund = async (tenantId, paymentId, refundData) => {
  const lockKey = `lock:pay:${tenantId}:${paymentId}`;

  return distributedLock.withLock(lockKey, 10000, async () => {
    const result = await paymentRepository.createRefund({
      tenantId,
      paymentId,
      amount: refundData.amount,
      reason: refundData.reason,
      gatewayRefundId: refundData.gateway_refund_id,
    });

    logger.info(`Refund issued: ${result.refund.id} against payment: ${paymentId} amount: ${refundData.amount}`);
    return result;
  });
};

/**
 * Get tax invoice for an order
 */
const getInvoiceByOrderId = async (tenantId, orderId) => {
  const invoice = await paymentRepository.getInvoiceByOrderId(tenantId, orderId);
  if (!invoice) {
    throw new NotFoundError(`Invoice not found for order ID: ${orderId}`);
  }
  return invoice;
};

/**
 * Record settlement reconciliation
 */
const createReconciliation = async (tenantId, reconData) => {
  const result = await paymentRepository.createReconciliation({
    tenantId,
    gateway: reconData.gateway,
    settlementId: reconData.settlement_id,
    totalExpected: reconData.total_expected,
    totalSettled: reconData.total_settled,
  });

  logger.info(`Payment settlement reconciled: ${reconData.settlement_id} status: ${result.status}`);
  return result;
};

/**
 * List settlement reconciliation batches
 */
const listReconciliations = async (tenantId, query) => {
  return paymentRepository.listReconciliations(tenantId, {
    gateway: query.gateway,
    status: query.status,
    page: query.page,
    limit: query.limit,
  });
};

module.exports = {
  createPayment,
  capturePayment,
  getPaymentById,
  listPayments,
  createRefund,
  getInvoiceByOrderId,
  createReconciliation,
  listReconciliations,
};

