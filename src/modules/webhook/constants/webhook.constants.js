const WEBHOOK_EVENTS = {
  ORDER_CREATED: 'order.created',
  ORDER_CONFIRMED: 'order.confirmed',
  ORDER_CANCELLED: 'order.cancelled',
  ORDER_FULFILLED: 'order.fulfilled',
  ORDER_REFUNDED: 'order.refunded',
  INVENTORY_LOW: 'inventory.low_stock',
  INVENTORY_DEPLETED: 'inventory.depleted',
  PAYMENT_CAPTURED: 'payment.captured',
  PAYMENT_FAILED: 'payment.failed',
  RETURN_REQUESTED: 'return.requested',
  RETURN_COMPLETED: 'return.completed',
  BACKORDER_ALLOCATED: 'backorder.allocated',
  ALL: '*',
};

const WEBHOOK_DELIVERY_STATUS = {
  PENDING: 'PENDING',
  SUCCESS: 'SUCCESS',
  FAILED: 'FAILED',
};

module.exports = {
  WEBHOOK_EVENTS,
  WEBHOOK_DELIVERY_STATUS,
};
