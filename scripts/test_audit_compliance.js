const app = require('../src/app');
const { swaggerSpec } = require('../src/config/swagger');

async function runAuditComplianceTests() {
  console.log('=== STARTING INTEGRATION TESTS FOR AUDIT LOGGING & COMPLIANCE MODULE ===\n');

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

    // 2. Ingest Audit Record 1 (POST /audit-logs)
    console.log('\n[2] Ingesting price override audit log (POST /audit-logs)...');
    const testResourceId = `PROD-${Date.now()}`;
    const auditRes1 = await request('/audit-logs', {
      method: 'POST',
      headers: authHeaders,
      body: {
        actor_id: user.id,
        actor_type: 'USER',
        action: 'PRICE_OVERRIDE',
        resource_type: 'PRODUCT',
        resource_id: testResourceId,
        diff_payload: {
          previous_price: 150.0,
          new_price: 120.0,
          reason: 'Holiday flash promotion',
        },
        correlation_id: `req_test_${Date.now()}`,
      },
    });

    if (auditRes1.status !== 201) {
      console.error('Failed to create audit log 1:', auditRes1.body);
      process.exit(1);
    }

    const log1 = auditRes1.body.data;
    console.log(`✓ Audit Record 1 Created:`);
    console.log(`  - ID: ${log1.id}`);
    console.log(`  - Action: ${log1.action}`);
    console.log(`  - Resource: [${log1.resource_type}:${log1.resource_id}]`);

    // 3. Query Audit Logs (GET /audit-logs)
    console.log('\n[3] Querying Audit Trail (GET /audit-logs)...');
    const listRes = await request(`/audit-logs?resource_type=PRODUCT&resource_id=${testResourceId}`, {
      method: 'GET',
      headers: authHeaders,
    });

    if (listRes.status !== 200 || !listRes.body.data.length) {
      throw new Error(`Failed to list audit logs: ${JSON.stringify(listRes.body)}`);
    }
    console.log(`✓ Filtered audit list found ${listRes.body.data.length} match (Total: ${listRes.body.meta.total})`);

    // 4. Get Audit Log by ID (GET /audit-logs/:id)
    console.log('\n[4] Fetching Audit Log by ID (GET /audit-logs/:id)...');
    const getRes = await request(`/audit-logs/${log1.id}`, {
      method: 'GET',
      headers: authHeaders,
    });
    if (getRes.status !== 200) {
      throw new Error(`Failed to get audit log by ID: ${JSON.stringify(getRes.body)}`);
    }
    console.log(`✓ Fetched audit record: Actor Email=${getRes.body.data.actor_email}, Action=${getRes.body.data.action}`);

    // 5. Ingest Audit Record 2 for Same Resource
    console.log('\n[5] Ingesting second action for resource timeline verification...');
    const auditRes2 = await request('/audit-logs', {
      method: 'POST',
      headers: authHeaders,
      body: {
        actor_id: user.id,
        actor_type: 'USER',
        action: 'STATUS_CHANGE',
        resource_type: 'PRODUCT',
        resource_id: testResourceId,
        diff_payload: {
          previous_status: 'ACTIVE',
          new_status: 'DISCONTINUED',
        },
      },
    });
    console.log(`✓ Audit Record 2 Created: Action=${auditRes2.body.data.action}`);

    // 6. Get Resource Audit Timeline (GET /audit-logs/resource/:resource_type/:resource_id)
    console.log('\n[6] Fetching Resource Historical Timeline (GET /audit-logs/resource/:type/:id)...');
    const timelineRes = await request(`/audit-logs/resource/PRODUCT/${testResourceId}`, {
      method: 'GET',
      headers: authHeaders,
    });

    if (timelineRes.status !== 200) {
      console.error('Failed to get timeline:', timelineRes.body);
      process.exit(1);
    }

    const timelineData = timelineRes.body.data;
    console.log(`✓ Resource timeline verified: Found ${timelineData.total_events} chronological mutation events`);
    if (timelineData.total_events !== 2) {
      throw new Error(`Expected 2 events in timeline, got ${timelineData.total_events}`);
    }

    // 7. Verify Swagger OpenAPI 3.0 Documentation
    console.log('\n[7] Verifying Swagger OpenAPI 3.0 Documentation for Audit Module...');
    const documentedPaths = Object.keys(swaggerSpec.paths);
    const auditEndpoints = [
      '/audit-logs',
      '/audit-logs/resource/{resource_type}/{resource_id}',
      '/audit-logs/{id}',
    ];

    for (const ep of auditEndpoints) {
      if (documentedPaths.includes(ep)) {
        console.log(`✓ OpenAPI covers endpoint: ${ep}`);
      } else {
        throw new Error(`Missing OpenAPI documentation for endpoint: ${ep}`);
      }
    }

    console.log(`\n✓ Total documented endpoints in Swagger spec: ${documentedPaths.length}`);
    console.log('\n==================================================================');
    console.log('🎉 ALL INTEGRATION TESTS FOR AUDIT LOGGING & COMPLIANCE PASSED!');
    console.log('==================================================================');

    server.close();
    process.exit(0);
  } catch (error) {
    console.error('\n❌ TEST RUN FAILED:', error);
    server.close();
    process.exit(1);
  }
}

runAuditComplianceTests();

