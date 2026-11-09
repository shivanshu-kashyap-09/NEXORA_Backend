const app = require('../src/app');
const { pool } = require('../src/infrastructure/database');
const { getRedisClient } = require('../src/config/redis');
const { swaggerSpec } = require('../src/config/swagger');

async function runReturnsRmaTests() {
  console.log('=== STARTING INTEGRATION TESTS FOR REVERSE LOGISTICS & RMA MODULE ===\n');

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

    // 2. Setup Warehouse & Product
    console.log('\n[2] Setting up warehouse, product, and stock...');
    const whCode = `WH-REV-${Date.now().toString().slice(-4)}`;
    const whRes = await request('/warehouses', {
      method: 'POST',
      headers: authHeaders,
      body: {
        code: whCode,
        name: `Reverse Intake Warehouse ${whCode}`,
        address: {
          line1: '100 Return Logistics Blvd',
          city: 'Dallas',
          state: 'TX',
          postal_code: '75201',
          country: 'USA',
        },
        priority: 1,
        is_active: true,
      },
    });
    const warehouseId = whRes.body.data.id;
    console.log(`✓ Created Warehouse: ${whRes.body.data.name} (ID: ${warehouseId})`);

    const sku = `SKU-REV-${Date.now().toString().slice(-4)}`;
    const prodRes = await request('/products', {
      method: 'POST',
      headers: authHeaders,
      body: {
        sku,
        name: `RMA Eligible Item ${sku}`,
        price_base: 99.99,
        currency: 'USD',
      },
    });
    if (prodRes.status !== 201) {
      console.error('Failed to create product:', prodRes.body);
      process.exit(1);
    }
    const productId = prodRes.body.data.id;
    console.log(`✓ Created Product: ${prodRes.body.data.name} (ID: ${productId}, SKU: ${sku})`);

    // Seed stock: 20 units
    await pool.query(
      `INSERT INTO inventory_items (tenant_id, warehouse_id, product_id, on_hand, reserved, safety_stock, damaged, updated_at)
       VALUES ($1, $2, $3, 20, 0, 0, 0, NOW())
       ON CONFLICT (tenant_id, warehouse_id, product_id)
       DO UPDATE SET on_hand = 20;`,
      [activeTenant.tenant_id, warehouseId, productId]
    );
    console.log('✓ Seeded initial inventory: 20 on_hand');

    // 3. Create, Confirm & Complete an Order
    console.log('\n[3] Ingesting and completing order for return...');
    const orderNumber = `ORD-RMA-${Date.now().toString().slice(-6)}`;
    const orderRes = await request('/orders', {
      method: 'POST',
      headers: authHeaders,
      body: {
        currency: 'USD',
        items: [
          {
            product_id: productId,
            sku,
            title: `RMA Eligible Item ${sku}`,
            quantity: 4,
            unit_price: 99.99,
          },
        ],
        shipping_address: {
          name: 'Sarah Connor',
          street: '500 Customer Way',
          city: 'Austin',
          state: 'TX',
          country: 'US',
          postal_code: '73301',
        },
        billing_address: {
          name: 'Sarah Connor',
          street: '500 Customer Way',
          city: 'Austin',
          state: 'TX',
          country: 'US',
          postal_code: '73301',
        },
      },
    });

    if (orderRes.status !== 201) {
      console.error('Failed to create order:', orderRes.body);
      process.exit(1);
    }
    const order = orderRes.body.data;
    const orderItemId = order.items[0].id;
    console.log(`✓ Order Created: ${order.order_number} (ID: ${order.id}), Line Item: ${orderItemId}`);

    // Confirm order via payment
    await request('/payments', {
      method: 'POST',
      headers: authHeaders,
      body: {
        order_id: order.id,
        payment_method: 'CREDIT_CARD',
        gateway: 'STRIPE',
        amount: Number(order.total_amount),
        currency: 'USD',
        idempotency_key: `idemp_rma_pay_${Date.now()}`,
        auto_capture: true,
      },
    });

    // Fulfill order
    await request(`/orders/${order.id}/status`, {
      method: 'PATCH',
      headers: authHeaders,
      body: { status: 'PROCESSING' },
    });
    await request(`/orders/${order.id}/status`, {
      method: 'PATCH',
      headers: authHeaders,
      body: { status: 'READY' },
    });
    await request(`/orders/${order.id}/status`, {
      method: 'PATCH',
      headers: authHeaders,
      body: { status: 'FULFILLED' },
    });
    await request(`/orders/${order.id}/status`, {
      method: 'PATCH',
      headers: authHeaders,
      body: { status: 'COMPLETED' },
    });
    console.log(`✓ Order advanced to COMPLETED status.`);

    // 4. Ingest RMA Return Request (POST /returns)
    console.log('\n[4] Ingesting RMA Return Request (POST /returns)...');
    const returnPayload = {
      order_id: order.id,
      reason: 'DEFECTIVE_ITEM',
      items: [
        {
          order_item_id: orderItemId,
          quantity: 2,
        },
      ],
    };

    const rmaCreateRes = await request('/returns', {
      method: 'POST',
      headers: authHeaders,
      body: returnPayload,
    });

    if (rmaCreateRes.status !== 201) {
      console.error('Failed to create return:', rmaCreateRes.body);
      process.exit(1);
    }

    const rma = rmaCreateRes.body.data;
    console.log(`✓ RMA Return Created successfully:`);
    console.log(`  - RMA Number: ${rma.rma_number}`);
    console.log(`  - Initial Status: ${rma.status}`);
    console.log(`  - Reverse Tracking: ${rma.reverse_tracking_number}`);
    console.log(`  - Reverse Label URL: ${rma.reverse_label_url}`);
    console.log(`  - Items count: ${rma.items.length}`);

    if (rma.status !== 'REQUESTED') {
      throw new Error(`Expected RMA status to be REQUESTED, got ${rma.status}`);
    }

    // 5. Advance RMA Status Lifecycle (PATCH /returns/:id/status)
    console.log('\n[5] Advancing RMA status through reverse logistics lifecycle...');
    
    // Step A: Approve RMA
    const approveRes = await request(`/returns/${rma.id}/status`, {
      method: 'PATCH',
      headers: authHeaders,
      body: { status: 'APPROVED' },
    });
    if (approveRes.status !== 200) {
      console.error('Failed to approve RMA:', approveRes.body);
      process.exit(1);
    }
    console.log(`✓ RMA approved: Status is now ${approveRes.body.data.status}`);

    // Step B: Mark IN_TRANSIT
    const transitRes = await request(`/returns/${rma.id}/status`, {
      method: 'PATCH',
      headers: authHeaders,
      body: {
        status: 'IN_TRANSIT',
        reverse_tracking_number: 'REV-CARRIER-12345678',
      },
    });
    if (transitRes.status !== 200) {
      console.error('Failed to update RMA to IN_TRANSIT:', transitRes.body);
      process.exit(1);
    }
    console.log(`✓ RMA in transit: Tracking ${transitRes.body.data.reverse_tracking_number}, Status: ${transitRes.body.data.status}`);

    // Step C: Mark RECEIVED at Facility
    const receivedRes = await request(`/returns/${rma.id}/status`, {
      method: 'PATCH',
      headers: authHeaders,
      body: { status: 'RECEIVED' },
    });
    if (receivedRes.status !== 200) {
      console.error('Failed to mark RMA RECEIVED:', receivedRes.body);
      process.exit(1);
    }
    console.log(`✓ RMA received at facility: Status is now ${receivedRes.body.data.status}`);

    // 6. Test FSM Transition Guard (Invalid jump back to REQUESTED)
    console.log('\n[6] Testing FSM Transition Guard on invalid state rollback...');
    const invalidFsmRes = await request(`/returns/${rma.id}/status`, {
      method: 'PATCH',
      headers: authHeaders,
      body: { status: 'REQUESTED' },
    });
    if (invalidFsmRes.status === 400) {
      console.log(`✓ Invalid FSM transition correctly rejected (400 Bad Request): ${invalidFsmRes.body.message}`);
    } else {
      throw new Error(`Expected 400 for invalid FSM transition, got ${invalidFsmRes.status}`);
    }

    // 7. Get Return by ID & List Returns (GET /returns/:id & GET /returns)
    console.log('\n[7] Querying Return Authorizations (GET /returns/:id & GET /returns)...');
    const getRes = await request(`/returns/${rma.id}`, {
      method: 'GET',
      headers: authHeaders,
    });
    if (getRes.status !== 200) {
      console.error('Failed to get RMA by ID:', getRes.body);
      process.exit(1);
    }
    console.log(`✓ Fetched RMA by ID: Order Number ${getRes.body.data.order_number}, Items: ${getRes.body.data.items.length}`);

    const listRes = await request(`/returns?rma_number=${rma.rma_number}`, {
      method: 'GET',
      headers: authHeaders,
    });
    if (listRes.status !== 200 || !listRes.body.data.length) {
      throw new Error(`Failed to list returns by RMA number: ${JSON.stringify(listRes.body)}`);
    }
    console.log(`✓ Filtered returns list verified: Found ${listRes.body.data.length} match (Total: ${listRes.body.meta.total})`);

    // 8. Warehouse Intake QA Inspection & Automated Stock Restocking (POST /returns/:id/inspect)
    console.log('\n[8] Executing Warehouse Intake QA Inspection & Automated Restocking...');
    const returnItemId = rma.items[0].id;

    // Check stock before inspection
    const invBefore = await pool.query(
      `SELECT on_hand, damaged FROM inventory_items WHERE tenant_id = $1 AND warehouse_id = $2 AND product_id = $3;`,
      [activeTenant.tenant_id, warehouseId, productId]
    );
    const initialOnHand = invBefore.rows[0]?.on_hand || 0;
    console.log(`  - On-hand stock before QA inspection: ${initialOnHand}`);

    const inspectRes = await request(`/returns/${rma.id}/inspect`, {
      method: 'POST',
      headers: authHeaders,
      body: {
        warehouse_id: warehouseId,
        items: [
          {
            return_item_id: returnItemId,
            qa_grade: 'SELLABLE',
          },
        ],
      },
    });

    if (inspectRes.status !== 200) {
      console.error('Failed to inspect and restock RMA:', inspectRes.body);
      process.exit(1);
    }

    const inspectData = inspectRes.body.data;
    console.log(`✓ RMA Inspected successfully: Status is now ${inspectData.return.status}`);
    console.log(`✓ Inspected items: ${inspectData.inspectedItems.length}, QA Grade: ${inspectData.inspectedItems[0].qa_grade}, Restocked: ${inspectData.inspectedItems[0].is_restocked}`);

    // Verify stock incremented by 2
    const invAfter = await pool.query(
      `SELECT on_hand, damaged FROM inventory_items WHERE tenant_id = $1 AND warehouse_id = $2 AND product_id = $3;`,
      [activeTenant.tenant_id, warehouseId, productId]
    );
    const afterOnHand = invAfter.rows[0]?.on_hand || 0;
    console.log(`  - On-hand stock after QA inspection: ${afterOnHand}`);

    if (afterOnHand !== initialOnHand + 2) {
      throw new Error(`Expected on_hand to increase from ${initialOnHand} to ${initialOnHand + 2}, got ${afterOnHand}`);
    }
    console.log(`✓ Automated stock restock verified: Exactly +2 units credited to on_hand inventory`);

    // Verify inventory adjustment ledger
    const adjRes = await pool.query(
      `SELECT * FROM inventory_adjustments WHERE tenant_id = $1 AND warehouse_id = $2 AND product_id = $3 AND reason = 'RMA_RESTOCK';`,
      [activeTenant.tenant_id, warehouseId, productId]
    );
    if (adjRes.rows.length === 0) {
      throw new Error('Expected inventory_adjustments entry for RMA_RESTOCK');
    }
    console.log(`✓ Inventory adjustment audit log verified: ${adjRes.rows[0].reason} (+${adjRes.rows[0].quantity_delta} units)`);

    // 9. Verify Swagger / OpenAPI Coverage
    console.log('\n[9] Verifying Swagger OpenAPI 3.0 Documentation for RMA module...');
    const documentedPaths = Object.keys(swaggerSpec.paths);
    const rmaEndpoints = [
      '/returns',
      '/returns/{id}',
      '/returns/{id}/status',
      '/returns/{id}/inspect',
    ];

    for (const ep of rmaEndpoints) {
      if (documentedPaths.includes(ep)) {
        console.log(`✓ OpenAPI covers endpoint: ${ep}`);
      } else {
        throw new Error(`Missing OpenAPI documentation for endpoint: ${ep}`);
      }
    }

    console.log(`\n✓ Total documented endpoints in Swagger spec: ${documentedPaths.length}`);
    console.log('\n=============================================================');
    console.log('🎉 ALL INTEGRATION TESTS FOR REVERSE LOGISTICS & RMA PASSED!');
    console.log('=============================================================');

    server.close();
    process.exit(0);
  } catch (error) {
    console.error('\n❌ TEST RUN FAILED:', error);
    server.close();
    process.exit(1);
  }
}

runReturnsRmaTests();
