/**
 * Outbox & Event Bus Constants
 */

const OutboxStatus = {
  PENDING: 'PENDING',
  PROCESSING: 'PROCESSING',
  PUBLISHED: 'PUBLISHED',
  FAILED: 'FAILED',
  DEAD: 'DEAD',
};

const AggregateType = {
  ORDER: 'ORDER',
  PAYMENT: 'PAYMENT',
  FULFILLMENT: 'FULFILLMENT',
  INVENTORY: 'INVENTORY',
  RETURN: 'RETURN',
  CUSTOMER: 'CUSTOMER',
  PROMOTION: 'PROMOTION',
};

const EventType = {
  ORDER_CREATED: 'order.created',
  ORDER_CONFIRMED: 'order.confirmed',
  ORDER_COMPLETED: 'order.completed',
  ORDER_CANCELLED: 'order.cancelled',
  PAYMENT_CAPTURED: 'payment.captured',
  PAYMENT_REFUNDED: 'payment.refunded',
  FULFILLMENT_SHIPPED: 'fulfillment.shipped',
  FULFILLMENT_DELIVERED: 'fulfillment.delivered',
  INVENTORY_ADJUSTED: 'inventory.adjusted',
  RMA_REQUESTED: 'rma.requested',
  RMA_INSPECTED: 'rma.inspected',
  COUPON_REDEEMED: 'coupon.redeemed',
};

module.exports = {
  OutboxStatus,
  AggregateType,
  EventType,
};

