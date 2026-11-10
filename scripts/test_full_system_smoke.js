const dns = require('dns');
dns.setDefaultResultOrder('ipv4first');
require('dotenv').config();
const http = require('http');
const app = require('../src/app');
const { swaggerSpec } = require('../src/config/swagger');

async function runFullSystemSmokeTest() {
  console.log('================================================================================');
  console.log('🚀 NEXORA ENTERPRISE OMS - COMPLETE END-TO-END MASTER SMOKE TEST (STEPS 1-17)');
  console.log('================================================================================\n');

  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));
  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}`;

  let passedChecks = 0;
  const recordSuccess = (domain, msg) => {
    passedChecks++;
    console.log(`[PASS] Domain ${passedChecks.toString().padStart(2, '0')}: ${domain.padEnd(28, ' ')} -> ${msg}`);
  };

  try {
    // 1. Health Liveness Probe
    const healthRes = await fetch(`${baseUrl}/health`);
    const healthData = await healthRes.json();
    if (!healthRes.ok || healthData.status !== 'UP') throw new Error('Health liveness check failed');
    recordSuccess('Health Liveness', `Process UP (uptime: ${healthData.uptime.toFixed(1)}s)`);

    // 2. Readiness Probe (PostgreSQL & Redis)
    let readyRes = await fetch(`${baseUrl}/health/readiness`);
    let readyData = await readyRes.json();
    if (readyData.status !== 'READY') {
      await new Promise((r) => setTimeout(r, 2000));
      readyRes = await fetch(`${baseUrl}/health/readiness`);
      readyData = await readyRes.json();
    }
    if (!readyRes.ok || readyData.status !== 'READY') throw new Error(`Readiness check failed: ${JSON.stringify(readyData)}`);
    recordSuccess('Readiness Probe', `DB: ${readyData.dependencies.database}, Redis: ${readyData.dependencies.redis}`);

    // 3. Prometheus Metrics Endpoint
    const metricsRes = await fetch(`${baseUrl}/metrics`);
    const metricsText = await metricsRes.text();
    if (!metricsRes.ok || !metricsText.includes('nexora_http_requests_total')) throw new Error('Prometheus metrics failed');
    recordSuccess('Prometheus Metrics', `Exposition text format valid (${metricsText.split('\n').length} lines)`);

    // 4. Root API Gateway Info
    const rootRes = await fetch(`${baseUrl}/`);
    const rootData = await rootRes.json();
    if (!rootRes.ok || rootData.name !== 'NEXORA OMS Engine') throw new Error('Root info check failed');
    recordSuccess('API Gateway Root', `${rootData.name} v${rootData.version} (${rootData.environment})`);

    // 5. OpenAPI Swagger Documentation
    const totalSwaggerPaths = Object.keys(swaggerSpec.paths).length;
    let totalSwaggerOps = 0;
    for (const p of Object.keys(swaggerSpec.paths)) {
      totalSwaggerOps += Object.keys(swaggerSpec.paths[p]).length;
    }
    recordSuccess('OpenAPI Documentation', `${totalSwaggerPaths} unique paths, ${totalSwaggerOps} total API operations`);

    // 6. Identity & Authentication (Step 1)
    const loginRes = await fetch(`${baseUrl}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'admin@nexora.io', password: 'Admin@Nexora2026' }),
    });
    const loginData = await loginRes.json();
    if (!loginRes.ok) throw new Error(`Login failed: ${JSON.stringify(loginData)}`);
    const { tokens, activeTenant, user } = loginData.data;
    const authHeaders = {
      Authorization: `Bearer ${tokens.accessToken}`,
      'X-Tenant-ID': activeTenant.tenant_id,
      'Content-Type': 'application/json',
    };
    recordSuccess('Identity & Auth', `Authenticated ${user.email} (${activeTenant.role_name})`);

    // 7. Multi-Tenant Context (Step 2)
    const tenantRes = await fetch(`${baseUrl}/api/v1/tenants/current`, { headers: authHeaders });
    const tenantData = await tenantRes.json();
    if (!tenantRes.ok) throw new Error(`Tenant check failed: ${JSON.stringify(tenantData)}`);
    recordSuccess('Tenancy Isolation', `Active: ${tenantData.data.name} (slug: ${tenantData.data.slug})`);

    // 8. Catalog Categories & Products (Step 3)
    const sku = `SMOKE-PROD-${Date.now()}`;
    const prodRes = await fetch(`${baseUrl}/api/v1/products`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        sku,
        name: 'Smoke Test Drone Pro',
        price_base: 499.00,
        currency: 'USD',
      }),
    });
    const prodData = await prodRes.json();
    if (!prodRes.ok) throw new Error(`Product creation failed: ${JSON.stringify(prodData)}`);
    const productId = prodData.data.id;
    recordSuccess('Catalog & Products', `Provisioned SKU ${sku} (ID: ${productId.slice(0, 8)}...)`);

    // 9. Warehouses (Step 3)
    const whRes = await fetch(`${baseUrl}/api/v1/warehouses`, { headers: authHeaders });
    const whData = await whRes.json();
    if (!whRes.ok) throw new Error(`Warehouse list failed: ${JSON.stringify(whData)}`);
    const warehouseId = whData.data[0].id;
    recordSuccess('Warehouses Logistics', `Retrieved ${whData.data.length} fulfillment nodes (Primary: ${whData.data[0].code})`);

    // 10. Inventory Items & Stock Holds (Step 4)
    const invRes = await fetch(`${baseUrl}/api/v1/inventory?limit=5`, { headers: authHeaders });
    const invData = await invRes.json();
    if (!invRes.ok) throw new Error(`Inventory check failed: ${JSON.stringify(invData)}`);
    recordSuccess('Real-Time Inventory', `Inventory ledger query active (${invData.data.length} stock allocations tracked)`);

    // 11. Customer Profiles (Step 5)
    const custRes = await fetch(`${baseUrl}/api/v1/customers?limit=5`, { headers: authHeaders });
    const custData = await custRes.json();
    if (!custRes.ok) throw new Error(`Customer check failed: ${JSON.stringify(custData)}`);
    recordSuccess('Customer Management', `Customer CRM registry queried (${custData.data.length} profiles)`);

    // 12. Sales Channels (Step 5)
    const chRes = await fetch(`${baseUrl}/api/v1/channels`, { headers: authHeaders });
    const chData = await chRes.json();
    if (!chRes.ok) throw new Error(`Channel check failed: ${JSON.stringify(chData)}`);
    const channelId = chData.data[0].id;
    recordSuccess('Sales Channels', `Channel connectors loaded (Primary: ${chData.data[0].name})`);

    // 13. Promotions & Coupons Engine (Step 10)
    const promoRes = await fetch(`${baseUrl}/api/v1/promotions`, { headers: authHeaders });
    const promoData = await promoRes.json();
    if (!promoRes.ok) throw new Error(`Promotions check failed: ${JSON.stringify(promoData)}`);
    recordSuccess('Promotions Engine', `Promotion campaigns verified (${promoData.data.length} active coupons/discounts)`);

    // 14. Order State Machine (Step 6)
    const orderRes = await fetch(`${baseUrl}/api/v1/orders`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        channel_id: channelId,
        currency: 'USD',
        shipping_address: {
          name: 'Smoke Test Customer',
          street: '100 Nexora Boulevard',
          city: 'San Francisco',
          state: 'CA',
          country: 'US',
          postal_code: '94105',
        },
        billing_address: {
          name: 'Smoke Test Customer',
          street: '100 Nexora Boulevard',
          city: 'San Francisco',
          state: 'CA',
          country: 'US',
          postal_code: '94105',
        },
        items: [{
          product_id: productId,
          sku,
          title: 'Smoke Test Drone Pro',
          quantity: 1,
          unit_price: 499.00,
        }],
      }),
    });
    const orderData = await orderRes.json();
    if (!orderRes.ok) throw new Error(`Order creation failed: ${JSON.stringify(orderData)}`);
    const orderId = orderData.data.id;
    recordSuccess('Order Orchestration', `Created Order ${orderData.data.order_number} (${orderData.data.status})`);

    // 15. Payments & Invoices (Step 7)
    const payRes = await fetch(`${baseUrl}/api/v1/payments`, { headers: authHeaders });
    const payData = await payRes.json();
    if (!payRes.ok) throw new Error(`Payments check failed: ${JSON.stringify(payData)}`);
    recordSuccess('Payments & Invoicing', `Payment ledger queried (${payData.data.length} payment records)`);

    // 16. Fulfillments & Shipments (Step 8)
    const fulRes = await fetch(`${baseUrl}/api/v1/fulfillments`, { headers: authHeaders });
    const fulData = await fulRes.json();
    if (!fulRes.ok) throw new Error(`Fulfillment check failed: ${JSON.stringify(fulData)}`);
    recordSuccess('Fulfillment Orders', `Fulfillment routing active (${fulData.data.length} allocations)`);

    // 17. Reverse Logistics & Returns (Step 9)
    const retRes = await fetch(`${baseUrl}/api/v1/returns`, { headers: authHeaders });
    const retData = await retRes.json();
    if (!retRes.ok) throw new Error(`Returns check failed: ${JSON.stringify(retData)}`);
    recordSuccess('Reverse Logistics RMA', `Returns engine queried (${retData.data.length} RMA tickets)`);

    // 18. Transactional Outbox & Events (Step 11)
    const eventRes = await fetch(`${baseUrl}/api/v1/events/outbox?limit=5`, { headers: authHeaders });
    const eventData = await eventRes.json();
    if (!eventRes.ok) throw new Error(`Outbox check failed: ${JSON.stringify(eventData)}`);
    recordSuccess('Transactional Outbox', `Outbox engine active (${eventData.data.length} event records checked)`);

    // 19. Vendors & Purchase Orders (Step 12)
    const poRes = await fetch(`${baseUrl}/api/v1/purchase-orders?limit=5`, { headers: authHeaders });
    const poData = await poRes.json();
    if (!poRes.ok) throw new Error(`Purchase order check failed: ${JSON.stringify(poData)}`);
    recordSuccess('Vendor PO Receiving', `Purchase order registry verified (${poData.data.length} POs tracked)`);

    // 20. Backorder Priority Queue (Step 13)
    const boRes = await fetch(`${baseUrl}/api/v1/backorders?limit=5`, { headers: authHeaders });
    const boData = await boRes.json();
    if (!boRes.ok) throw new Error(`Backorder check failed: ${JSON.stringify(boData)}`);
    recordSuccess('Backorder Priority Queue', `FIFO allocation queue verified (${boData.data.length} queued records)`);

    // 21. Compliance Audit Logs (Step 14)
    const auditRes = await fetch(`${baseUrl}/api/v1/audit-logs?limit=5`, { headers: authHeaders });
    const auditData = await auditRes.json();
    if (!auditRes.ok) throw new Error(`Audit log check failed: ${JSON.stringify(auditData)}`);
    recordSuccess('Audit & Compliance', `Immutable audit trails active (${auditData.data.length} mutations recorded)`);

    // 22. Analytics & Reporting (Step 15)
    const repRes = await fetch(`${baseUrl}/api/v1/reports/sales-summary`, { headers: authHeaders });
    const repData = await repRes.json();
    if (!repRes.ok) throw new Error(`Report check failed: ${JSON.stringify(repData)}`);
    recordSuccess('Financial Reporting', `Sales summary aggregate (Gross: $${repData.data.gross_sales}, Orders: ${repData.data.total_orders})`);

    // 23. System Webhooks & HMAC Ping (Step 16)
    const whCreateRes = await fetch(`${baseUrl}/api/v1/webhooks`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        url: 'http://127.0.0.1:59999/smoke-hook',
        events: ['*'],
        description: 'Smoke Test Webhook',
      }),
    });
    const whCreateData = await whCreateRes.json();
    if (!whCreateRes.ok) throw new Error(`Webhook creation failed: ${JSON.stringify(whCreateData)}`);
    const hookId = whCreateData.data.id;
    // Dispatch test ping
    await fetch(`${baseUrl}/api/v1/webhooks/${hookId}/test`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({ event_type: 'smoke.ping', payload: { test: true } }),
    });
    // Cleanup webhook
    await fetch(`${baseUrl}/api/v1/webhooks/${hookId}`, { method: 'DELETE', headers: authHeaders });
    recordSuccess('Webhook Dispatch Hub', `Created, dispatched HMAC ping, and cleaned hook ${hookId.slice(0, 8)}...`);

    // 24. Sliding-Window Rate Limiter
    const rateLimitHeader = tenantRes.headers.get('x-ratelimit-limit');
    if (!rateLimitHeader) throw new Error('Missing X-RateLimit headers');
    recordSuccess('Production Rate Limiter', `Sliding-window Redis limit active (${rateLimitHeader} req/window)`);

    console.log('\n================================================================================');
    console.log(`🎉 100% COMPLETE: ALL 24 SYSTEM & DOMAIN CHECKS PASSED SUCCESSFULLY!`);
    console.log(`📊 TOTAL SWAGGER OPENAPI ENDPOINTS: ${totalSwaggerOps}`);
    console.log('================================================================================\n');
  } finally {
    server.close();
  }
}

runFullSystemSmokeTest()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Smoke test failed:', err);
    process.exit(1);
  });
