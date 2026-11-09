const FulfillmentStatus = {
  PENDING: 'PENDING',
  ALLOCATED: 'ALLOCATED',
  PICKING: 'PICKING',
  PACKED: 'PACKED',
  SHIPPED: 'SHIPPED',
  CANCELLED: 'CANCELLED',
};

const VALID_FULFILLMENT_TRANSITIONS = {
  [FulfillmentStatus.PENDING]: [
    FulfillmentStatus.ALLOCATED,
    FulfillmentStatus.CANCELLED,
  ],
  [FulfillmentStatus.ALLOCATED]: [
    FulfillmentStatus.PICKING,
    FulfillmentStatus.CANCELLED,
  ],
  [FulfillmentStatus.PICKING]: [
    FulfillmentStatus.PACKED,
    FulfillmentStatus.CANCELLED,
  ],
  [FulfillmentStatus.PACKED]: [
    FulfillmentStatus.SHIPPED,
    FulfillmentStatus.CANCELLED,
  ],
  [FulfillmentStatus.SHIPPED]: [], // Terminal
  [FulfillmentStatus.CANCELLED]: [], // Terminal
};

module.exports = {
  FulfillmentStatus,
  VALID_FULFILLMENT_TRANSITIONS,
};

