const crypto = require('crypto');

async function testFullShopifyFlow() {
  const webhookSecret = 'shpss_test_secret_key_88492041';

  // 1. Login as admin to get Bearer token
  console.log('Step 1: Logging in as admin...');
  const loginRes = await fetch('http://localhost:5001/api/v1/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: 'admin@nexora.io',
      password: 'Admin@Nexora2026',
    }),
  });
  const loginData = await loginRes.json();
  const token = loginData.data?.tokens?.accessToken || loginData.data?.accessToken;
  const jwtPayload = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString());
  const tenantId = jwtPayload.tenantId;
  console.log('Login successful. Token acquired. Tenant ID:', tenantId);

  // 2. Register or update Shopify Channel
  console.log('Step 2: Registering Shopify Channel in NEXORA...');
  const channelPayload = {
    code: `SHOPIFY-TEST-${Date.now().toString(36).toUpperCase()}`,
    name: 'Official Shopify Flagship Store',
    type: 'shopify',
    is_active: true,
    credentials: {
      store_url: 'https://test-flagship.myshopify.com',
      access_token: 'shpat_99887766554433221100',
      webhook_secret: webhookSecret,
    },
    settings: {
      buffer_percentage: 10,
    },
  };

  const channelRes = await fetch('http://localhost:5001/api/v1/channels', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
      'X-Tenant-ID': tenantId,
    },
    body: JSON.stringify(channelPayload),
  });
  const channelData = await channelRes.json();
  console.log('Channel registered:', channelData.data?.code, channelData.data?.id);

  // 3. Construct Shopify Order JSON payload
  console.log('Step 3: Constructing Shopify Order Webhook payload...');
  const shopifyPayload = {
    id: 8844221100,
    name: `#SHP-ORD-${Date.now().toString(36).toUpperCase()}`,
    currency: 'USD',
    financial_status: 'paid',
    line_items: [
      {
        id: 991122,
        sku: 'SHP-HOODIE-BLK',
        title: 'Minimalist Black Cotton Hoodie',
        quantity: 2,
        price: '79.99',
      },
    ],
    shipping_address: {
      first_name: 'Jessica',
      last_name: 'Taylor',
      address1: '789 Broadway St',
      city: 'Seattle',
      province: 'WA',
      zip: '98101',
      country_code: 'US',
    },
    billing_address: {
      first_name: 'Jessica',
      last_name: 'Taylor',
      address1: '789 Broadway St',
      city: 'Seattle',
      province: 'WA',
      zip: '98101',
      country_code: 'US',
    },
  };

  const rawBuffer = Buffer.from(JSON.stringify(shopifyPayload), 'utf8');

  // 4. Calculate Shopify Base64 HMAC-SHA256 signature
  const hmacHeader = crypto
    .createHmac('sha256', webhookSecret)
    .update(rawBuffer)
    .digest('base64');

  console.log('Generated Shopify HMAC Signature:', hmacHeader);

  // 5. Fire incoming webhook to NEXORA
  console.log('Step 4: Firing webhook to /api/v1/channels/shopify/webhook/:tenantId...');
  const whRes = await fetch(`http://localhost:5001/api/v1/channels/shopify/webhook/${tenantId}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Topic': 'orders/create',
      'X-Shopify-Hmac-Sha256': hmacHeader,
      'X-Shopify-Shop-Domain': 'test-flagship.myshopify.com',
      'X-Shopify-Webhook-Id': `wh_${Date.now()}`,
    },
    body: rawBuffer,
  });

  const whData = await whRes.json();
  console.log('Shopify Webhook Ingestion Response:');
  console.log(JSON.stringify(whData, null, 2));

  if (whData.data?.order_number) {
    console.log(`\n🎉 SUCCESS! Shopify Order ${shopifyPayload.name} successfully ingested into NEXORA as Order Number: ${whData.data.order_number}`);
  } else {
    console.log('\n❌ Webhook result did not contain order_number', whData);
  }
}

testFullShopifyFlow().catch((e) => console.error('Test Failed:', e));
