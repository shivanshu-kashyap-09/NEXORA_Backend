const app = require('../src/app');
const { pool } = require('../src/infrastructure/database');
const { swaggerSpec } = require('../src/config/swagger');

async function runVendorPoTests() {
  console.log('=== STARTING INTEGRATION TESTS FOR VENDOR & PURCHASE ORDERS MODULE ===\n');

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
    console.log('\n[2] Setting up receiving warehouse and product catalog...');
    const whCode = `WH-PO-${Date.now().toString().slice(-4)}`;
    const whRes = await request('/warehouses', {
      method: 'POST',
      headers: authHeaders,
      body: {
        code: whCode,
        name: `Receiving Inbound Dock ${whCode}`,
        address: {
          line1: '789 Logistics Way',
          city: 'Chicago',
          state: 'IL',
          postal_code: '60601',
          country: 'USA',
        },
        priority: 1,
        is_active: true,
      },
    });
    const warehouseId = whRes.body.data.id;
    console.log(`✓ Created Receiving Warehouse: ${whRes.body.data.name} (ID: ${warehouseId})`);

    const sku = `SKU-PO-${Date.now().toString().slice(-4)}`;
    const prodRes = await request('/products', {
      method: 'POST',
      headers: authHeaders,
      body: {
        sku,
        name: `Replenishment Widget ${sku}`,
        price_base: 49.99,
        currency: 'USD',
      },
    });
    const productId = prodRes.body.data.id;
    console.log(`✓ Created Product: ${sku} (ID: ${productId})`);

    // 3. Register Vendor (POST /vendors)
    console.log('\n[3] Registering 3rd-Party Vendor (POST /vendors)...');
    const vendorCode = `VEND-${Date.now().toString().slice(-4)}`;
    const vendorRes = await request('/vendors', {
      method: 'POST',
      headers: authHeaders,
      body: {
        code: vendorCode,
        name: `Acme Global Supplies ${vendorCode}`,
        email: `supply_${vendorCode.toLowerCase()}@acme.com`,
        phone: '+14155552671',
        commission_percentage: 10.0,
        is_active: true,
      },
    });

    if (vendorRes.status !== 201) {
      console.error('Failed to register vendor:', vendorRes.body);
      process.exit(1);
    }
    const vendor = vendorRes.body.data;
    console.log(`✓ Registered Vendor: ${vendor.name} (Code: ${vendor.code}, ID: ${vendor.id})`);

    // 4. Duplicate Code Guard
    console.log('\n[4] Testing Duplicate Vendor Code Conflict Guard...');
    const dupRes = await request('/vendors', {
      method: 'POST',
      headers: authHeaders,
      body: {
        code: vendorCode,
        name: 'Duplicate Vendor',
        email: 'dup@acme.com',
      },
    });
    if (dupRes.status === 409) {
      console.log(`✓ Duplicate vendor code correctly rejected (409 Conflict): ${dupRes.body.message}`);
    } else {
      throw new Error(`Expected 409 for duplicate vendor code, got ${dupRes.status}`);
    }

    // 5. Query & List Vendors
    console.log('\n[5] Querying Vendors (GET /vendors & GET /vendors/:id)...');
    const listVendorsRes = await request(`/vendors?search=${vendorCode}`, {
      method: 'GET',
      headers: authHeaders,
    });
    if (listVendorsRes.status !== 200 || !listVendorsRes.body.data.length) {
      throw new Error(`Failed to list vendors: ${JSON.stringify(listVendorsRes.body)}`);
    }
    console.log(`✓ Filtered vendors list verified: Found ${listVendorsRes.body.data.length} match`);

    const getVendorRes = await request(`/vendors/${vendor.id}`, {
      method: 'GET',
      headers: authHeaders,
    });
    if (getVendorRes.status !== 200) {
      throw new Error(`Failed to get vendor by ID: ${JSON.stringify(getVendorRes.body)}`);
    }
    console.log(`✓ Fetched vendor details: ${getVendorRes.body.data.name}, Total POs: ${getVendorRes.body.data.po_count}`);

    // 6. Create Purchase Order (POST /purchase-orders)
    console.log('\n[6] Issuing Purchase Order (POST /purchase-orders)...');
    const poNumber = `PO-${Date.now().toString().slice(-6)}`;
    const poRes = await request('/purchase-orders', {
      method: 'POST',
      headers: authHeaders,
      body: {
        vendor_id: vendor.id,
        po_number: poNumber,
        total_cost: 2500.0,
        expected_delivery_date: '2026-11-30',
      },
    });

    if (poRes.status !== 201) {
      console.error('Failed to create PO:', poRes.body);
      process.exit(1);
    }
    const po = poRes.body.data;
    console.log(`✓ Purchase Order Issued:`);
    console.log(`  - PO Number: ${po.po_number}`);
    console.log(`  - Status: ${po.status}`);
    console.log(`  - Total Cost: $${po.total_cost}`);

    // 7. Query Purchase Orders (GET /purchase-orders & GET /purchase-orders/:id)
    console.log('\n[7] Querying Purchase Orders (GET /purchase-orders & GET /purchase-orders/:id)...');
    const listPoRes = await request(`/purchase-orders?vendor_id=${vendor.id}`, {
      method: 'GET',
      headers: authHeaders,
    });
    if (listPoRes.status !== 200 || !listPoRes.body.data.length) {
      throw new Error(`Failed to list purchase orders: ${JSON.stringify(listPoRes.body)}`);
    }
    console.log(`✓ Filtered POs list verified: Found ${listPoRes.body.data.length} PO for vendor`);

    const getPoRes = await request(`/purchase-orders/${po.id}`, {
      method: 'GET',
      headers: authHeaders,
    });
    if (getPoRes.status !== 200) {
      throw new Error(`Failed to fetch PO by ID: ${JSON.stringify(getPoRes.body)}`);
    }
    console.log(`✓ Fetched PO: ${getPoRes.body.data.po_number}, Vendor: ${getPoRes.body.data.vendor_name}`);

    // 8. Receive Purchase Order Goods & Verify Auto-Stocking (POST /purchase-orders/:id/receive)
    console.log('\n[8] Receiving Inbound PO Delivery & Auto-Stocking (POST /purchase-orders/:id/receive)...');
    
    // Check initial stock
    const stockBefore = await pool.query(
      `SELECT on_hand FROM inventory_items WHERE tenant_id = $1 AND warehouse_id = $2 AND product_id = $3;`,
      [activeTenant.tenant_id, warehouseId, productId]
    );
    const initialOnHand = stockBefore.rows[0]?.on_hand || 0;
    console.log(`  - On-hand stock before PO receipt: ${initialOnHand}`);

    const receiveRes = await request(`/purchase-orders/${po.id}/receive`, {
      method: 'POST',
      headers: authHeaders,
      body: {
        warehouse_id: warehouseId,
        items: [
          {
            product_id: productId,
            quantity_received: 50,
          },
        ],
      },
    });

    if (receiveRes.status !== 200) {
      console.error('Failed to receive PO:', receiveRes.body);
      process.exit(1);
    }

    const receiveData = receiveRes.body.data;
    console.log(`✓ Purchase Order received successfully: Status is now ${receiveData.purchase_order.status}`);
    console.log(`  - Received items count: ${receiveData.received_items.length}, Qty: ${receiveData.received_items[0].quantity_received}`);

    // Verify stock incremented by 50
    const stockAfter = await pool.query(
      `SELECT on_hand FROM inventory_items WHERE tenant_id = $1 AND warehouse_id = $2 AND product_id = $3;`,
      [activeTenant.tenant_id, warehouseId, productId]
    );
    const afterOnHand = stockAfter.rows[0]?.on_hand || 0;
    console.log(`  - On-hand stock after PO receipt: ${afterOnHand}`);

    if (afterOnHand !== initialOnHand + 50) {
      throw new Error(`Expected on_hand to increase from ${initialOnHand} to ${initialOnHand + 50}, got ${afterOnHand}`);
    }
    console.log(`✓ Auto-stocking verified: Exactly +50 units credited to on_hand inventory`);

    // Verify inventory adjustment ledger
    const adjRes = await pool.query(
      `SELECT * FROM inventory_adjustments WHERE tenant_id = $1 AND warehouse_id = $2 AND product_id = $3 AND reason = 'PO_RECEIPT';`,
      [activeTenant.tenant_id, warehouseId, productId]
    );
    if (adjRes.rows.length === 0) {
      throw new Error('Expected inventory_adjustments entry for PO_RECEIPT');
    }
    console.log(`✓ Inventory adjustment ledger verified: ${adjRes.rows[0].reason} (+${adjRes.rows[0].quantity_delta} units)`);

    // Test duplicate receive rejection
    const dupReceiveRes = await request(`/purchase-orders/${po.id}/receive`, {
      method: 'POST',
      headers: authHeaders,
      body: {
        warehouse_id: warehouseId,
        items: [{ product_id: productId, quantity_received: 50 }],
      },
    });
    if (dupReceiveRes.status === 400) {
      console.log(`✓ Duplicate PO receive correctly blocked (400 Bad Request): ${dupReceiveRes.body.message}`);
    } else {
      throw new Error(`Expected 400 for receiving already completed PO, got ${dupReceiveRes.status}`);
    }

    // 9. Verify Swagger OpenAPI 3.0 Documentation
    console.log('\n[9] Verifying Swagger OpenAPI 3.0 Documentation for Vendor & PO Module...');
    const documentedPaths = Object.keys(swaggerSpec.paths);
    const vendorEndpoints = [
      '/vendors',
      '/vendors/{id}',
      '/purchase-orders',
      '/purchase-orders/{id}',
      '/purchase-orders/{id}/receive',
    ];

    for (const ep of vendorEndpoints) {
      if (documentedPaths.includes(ep)) {
        console.log(`✓ OpenAPI covers endpoint: ${ep}`);
      } else {
        throw new Error(`Missing OpenAPI documentation for endpoint: ${ep}`);
      }
    }

    console.log(`\n✓ Total documented endpoints in Swagger spec: ${documentedPaths.length}`);
    console.log('\n==================================================================');
    console.log('🎉 ALL INTEGRATION TESTS FOR VENDORS & PURCHASE ORDERS PASSED!');
    console.log('==================================================================');

    server.close();
    process.exit(0);
  } catch (error) {
    console.error('\n❌ TEST RUN FAILED:', error);
    server.close();
    process.exit(1);
  }
}

runVendorPoTests();
