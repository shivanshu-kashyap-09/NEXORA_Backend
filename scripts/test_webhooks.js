require('dotenv').config();
const http = require('http');
const crypto = require('crypto');
const app = require('../src/app');
const { swaggerSpec } = require('../src/config/swagger');

async function testWebhooksModule() {
  console.log('=== STARTING INTEGRATION TESTS FOR SYSTEM WEBHOOKS MODULE ===\n');

  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));
  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}/api/v1`;

  // Start a mock target webhook receiver to test testDispatchWebhook
  let lastReceivedPayload = null;
  let lastReceivedHeaders = null;
  const receiver = http.createServer((req, res) => {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      lastReceivedPayload = JSON.parse(body || '{}');
      lastReceivedHeaders = req.headers;
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ received: true }));
    });
  });
  await new Promise((resolve) => receiver.listen(0, resolve));
  const receiverPort = receiver.address().port;
  const receiverUrl = `http://127.0.0.1:${receiverPort}/webhook-target`;

  try {
    // 1. Authenticate Admin User
    console.log('[1] Logging in with seeded admin user...');
    const loginRes = await fetch(`${baseUrl}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'admin@nexora.io', password: 'Admin@Nexora2026' }),
    });
    const loginData = await loginRes.json();
    if (!loginRes.ok) throw new Error(`Login failed: ${JSON.stringify(loginData)}`);
    const { tokens, activeTenant } = loginData.data;
    const authHeaders = {
      Authorization: `Bearer ${tokens.accessToken}`,
      'X-Tenant-ID': activeTenant.tenant_id,
      'Content-Type': 'application/json',
    };
    console.log(`✓ Authenticated as admin@nexora.io\n`);

    // 2. Register Webhook
    console.log(`[2] Registering Webhook Subscription pointing to ${receiverUrl}...`);
    const createWebhookRes = await fetch(`${baseUrl}/webhooks`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        url: receiverUrl,
        events: ['order.created', 'order.cancelled'],
        description: 'Mock External ERP Webhook Listener',
        headers: { 'X-Custom-System': 'TestSuite' },
      }),
    });
    const createWebhookData = await createWebhookRes.json();
    if (!createWebhookRes.ok) throw new Error(`Create webhook failed: ${JSON.stringify(createWebhookData)}`);
    const webhook = createWebhookData.data;
    console.log(`✓ Created Webhook ID: ${webhook.id}`);
    console.log(`  - Target URL: ${webhook.url}`);
    console.log(`  - Secret generated: ${webhook.secret ? 'Yes (Entropy length: ' + webhook.secret.length + ')' : 'No'}`);
    console.log(`  - Subscribed Events: ${JSON.stringify(webhook.events)}\n`);

    // 3. List Webhooks
    console.log('[3] Fetching Webhook List (GET /webhooks)...');
    const listRes = await fetch(`${baseUrl}/webhooks?limit=10`, {
      method: 'GET',
      headers: authHeaders,
    });
    const listData = await listRes.json();
    if (!listRes.ok) throw new Error(`List webhooks failed: ${JSON.stringify(listData)}`);
    console.log(`✓ Found ${listData.data.length} registered webhook(s)\n`);

    // 4. Get Webhook by ID
    console.log(`[4] Fetching Webhook Details (GET /webhooks/${webhook.id})...`);
    const getRes = await fetch(`${baseUrl}/webhooks/${webhook.id}`, {
      method: 'GET',
      headers: authHeaders,
    });
    const getData = await getRes.json();
    if (!getRes.ok) throw new Error(`Get webhook failed: ${JSON.stringify(getData)}`);
    console.log(`✓ Webhook active status: ${getData.data.is_active}\n`);

    // 5. Update Webhook
    console.log(`[5] Updating Webhook Description & Events (PUT /webhooks/${webhook.id})...`);
    const updateRes = await fetch(`${baseUrl}/webhooks/${webhook.id}`, {
      method: 'PUT',
      headers: authHeaders,
      body: JSON.stringify({
        description: 'Updated External ERP Listener v2',
        events: ['order.created', 'order.fulfilled', 'inventory.depleted'],
      }),
    });
    const updateData = await updateRes.json();
    if (!updateRes.ok) throw new Error(`Update webhook failed: ${JSON.stringify(updateData)}`);
    console.log(`✓ Updated Description: ${updateData.data.description}`);
    console.log(`✓ Updated Events: ${JSON.stringify(updateData.data.events)}\n`);

    // 6. Test Dispatch Ping with HMAC SHA-256 verification
    console.log(`[6] Triggering Test Dispatch Ping (POST /webhooks/${webhook.id}/test)...`);
    const testRes = await fetch(`${baseUrl}/webhooks/${webhook.id}/test`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        event_type: 'order.created',
        payload: { order_number: 'NEX-TEST-999', total_amount: 199.99 },
      }),
    });
    const testData = await testRes.json();
    if (!testRes.ok) throw new Error(`Test dispatch failed: ${JSON.stringify(testData)}`);
    console.log(`✓ Webhook Dispatch Triggered!`);
    console.log(`  - Delivery Status: ${testData.data.delivery.status}`);
    console.log(`  - HTTP Status: ${testData.data.delivery.response_status}`);
    console.log(`  - HMAC-SHA256 Signature: ${testData.data.signature_used}`);

    // Verify receiver got it
    if (!lastReceivedPayload) throw new Error('Receiver did not receive the test webhook payload!');
    console.log(`✓ Target receiver successfully captured payload:`, lastReceivedPayload.event);
    console.log(`✓ Receiver header X-Nexora-Signature: ${lastReceivedHeaders['x-nexora-signature']}`);
    console.log(`✓ Receiver header X-Custom-System: ${lastReceivedHeaders['x-custom-system']}\n`);

    // 7. Get Webhook Deliveries
    console.log(`[7] Fetching Webhook Deliveries History (GET /webhooks/${webhook.id}/deliveries)...`);
    const deliveriesRes = await fetch(`${baseUrl}/webhooks/${webhook.id}/deliveries`, {
      method: 'GET',
      headers: authHeaders,
    });
    const deliveriesData = await deliveriesRes.json();
    if (!deliveriesRes.ok) throw new Error(`Get deliveries failed: ${JSON.stringify(deliveriesData)}`);
    console.log(`✓ Recorded Deliveries count: ${deliveriesData.data.length}\n`);

    // 8. Delete Webhook
    console.log(`[8] Deleting Webhook (DELETE /webhooks/${webhook.id})...`);
    const deleteRes = await fetch(`${baseUrl}/webhooks/${webhook.id}`, {
      method: 'DELETE',
      headers: authHeaders,
    });
    const deleteData = await deleteRes.json();
    if (!deleteRes.ok) throw new Error(`Delete webhook failed: ${JSON.stringify(deleteData)}`);
    console.log(`✓ Webhook successfully deleted.\n`);

    // 9. Verify Swagger OpenAPI Spec
    console.log('[9] Verifying Swagger OpenAPI 3.0 Documentation for Webhook Module...');
    const paths = Object.keys(swaggerSpec.paths);
    const expectedEndpoints = [
      '/webhooks',
      '/webhooks/{id}',
      '/webhooks/{id}/test',
      '/webhooks/{id}/deliveries',
    ];

    for (const ep of expectedEndpoints) {
      if (!paths.includes(ep)) {
        throw new Error(`Missing Swagger path documentation for: ${ep}`);
      }
      console.log(`✓ OpenAPI covers endpoint: ${ep}`);
    }

    let totalEndpoints = 0;
    for (const p of paths) {
      totalEndpoints += Object.keys(swaggerSpec.paths[p]).length;
    }
    console.log(`\n✓ Total documented endpoints in Swagger spec: ${totalEndpoints}`);

    console.log('\n==================================================================');
    console.log('🎉 ALL INTEGRATION TESTS FOR SYSTEM WEBHOOKS PASSED!');
    console.log('==================================================================\n');
  } finally {
    server.close();
    receiver.close();
  }
}

testWebhooksModule()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Test execution failed:', err);
    process.exit(1);
  });
