const OrderStatus = {
  PENDING: 'PENDING',
  CONFIRMED: 'CONFIRMED',
  PROCESSING: 'PROCESSING',
  READY: 'READY',
  FULFILLED: 'FULFILLED',
  COMPLETED: 'COMPLETED',
  CANCELLED: 'CANCELLED',
  ON_HOLD: 'ON_HOLD',
};

const PaymentStatus = {
  PENDING: 'PENDING',
  AUTHORIZED: 'AUTHORIZED',
  CAPTURED: 'CAPTURED',
  FAILED: 'FAILED',
  REFUNDED: 'REFUNDED',
  PARTIALLY_REFUNDED: 'PARTIALLY_REFUNDED',
};

/**
 * Forward-Only Finite State Machine (FSM) Allowed Transitions
 */
const VALID_STATUS_TRANSITIONS = {
  [OrderStatus.PENDING]: [
    OrderStatus.CONFIRMED,
    OrderStatus.CANCELLED,
    OrderStatus.ON_HOLD,
  ],
  [OrderStatus.CONFIRMED]: [
    OrderStatus.PROCESSING,
    OrderStatus.CANCELLED,
    OrderStatus.ON_HOLD,
  ],
  [OrderStatus.PROCESSING]: [
    OrderStatus.READY,
    OrderStatus.CANCELLED,
    OrderStatus.ON_HOLD,
  ],
  [OrderStatus.READY]: [
    OrderStatus.FULFILLED,
    OrderStatus.COMPLETED,
    OrderStatus.CANCELLED,
    OrderStatus.ON_HOLD,
  ],
  [OrderStatus.FULFILLED]: [
    OrderStatus.COMPLETED,
  ],
  [OrderStatus.ON_HOLD]: [
    OrderStatus.PENDING,
    OrderStatus.CONFIRMED,
    OrderStatus.PROCESSING,
    OrderStatus.READY,
    OrderStatus.CANCELLED,
  ],
  [OrderStatus.COMPLETED]: [], // Terminal State
  [OrderStatus.CANCELLED]: [], // Terminal State
};

const HoldReasons = {
  FRAUD_REVIEW: 'FRAUD_REVIEW',
  ADDRESS_VERIFICATION: 'ADDRESS_VERIFICATION',
  PAYMENT_DISPUTE: 'PAYMENT_DISPUTE',
  MANUAL_AUDIT: 'MANUAL_AUDIT',
  STOCK_EXCEPTION: 'STOCK_EXCEPTION',
};

module.exports = {
  OrderStatus,
  PaymentStatus,
  VALID_STATUS_TRANSITIONS,
  HoldReasons,
};

