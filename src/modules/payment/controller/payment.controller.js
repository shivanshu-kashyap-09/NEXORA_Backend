const catchAsync = require('../../../shared/utils/catchAsync');
const ApiResponse = require('../../../shared/utils/ApiResponse');
const paymentService = require('../service/payment.service');

/**
 * Process a new payment transaction
 */
const createPayment = catchAsync(async (req, res) => {
  const result = await paymentService.createPayment(req.user.tenantId, req.body);
  return ApiResponse.created(res, result, 'Payment recorded successfully');
});

/**
 * Capture an authorized payment
 */
const capturePayment = catchAsync(async (req, res) => {
  const result = await paymentService.capturePayment(
    req.user.tenantId,
    req.params.id,
    req.body
  );
  return ApiResponse.success(res, result, 'Payment captured successfully');
});

/**
 * Get payment details by ID
 */
const getPayment = catchAsync(async (req, res) => {
  const payment = await paymentService.getPaymentById(req.user.tenantId, req.params.id);
  return ApiResponse.success(res, payment, 'Payment details retrieved successfully');
});

/**
 * List payments with filters and pagination
 */
const listPayments = catchAsync(async (req, res) => {
  const result = await paymentService.listPayments(req.user.tenantId, req.query);
  return ApiResponse.paginated(
    res,
    result.items,
    result.page,
    result.limit,
    result.total,
    'Payments retrieved successfully'
  );
});

/**
 * Issue refund against captured payment
 */
const createRefund = catchAsync(async (req, res) => {
  const result = await paymentService.createRefund(
    req.user.tenantId,
    req.params.id,
    req.body
  );
  return ApiResponse.created(res, result, 'Refund issued successfully');
});

/**
 * Get tax invoice for an order
 */
const getInvoice = catchAsync(async (req, res) => {
  const invoice = await paymentService.getInvoiceByOrderId(
    req.user.tenantId,
    req.params.orderId
  );
  return ApiResponse.success(res, invoice, 'Invoice retrieved successfully');
});

/**
 * Record a settlement reconciliation report
 */
const createReconciliation = catchAsync(async (req, res) => {
  const result = await paymentService.createReconciliation(req.user.tenantId, req.body);
  return ApiResponse.created(res, result, 'Reconciliation recorded successfully');
});

/**
 * List reconciliation batches
 */
const listReconciliations = catchAsync(async (req, res) => {
  const result = await paymentService.listReconciliations(req.user.tenantId, req.query);
  return ApiResponse.paginated(
    res,
    result.items,
    result.page,
    result.limit,
    result.total,
    'Reconciliations retrieved successfully'
  );
});

module.exports = {
  createPayment,
  capturePayment,
  getPayment,
  listPayments,
  createRefund,
  getInvoice,
  createReconciliation,
  listReconciliations,
};

