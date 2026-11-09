const ShipmentStatus = {
  CREATED: 'CREATED',
  PACKED: 'PACKED',
  SHIPPED: 'SHIPPED',
  IN_TRANSIT: 'IN_TRANSIT',
  OUT_FOR_DELIVERY: 'OUT_FOR_DELIVERY',
  DELIVERED: 'DELIVERED',
  FAILED: 'FAILED',
  RTO: 'RTO',
  CANCELLED: 'CANCELLED',
};

const SupportedCarriers = {
  FEDEX: 'FEDEX',
  DHL: 'DHL',
  DELHIVERY: 'DELHIVERY',
  UPS: 'UPS',
  BLUEDART: 'BLUEDART',
  USPS: 'USPS',
};

module.exports = {
  ShipmentStatus,
  SupportedCarriers,
};

