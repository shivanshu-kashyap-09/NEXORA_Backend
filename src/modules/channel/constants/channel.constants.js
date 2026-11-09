const ChannelTypes = {
  SHOPIFY: 'shopify',
  WOOCOMMERCE: 'woocommerce',
  AMAZON: 'amazon',
  MAGENTO: 'magento',
  CUSTOM_WEBHOOK: 'custom_webhook',
  POS: 'pos',
};

const SyncTypes = {
  INVENTORY_PUSH: 'INVENTORY_PUSH',
  ORDER_INGEST: 'ORDER_INGEST',
  CATALOG_SYNC: 'CATALOG_SYNC',
  FULFILLMENT_PUSH: 'FULFILLMENT_PUSH',
};

const SyncStatuses = {
  SUCCESS: 'SUCCESS',
  FAILED: 'FAILED',
  PARTIAL: 'PARTIAL',
};

module.exports = {
  ChannelTypes,
  SyncTypes,
  SyncStatuses,
};

