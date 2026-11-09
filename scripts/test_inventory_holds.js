const app = require('../src/app');
const { pool } = require('../src/infrastructure/database');
const { getRedisClient } = require('../src/config/redis');
const { swaggerSpec } = require('../src/config/swagger');

async function runInventoryIntegrationTests() {
  console.log('=== STARTING INTEGRATION TESTS FOR REAL-TIME INVENTORY & 15-MIN SOFT HOLDS ===\n');

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
    console.log('\n[2] Setting up Warehouse and Product for stock tests...');
    const whRes = await request('/warehouses', {
      method: 'POST',
      headers: authHeaders,
      body: {
        code: `WH-INV-${Date.now().toString().slice(-4)}`,
        name: 'Inventory Test Hub',
        priority: 1,
        address: { city: 'Bengaluru', country: 'IN', postal_code: '560001' },
      },
    });
    const warehouse = whRes.body.data;
    console.log(`✓ Warehouse Created: ${warehouse.code} (${warehouse.id})`);

    const prodRes = await request('/products', {
      method: 'POST',
      headers: authHeaders,
      body: {
        sku: `SKU-INV-${Date.now()}`,
        name: 'Nexora Concurrency Jacket',
        price_base: 149.99,
        currency: 'USD',
      },
    });
    const product = prodRes.body.data;
    console.log(`✓ Product Created: ${product.sku} (${product.id})`);

    // 3. Adjust Stock Level (Restock 100 units with 10 safety stock)
    console.log('\n[3] Testing Stock Adjustment (POST /inventory/adjust)...');
    const adjustRes = await request('/inventory/adjust', {
      method: 'POST',
      headers: authHeaders,
      body: {
        warehouse_id: warehouse.id,
        product_id: product.id,
        quantity_delta: 100,
        reason: 'RESTOCK',
        safety_stock: 10,
        damaged: 0,
      },
    });

    console.log(`Status: ${adjustRes.status}`);
    if (adjustRes.status !== 201) {
      console.error('Stock adjustment failed:', adjustRes.body);
      process.exit(1);
    }

    const inv = adjustRes.body.data.inventoryItem;
    console.log(`✓ Stock Adjusted: on_hand=${inv.on_hand}, safety_stock=${inv.safety_stock}, ATP=${inv.available_to_promise}`);
    if (inv.on_hand !== 100 || inv.available_to_promise !== 90) {
      console.error('Unexpected inventory numbers!', inv);
      process.exit(1);
    }

    // 4. Query Inventory Levels
    console.log('\n[4] Testing Inventory Listing (GET /inventory)...');
    const listRes = await request(`/inventory?product_id=${product.id}`, {
      method: 'GET',
      headers: authHeaders,
    });

    const items = listRes.body.data;
    console.log(`Status: ${listRes.status}, Total records: ${items.length}`);
    if (listRes.status !== 200 || items.length === 0) {
      console.error('Inventory query failed:', listRes.body);
      process.exit(1);
    }
    const queriedItem = items[0];
    console.log(`✓ Query Verified: Warehouse=${queriedItem.warehouse_code}, Product=${queriedItem.product_sku}, ATP=${queriedItem.available_to_promise}`);

    // 5. Product Cross-Warehouse Summary
    console.log('\n[5] Testing Product Inventory Summary (GET /inventory/:productId)...');
    const summaryRes = await request(`/inventory/${product.id}`, {
      method: 'GET',
      headers: authHeaders,
    });
    console.log(`Status: ${summaryRes.status}`);
    const summary = summaryRes.body.data.summary;
    console.log(`✓ Summary: Total On-Hand=${summary.total_on_hand}, Total ATP=${summary.total_available}`);

    // 6. 15-Minute Soft Hold Reservation
    console.log('\n[6] Testing 15-Minute Soft Hold (POST /inventory/reserve)...');
    const reserveRes = await request('/inventory/reserve', {
      method: 'POST',
      headers: authHeaders,
      body: {
        warehouse_id: warehouse.id,
        product_id: product.id,
        quantity: 15,
        duration_minutes: 15,
      },
    });

    console.log(`Status: ${reserveRes.status}`);
    if (reserveRes.status !== 201) {
      console.error('Reservation failed:', reserveRes.body);
      process.exit(1);
    }
    const reservation = reserveRes.body.data.reservation;
    const invAfterReserve = reserveRes.body.data.inventory;
    console.log(`✓ Soft Hold Reserved: ID=${reservation.id}, Qty=${reservation.quantity}, ExpiresAt=${reservation.expires_at}`);
    console.log(`✓ Inventory After Hold: Reserved=${invAfterReserve.reserved}, ATP Remaining=${invAfterReserve.available_to_promise}`);
    if (invAfterReserve.reserved !== 15 || invAfterReserve.available_to_promise !== 75) {
      console.error('Reservation count mismatch!', invAfterReserve);
      process.exit(1);
    }

    // 7. Concurrency / Overselling Protection Test
    console.log('\n[7] Testing Oversell Protection (Reserve 80 units when only 75 ATP)...');
    const oversellRes = await request('/inventory/reserve', {
      method: 'POST',
      headers: authHeaders,
      body: {
        warehouse_id: warehouse.id,
        product_id: product.id,
        quantity: 80,
      },
    });

    console.log(`Status: ${oversellRes.status} (Expected: 409 Conflict)`);
    if (oversellRes.status === 409) {
      console.log(`✓ Zero Overselling Guaranteed: Rejected with message: "${oversellRes.body.error.message}"`);
    } else {
      console.error('Oversell check failed! Allowed overbooking:', oversellRes.body);
      process.exit(1);
    }

    // 8. Release Soft Hold Reservation
    console.log('\n[8] Testing Soft Hold Release (POST /inventory/reservations/:id/release)...');
    const releaseRes = await request(`/inventory/reservations/${reservation.id}/release`, {
      method: 'POST',
      headers: authHeaders,
    });

    console.log(`Status: ${releaseRes.status}`);
    if (releaseRes.status !== 200) {
      console.error('Reservation release failed:', releaseRes.body);
      process.exit(1);
    }
    console.log(`✓ Reservation Released successfully: Reserved count is now ${releaseRes.body.data.inventory.reserved}`);

    // 9. Expired Hold Sweeper
    console.log('\n[9] Testing Expired Reservation Sweeper (POST /inventory/reservations/release-expired)...');
    const sweeperRes = await request('/inventory/reservations/release-expired', {
      method: 'POST',
      headers: authHeaders,
    });
    console.log(`Status: ${sweeperRes.status}, Released Count: ${sweeperRes.body.data.releasedCount}`);
    console.log('✓ Expired reservation sweeper executed successfully');

    // 10. Swagger Spec Verification
    console.log('\n[10] Verifying OpenAPI / Swagger Spec coverage for Inventory module...');
    const paths = Object.keys(swaggerSpec.paths);
    console.log(`Total Swagger Documented Endpoints in NEXORA: ${paths.length}`);

    const inventoryPaths = [
      '/inventory/adjust',
      '/inventory',
      '/inventory/{productId}',
      '/inventory/reserve',
      '/inventory/reservations/{id}/release',
      '/inventory/reservations/release-expired',
    ];

    const missing = inventoryPaths.filter((reqPath) => !paths.includes(reqPath));
    if (missing.length > 0) {
      console.error('Missing Swagger documentation for:', missing);
      process.exit(1);
    }
    console.log('✓ All 6 Inventory & Soft Hold Endpoints are registered in Swagger UI!');

    console.log('\n=== ALL STEP 3 INVENTORY INTEGRATION TESTS PASSED 100% ===');
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

runInventoryIntegrationTests();

