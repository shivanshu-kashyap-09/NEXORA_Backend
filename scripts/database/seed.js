const path = require('path');
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  console.error('❌ Error: DATABASE_URL is not defined in .env file');
  process.exit(1);
}

const pool = new Pool({
  connectionString,
  ssl: { rejectUnauthorized: false },
});

async function runSeed() {
  console.log('🌱 Starting NEXORA Database Seeding...');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1. Create Default Master Tenant
    console.log('Inserting default tenant...');
    const tenantRes = await client.query(`
      INSERT INTO tenants (slug, name, status, plan, currency, timezone)
      VALUES ('demo-corp', 'Demo Global Retail Corp', 'ACTIVE', 'enterprise', 'USD', 'UTC')
      ON CONFLICT (slug) DO UPDATE SET updated_at = NOW()
      RETURNING id;
    `);
    const tenantId = tenantRes.rows[0].id;

    // 2. Set Tenant Context for RLS
    await client.query(`SET LOCAL app.current_tenant_id = '${tenantId}';`);

    // 3. Create Default Admin User
    console.log('Inserting admin user...');
    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash('Admin@Nexora2026', salt);

    const userRes = await client.query(`
      INSERT INTO users (email, password_hash, first_name, last_name, is_verified)
      VALUES ('admin@nexora.io', $1, 'Shivanshu', 'Admin', true)
      ON CONFLICT (email) DO UPDATE SET updated_at = NOW()
      RETURNING id;
    `, [passwordHash]);
    const userId = userRes.rows[0].id;

    // 4. Link User to Tenant as Owner
    await client.query(`
      INSERT INTO tenant_users (tenant_id, user_id, role, permissions)
      VALUES ($1, $2, 'owner', ARRAY['*'])
      ON CONFLICT (tenant_id, user_id) DO NOTHING;
    `, [tenantId, userId]);

    // 5. Create Sample Warehouse
    console.log('Inserting sample warehouse...');
    const whRes = await client.query(`
      INSERT INTO warehouses (tenant_id, code, name, address)
      VALUES ($1, 'WH-MAIN-01', 'Primary Central Distribution Hub', '{"city": "Mumbai", "country": "IN", "postal_code": "400001"}'::jsonb)
      ON CONFLICT (tenant_id, code) DO UPDATE SET name = EXCLUDED.name
      RETURNING id;
    `, [tenantId]);
    const warehouseId = whRes.rows[0].id;

    // 6. Create Sample Category & Product
    console.log('Inserting sample product and inventory...');
    const catRes = await client.query(`
      INSERT INTO categories (tenant_id, slug, name)
      VALUES ($1, 'electronics', 'Consumer Electronics')
      ON CONFLICT (tenant_id, slug) DO UPDATE SET name = EXCLUDED.name
      RETURNING id;
    `, [tenantId]);
    const categoryId = catRes.rows[0].id;

    const prodRes = await client.query(`
      INSERT INTO products (tenant_id, category_id, sku, name, price_base, currency)
      VALUES ($1, $2, 'SKU-NX-001', 'NEXORA Smart Terminal Pro', 299.99, 'USD')
      ON CONFLICT (tenant_id, sku) DO UPDATE SET price_base = EXCLUDED.price_base
      RETURNING id;
    `, [tenantId, categoryId]);
    const productId = prodRes.rows[0].id;

    // 7. Initialize Stock
    await client.query(`
      INSERT INTO inventory_items (tenant_id, warehouse_id, product_id, on_hand, reserved, safety_stock)
      VALUES ($1, $2, $3, 1000, 0, 50)
      ON CONFLICT (tenant_id, warehouse_id, product_id) DO UPDATE SET on_hand = 1000;
    `, [tenantId, warehouseId, productId]);

    await client.query('COMMIT');
    console.log('✅ Seeding completed successfully!');
    console.log(`Tenant ID: ${tenantId}`);
    console.log(`Admin User: admin@nexora.io (Password: Admin@Nexora2026)`);
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Seeding failed:', error.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

runSeed();

