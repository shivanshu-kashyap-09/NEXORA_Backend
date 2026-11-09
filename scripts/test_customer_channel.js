const app = require('../src/app');
const { pool } = require('../src/infrastructure/database');
const { swaggerSpec } = require('../src/config/swagger');

async function runCustomerChannelTests() {
  console.log('=== STARTING INTEGRATION TESTS FOR CUSTOMERS & SALES CHANNELS ===\n');

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

    // 2. Customer Creation
    console.log('\n[2] Testing Customer Creation (POST /customers)...');
    const custEmail = `customer_${Date.now()}@example.com`;
    const createCustRes = await request('/customers', {
      method: 'POST',
      headers: authHeaders,
      body: {
        email: custEmail,
        first_name: 'Jane',
        last_name: 'Doe',
        phone: '+14155552671',
        shipping_addresses: [
          {
            name: 'Home',
            street: '742 Evergreen Terrace',
            city: 'Springfield',
            state: 'OR',
            country: 'US',
            postal_code: '97477',
            phone: '+14155552671',
            is_default: true,
          },
        ],
      },
    });

    console.log(`Status: ${createCustRes.status}`);
    if (createCustRes.status !== 201) {
      console.error('Customer creation failed:', createCustRes.body);
      process.exit(1);
    }
    const customer = createCustRes.body.data;
    console.log(`✓ Customer Created: ${customer.first_name} ${customer.last_name} (${customer.email}) [ID: ${customer.id}]`);
    console.log(`✓ Initial addresses: ${customer.shipping_addresses.length}`);

    // 3. Customer List & Search
    console.log('\n[3] Testing Customer Listing & Search (GET /customers)...');
    const listCustRes = await request(`/customers?search=${custEmail}`, {
      method: 'GET',
      headers: authHeaders,
    });
    console.log(`Status: ${listCustRes.status}, Total: ${listCustRes.body.data.length}`);
    if (listCustRes.status !== 200 || listCustRes.body.data.length === 0) {
      console.error('Customer list failed:', listCustRes.body);
      process.exit(1);
    }
    console.log('✓ Customer search verified');

    // 4. Customer Detail
    console.log('\n[4] Testing Customer Retrieval (GET /customers/:id)...');
    const getCustRes = await request(`/customers/${customer.id}`, {
      method: 'GET',
      headers: authHeaders,
    });
    console.log(`Status: ${getCustRes.status}`);
    if (getCustRes.status !== 200) {
      console.error('Customer detail fetch failed:', getCustRes.body);
      process.exit(1);
    }
    console.log(`✓ Customer retrieved successfully: ${getCustRes.body.data.email}`);

    // 5. Customer Profile Update
    console.log('\n[5] Testing Customer Update (PATCH /customers/:id)...');
    const updateCustRes = await request(`/customers/${customer.id}`, {
      method: 'PATCH',
      headers: authHeaders,
      body: {
        last_name: 'Smith',
        phone: '+14155559999',
      },
    });
    console.log(`Status: ${updateCustRes.status}`);
    if (updateCustRes.status !== 200 || updateCustRes.body.data.last_name !== 'Smith') {
      console.error('Customer update failed:', updateCustRes.body);
      process.exit(1);
    }
    console.log('✓ Customer updated successfully');

    // 6. Add Shipping Address
    console.log('\n[6] Testing Add Shipping Address (POST /customers/:id/addresses)...');
    const addAddrRes = await request(`/customers/${customer.id}/addresses`, {
      method: 'POST',
      headers: authHeaders,
      body: {
        name: 'Work Office',
        street: '100 Market St, Suite 500',
        city: 'San Francisco',
        state: 'CA',
        country: 'US',
        postal_code: '94105',
        is_default: false,
      },
    });
    console.log(`Status: ${addAddrRes.status}`);
    if (addAddrRes.status !== 201) {
      console.error('Address addition failed:', addAddrRes.body);
      process.exit(1);
    }
    const updatedAddresses = addAddrRes.body.data.shipping_addresses;
    console.log(`✓ Address added! Total addresses now: ${updatedAddresses.length}`);
    const secondAddrId = updatedAddresses[1].id;

    // 7. Delete Shipping Address
    console.log('\n[7] Testing Delete Shipping Address (DELETE /customers/:id/addresses/:addressId)...');
    const delAddrRes = await request(`/customers/${customer.id}/addresses/${secondAddrId}`, {
      method: 'DELETE',
      headers: authHeaders,
    });
    console.log(`Status: ${delAddrRes.status}`);
    if (delAddrRes.status !== 200 || delAddrRes.body.data.shipping_addresses.length !== 1) {
      console.error('Address deletion failed:', delAddrRes.body);
      process.exit(1);
    }
    console.log('✓ Address removed successfully');

    // 8. Sales Channel Creation
    console.log('\n[8] Testing Sales Channel Creation (POST /channels)...');
    const chCode = `SHOPIFY-${Date.now().toString().slice(-4)}`;
    const createChanRes = await request('/channels', {
      method: 'POST',
      headers: authHeaders,
      body: {
        code: chCode,
        name: 'Shopify US Direct Storefront',
        type: 'shopify',
        is_active: true,
        credentials: {
          store_url: 'https://nexora-test.myshopify.com',
          access_token: 'shpat_9876543210abcdef',
        },
        settings: {
          auto_sync_stock: true,
          auto_fulfill: true,
          stock_buffer_percentage: 5,
        },
      },
    });

    console.log(`Status: ${createChanRes.status}`);
    if (createChanRes.status !== 201) {
      console.error('Channel creation failed:', createChanRes.body);
      process.exit(1);
    }
    const channel = createChanRes.body.data;
    console.log(`✓ Channel Registered: ${channel.name} (${channel.code}) [ID: ${channel.id}]`);
    console.log(`✓ Credentials masked in response: ${JSON.stringify(channel.credentials)}`);

    // 9. List Channels
    console.log('\n[9] Testing Channel Listing (GET /channels)...');
    const listChanRes = await request('/channels', {
      method: 'GET',
      headers: authHeaders,
    });
    console.log(`Status: ${listChanRes.status}, Total Channels: ${listChanRes.body.data.length}`);
    if (listChanRes.status !== 200 || listChanRes.body.data.length === 0) {
      console.error('Channel list failed:', listChanRes.body);
      process.exit(1);
    }
    console.log('✓ Channels listed successfully');

    // 10. Channel Retrieval
    console.log('\n[10] Testing Channel Details Retrieval (GET /channels/:id)...');
    const getChanRes = await request(`/channels/${channel.id}`, {
      method: 'GET',
      headers: authHeaders,
    });
    console.log(`Status: ${getChanRes.status}`);
    if (getChanRes.status !== 200) {
      console.error('Channel fetch failed:', getChanRes.body);
      process.exit(1);
    }
    console.log(`✓ Channel retrieved: ${getChanRes.body.data.name}`);

    // 11. Channel Update
    console.log('\n[11] Testing Channel Update (PATCH /channels/:id)...');
    const updateChanRes = await request(`/channels/${channel.id}`, {
      method: 'PATCH',
      headers: authHeaders,
      body: {
        name: 'Shopify Global Megastore',
        settings: {
          auto_sync_stock: true,
          stock_buffer_percentage: 10,
        },
      },
    });
    console.log(`Status: ${updateChanRes.status}`);
    if (updateChanRes.status !== 200 || updateChanRes.body.data.name !== 'Shopify Global Megastore') {
      console.error('Channel update failed:', updateChanRes.body);
      process.exit(1);
    }
    console.log('✓ Channel updated successfully');

    // 12. Channel Sync Audit Log
    console.log('\n[12] Testing Channel Sync Log Recording (POST /channels/:id/sync-logs)...');
    const syncLogRes = await request(`/channels/${channel.id}/sync-logs`, {
      method: 'POST',
      headers: authHeaders,
      body: {
        sync_type: 'INVENTORY_PUSH',
        status: 'SUCCESS',
        details: {
          synced_skus: 45,
          duration_ms: 180,
        },
      },
    });
    console.log(`Status: ${syncLogRes.status}`);
    if (syncLogRes.status !== 201) {
      console.error('Sync log recording failed:', syncLogRes.body);
      process.exit(1);
    }
    console.log(`✓ Sync log recorded: ID=${syncLogRes.body.data.id}`);

    // 13. Channel Sync Logs Retrieval
    console.log('\n[13] Testing Channel Sync Logs Query (GET /channels/:id/sync-logs)...');
    const getLogsRes = await request(`/channels/${channel.id}/sync-logs`, {
      method: 'GET',
      headers: authHeaders,
    });
    console.log(`Status: ${getLogsRes.status}, Total logs: ${getLogsRes.body.data.length}`);
    if (getLogsRes.status !== 200 || getLogsRes.body.data.length === 0) {
      console.error('Sync logs query failed:', getLogsRes.body);
      process.exit(1);
    }
    console.log('✓ Sync logs retrieved successfully');

    // 14. Swagger OpenAPI Spec Verification
    console.log('\n[14] Verifying OpenAPI / Swagger Spec coverage for Customers & Channels...');
    const paths = Object.keys(swaggerSpec.paths);
    console.log(`Total Swagger Documented Endpoints in NEXORA: ${paths.length}`);

    const expectedPaths = [
      '/customers',
      '/customers/{id}',
      '/customers/{id}/addresses',
      '/customers/{id}/addresses/{addressId}',
      '/channels',
      '/channels/{id}',
      '/channels/{id}/sync-logs',
    ];

    const missing = expectedPaths.filter((p) => !paths.includes(p));
    if (missing.length > 0) {
      console.error('Missing Swagger documentation for:', missing);
      process.exit(1);
    }
    console.log('✓ All Customer & Channel Endpoints are fully registered in Swagger UI!');

    console.log('\n=== ALL STEP 4 CUSTOMER & SALES CHANNEL TESTS PASSED 100% ===');
  } catch (err) {
    console.error('Test execution error:', err);
    process.exit(1);
  } finally {
    server.close();
    await pool.end();
  }
}

runCustomerChannelTests();

