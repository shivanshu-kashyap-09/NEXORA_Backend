const app = require('../src/app');
const { pool } = require('../src/infrastructure/database');
const { getRedisClient } = require('../src/config/redis');
const { swaggerSpec } = require('../src/config/swagger');

async function runFulfillmentLogisticsTests() {
  console.log('=== STARTING INTEGRATION TESTS FOR FULFILLMENT & 3PL LOGISTICS ===\n');

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

    // 2. Setup Warehouse, Product, and Order
    console.log('\n[2] Setting up warehouse, product, and confirmed order...');
    const whRes = await request('/warehouses', {
      method: 'POST',
      headers: authHeaders,
      body: {
        code: `WH-LOG-${Date.now().toString().slice(-4)}`,
        name: 'Logistics Sort Center',
        priority: 1,
        address: { city: 'Dallas', country: 'US', postal_code: '75201' },
      },
    });
    const warehouse = whRes.body.data;

    const prodRes = await request('/products', {
      method: 'POST',
      headers: authHeaders,
      body: {
        sku: `SKU-LOG-${Date.now()}`,
        name: 'All-Terrain Rugged Drone',
        price_base: 899.00,
        currency: 'USD',
      },
    });
    const product = prodRes.body.data;

    const orderRes = await request('/orders', {
      method: 'POST',
      headers: authHeaders,
      body: {
        currency: 'USD',
        items: [
          {
            product_id: product.id,
            sku: product.sku,
            title: product.name,
            quantity: 1,
            unit_price: 899.00,
          },
        ],
        shipping_address: {
          name: 'Sarah Connor',
          street: '123 Cyber Way',
          city: 'Los Angeles',
          state: 'CA',
          country: 'US',
          postal_code: '90001',
        },
        billing_address: {
          name: 'Sarah Connor',
          street: '123 Cyber Way',
          city: 'Los Angeles',
          state: 'CA',
          country: 'US',
          postal_code: '90001',
        },
      },
    });
    const order = orderRes.body.data;

    // Capture payment so order is CONFIRMED
    await request('/payments', {
      method: 'POST',
      headers: authHeaders,
      body: {
        order_id: order.id,
        payment_method: 'CREDIT_CARD',
        gateway: 'STRIPE',
        amount: Number(order.total_amount),
        currency: 'USD',
        idempotency_key: `idemp_log_pay_${Date.now()}`,
        auto_capture: true,
      },
    });
    console.log(`✓ Order Created & Confirmed: ${order.order_number}`);

    // 3. Create Fulfillment Wave Allocation
    console.log('\n[3] Testing Fulfillment Wave Allocation (POST /fulfillments)...');
    const orderItemId = order.items[0].id;
    const fulRes = await request('/fulfillments', {
      method: 'POST',
      headers: authHeaders,
      body: {
        order_id: order.id,
        warehouse_id: warehouse.id,
        items: [
          {
            order_item_id: orderItemId,
            quantity: 1,
          },
        ],
      },
    });

    console.log(`Status: ${fulRes.status}`);
    if (fulRes.status !== 201) {
      console.error('Fulfillment allocation failed:', fulRes.body);
      process.exit(1);
    }
    const fulfillment = fulRes.body.data;
    console.log(`✓ Fulfillment Allocated: ID=${fulfillment.id}, Status=${fulfillment.status}`);

    // Verify order advanced to PROCESSING
    const checkOrd1 = await request(`/orders/${order.id}`, { method: 'GET', headers: authHeaders });
    console.log(`✓ Order status synchronized to: ${checkOrd1.body.data.status}`);
    if (checkOrd1.body.data.status !== 'PROCESSING') {
      console.error('Order status expected PROCESSING, got:', checkOrd1.body.data.status);
      process.exit(1);
    }

    // 4. Progress Fulfillment Lifecycle: ALLOCATED -> PICKING -> PACKED
    console.log('\n[4] Progressing Fulfillment Lifecycle (PICKING -> PACKED)...');
    await request(`/fulfillments/${fulfillment.id}/status`, {
      method: 'PATCH',
      headers: authHeaders,
      body: { status: 'PICKING' },
    });
    console.log('✓ Fulfillment status: PICKING');

    const packRes = await request(`/fulfillments/${fulfillment.id}/status`, {
      method: 'PATCH',
      headers: authHeaders,
      body: { status: 'PACKED' },
    });
    console.log(`✓ Fulfillment status: PACKED (Status: ${packRes.status})`);

    // Verify order status advanced to READY
    const checkOrd2 = await request(`/orders/${order.id}`, { method: 'GET', headers: authHeaders });
    console.log(`✓ Order status synchronized to: ${checkOrd2.body.data.status}`);
    if (checkOrd2.body.data.status !== 'READY') {
      console.error('Order status expected READY, got:', checkOrd2.body.data.status);
      process.exit(1);
    }

    // 5. Create 3PL Carrier Shipment
    console.log('\n[5] Testing 3PL Carrier Shipment Creation (POST /shipments)...');
    const customTracking = `79461234${Date.now().toString().slice(-4)}`;
    const shipRes = await request('/shipments', {
      method: 'POST',
      headers: authHeaders,
      body: {
        fulfillment_id: fulfillment.id,
        carrier: 'FedEx',
        service_tier: 'Priority Overnight',
        tracking_number: customTracking,
        tracking_url: `https://www.fedex.com/fedextrack/?trknbr=${customTracking}`,
        shipping_label_url: `https://cdn.nexora.io/labels/fedex_${customTracking}.pdf`,
      },
    });

    console.log(`Status: ${shipRes.status}`);
    if (shipRes.status !== 201) {
      console.error('Shipment creation failed:', shipRes.body);
      process.exit(1);
    }
    const shipment = shipRes.body.data;
    console.log(`✓ Shipment Created: Carrier=${shipment.carrier}, Tracking=${shipment.tracking_number}, Status=${shipment.status}`);

    // Verify fulfillment advanced to SHIPPED and order to FULFILLED
    const checkFul = await request(`/fulfillments/${fulfillment.id}`, { method: 'GET', headers: authHeaders });
    const checkOrd3 = await request(`/orders/${order.id}`, { method: 'GET', headers: authHeaders });
    console.log(`✓ Fulfillment status is now: ${checkFul.body.data.status}`);
    console.log(`✓ Order status is now: ${checkOrd3.body.data.status}`);
    if (checkFul.body.data.status !== 'SHIPPED' || checkOrd3.body.data.status !== 'FULFILLED') {
      console.error('Statuses not properly synchronized upon shipment dispatch!');
      process.exit(1);
    }

    // 6. Ingest 3PL Carrier Checkpoints
    console.log('\n[6] Ingesting Carrier Milestone Checkpoints (POST /shipments/:id/events)...');
    // Checkpoint 1: In Transit
    await request(`/shipments/${shipment.id}/events`, {
      method: 'POST',
      headers: authHeaders,
      body: {
        checkpoint_status: 'IN_TRANSIT',
        location: 'Memphis Sorting Hub, TN',
        raw_payload: { scan_type: 'DEPARTURE_SCAN' },
      },
    });
    console.log('✓ Checkpoint 1: IN_TRANSIT at Memphis Hub');

    // Checkpoint 2: Out for Delivery
    await request(`/shipments/${shipment.id}/events`, {
      method: 'POST',
      headers: authHeaders,
      body: {
        checkpoint_status: 'OUT_FOR_DELIVERY',
        location: 'Los Angeles Depot, CA',
        raw_payload: { vehicle_id: 'VAN-42' },
      },
    });
    console.log('✓ Checkpoint 2: OUT_FOR_DELIVERY in Los Angeles');

    // Checkpoint 3: DELIVERED
    const deliverRes = await request(`/shipments/${shipment.id}/events`, {
      method: 'POST',
      headers: authHeaders,
      body: {
        checkpoint_status: 'DELIVERED',
        location: 'Customer Porch, Los Angeles, CA',
        raw_payload: { signature: 'S. Connor', received_by: 'Resident' },
      },
    });
    console.log(`✓ Checkpoint 3: DELIVERED (Status: ${deliverRes.status})`);

    // 7. Verify Delivery Completion on Shipment and Order
    console.log('\n[7] Verifying complete delivery cycle...');
    const finalShipRes = await request(`/shipments/${shipment.id}`, { method: 'GET', headers: authHeaders });
    const finalOrdRes = await request(`/orders/${order.id}`, { method: 'GET', headers: authHeaders });

    console.log(`✓ Final Shipment Status: ${finalShipRes.body.data.status} (Delivered At: ${finalShipRes.body.data.delivered_at})`);
    console.log(`✓ Final Order Status: ${finalOrdRes.body.data.status}`);
    console.log(`✓ Total Checkpoint Milestones: ${finalShipRes.body.data.tracking_events.length}`);

    if (finalShipRes.body.data.status !== 'DELIVERED' || finalOrdRes.body.data.status !== 'COMPLETED') {
      console.error('Final delivery cycle verification failed!');
      process.exit(1);
    }

    // 8. Swagger OpenAPI Coverage
    console.log('\n[8] Verifying OpenAPI / Swagger Spec coverage for Fulfillment & Logistics...');
    const paths = Object.keys(swaggerSpec.paths);
    console.log(`Total Swagger Documented Endpoints in NEXORA: ${paths.length}`);

    const expectedFulfillmentPaths = [
      '/fulfillments',
      '/fulfillments/{id}',
      '/fulfillments/{id}/status',
      '/shipments',
      '/shipments/{id}',
      '/shipments/{id}/status',
      '/shipments/{id}/events',
    ];

    const missing = expectedFulfillmentPaths.filter((p) => !paths.includes(p));
    if (missing.length > 0) {
      console.error('Missing Swagger documentation for:', missing);
      process.exit(1);
    }
    console.log('✓ All 7 Fulfillment & 3PL Logistics Endpoints are fully registered in Swagger UI!');

    console.log('\n=== ALL STEP 7 FULFILLMENT & 3PL LOGISTICS TESTS PASSED 100% ===');
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

runFulfillmentLogisticsTests();

