const express = require('express');
const router = express.Router();
const paymentController = require('../controller/payment.controller');
const {
  createPaymentSchema,
  capturePaymentSchema,
  createRefundSchema,
  createReconciliationSchema,
  paymentQuerySchema,
  reconciliationQuerySchema,
} = require('../validation/payment.validation');
const validateRequest = require('../../../shared/validators/validateRequest');
const authGuard = require('../../../shared/middleware/authGuard');
const rbacGuard = require('../../../shared/middleware/rbacGuard');

// Require authentication for all payment endpoints
router.use(authGuard);

/**
 * @openapi
 * /payments/reconciliations:
 *   post:
 *     summary: Record gateway settlement reconciliation report
 *     description: Ingests a settlement reconciliation report from Stripe, Razorpay, or bank transfer, calculating financial discrepancies.
 *     tags:
 *       - Payments & Invoicing
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - gateway
 *               - settlement_id
 *               - total_expected
 *               - total_settled
 *             properties:
 *               gateway:
 *                 type: string
 *                 example: STRIPE
 *               settlement_id:
 *                 type: string
 *                 example: set_1N4sYx2eZvKYlo2C
 *               total_expected:
 *                 type: number
 *                 example: 5400.00
 *               total_settled:
 *                 type: number
 *                 example: 5400.00
 *     responses:
 *       201:
 *         description: Reconciliation recorded successfully
 *       403:
 *         description: Forbidden - requires owner or admin role
 */
router.post(
  '/reconciliations',
  rbacGuard({ roles: ['owner', 'admin'] }),
  validateRequest({ body: createReconciliationSchema }),
  paymentController.createReconciliation
);

/**
 * @openapi
 * /payments/reconciliations:
 *   get:
 *     summary: List settlement reconciliation reports
 *     description: Retrieve audit history of payment gateway settlements and discrepancy tracking.
 *     tags:
 *       - Payments & Invoicing
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: gateway
 *         schema:
 *           type: string
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [MATCHED, DISCREPANCY, UNRESOLVED]
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
 *         description: Reconciliations list retrieved successfully
 */
router.get(
  '/reconciliations',
  validateRequest({ query: reconciliationQuerySchema }),
  paymentController.listReconciliations
);

/**
 * @openapi
 * /payments/orders/{orderId}/invoice:
 *   get:
 *     summary: Get tax invoice for an order
 *     description: Retrieve tax-compliant legal invoice generated upon payment capture.
 *     tags:
 *       - Payments & Invoicing
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: orderId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Order UUID
 *     responses:
 *       200:
 *         description: Invoice retrieved successfully
 *       404:
 *         description: Invoice not found
 */
router.get('/orders/:orderId/invoice', paymentController.getInvoice);

/**
 * @openapi
 * /payments:
 *   post:
 *     summary: Process a payment transaction
 *     description: Records an authorized or captured payment for an order with idempotency protection and automatic invoice generation.
 *     tags:
 *       - Payments & Invoicing
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - order_id
 *               - payment_method
 *               - gateway
 *               - amount
 *               - idempotency_key
 *             properties:
 *               order_id:
 *                 type: string
 *                 format: uuid
 *               payment_method:
 *                 type: string
 *                 example: CREDIT_CARD
 *               gateway:
 *                 type: string
 *                 example: STRIPE
 *               gateway_transaction_id:
 *                 type: string
 *                 example: ch_3N4sYx2eZvKYlo2C1gQfQzP8
 *               amount:
 *                 type: number
 *                 example: 269.00
 *               currency:
 *                 type: string
 *                 default: USD
 *                 example: USD
 *               idempotency_key:
 *                 type: string
 *                 example: idemp_pay_998811
 *               auto_capture:
 *                 type: boolean
 *                 default: true
 *                 description: When true, marks payment CAPTURED and generates invoice immediately
 *     responses:
 *       201:
 *         description: Payment processed successfully
 *       400:
 *         description: Validation error
 *       409:
 *         description: Conflict
 */
router.post(
  '/',
  validateRequest({ body: createPaymentSchema }),
  paymentController.createPayment
);

/**
 * @openapi
 * /payments:
 *   get:
 *     summary: List payment transactions
 *     description: Query payments filtered by order ID or payment status.
 *     tags:
 *       - Payments & Invoicing
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: order_id
 *         schema:
 *           type: string
 *           format: uuid
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [PENDING, AUTHORIZED, CAPTURED, FAILED, REFUNDED, PARTIALLY_REFUNDED]
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
 *         description: Payments retrieved successfully
 */
router.get(
  '/',
  validateRequest({ query: paymentQuerySchema }),
  paymentController.listPayments
);

/**
 * @openapi
 * /payments/{id}:
 *   get:
 *     summary: Get payment details with refunds
 *     description: Retrieve complete payment transaction details, gateway transaction ID, and list of associated refunds.
 *     tags:
 *       - Payments & Invoicing
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Payment UUID
 *     responses:
 *       200:
 *         description: Payment details retrieved successfully
 *       404:
 *         description: Payment not found
 */
router.get('/:id', paymentController.getPayment);

/**
 * @openapi
 * /payments/{id}/capture:
 *   post:
 *     summary: Capture an authorized payment
 *     description: Captures pre-authorized funds for an order and generates invoice.
 *     tags:
 *       - Payments & Invoicing
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Payment UUID
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               gateway_transaction_id:
 *                 type: string
 *                 example: cap_3N4sYx2eZvKYlo2C1gQfQzP8
 *     responses:
 *       200:
 *         description: Payment captured successfully
 *       404:
 *         description: Payment not found
 */
router.post(
  '/:id/capture',
  rbacGuard({ roles: ['owner', 'admin', 'order_operator'] }),
  validateRequest({ body: capturePaymentSchema }),
  paymentController.capturePayment
);

/**
 * @openapi
 * /payments/{id}/refunds:
 *   post:
 *     summary: Issue full or partial refund
 *     description: Refunds money against a captured payment. Rejects amounts exceeding remaining balance.
 *     tags:
 *       - Payments & Invoicing
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Payment UUID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - amount
 *               - reason
 *             properties:
 *               amount:
 *                 type: number
 *                 example: 50.00
 *               reason:
 *                 type: string
 *                 example: "Customer returned defective item"
 *               gateway_refund_id:
 *                 type: string
 *                 example: re_3N4sYx2eZvKYlo2C1gQfQzP8
 *     responses:
 *       201:
 *         description: Refund issued successfully
 *       400:
 *         description: Refund amount exceeds remaining balance
 *       404:
 *         description: Payment not found
 */
router.post(
  '/:id/refunds',
  rbacGuard({ roles: ['owner', 'admin'] }),
  validateRequest({ body: createRefundSchema }),
  paymentController.createRefund
);

module.exports = router;

