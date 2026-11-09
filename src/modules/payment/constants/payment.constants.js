const PaymentStatus = {
  PENDING: 'PENDING',
  AUTHORIZED: 'AUTHORIZED',
  CAPTURED: 'CAPTURED',
  FAILED: 'FAILED',
  REFUNDED: 'REFUNDED',
  PARTIALLY_REFUNDED: 'PARTIALLY_REFUNDED',
};

const PaymentMethods = {
  CREDIT_CARD: 'CREDIT_CARD',
  DEBIT_CARD: 'DEBIT_CARD',
  UPI: 'UPI',
  NET_BANKING: 'NET_BANKING',
  WALLET: 'WALLET',
  PAYPAL: 'PAYPAL',
  COD: 'COD',
};

const PaymentGateways = {
  STRIPE: 'STRIPE',
  RAZORPAY: 'RAZORPAY',
  PAYPAL: 'PAYPAL',
  MANUAL_COD: 'MANUAL_COD',
  SQUARE: 'SQUARE',
};

const ReconciliationStatus = {
  MATCHED: 'MATCHED',
  DISCREPANCY: 'DISCREPANCY',
  UNRESOLVED: 'UNRESOLVED',
};

module.exports = {
  PaymentStatus,
  PaymentMethods,
  PaymentGateways,
  ReconciliationStatus,
};

