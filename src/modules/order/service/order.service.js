const orderRepository = require('../repository/order.repository');
const { distributedLock } = require('../../../infrastructure/redis');
const { OrderStatus, VALID_STATUS_TRANSITIONS } = require('../constants/order.constants');
const { ConflictError, NotFoundError, BadRequestError } = require('../../../shared/errors');
const logger = require('../../../config/logger');

/**
 * Ingest a new order with idempotency protection and atomic line-item insertion
 */
const createOrder = async (tenantId, userId, orderData) => {
  // 1. Check idempotency key
  if (orderData.idempotency_key) {
    const existing = await orderRepository.findOrderByIdempotencyKey(tenantId, orderData.idempotency_key);
    if (existing) {
      logger.info(`Idempotent order request detected for key: ${orderData.idempotency_key}`);
      return orderRepository.findOrderById(tenantId, existing.id);
    }
  }

  const order = await orderRepository.createOrder({
    tenantId,
    channelId: orderData.channel_id,
    channelOrderId: orderData.channel_order_id,
    customerId: orderData.customer_id,
    currency: orderData.currency,
    items: orderData.items,
    shippingAddress: orderData.shipping_address,
    billingAddress: orderData.billing_address,
    isCod: orderData.is_cod,
    shippingTotal: orderData.shipping_total,
    discountTotal: orderData.discount_total,
    idempotencyKey: orderData.idempotency_key,
    metadata: orderData.metadata,
    triggeredBy: userId,
  });

  logger.info(`Order ingested successfully: ${order.order_number} (${order.id}) for tenant: ${tenantId}`);
  return order;
};

/**
 * Get order details by ID
 */
const getOrderById = async (tenantId, id) => {
  const order = await orderRepository.findOrderById(tenantId, id);
  if (!order) {
    throw new NotFoundError(`Order not found with ID: ${id}`);
  }
  return order;
};

/**
 * List orders with search and pagination
 */
const listOrders = async (tenantId, query) => {
  return orderRepository.listOrders(tenantId, {
    status: query.status,
    customerId: query.customer_id,
    channelId: query.channel_id,
    search: query.search,
    page: query.page,
    limit: query.limit,
  });
};

/**
 * Execute a valid state transition in the forward-only FSM
 */
const transitionOrderState = async (tenantId, userId, orderId, { status: nextState, reason }) => {
  const currentOrder = await getOrderById(tenantId, orderId);

  // 1. Verify that nextState is allowed from currentOrder.status
  const allowedNextStates = VALID_STATUS_TRANSITIONS[currentOrder.status] || [];
  if (!allowedNextStates.includes(nextState)) {
    throw new BadRequestError(
      `Invalid order state transition: Cannot move from '${currentOrder.status}' to '${nextState}'. Allowed transitions: [${allowedNextStates.join(', ')}]`
    );
  }

  // 2. Lock and transition
  const lockKey = `lock:order:${tenantId}:${orderId}`;
  return distributedLock.withLock(lockKey, 10000, async () => {
    const result = await orderRepository.transitionState({
      tenantId,
      orderId,
      nextState,
      reason,
      triggeredBy: userId,
    });

    logger.info(`Order state transitioned: ${orderId} [${currentOrder.status} -> ${nextState}] reason: ${reason}`);
    return result;
  });
};

/**
 * Place order on hold
 */
const placeHold = async (tenantId, userId, orderId, { reason }) => {
  await getOrderById(tenantId, orderId);

  const lockKey = `lock:order:${tenantId}:${orderId}`;
  return distributedLock.withLock(lockKey, 10000, async () => {
    const result = await orderRepository.placeHold({
      tenantId,
      orderId,
      reason,
      triggeredBy: userId,
    });

    logger.info(`Order placed on hold: ${orderId} reason: ${reason}`);
    return result;
  });
};

/**
 * Resolve an active order hold
 */
const resolveHold = async (tenantId, userId, orderId, holdId, { target_status, resolution_notes }) => {
  await getOrderById(tenantId, orderId);

  const lockKey = `lock:order:${tenantId}:${orderId}`;
  return distributedLock.withLock(lockKey, 10000, async () => {
    const result = await orderRepository.resolveHold({
      tenantId,
      orderId,
      holdId,
      targetStatus: target_status,
      resolutionNotes: resolution_notes,
      resolvedBy: userId,
    });

    logger.info(`Order hold resolved: ${holdId} for order: ${orderId}`);
    return result;
  });
};

/**
 * Get order state transition audit trail
 */
const getOrderStateHistory = async (tenantId, orderId) => {
  await getOrderById(tenantId, orderId);
  return orderRepository.getOrderStateHistory(tenantId, orderId);
};

module.exports = {
  createOrder,
  getOrderById,
  listOrders,
  transitionOrderState,
  placeHold,
  resolveHold,
  getOrderStateHistory,
};

