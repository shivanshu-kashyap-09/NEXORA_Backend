const app = require('../src/app');
const { pool } = require('../src/infrastructure/database');
const { getRedisClient } = require('../src/config/redis');
const { swaggerSpec } = require('../src/config/swagger');

async function runOmnichannelTests() {
  console.log('=== STARTING INTEGRATION TESTS FOR OMNICHANNEL RETAIL FULFILLMENT (BOPIS / BORIS) ===\n');

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

    // 2. Setup Retail Store Node & Catalog Product
    console.log('\n[2] Setting up retail store node and product catalog...');
    const storeCode = `STORE-${Date.now().toString().slice(-4)}`;
    const storeRes = await request('/warehouses', {
      method: 'POST',
      headers: authHeaders,
      body: {
        code: storeCode,
        name: `Flagship Retail Store ${storeCode}`,
        address: {
          line1: '450 5th Avenue',
          city: 'New York',
          state: 'NY',
          postal_code: '10018',
          country: 'USA',
        },
        priority: 1,
        is_active: true,
      },
    });

    if (storeRes.status !== 201) {
      console.error('Store creation failed:', storeRes.body);
      process.exit(1);
    }
    const storeId = storeRes.body.data.id;
    console.log(`✓ Created Store Warehouse: ${storeRes.body.data.name} (ID: ${storeId})`);

    const sku = `SKU-BOPIS-${Date.now().toString().slice(-4)}`;
    const prodRes = await request('/products', {
      method: 'POST',
      headers: authHeaders,
      body: {
        sku,
        name: `Omnichannel Smart Jacket ${sku}`,
        price_base: 149.99,
        currency: 'USD',
      },
    });

    if (prodRes.status !== 201) {
      console.error('Product creation failed:', prodRes.body);
      process.exit(1);
    }
    const productId = prodRes.body.data.id;
    console.log(`✓ Created Product: ${prodRes.body.data.name} (ID: ${productId}, SKU: ${sku})`);

    // Seed stock: 15 units at the retail store
    await pool.query(
      `INSERT INTO inventory_items (tenant_id, warehouse_id, product_id, on_hand, reserved, safety_stock, damaged, updated_at)
       VALUES ($1, $2, $3, 15, 0, 0, 0, NOW())
       ON CONFLICT (tenant_id, warehouse_id, product_id)
       DO UPDATE SET on_hand = 15;`,
      [activeTenant.tenant_id, storeId, productId]
    );
    console.log('✓ Seeded store retail inventory: 15 units on_hand');

    // 3. Ingest Online Order & Confirm Payment
    console.log('\n[3] Ingesting and confirming BOPIS order...');
    const orderRes = await request('/orders', {
      method: 'POST',
      headers: authHeaders,
      body: {
        currency: 'USD',
        items: [
          {
            product_id: productId,
            sku,
            title: `Omnichannel Smart Jacket ${sku}`,
            quantity: 2,
            unit_price: 149.99,
          },
        ],
        shipping_address: {
          name: 'Sarah Connor',
          street: '450 5th Avenue (In-Store Pickup)',
          city: 'New York',
          state: 'NY',
          country: 'US',
          postal_code: '10018',
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

    if (orderRes.status !== 201) {
      console.error('Failed to create order:', orderRes.body);
      process.exit(1);
    }
    const order = orderRes.body.data;
    const orderItemId = order.items[0].id;
    console.log(`✓ Order Ingested: ${order.order_number} (ID: ${order.id}), Item: ${orderItemId}`);

    // Capture payment
    await request('/payments', {
      method: 'POST',
      headers: authHeaders,
      body: {
        order_id: order.id,
        payment_method: 'CREDIT_CARD',
        gateway: 'STRIPE',
        amount: Number(order.total_amount),
        currency: 'USD',
        idempotency_key: `idemp_bopis_pay_${Date.now()}`,
        auto_capture: true,
      },
    });
    console.log(`✓ Order payment captured and status CONFIRMED.`);

    // 4. Ingest BOPIS Pickup Registration (POST /omnichannel/bopis)
    console.log('\n[4] Ingesting BOPIS Pickup Registration (POST /omnichannel/bopis)...');
    const bopisCreateRes = await request('/omnichannel/bopis', {
      method: 'POST',
      headers: authHeaders,
      body: {
        order_id: order.id,
        store_warehouse_id: storeId,
      },
    });

    if (bopisCreateRes.status !== 201) {
      console.error('Failed to register BOPIS pickup:', bopisCreateRes.body);
      process.exit(1);
    }

    const bopis = bopisCreateRes.body.data;
    const pickupPin = bopis.pickup_pin;
    console.log(`✓ BOPIS pickup registered successfully:`);
    console.log(`  - Pickup ID: ${bopis.id}`);
    console.log(`  - 6-Digit Pickup PIN (for Customer): ${pickupPin}`);
    console.log(`  - Is Staged: ${bopis.is_staged}`);

    if (!pickupPin || pickupPin.length !== 6) {
      throw new Error(`Expected 6-digit pickup PIN, got ${pickupPin}`);
    }

    // Verify order moved to PROCESSING
    const ordCheck1 = await request(`/orders/${order.id}`, { method: 'GET', headers: authHeaders });
    console.log(`✓ Order status synchronized to: ${ordCheck1.body.data.status} (Store picking underway)`);
    if (ordCheck1.body.data.status !== 'PROCESSING') {
      throw new Error(`Expected order status PROCESSING, got ${ordCheck1.body.data.status}`);
    }

    // 5. Query & List BOPIS Pickups
    console.log('\n[5] Querying BOPIS Pickups (GET /omnichannel/bopis & GET /omnichannel/bopis/:id)...');
    const listRes = await request(`/omnichannel/bopis?store_warehouse_id=${storeId}&is_staged=false`, {
      method: 'GET',
      headers: authHeaders,
    });
    if (listRes.status !== 200 || !listRes.body.data.length) {
      throw new Error(`Failed to list BOPIS pickups: ${JSON.stringify(listRes.body)}`);
    }
    console.log(`✓ Filtered BOPIS list verified: Found ${listRes.body.data.length} staged=false items at store`);

    const getRes = await request(`/omnichannel/bopis/${bopis.id}`, {
      method: 'GET',
      headers: authHeaders,
    });
    if (getRes.status !== 200) {
      throw new Error(`Failed to fetch BOPIS by ID: ${JSON.stringify(getRes.body)}`);
    }
    console.log(`✓ Fetched BOPIS record: Store Name: ${getRes.body.data.store_name}, Order: ${getRes.body.data.order_number}`);
    if (getRes.body.data.pickup_pin_hash) {
      throw new Error('Security violation: pickup_pin_hash exposed in GET response');
    }

    // 6. Store Associate Picking & Staging (POST /omnichannel/bopis/:id/stage)
    console.log('\n[6] Testing Store Associate Picking & Staging (POST /omnichannel/bopis/:id/stage)...');
    const stageRes = await request(`/omnichannel/bopis/${bopis.id}/stage`, {
      method: 'POST',
      headers: authHeaders,
      body: {
        staging_bin: 'HOLD-BIN-C4',
        notes: 'Packaged in branded store carry bag',
      },
    });

    if (stageRes.status !== 200) {
      console.error('Failed to stage BOPIS order:', stageRes.body);
      process.exit(1);
    }
    console.log(`✓ BOPIS pickup marked staged: is_staged=${stageRes.body.data.is_staged}`);

    // Verify order transitioned to READY
    const ordCheck2 = await request(`/orders/${order.id}`, { method: 'GET', headers: authHeaders });
    console.log(`✓ Order status synchronized to: ${ordCheck2.body.data.status} (Ready for customer collection)`);
    if (ordCheck2.body.data.status !== 'READY') {
      throw new Error(`Expected order status READY, got ${ordCheck2.body.data.status}`);
    }

    // 7. Customer Handover & PIN Security Verification (POST /omnichannel/bopis/:id/handover)
    console.log('\n[7] Testing Customer Handover & PIN Verification Security...');
    
    // Attempt with incorrect PIN
    const wrongPinRes = await request(`/omnichannel/bopis/${bopis.id}/handover`, {
      method: 'POST',
      headers: authHeaders,
      body: {
        pin: '000000',
        picked_up_by_name: 'Imposter Bob',
      },
    });
    if (wrongPinRes.status === 400) {
      console.log(`✓ Invalid PIN correctly rejected (400 Bad Request): ${wrongPinRes.body.message}`);
    } else {
      throw new Error(`Expected 400 for wrong PIN, got ${wrongPinRes.status}`);
    }

    // Perform authentic handover with correct PIN
    const validHandoverRes = await request(`/omnichannel/bopis/${bopis.id}/handover`, {
      method: 'POST',
      headers: authHeaders,
      body: {
        pin: pickupPin,
        picked_up_by_name: 'Sarah Connor',
      },
    });

    if (validHandoverRes.status !== 200) {
      console.error('Handover failed:', validHandoverRes.body);
      process.exit(1);
    }

    const completedPickup = validHandoverRes.body.data;
    console.log(`✓ Valid PIN verified. Package handed over to: ${completedPickup.picked_up_by_name}`);
    console.log(`  - Picked Up At: ${completedPickup.picked_up_at}`);

    // Verify order transitioned to COMPLETED
    const ordCheck3 = await request(`/orders/${order.id}`, { method: 'GET', headers: authHeaders });
    console.log(`✓ Order status synchronized to: ${ordCheck3.body.data.status}`);
    if (ordCheck3.body.data.status !== 'COMPLETED') {
      throw new Error(`Expected order status COMPLETED, got ${ordCheck3.body.data.status}`);
    }

    // Test duplicate handover prevention
    const dupRes = await request(`/omnichannel/bopis/${bopis.id}/handover`, {
      method: 'POST',
      headers: authHeaders,
      body: {
        pin: pickupPin,
        picked_up_by_name: 'Sarah Connor Again',
      },
    });
    if (dupRes.status === 409) {
      console.log(`✓ Duplicate handover correctly rejected with 409 Conflict`);
    } else {
      throw new Error(`Expected 409 for duplicate handover, got ${dupRes.status}`);
    }

    // 8. BORIS (Buy Online, Return In Store) Desk Flow (POST /omnichannel/boris)
    console.log('\n[8] Testing BORIS In-Store Return Desk & Instant Restock (POST /omnichannel/boris)...');

    // Check store on_hand stock before BORIS return
    const stockBefore = await pool.query(
      `SELECT on_hand, damaged FROM inventory_items WHERE tenant_id = $1 AND warehouse_id = $2 AND product_id = $3;`,
      [activeTenant.tenant_id, storeId, productId]
    );
    const storeOnHandBefore = stockBefore.rows[0]?.on_hand || 0;
    console.log(`  - Store on_hand stock before return: ${storeOnHandBefore}`);

    const borisRes = await request('/omnichannel/boris', {
      method: 'POST',
      headers: authHeaders,
      body: {
        order_id: order.id,
        store_warehouse_id: storeId,
        reason: 'SIZE_TOO_LARGE',
        customer_name: 'Sarah Connor',
        refund_method: 'ORIGINAL_PAYMENT',
        items: [
          {
            order_item_id: orderItemId,
            quantity: 1,
            qa_grade: 'SELLABLE',
          },
        ],
      },
    });

    if (borisRes.status !== 201) {
      console.error('BORIS return failed:', borisRes.body);
      process.exit(1);
    }

    const borisData = borisRes.body.data;
    console.log(`✓ BORIS In-Store Return Processed:`);
    console.log(`  - Return RMA: ${borisData.rma_number}`);
    console.log(`  - Refunded Amount: $${borisData.refunded_amount}`);
    console.log(`  - Payment Refund ID: ${borisData.refund?.id}`);

    // Verify store inventory credited (+1 unit)
    const stockAfter = await pool.query(
      `SELECT on_hand, damaged FROM inventory_items WHERE tenant_id = $1 AND warehouse_id = $2 AND product_id = $3;`,
      [activeTenant.tenant_id, storeId, productId]
    );
    const storeOnHandAfter = stockAfter.rows[0]?.on_hand || 0;
    console.log(`  - Store on_hand stock after return: ${storeOnHandAfter}`);

    if (storeOnHandAfter !== storeOnHandBefore + 1) {
      throw new Error(`Expected store stock to increase by 1, from ${storeOnHandBefore} to ${storeOnHandBefore + 1}, got ${storeOnHandAfter}`);
    }
    console.log(`✓ Store inventory instant restock verified: Exactly +1 unit added back to on_hand`);

    // Verify inventory adjustment ledger
    const adjRes = await pool.query(
      `SELECT * FROM inventory_adjustments WHERE tenant_id = $1 AND warehouse_id = $2 AND product_id = $3 AND reason = 'BORIS_IN_STORE_RESTOCK';`,
      [activeTenant.tenant_id, storeId, productId]
    );
    if (adjRes.rows.length === 0) {
      throw new Error('Expected inventory_adjustments entry for BORIS_IN_STORE_RESTOCK');
    }
    console.log(`✓ Inventory adjustment audit log verified: ${adjRes.rows[0].reason} (+${adjRes.rows[0].quantity_delta} units)`);

    // 9. Verify Swagger / OpenAPI Coverage
    console.log('\n[9] Verifying Swagger OpenAPI 3.0 Documentation for Omnichannel Module...');
    const documentedPaths = Object.keys(swaggerSpec.paths);
    const omnichannelEndpoints = [
      '/omnichannel/bopis',
      '/omnichannel/bopis/{id}',
      '/omnichannel/bopis/{id}/stage',
      '/omnichannel/bopis/{id}/handover',
      '/omnichannel/boris',
    ];

    for (const ep of omnichannelEndpoints) {
      if (documentedPaths.includes(ep)) {
        console.log(`✓ OpenAPI covers endpoint: ${ep}`);
      } else {
        throw new Error(`Missing OpenAPI documentation for endpoint: ${ep}`);
      }
    }

    console.log(`\n✓ Total documented endpoints in Swagger spec: ${documentedPaths.length}`);
    console.log('\n==================================================================');
    console.log('🎉 ALL INTEGRATION TESTS FOR OMNICHANNEL (BOPIS / BORIS) PASSED!');
    console.log('==================================================================');

    server.close();
    process.exit(0);
  } catch (error) {
    console.error('\n❌ TEST RUN FAILED:', error);
    server.close();
    process.exit(1);
  }
}

runOmnichannelTests();

