const app = require('../src/app');
const { swaggerSpec } = require('../src/config/swagger');

async function runReportingTests() {
  console.log('=== STARTING INTEGRATION TESTS FOR REPORTING & ANALYTICS MODULE ===\n');

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

    // 2. Test Sales & Revenue Summary (GET /reports/sales-summary)
    console.log('\n[2] Fetching Sales & Revenue Summary (GET /reports/sales-summary)...');
    const salesRes = await request('/reports/sales-summary', {
      method: 'GET',
      headers: authHeaders,
    });

    if (salesRes.status !== 200) {
      console.error('Sales summary failed:', salesRes.body);
      process.exit(1);
    }

    const sales = salesRes.body.data;
    console.log(`✓ Sales Summary Metrics:`);
    console.log(`  - Total Orders: ${sales.total_orders}`);
    console.log(`  - Gross Revenue: $${sales.gross_revenue}`);
    console.log(`  - Total Discounts: $${sales.total_discounts}`);
    console.log(`  - Average Order Value (AOV): $${sales.average_order_value}`);

    // 3. Test Inventory Valuation (GET /reports/inventory-valuation)
    console.log('\n[3] Fetching Inventory Valuation (GET /reports/inventory-valuation)...');
    const invRes = await request('/reports/inventory-valuation', {
      method: 'GET',
      headers: authHeaders,
    });

    if (invRes.status !== 200) {
      console.error('Inventory valuation failed:', invRes.body);
      process.exit(1);
    }

    const inv = invRes.body.data;
    console.log(`✓ Inventory Valuation Metrics:`);
    console.log(`  - Grand Total On-Hand Units: ${inv.grand_total_units}`);
    console.log(`  - Grand Total Asset Valuation: $${inv.grand_total_valuation}`);
    console.log(`  - Warehouses Reported: ${inv.warehouses.length}`);

    // 4. Test Return Rates & Defect Breakdown (GET /reports/return-rates)
    console.log('\n[4] Fetching Return Rates & Defects (GET /reports/return-rates)...');
    const returnsRes = await request('/reports/return-rates', {
      method: 'GET',
      headers: authHeaders,
    });

    if (returnsRes.status !== 200) {
      console.error('Return rates failed:', returnsRes.body);
      process.exit(1);
    }

    const rma = returnsRes.body.data;
    console.log(`✓ Return Rates Metrics:`);
    console.log(`  - Total Returns: ${rma.total_returns}`);
    console.log(`  - Return Rate: ${rma.return_rate_percentage}%`);
    console.log(`  - Reasons Analyzed: ${rma.reasons_breakdown.length}`);

    // 5. Test Sales Channel Performance (GET /reports/channel-breakdown)
    console.log('\n[5] Fetching Sales Channel Performance (GET /reports/channel-breakdown)...');
    const chanRes = await request('/reports/channel-breakdown', {
      method: 'GET',
      headers: authHeaders,
    });

    if (chanRes.status !== 200) {
      console.error('Channel performance failed:', chanRes.body);
      process.exit(1);
    }

    console.log(`✓ Channel Performance Metrics: Found ${chanRes.body.data.length} sales channel(s)`);

    // 6. Verify Swagger OpenAPI 3.0 Documentation
    console.log('\n[6] Verifying Swagger OpenAPI 3.0 Documentation for Reporting Module...');
    const documentedPaths = Object.keys(swaggerSpec.paths);
    const reportEndpoints = [
      '/reports/sales-summary',
      '/reports/inventory-valuation',
      '/reports/return-rates',
      '/reports/channel-breakdown',
    ];

    for (const ep of reportEndpoints) {
      if (documentedPaths.includes(ep)) {
        console.log(`✓ OpenAPI covers endpoint: ${ep}`);
      } else {
        throw new Error(`Missing OpenAPI documentation for endpoint: ${ep}`);
      }
    }

    console.log(`\n✓ Total documented endpoints in Swagger spec: ${documentedPaths.length}`);
    console.log('\n==================================================================');
    console.log('🎉 ALL INTEGRATION TESTS FOR REPORTING & ANALYTICS PASSED!');
    console.log('==================================================================');

    server.close();
    process.exit(0);
  } catch (error) {
    console.error('\n❌ TEST RUN FAILED:', error);
    server.close();
    process.exit(1);
  }
}

runReportingTests();

