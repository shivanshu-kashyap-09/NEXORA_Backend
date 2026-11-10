const app = require('../src/app');
const { pool } = require('../src/infrastructure/database');
const { getRedisClient } = require('../src/config/redis');
const { swaggerSpec } = require('../src/config/swagger');

async function runOutboxTests() {
  console.log('=== STARTING INTEGRATION TESTS FOR TRANSACTIONAL OUTBOX & EVENT BUS ===\n');

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

    // 2. Ingest Event into Transactional Outbox (POST /events/outbox)
    console.log('\n[2] Ingesting domain event into Outbox (POST /events/outbox)...');
    const aggregateId = `ORD-EVT-${Date.now()}`;
    const createRes = await request('/events/outbox', {
      method: 'POST',
      headers: authHeaders,
      body: {
        aggregate_type: 'ORDER',
        aggregate_id: aggregateId,
        event_type: 'order.created',
        payload: {
          order_id: aggregateId,
          total_amount: 250.0,
          currency: 'USD',
          customer_email: 'shopper@nexora.io',
        },
      },
    });

    if (createRes.status !== 201) {
      console.error('Failed to create outbox event:', createRes.body);
      process.exit(1);
    }

    const event = createRes.body.data;
    console.log(`✓ Outbox Event created:`);
    console.log(`  - ID: ${event.id}`);
    console.log(`  - Aggregate: ${event.aggregate_type} (${event.aggregate_id})`);
    console.log(`  - Event Type: ${event.event_type}`);
    console.log(`  - Status: ${event.status}`);

    if (event.status !== 'PENDING') {
      throw new Error(`Expected event status PENDING, got ${event.status}`);
    }

    // 3. Query Outbox Events (GET /events/outbox & GET /events/outbox/:id)
    console.log('\n[3] Querying Outbox Events (GET /events/outbox & GET /events/outbox/:id)...');
    const listRes = await request(`/events/outbox?status=PENDING&aggregate_type=ORDER`, {
      method: 'GET',
      headers: authHeaders,
    });
    if (listRes.status !== 200 || !listRes.body.data.length) {
      throw new Error(`Failed to list outbox events: ${JSON.stringify(listRes.body)}`);
    }
    console.log(`✓ Filtered outbox list found ${listRes.body.data.length} PENDING event(s)`);

    const getRes = await request(`/events/outbox/${event.id}`, {
      method: 'GET',
      headers: authHeaders,
    });
    if (getRes.status !== 200) {
      throw new Error(`Failed to fetch outbox event by ID: ${JSON.stringify(getRes.body)}`);
    }
    console.log(`✓ Fetched outbox event: Type=${getRes.body.data.event_type}, Status=${getRes.body.data.status}`);

    // 4. Dispatch Pending Outbox Events to Redis Pub/Sub (POST /events/outbox/dispatch)
    console.log('\n[4] Dispatching Pending Events to Redis Pub/Sub (POST /events/outbox/dispatch)...');
    const dispatchRes = await request('/events/outbox/dispatch', {
      method: 'POST',
      headers: authHeaders,
      body: { limit: 10 },
    });

    if (dispatchRes.status !== 200) {
      console.error('Dispatch failed:', dispatchRes.body);
      process.exit(1);
    }
    console.log(`✓ Dispatch batch completed: Dispatched ${dispatchRes.body.data.dispatchedCount} event(s)`);

    // Verify event status transitioned to PUBLISHED
    const getAfterDispatch = await request(`/events/outbox/${event.id}`, {
      method: 'GET',
      headers: authHeaders,
    });
    console.log(`✓ Event status after dispatch: ${getAfterDispatch.body.data.status}`);
    if (getAfterDispatch.body.data.status !== 'PUBLISHED') {
      throw new Error(`Expected event status to be PUBLISHED, got ${getAfterDispatch.body.data.status}`);
    }

    // 5. Test Dead-Letter Queue (DLQ) & Replay Engine
    console.log('\n[5] Testing Dead-Letter Queue (DLQ) Replay Engine...');
    
    // Simulate dead event
    await pool.query(
      `UPDATE outbox_events SET status = 'DEAD', retry_count = 5, last_error = 'Connection timeout to webhook broker' WHERE id = $1;`,
      [event.id]
    );
    console.log('✓ Simulated event moved to DEAD status in DLQ');

    const replayRes = await request(`/events/outbox/${event.id}/replay`, {
      method: 'POST',
      headers: authHeaders,
    });

    if (replayRes.status !== 200) {
      console.error('Failed to replay outbox event:', replayRes.body);
      process.exit(1);
    }

    const replayedEvent = replayRes.body.data;
    console.log(`✓ Event successfully replayed: Status is now ${replayedEvent.status}, Retries = ${replayedEvent.retry_count}`);
    if (replayedEvent.status !== 'PENDING' || replayedEvent.retry_count !== 0) {
      throw new Error(`Expected status PENDING and retry_count 0 after replay, got ${replayedEvent.status} / ${replayedEvent.retry_count}`);
    }

    // 6. Verify Swagger OpenAPI 3.0 Documentation
    console.log('\n[6] Verifying Swagger OpenAPI 3.0 Documentation for Outbox Events Module...');
    const documentedPaths = Object.keys(swaggerSpec.paths);
    const outboxEndpoints = [
      '/events/outbox',
      '/events/outbox/dispatch',
      '/events/outbox/{id}',
      '/events/outbox/{id}/replay',
    ];

    for (const ep of outboxEndpoints) {
      if (documentedPaths.includes(ep)) {
        console.log(`✓ OpenAPI covers endpoint: ${ep}`);
      } else {
        throw new Error(`Missing OpenAPI documentation for endpoint: ${ep}`);
      }
    }

    console.log(`\n✓ Total documented endpoints in Swagger spec: ${documentedPaths.length}`);
    console.log('\n==================================================================');
    console.log('🎉 ALL INTEGRATION TESTS FOR TRANSACTIONAL OUTBOX & EVENT BUS PASSED!');
    console.log('==================================================================');

    server.close();
    process.exit(0);
  } catch (error) {
    console.error('\n❌ TEST RUN FAILED:', error);
    server.close();
    process.exit(1);
  }
}

runOutboxTests();

