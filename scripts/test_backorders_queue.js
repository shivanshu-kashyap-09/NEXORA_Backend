const app = require('../src/app');
const { pool } = require('../src/infrastructure/database');
const { swaggerSpec } = require('../src/config/swagger');

async function runBackorderTests() {
  console.log('=== STARTING INTEGRATION TESTS FOR PRE-ORDERS & BACKORDER QUEUE MODULE ===\n');

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

    // 2. Setup Warehouse and Out-of-Stock Product
    console.log('\n[2] Setting up warehouse and out-of-stock product...');
    const whCode = `WH-BO-${Date.now().toString().slice(-4)}`;
    const whRes = await request('/warehouses', {
      method: 'POST',
      headers: authHeaders,
      body: {
        code: whCode,
        name: `Backorder Depot ${whCode}`,
        address: {
          line1: '100 Fulfilment Hub Way',
          city: 'Austin',
          state: 'TX',
          postal_code: '78701',
          country: 'USA',
        },
        priority: 1,
        is_active: true,
      },
    });
    const warehouseId = whRes.body.data.id;
    console.log(`✓ Created Warehouse: ${whRes.body.data.name} (ID: ${warehouseId})`);

    const sku = `SKU-BO-${Date.now().toString().slice(-4)}`;
    const prodRes = await request('/products', {
      method: 'POST',
      headers: authHeaders,
      body: {
        sku,
        name: `Pre-Order Gaming Headset ${sku}`,
        price_base: 199.99,
        currency: 'USD',
      },
    });
    const productId = prodRes.body.data.id;
    console.log(`✓ Created Product: ${sku} (ID: ${productId})`);

    // Ingest Order for 2 units
    console.log('\n[3] Ingesting Order for out-of-stock product...');
    const orderRes = await request('/orders', {
      method: 'POST',
      headers: authHeaders,
      body: {
        currency: 'USD',
        items: [
          {
            product_id: productId,
            sku,
            title: `Pre-Order Gaming Headset ${sku}`,
            quantity: 2,
            unit_price: 199.99,
          },
        ],
        shipping_address: {
          name: 'Arthur Pendelton',
          street: '404 Camelot Lane',
          city: 'Austin',
          state: 'TX',
          country: 'US',
          postal_code: '78701',
        },
        billing_address: {
          name: 'Arthur Pendelton',
          street: '404 Camelot Lane',
          city: 'Austin',
          state: 'TX',
          country: 'US',
          postal_code: '78701',
        },
      },
    });
    const order = orderRes.body.data;
    console.log(`✓ Order Ingested: ${order.order_number} (ID: ${order.id}, Status: ${order.status})`);

    // 4. Enqueue into Backorder Queue (POST /backorders)
    console.log('\n[4] Enqueueing into Backorder Priority Queue (POST /backorders)...');
    const boRes = await request('/backorders', {
      method: 'POST',
      headers: authHeaders,
      body: {
        order_id: order.id,
        product_id: productId,
        quantity: 2,
        priority: 1,
      },
    });

    if (boRes.status !== 201) {
      console.error('Failed to enqueue backorder:', boRes.body);
      process.exit(1);
    }

    const backorder = boRes.body.data;
    console.log(`✓ Backorder Enqueued:`);
    console.log(`  - Backorder ID: ${backorder.id}`);
    console.log(`  - Product ID: ${backorder.product_id}`);
    console.log(`  - Quantity: ${backorder.quantity}`);
    console.log(`  - Initial Priority: ${backorder.priority}`);
    console.log(`  - Is Allocated: ${backorder.is_allocated}`);

    // Verify order moved to ON_HOLD
    const ordCheck1 = await request(`/orders/${order.id}`, { method: 'GET', headers: authHeaders });
    console.log(`✓ Order status synchronized to: ${ordCheck1.body.data.status}`);
    if (ordCheck1.body.data.status !== 'ON_HOLD') {
      throw new Error(`Expected order status ON_HOLD, got ${ordCheck1.body.data.status}`);
    }

    // 5. Update Priority Rank (PATCH /backorders/:id/priority)
    console.log('\n[5] Boosting Backorder Priority (PATCH /backorders/:id/priority)...');
    const prioRes = await request(`/backorders/${backorder.id}/priority`, {
      method: 'PATCH',
      headers: authHeaders,
      body: { priority: 5 },
    });
    if (prioRes.status !== 200 || prioRes.body.data.priority !== 5) {
      throw new Error(`Failed to update priority: ${JSON.stringify(prioRes.body)}`);
    }
    console.log(`✓ Backorder priority boosted: Priority is now ${prioRes.body.data.priority} (VIP level)`);

    // 6. Query Backorders Queue (GET /backorders & GET /backorders/:id)
    console.log('\n[6] Querying Backorders Queue (GET /backorders & GET /backorders/:id)...');
    const listRes = await request(`/backorders?product_id=${productId}&is_allocated=false`, {
      method: 'GET',
      headers: authHeaders,
    });
    if (listRes.status !== 200 || !listRes.body.data.length) {
      throw new Error(`Failed to list backorders: ${JSON.stringify(listRes.body)}`);
    }
    console.log(`✓ Filtered backorders verified: Found ${listRes.body.data.length} pending allocation`);

    const getRes = await request(`/backorders/${backorder.id}`, {
      method: 'GET',
      headers: authHeaders,
    });
    if (getRes.status !== 200) {
      throw new Error(`Failed to get backorder by ID: ${JSON.stringify(getRes.body)}`);
    }
    console.log(`✓ Fetched backorder: Order Number: ${getRes.body.data.order_number}, SKU: ${getRes.body.data.sku}`);

    // 7. Seed Fresh Inventory at Warehouse
    console.log('\n[7] Simulating inventory receipt of 10 units at warehouse...');
    await pool.query(
      `
      INSERT INTO inventory_items (tenant_id, warehouse_id, product_id, on_hand, reserved, safety_stock, damaged, updated_at)
      VALUES ($1, $2, $3, 10, 0, 0, 0, NOW())
      ON CONFLICT (tenant_id, warehouse_id, product_id)
      DO UPDATE SET on_hand = 10;
    `,
      [activeTenant.tenant_id, warehouseId, productId]
    );

    // 8. Allocate Available Stock to Backorders (POST /backorders/allocate)
    console.log('\n[8] Triggering Priority Stock Allocation (POST /backorders/allocate)...');
    const allocRes = await request('/backorders/allocate', {
      method: 'POST',
      headers: authHeaders,
      body: {
        product_id: productId,
        warehouse_id: warehouseId,
        quantity: 10,
      },
    });

    if (allocRes.status !== 200) {
      console.error('Allocation failed:', allocRes.body);
      process.exit(1);
    }

    const allocData = allocRes.body.data;
    console.log(`✓ Stock allocation completed:`);
    console.log(`  - Allocated orders count: ${allocData.allocated_count}`);
    console.log(`  - Remaining unallocated stock: ${allocData.remaining_unallocated_stock}`);

    // Verify backorder is marked is_allocated = true
    const checkBo = await request(`/backorders/${backorder.id}`, { method: 'GET', headers: authHeaders });
    console.log(`✓ Backorder queue record updated: is_allocated = ${checkBo.body.data.is_allocated}`);
    if (!checkBo.body.data.is_allocated) {
      throw new Error('Expected backorder item to be allocated');
    }

    // Verify order released to CONFIRMED
    const ordCheck2 = await request(`/orders/${order.id}`, { method: 'GET', headers: authHeaders });
    console.log(`✓ Order released from hold: Status is now ${ordCheck2.body.data.status}`);
    if (ordCheck2.body.data.status !== 'CONFIRMED') {
      throw new Error(`Expected order status CONFIRMED, got ${ordCheck2.body.data.status}`);
    }

    // 9. Verify Swagger OpenAPI 3.0 Documentation
    console.log('\n[9] Verifying Swagger OpenAPI 3.0 Documentation for Backorder Module...');
    const documentedPaths = Object.keys(swaggerSpec.paths);
    const boEndpoints = [
      '/backorders',
      '/backorders/allocate',
      '/backorders/{id}',
      '/backorders/{id}/priority',
    ];

    for (const ep of boEndpoints) {
      if (documentedPaths.includes(ep)) {
        console.log(`✓ OpenAPI covers endpoint: ${ep}`);
      } else {
        throw new Error(`Missing OpenAPI documentation for endpoint: ${ep}`);
      }
    }

    console.log(`\n✓ Total documented endpoints in Swagger spec: ${documentedPaths.length}`);
    console.log('\n==================================================================');
    console.log('🎉 ALL INTEGRATION TESTS FOR PRE-ORDERS & BACKORDERS PASSED!');
    console.log('==================================================================');

    server.close();
    process.exit(0);
  } catch (error) {
    console.error('\n❌ TEST RUN FAILED:', error);
    server.close();
    process.exit(1);
  }
}

runBackorderTests();

