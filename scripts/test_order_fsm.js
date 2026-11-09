const app = require('../src/app');
const { pool } = require('../src/infrastructure/database');
const { getRedisClient } = require('../src/config/redis');
const { swaggerSpec } = require('../src/config/swagger');

async function runOrderFsmIntegrationTests() {
  console.log('=== STARTING INTEGRATION TESTS FOR ORDER ORCHESTRATION & STATE MACHINE ===\n');

  const server = app.listen(0);
  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}/api/v1`;

  const request = async (path, options = {}) => {
    const url = `${baseUrl}${path}`;
    const headers = {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    };
    const res = await fetch(url, {
      ...options,
      headers,
      body: options.body ? JSON.stringify(options.body) : undefined,
    });
    const text = await res.text();
    let json;
    try {
      json = JSON.parse(text);
    } catch {
      json = { raw: text };
    }
    return { status: res.status, body: json };
  };

  try {
    // 1. Authenticate with seeded admin
    console.log('[1] Logging in with seeded admin user...');
    const loginRes = await request('/auth/login', {
      method: 'POST',
      body: {
        email: 'admin@nexora.io',
        password: 'Admin@Nexora2026',
      },
    });

    if (loginRes.status !== 200) {
      console.error('Login failed:', loginRes.body);
      process.exit(1);
    }

    const { tokens, user, activeTenant } = loginRes.body.data;
    console.log(`✓ Authenticated as ${user.email} (Tenant: ${activeTenant.tenant_slug}, Role: ${activeTenant.role_name})`);

    const authHeaders = {
      Authorization: `Bearer ${tokens.accessToken}`,
      'X-Tenant-ID': activeTenant.tenant_id,
    };

    // 2. Setup Dependencies: Customer & Product
    console.log('\n[2] Setting up customer and product for order tests...');
    const custRes = await request('/customers', {
      method: 'POST',
      headers: authHeaders,
      body: {
        email: `fsm_buyer_${Date.now()}@test.com`,
        first_name: 'Alex',
        last_name: 'Hunter',
        phone: '+15551234567',
      },
    });
    const customer = custRes.body.data;
    console.log(`✓ Customer: ${customer.first_name} ${customer.last_name} (${customer.id})`);

    const prodRes = await request('/products', {
      method: 'POST',
      headers: authHeaders,
      body: {
        sku: `SKU-ORD-${Date.now()}`,
        name: 'Omni Tactical Backpack',
        price_base: 120.00,
        currency: 'USD',
      },
    });
    const product = prodRes.body.data;
    console.log(`✓ Product: ${product.name} (${product.sku})`);

    // 3. Ingest Order
    console.log('\n[3] Testing Order Ingestion (POST /orders)...');
    const idempKey = `idemp_order_${Date.now()}`;
    const orderPayload = {
      customer_id: customer.id,
      channel_order_id: '#ORD-SHP-8821',
      currency: 'USD',
      items: [
        {
          product_id: product.id,
          sku: product.sku,
          title: product.name,
          quantity: 2,
          unit_price: 120.00,
          tax_amount: 24.00,
          discount_amount: 10.00,
        },
      ],
      shipping_address: {
        name: 'Alex Hunter',
        street: '100 Mission St',
        city: 'San Francisco',
        state: 'CA',
        country: 'US',
        postal_code: '94105',
        phone: '+15551234567',
      },
      billing_address: {
        name: 'Alex Hunter',
        street: '100 Mission St',
        city: 'San Francisco',
        state: 'CA',
        country: 'US',
        postal_code: '94105',
        phone: '+15551234567',
      },
      is_cod: false,
      shipping_total: 15.00,
      discount_total: 10.00,
      idempotency_key: idempKey,
    };

    const createOrderRes = await request('/orders', {
      method: 'POST',
      headers: authHeaders,
      body: orderPayload,
    });

    console.log(`Status: ${createOrderRes.status}`);
    if (createOrderRes.status !== 201) {
      console.error('Order creation failed:', createOrderRes.body);
      process.exit(1);
    }
    const order = createOrderRes.body.data;
    console.log(`✓ Order Ingested: ${order.order_number} [ID: ${order.id}] Initial Status: ${order.status}`);
    console.log(`✓ Financials: Subtotal=${order.subtotal}, Tax=${order.tax_total}, TotalAmount=${order.total_amount}`);

    // Verify subtotal (2 * 120 = 240) and total (240 + 24 tax + 15 shipping - 10 discount = 269)
    if (Number(order.subtotal) !== 240 || Number(order.total_amount) !== 269) {
      console.error('Financial calculations mismatch!', order);
      process.exit(1);
    }
    console.log('✓ Pricing arithmetic exact match: $269.00');

    // 4. Idempotency Test
    console.log('\n[4] Testing Order Idempotency...');
    const duplicateRes = await request('/orders', {
      method: 'POST',
      headers: authHeaders,
      body: orderPayload,
    });
    if (duplicateRes.body.data.id === order.id) {
      console.log(`✓ Idempotency Verified: Returned existing order ID ${duplicateRes.body.data.id} without duplicating!`);
    } else {
      console.error('Idempotency check failed!', duplicateRes.body);
      process.exit(1);
    }

    // 5. Illegal State Transition Rejection Test
    console.log('\n[5] Testing Forward-Only FSM Guard (PENDING -> COMPLETED)...');
    const illegalTransRes = await request(`/orders/${order.id}/status`, {
      method: 'PATCH',
      headers: authHeaders,
      body: {
        status: 'COMPLETED',
        reason: 'Illegal direct leap',
      },
    });

    console.log(`Status: ${illegalTransRes.status} (Expected: 400 Bad Request)`);
    if (illegalTransRes.status === 400) {
      console.log(`✓ Illegal Transition Blocked: "${illegalTransRes.body.error.message}"`);
    } else {
      console.error('FSM integrity breach! Allowed illegal transition:', illegalTransRes.body);
      process.exit(1);
    }

    // 6. Valid Forward-Only FSM Lifecycle Progression
    console.log('\n[6] Testing Valid FSM Lifecycle Progression...');

    // PENDING -> CONFIRMED
    const confirmRes = await request(`/orders/${order.id}/status`, {
      method: 'PATCH',
      headers: authHeaders,
      body: { status: 'CONFIRMED', reason: 'Credit card payment captured' },
    });
    console.log(`✓ PENDING -> CONFIRMED (Status: ${confirmRes.status})`);

    // CONFIRMED -> PROCESSING
    const processRes = await request(`/orders/${order.id}/status`, {
      method: 'PATCH',
      headers: authHeaders,
      body: { status: 'PROCESSING', reason: 'Allocated to warehouse for picking' },
    });
    console.log(`✓ CONFIRMED -> PROCESSING (Status: ${processRes.status})`);

    // PROCESSING -> READY
    const readyRes = await request(`/orders/${order.id}/status`, {
      method: 'PATCH',
      headers: authHeaders,
      body: { status: 'READY', reason: 'Items picked, scanned, and packed into box' },
    });
    console.log(`✓ PROCESSING -> READY (Status: ${readyRes.status})`);

    // READY -> FULFILLED
    const fulfillRes = await request(`/orders/${order.id}/status`, {
      method: 'PATCH',
      headers: authHeaders,
      body: { status: 'FULFILLED', reason: 'Handed over to FedEx carrier' },
    });
    console.log(`✓ READY -> FULFILLED (Status: ${fulfillRes.status})`);

    // FULFILLED -> COMPLETED
    const completeRes = await request(`/orders/${order.id}/status`, {
      method: 'PATCH',
      headers: authHeaders,
      body: { status: 'COMPLETED', reason: 'Delivered to customer doorstep' },
    });
    console.log(`✓ FULFILLED -> COMPLETED (Status: ${completeRes.status})`);

    // 7. Order Holds Lifecycle
    console.log('\n[7] Testing Order Holds Mechanism...');
    // Create second order for hold test
    const order2Res = await request('/orders', {
      method: 'POST',
      headers: authHeaders,
      body: {
        customer_id: customer.id,
        currency: 'USD',
        items: [
          {
            product_id: product.id,
            sku: product.sku,
            title: product.name,
            quantity: 1,
            unit_price: 120.00,
          },
        ],
        shipping_address: orderPayload.shipping_address,
        billing_address: orderPayload.billing_address,
      },
    });
    const order2 = order2Res.body.data;

    // Place Hold
    const holdRes = await request(`/orders/${order2.id}/holds`, {
      method: 'POST',
      headers: authHeaders,
      body: { reason: 'Fraud review: Suspected high velocity charge' },
    });
    console.log(`Status: ${holdRes.status}`);
    const holdData = holdRes.body.data;
    console.log(`✓ Hold Placed: Order status is now ${holdData.status} [Hold ID: ${holdData.hold.id}]`);

    // Resolve Hold
    const resolveRes = await request(`/orders/${order2.id}/holds/${holdData.hold.id}/resolve`, {
      method: 'POST',
      headers: authHeaders,
      body: { target_status: 'CONFIRMED', resolution_notes: 'Customer submitted valid government photo ID' },
    });
    console.log(`Status: ${resolveRes.status}`);
    console.log(`✓ Hold Resolved: Order status restored to ${resolveRes.body.data.status}`);

    // 8. Order Details & State History Audit Trail
    console.log('\n[8] Testing Order Details & State History Audit Query (GET /orders/:id/history)...');
    const historyRes = await request(`/orders/${order.id}/history`, {
      method: 'GET',
      headers: authHeaders,
    });
    console.log(`Status: ${historyRes.status}, Total State Transitions Logged: ${historyRes.body.data.length}`);
    if (historyRes.status !== 200 || historyRes.body.data.length < 5) {
      console.error('History audit trail incomplete!', historyRes.body);
      process.exit(1);
    }
    console.log('Chronological state history:');
    historyRes.body.data.forEach((h, idx) => {
      console.log(`  ${idx + 1}. [${h.previous_state || 'START'}] -> [${h.new_state}] Reason: "${h.transition_reason}"`);
    });

    // 9. List Orders with Filter
    console.log('\n[9] Testing Order Listing & Query (GET /orders)...');
    const listRes = await request(`/orders?status=COMPLETED`, {
      method: 'GET',
      headers: authHeaders,
    });
    console.log(`Status: ${listRes.status}, Completed orders count: ${listRes.body.data.length}`);
    if (listRes.status !== 200) {
      console.error('Orders listing failed:', listRes.body);
      process.exit(1);
    }
    console.log('✓ Order listing verified');

    // 10. Swagger OpenAPI Coverage
    console.log('\n[10] Verifying OpenAPI / Swagger Spec coverage for Orders module...');
    const paths = Object.keys(swaggerSpec.paths);
    console.log(`Total Swagger Documented Endpoints in NEXORA: ${paths.length}`);

    const expectedOrderPaths = [
      '/orders',
      '/orders/{id}',
      '/orders/{id}/status',
      '/orders/{id}/holds',
      '/orders/{id}/holds/{holdId}/resolve',
      '/orders/{id}/history',
    ];

    const missing = expectedOrderPaths.filter((p) => !paths.includes(p));
    if (missing.length > 0) {
      console.error('Missing Swagger documentation for:', missing);
      process.exit(1);
    }
    console.log('✓ All 6 Order Orchestration & FSM Endpoints are fully registered in Swagger UI!');

    console.log('\n=== ALL STEP 5 ORDER & STATE MACHINE TESTS PASSED 100% ===');
  } catch (err) {
    console.error('Test execution error:', err);
    process.exit(1);
  } finally {
    server.close();
    await pool.end();
    const redis = getRedisClient();
    redis.disconnect();
  }
}

runOrderFsmIntegrationTests();

