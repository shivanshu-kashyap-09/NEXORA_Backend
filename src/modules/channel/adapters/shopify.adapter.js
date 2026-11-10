const crypto = require('crypto');
const logger = require('../../../config/logger');
const catalogRepository = require('../../catalog/repository/catalog.repository');

/**
 * Verify Shopify cryptographic HMAC-SHA256 signature on raw request buffer.
 * Shopify calculates Base64 HMAC over the raw request payload using the app's client secret.
 */
const verifyShopifyHmac = (rawBody, hmacHeader, secret) => {
  if (!rawBody || !hmacHeader || !secret) {
    return false;
  }

  try {
    const generatedHmac = crypto
      .createHmac('sha256', secret)
      .update(rawBody)
      .digest('base64');

    const generatedBuffer = Buffer.from(generatedHmac, 'utf8');
    const headerBuffer = Buffer.from(hmacHeader, 'utf8');

    if (generatedBuffer.length !== headerBuffer.length) {
      return false;
    }

    return crypto.timingSafeEqual(generatedBuffer, headerBuffer);
  } catch (err) {
    logger.error('Error during Shopify HMAC verification', { error: err.message });
    return false;
  }
};

/**
 * Normalizes incoming Shopify webhook payload into NEXORA canonical Order schema.
 * Resolves SKUs against tenant product catalog, auto-creating catalog stubs if new.
 */
const normalizeShopifyOrder = async (tenantId, channelId, shopifyData) => {
  const lineItems = shopifyData.line_items || [];
  const normalizedItems = [];

  for (const item of lineItems) {
    const sku = (item.sku || `SHOPIFY-${item.variant_id || item.id}`).trim().toUpperCase();
    
    // Resolve product_id from catalog or auto-stub
    let product = await catalogRepository.findProductBySku(tenantId, sku);
    if (!product) {
      logger.info(`Auto-registering catalog item for Shopify SKU: ${sku}`);
      product = await catalogRepository.createProduct({
        tenantId,
        sku,
        name: item.title || item.name || sku,
        description: `Imported via Shopify Webhook (${shopifyData.name || ''})`,
        priceBase: parseFloat(item.price) || 0,
        currency: shopifyData.currency || 'USD',
      });
    }

    normalizedItems.push({
      product_id: product.id,
      sku,
      title: item.title || item.name || product.name,
      quantity: Math.max(1, parseInt(item.quantity, 10) || 1),
      unit_price: parseFloat(item.price) || 0,
      tax_amount: (item.tax_lines || []).reduce((acc, t) => acc + parseFloat(t.price || 0), 0),
      discount_amount: (item.discount_allocations || []).reduce((acc, d) => acc + parseFloat(d.amount || 0), 0),
    });
  }

  // Address normalizer
  const rawShip = shopifyData.shipping_address || {};
  const rawBill = shopifyData.billing_address || rawShip;

  const shippingAddress = {
    first_name: rawShip.first_name || rawShip.name || 'Shopify Customer',
    last_name: rawShip.last_name || '',
    phone: rawShip.phone || shopifyData.phone || '',
    address_line1: rawShip.address1 || 'Address Line 1',
    address_line2: rawShip.address2 || '',
    city: rawShip.city || 'City',
    state: rawShip.province || rawShip.province_code || '',
    postal_code: rawShip.zip || '000000',
    country: rawShip.country_code || rawShip.country || 'US',
  };

  const billingAddress = {
    first_name: rawBill.first_name || rawBill.name || shippingAddress.first_name,
    last_name: rawBill.last_name || shippingAddress.last_name,
    phone: rawBill.phone || shippingAddress.phone,
    address_line1: rawBill.address1 || shippingAddress.address_line1,
    address_line2: rawBill.address2 || shippingAddress.address_line2,
    city: rawBill.city || shippingAddress.city,
    state: rawBill.province || rawBill.province_code || shippingAddress.state,
    postal_code: rawBill.zip || shippingAddress.postal_code,
    country: rawBill.country_code || rawBill.country || shippingAddress.country,
  };

  const isCod = shopifyData.gateway === 'cash_on_delivery' ||
    (shopifyData.payment_gateway_names && shopifyData.payment_gateway_names.includes('manual'));

  return {
    channel_id: channelId,
    channel_order_id: String(shopifyData.name || shopifyData.id || `SHOPIFY-${Date.now()}`),
    currency: shopifyData.currency || 'USD',
    items: normalizedItems,
    shipping_address: shippingAddress,
    billing_address: billingAddress,
    is_cod: isCod,
    shipping_total: (shopifyData.shipping_lines || []).reduce((acc, s) => acc + parseFloat(s.price || 0), 0),
    discount_total: parseFloat(shopifyData.total_discounts || 0),
    idempotency_key: `SHOPIFY-WH-${shopifyData.id || shopifyData.name}`,
    metadata: {
      source: 'shopify_webhook',
      shopify_order_id: shopifyData.id,
      shopify_order_number: shopifyData.order_number,
      financial_status: shopifyData.financial_status,
      fulfillment_status: shopifyData.fulfillment_status,
      customer_email: shopifyData.email || shopifyData.contact_email,
    },
  };
};

/**
 * Push fulfillment tracking to Shopify Admin REST API
 */
const fulfillShopifyOrder = async ({ storeUrl, accessToken, shopifyOrderId, trackingNumber, trackingCompany, trackingUrl }) => {
  try {
    const cleanUrl = storeUrl.replace(/^https?:\/\//, '').replace(/\/$/, '');
    const endpoint = `https://${cleanUrl}/admin/api/2024-01/orders/${shopifyOrderId}/fulfillments.json`;

    const payload = {
      fulfillment: {
        notify_customer: true,
        tracking_info: {
          number: trackingNumber,
          company: trackingCompany || 'Courier',
          url: trackingUrl || undefined,
        },
      },
    };

    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Access-Token': accessToken,
      },
      body: JSON.stringify(payload),
    });

    const data = await res.json();
    if (!res.ok) {
      logger.error('Failed to fulfill order on Shopify', { status: res.status, data });
      return { success: false, error: data };
    }

    logger.info(`Order ${shopifyOrderId} fulfilled on Shopify with tracking ${trackingNumber}`);
    return { success: true, data };
  } catch (err) {
    logger.error('Exception calling Shopify Fulfillment API', { error: err.message });
    return { success: false, error: err.message };
  }
};

module.exports = {
  verifyShopifyHmac,
  normalizeShopifyOrder,
  fulfillShopifyOrder,
};
