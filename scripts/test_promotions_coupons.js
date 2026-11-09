const app = require('../src/app');
const { pool } = require('../src/infrastructure/database');
const { getRedisClient } = require('../src/config/redis');
const { swaggerSpec } = require('../src/config/swagger');

async function runPromotionsTests() {
  console.log('=== STARTING INTEGRATION TESTS FOR PROMOTIONS, DISCOUNTS & COUPONS MODULE ===\n');

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

    // 2. Create Percentage Discount Promotion
    console.log('\n[2] Creating Percentage Discount Promotion (POST /promotions)...');
    const promoCode1 = `SAVE20-${Date.now().toString().slice(-4)}`;
    const promo1Res = await request('/promotions', {
      method: 'POST',
      headers: authHeaders,
      body: {
        code: promoCode1,
        title: '20% Off Orders Over $50 (Capped at $50)',
        discount_type: 'PERCENTAGE',
        discount_value: 20.0,
        min_order_value: 50.0,
        max_discount_amount: 50.0,
        usage_limit_total: 100,
        usage_limit_per_customer: 1,
        is_active: true,
      },
    });

    if (promo1Res.status !== 201) {
      console.error('Failed to create promotion 1:', promo1Res.body);
      process.exit(1);
    }
    const promo1 = promo1Res.body.data;
    console.log(`✓ Created Promotion: ${promo1.code} (ID: ${promo1.id}, Type: ${promo1.discount_type}, Value: ${promo1.discount_value}%)`);

    // 3. Create Fixed Amount Discount Promotion
    console.log('\n[3] Creating Fixed Amount Promotion (POST /promotions)...');
    const promoCode2 = `FLAT30-${Date.now().toString().slice(-4)}`;
    const promo2Res = await request('/promotions', {
      method: 'POST',
      headers: authHeaders,
      body: {
        code: promoCode2,
        title: '$30 Flat Discount on Orders Over $100',
        discount_type: 'FIXED_AMOUNT',
        discount_value: 30.0,
        min_order_value: 100.0,
        is_active: true,
      },
    });

    if (promo2Res.status !== 201) {
      console.error('Failed to create promotion 2:', promo2Res.body);
      process.exit(1);
    }
    const promo2 = promo2Res.body.data;
    console.log(`✓ Created Promotion: ${promo2.code} (ID: ${promo2.id}, Type: ${promo2.discount_type}, Value: $${promo2.discount_value})`);

    // 4. Duplicate Code Prevention
    console.log('\n[4] Testing Duplicate Promo Code Conflict Guard...');
    const dupRes = await request('/promotions', {
      method: 'POST',
      headers: authHeaders,
      body: {
        code: promoCode1,
        title: 'Duplicate Attempt',
        discount_type: 'PERCENTAGE',
        discount_value: 10.0,
      },
    });
    if (dupRes.status === 409) {
      console.log(`✓ Duplicate code correctly rejected (409 Conflict): ${dupRes.body.message}`);
    } else {
      throw new Error(`Expected 409 for duplicate code, got ${dupRes.status}`);
    }

    // 5. Query & List Promotions (GET /promotions & GET /promotions/:id)
    console.log('\n[5] Querying Promotions (GET /promotions & GET /promotions/:id)...');
    const listRes = await request(`/promotions?search=${promoCode1}`, {
      method: 'GET',
      headers: authHeaders,
    });
    if (listRes.status !== 200 || !listRes.body.data.length) {
      throw new Error(`Failed to list promotions: ${JSON.stringify(listRes.body)}`);
    }
    console.log(`✓ Filtered promotions search found ${listRes.body.data.length} match (Total: ${listRes.body.meta.total})`);

    const getRes = await request(`/promotions/${promo1.id}`, {
      method: 'GET',
      headers: authHeaders,
    });
    if (getRes.status !== 200) {
      throw new Error(`Failed to get promotion by ID: ${JSON.stringify(getRes.body)}`);
    }
    console.log(`✓ Fetched promotion by ID: ${getRes.body.data.title}, Redemptions: ${getRes.body.data.redemptions_count}`);

    // 6. Update Promotion Configuration (PATCH /promotions/:id)
    console.log('\n[6] Updating Promotion Configuration (PATCH /promotions/:id)...');
    const updateRes = await request(`/promotions/${promo1.id}`, {
      method: 'PATCH',
      headers: authHeaders,
      body: {
        title: '20% Off Orders Over $50 (Updated Title)',
      },
    });
    if (updateRes.status !== 200 || updateRes.body.data.title !== '20% Off Orders Over $50 (Updated Title)') {
      throw new Error(`Failed to update promotion: ${JSON.stringify(updateRes.body)}`);
    }
    console.log(`✓ Promotion title successfully updated: ${updateRes.body.data.title}`);

    // 7. Validate & Preview Coupon Application (POST /promotions/validate)
    console.log('\n[7] Testing Coupon Validation Engine (POST /promotions/validate)...');

    // Case A: Minimum order spend not reached ($40 < $50 min)
    const belowMinRes = await request('/promotions/validate', {
      method: 'POST',
      headers: authHeaders,
      body: {
        code: promoCode1,
        order_amount: 40.0,
      },
    });
    if (belowMinRes.status === 400) {
      console.log(`✓ Under min-spend rejected (400 Bad Request): ${belowMinRes.body.message}`);
    } else {
      throw new Error(`Expected 400 for under min spend, got ${belowMinRes.status}`);
    }

    // Case B: Eligible order $200 with 20% = $40 (below $50 cap)
    const validCalcRes1 = await request('/promotions/validate', {
      method: 'POST',
      headers: authHeaders,
      body: {
        code: promoCode1,
        order_amount: 200.0,
      },
    });
    if (validCalcRes1.status !== 200) {
      console.error('Validation failed:', validCalcRes1.body);
      process.exit(1);
    }
    const calc1 = validCalcRes1.body.data;
    console.log(`✓ 20% calculation on $200: Discount = $${calc1.discount_applied}, Net = $${calc1.net_amount}`);
    if (calc1.discount_applied !== 40.0 || calc1.net_amount !== 160.0) {
      throw new Error(`Expected discount $40 and net $160, got ${calc1.discount_applied} / ${calc1.net_amount}`);
    }

    // Case C: Order $350 with 20% = $70 -> Capped at $50 max discount
    const validCalcRes2 = await request('/promotions/validate', {
      method: 'POST',
      headers: authHeaders,
      body: {
        code: promoCode1,
        order_amount: 350.0,
      },
    });
    const calc2 = validCalcRes2.body.data;
    console.log(`✓ 20% calculation on $350 (capped at $50): Discount = $${calc2.discount_applied}, Net = $${calc2.net_amount}`);
    if (calc2.discount_applied !== 50.0 || calc2.net_amount !== 300.0) {
      throw new Error(`Expected discount $50 (capped) and net $300, got ${calc2.discount_applied} / ${calc2.net_amount}`);
    }

    // Case D: Fixed amount promotion on $150 spend -> $30 off
    const validCalcRes3 = await request('/promotions/validate', {
      method: 'POST',
      headers: authHeaders,
      body: {
        code: promoCode2,
        order_amount: 150.0,
      },
    });
    const calc3 = validCalcRes3.body.data;
    console.log(`✓ Fixed $30 calculation on $150: Discount = $${calc3.discount_applied}, Net = $${calc3.net_amount}`);
    if (calc3.discount_applied !== 30.0 || calc3.net_amount !== 120.0) {
      throw new Error(`Expected discount $30 and net $120, got ${calc3.discount_applied} / ${calc3.net_amount}`);
    }

    // 8. Ingest Live Order & Redeem Coupon (POST /promotions/redeem)
    console.log('\n[8] Ingesting Live Order and Redeeming Coupon (POST /promotions/redeem)...');
    
    // Create customer to test per-customer redemption limit
    const custEmail = `shopper_${Date.now()}@example.com`;
    const custRes = await request('/customers', {
      method: 'POST',
      headers: authHeaders,
      body: {
        email: custEmail,
        first_name: 'Diana',
        last_name: 'Prince',
        phone: '+15550192834',
      },
    });
    const customerId = custRes.body.data.id;
    console.log(`✓ Customer created: ${custEmail} (ID: ${customerId})`);

    // Create product
    const sku = `SKU-PROMO-${Date.now().toString().slice(-4)}`;
    const prodRes = await request('/products', {
      method: 'POST',
      headers: authHeaders,
      body: {
        sku,
        name: 'Designer Silk Scarf',
        price_base: 100.0,
        currency: 'USD',
      },
    });
    const productId = prodRes.body.data.id;
    console.log(`✓ Product created: ${sku} (ID: ${productId})`);

    // Ingest order
    const orderRes = await request('/orders', {
      method: 'POST',
      headers: authHeaders,
      body: {
        currency: 'USD',
        customer_id: customerId,
        items: [
          {
            product_id: productId,
            sku,
            title: 'Designer Silk Scarf',
            quantity: 2,
            unit_price: 100.0,
          },
        ],
        shipping_address: {
          name: 'Diana Prince',
          street: '100 Gateway Blvd',
          city: 'Seattle',
          state: 'WA',
          country: 'US',
          postal_code: '98101',
        },
        billing_address: {
          name: 'Diana Prince',
          street: '100 Gateway Blvd',
          city: 'Seattle',
          state: 'WA',
          country: 'US',
          postal_code: '98101',
        },
      },
    });
    const order = orderRes.body.data;
    console.log(`✓ Order Ingested: ${order.order_number} (Total Amount: $${order.total_amount})`);

    // Redeem coupon on order
    const redeemRes = await request('/promotions/redeem', {
      method: 'POST',
      headers: authHeaders,
      body: {
        code: promoCode1,
        order_id: order.id,
        order_amount: 200.0,
        customer_id: customerId,
      },
    });

    if (redeemRes.status !== 201) {
      console.error('Failed to redeem coupon:', redeemRes.body);
      process.exit(1);
    }

    const redeemData = redeemRes.body.data;
    console.log(`✓ Coupon Redeemed:`);
    console.log(`  - Redemption ID: ${redeemData.redemption_id}`);
    console.log(`  - Code: ${redeemData.code}`);
    console.log(`  - Discount Applied: $${redeemData.discount_applied}`);
    console.log(`  - Net Amount: $${redeemData.net_amount}`);

    // Verify order discount_total updated in database
    const ordVerify = await pool.query(
      `SELECT discount_total, total_amount FROM orders WHERE tenant_id = $1 AND id = $2;`,
      [activeTenant.tenant_id, order.id]
    );
    console.log(`✓ Order Financials Updated: discount_total = $${ordVerify.rows[0].discount_total}, total_amount = $${ordVerify.rows[0].total_amount}`);

    // Verify current_redemptions incremented in promotions table
    const promoVerify = await pool.query(
      `SELECT current_redemptions FROM promotions WHERE tenant_id = $1 AND id = $2;`,
      [activeTenant.tenant_id, promo1.id]
    );
    console.log(`✓ Promotion usage count incremented: ${promoVerify.rows[0].current_redemptions}`);
    if (promoVerify.rows[0].current_redemptions !== 1) {
      throw new Error(`Expected current_redemptions to be 1, got ${promoVerify.rows[0].current_redemptions}`);
    }

    // 9. Test Per-Customer Usage Limit Enforcement
    console.log('\n[9] Testing Per-Customer Usage Limit Enforcement...');
    const secondRedeemRes = await request('/promotions/redeem', {
      method: 'POST',
      headers: authHeaders,
      body: {
        code: promoCode1,
        order_id: order.id,
        order_amount: 200.0,
        customer_id: customerId,
      },
    });
    if (secondRedeemRes.status === 400) {
      console.log(`✓ Second redemption by same customer blocked (400 Bad Request): ${secondRedeemRes.body.message}`);
    } else {
      throw new Error(`Expected 400 for exceeding customer usage limit, got ${secondRedeemRes.status}`);
    }

    // 10. Verify Swagger / OpenAPI Coverage
    console.log('\n[10] Verifying Swagger OpenAPI 3.0 Documentation for Promotions Module...');
    const documentedPaths = Object.keys(swaggerSpec.paths);
    const promoEndpoints = [
      '/promotions',
      '/promotions/validate',
      '/promotions/redeem',
      '/promotions/{id}',
    ];

    for (const ep of promoEndpoints) {
      if (documentedPaths.includes(ep)) {
        console.log(`✓ OpenAPI covers endpoint: ${ep}`);
      } else {
        throw new Error(`Missing OpenAPI documentation for endpoint: ${ep}`);
      }
    }

    console.log(`\n✓ Total documented endpoints in Swagger spec: ${documentedPaths.length}`);
    console.log('\n==================================================================');
    console.log('🎉 ALL INTEGRATION TESTS FOR PROMOTIONS & COUPONS PASSED!');
    console.log('==================================================================');

    server.close();
    process.exit(0);
  } catch (error) {
    console.error('\n❌ TEST RUN FAILED:', error);
    server.close();
    process.exit(1);
  }
}

runPromotionsTests();
