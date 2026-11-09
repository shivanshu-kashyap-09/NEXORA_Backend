const app = require('../src/app');
const { pool } = require('../src/infrastructure/database');
const { getRedisClient } = require('../src/config/redis');
const { swaggerSpec } = require('../src/config/swagger');

async function runPaymentInvoicingTests() {
  console.log('=== STARTING INTEGRATION TESTS FOR PAYMENTS, INVOICING & RECONCILIATION ===\n');

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

    // 2. Setup Product & Ingest Order for Payment Testing
    console.log('\n[2] Setting up order for payment capture...');
    const prodRes = await request('/products', {
      method: 'POST',
      headers: authHeaders,
      body: {
        sku: `SKU-PAY-${Date.now()}`,
        name: 'Aerospace Carbon Helmet',
        price_base: 250.00,
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
            unit_price: 250.00,
            tax_amount: 25.00,
          },
        ],
        shipping_address: {
          name: 'Sam Fisher',
          street: '555 Tech Parkway',
          city: 'Austin',
          state: 'TX',
          country: 'US',
          postal_code: '78701',
        },
        billing_address: {
          name: 'Sam Fisher',
          street: '555 Tech Parkway',
          city: 'Austin',
          state: 'TX',
          country: 'US',
          postal_code: '78701',
        },
        shipping_total: 10.00,
      },
    });
    const order = orderRes.body.data;
    console.log(`✓ Order Created: ${order.order_number} [Total: $${order.total_amount}] Initial Status: ${order.status}`);

    // 3. Process Captured Payment
    console.log('\n[3] Testing Payment Processing & Auto-Capture (POST /payments)...');
    const payIdempKey = `idemp_pay_${Date.now()}`;
    const payRes = await request('/payments', {
      method: 'POST',
      headers: authHeaders,
      body: {
        order_id: order.id,
        payment_method: 'CREDIT_CARD',
        gateway: 'STRIPE',
        gateway_transaction_id: `ch_stripe_${Date.now()}`,
        amount: Number(order.total_amount),
        currency: 'USD',
        idempotency_key: payIdempKey,
        auto_capture: true,
      },
    });

    console.log(`Status: ${payRes.status}`);
    if (payRes.status !== 201) {
      console.error('Payment processing failed:', payRes.body);
      process.exit(1);
    }
    const payment = payRes.body.data.payment;
    console.log(`✓ Payment Processed: ID=${payment.id}, Amount=$${payment.amount}, Status=${payment.status}`);
    if (payRes.body.data.invoice) {
      console.log(`✓ Legal Tax Invoice Auto-Generated: ${payRes.body.data.invoice.invoice_number}`);
    }

    // 4. Verify Order Status Advanced to CONFIRMED
    console.log('\n[4] Verifying Order Status updated upon payment capture...');
    const checkOrderRes = await request(`/orders/${order.id}`, {
      method: 'GET',
      headers: authHeaders,
    });
    console.log(`✓ Order Status is now: ${checkOrderRes.body.data.status}, Payment Status: ${checkOrderRes.body.data.payment_status}`);
    if (checkOrderRes.body.data.status !== 'CONFIRMED' || checkOrderRes.body.data.payment_status !== 'CAPTURED') {
      console.error('Order status did not advance properly upon payment capture!', checkOrderRes.body);
      process.exit(1);
    }

    // 5. Test Payment Idempotency
    console.log('\n[5] Testing Payment Idempotency...');
    const idempPayRes = await request('/payments', {
      method: 'POST',
      headers: authHeaders,
      body: {
        order_id: order.id,
        payment_method: 'CREDIT_CARD',
        gateway: 'STRIPE',
        amount: Number(order.total_amount),
        currency: 'USD',
        idempotency_key: payIdempKey,
        auto_capture: true,
      },
    });
    if (idempPayRes.body.data.id === payment.id) {
      console.log(`✓ Payment Idempotency Verified: Re-returned payment ID ${payment.id} without double charge!`);
    } else {
      console.error('Idempotency failed!', idempPayRes.body);
      process.exit(1);
    }

    // 6. Tax Invoice Retrieval
    console.log('\n[6] Testing Tax Invoice Retrieval (GET /payments/orders/:orderId/invoice)...');
    const invRes = await request(`/payments/orders/${order.id}/invoice`, {
      method: 'GET',
      headers: authHeaders,
    });
    console.log(`Status: ${invRes.status}`);
    if (invRes.status !== 200) {
      console.error('Invoice retrieval failed:', invRes.body);
      process.exit(1);
    }
    console.log(`✓ Invoice Retrieved: Number=${invRes.body.data.invoice_number}, Total=$${invRes.body.data.total_amount}`);

    // 7. Partial Refund ($50.00)
    console.log('\n[7] Testing Partial Refund (POST /payments/:id/refunds)...');
    const partialRefundRes = await request(`/payments/${payment.id}/refunds`, {
      method: 'POST',
      headers: authHeaders,
      body: {
        amount: 50.00,
        reason: 'Courtesy discount refund',
        gateway_refund_id: `re_stripe_${Date.now()}`,
      },
    });
    console.log(`Status: ${partialRefundRes.status}`);
    if (partialRefundRes.status !== 201) {
      console.error('Partial refund failed:', partialRefundRes.body);
      process.exit(1);
    }
    const partialData = partialRefundRes.body.data;
    console.log(`✓ Partial Refund Issued: Amount=$${partialData.refund.amount}, PaymentStatus=${partialData.paymentStatus}`);
    console.log(`✓ Remaining Balance: $${partialData.remainingBalance}`);

    // 8. Excessive Refund Rejection Test
    console.log('\n[8] Testing Excessive Refund Guard (Attempting $300 refund when balance is $235)...');
    const excessRefundRes = await request(`/payments/${payment.id}/refunds`, {
      method: 'POST',
      headers: authHeaders,
      body: {
        amount: 300.00,
        reason: 'Illegal excessive refund',
      },
    });
    console.log(`Status: ${excessRefundRes.status} (Expected: 400 Bad Request)`);
    if (excessRefundRes.status === 400) {
      console.log(`✓ Excessive Refund Blocked: "${excessRefundRes.body.error.message}"`);
    } else {
      console.error('Excessive refund was unexpectedly allowed!', excessRefundRes.body);
      process.exit(1);
    }

    // 9. Full Refund of Remaining Balance ($235.00)
    console.log('\n[9] Testing Full Refund Remainder ($235.00)...');
    const fullRefundRes = await request(`/payments/${payment.id}/refunds`, {
      method: 'POST',
      headers: authHeaders,
      body: {
        amount: partialData.remainingBalance,
        reason: 'Full order cancellation and return',
      },
    });
    console.log(`Status: ${fullRefundRes.status}`);
    const fullData = fullRefundRes.body.data;
    console.log(`✓ Remainder Refunded: PaymentStatus=${fullData.paymentStatus}, RemainingBalance=$${fullData.remainingBalance}`);
    if (fullData.paymentStatus !== 'REFUNDED') {
      console.error('Payment did not reach REFUNDED state!', fullData);
      process.exit(1);
    }

    // 10. Financial Settlement Reconciliation
    console.log('\n[10] Testing Gateway Settlement Reconciliation (POST /payments/reconciliations)...');
    const reconRes = await request('/payments/reconciliations', {
      method: 'POST',
      headers: authHeaders,
      body: {
        gateway: 'STRIPE',
        settlement_id: `set_stripe_${Date.now()}`,
        total_expected: 15400.00,
        total_settled: 15400.00,
      },
    });
    console.log(`Status: ${reconRes.status}`);
    if (reconRes.status !== 201) {
      console.error('Reconciliation failed:', reconRes.body);
      process.exit(1);
    }
    const recon = reconRes.body.data;
    console.log(`✓ Reconciliation Recorded: ${recon.settlement_id} Discrepancy=$${recon.discrepancy} Status=${recon.status}`);

    // Discrepancy test
    const discReconRes = await request('/payments/reconciliations', {
      method: 'POST',
      headers: authHeaders,
      body: {
        gateway: 'STRIPE',
        settlement_id: `set_stripe_disc_${Date.now()}`,
        total_expected: 10000.00,
        total_settled: 9850.00, // $150 missing
      },
    });
    console.log(`✓ Discrepancy Report Recorded: Discrepancy=$${discReconRes.body.data.discrepancy} Status=${discReconRes.body.data.status}`);

    // 11. Swagger OpenAPI Coverage
    console.log('\n[11] Verifying OpenAPI / Swagger Spec coverage for Payments module...');
    const paths = Object.keys(swaggerSpec.paths);
    console.log(`Total Swagger Documented Endpoints in NEXORA: ${paths.length}`);

    const expectedPaymentPaths = [
      '/payments',
      '/payments/{id}',
      '/payments/{id}/capture',
      '/payments/{id}/refunds',
      '/payments/orders/{orderId}/invoice',
      '/payments/reconciliations',
    ];

    const missing = expectedPaymentPaths.filter((p) => !paths.includes(p));
    if (missing.length > 0) {
      console.error('Missing Swagger documentation for:', missing);
      process.exit(1);
    }
    console.log('✓ All 6 Payment, Invoicing & Reconciliation Endpoint Paths are fully registered in Swagger UI!');

    console.log('\n=== ALL STEP 6 PAYMENTS & INVOICING TESTS PASSED 100% ===');
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

runPaymentInvoicingTests();

