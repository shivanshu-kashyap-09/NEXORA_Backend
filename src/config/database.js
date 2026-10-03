const config = require('./environment');
const logger = require('./logger');
const { Pool } = require('pg');
const { createClient } = require('@supabase/supabase-js');

// Direct PostgreSQL Connection Pool
const pool = new Pool({
  connectionString: config.database_url,
  max: config.db_pool_max,
  idleTimeoutMillis: config.db_pool_idle_timeout_ms,
  connectionTimeoutMillis: 10000,
  ssl: { rejectUnauthorized: false },
});

pool.on('error', (err) => {
  logger.error('Unexpected error on idle PostgreSQL client pool', { error: err.message });
});

// Supabase Public / Anon Client
const supabase = createClient(
  config.supabase_url || '',
  config.supabase_anon_key || ''
);

// Supabase Service Role Client (Elevated Privileges)
const supabaseServiceRole = createClient(
  config.supabase_url || '',
  config.supabase_service_role_key || ''
);

// Direct DB Query Helper
const queryDb = (text, params) => pool.query(text, params);

// Connection Health Check
const testDbConnection = async () => {
  try {
    const res = await pool.query('SELECT NOW() AS now');
    logger.info(`PostgreSQL / Supabase connected successfully at: ${res.rows[0].now}`);
    return true;
  } catch (err) {
    logger.error('PostgreSQL / Supabase connection failed', { error: err.message });
    return false;
  }
};

module.exports = {
  pool,
  testDbConnection,
  queryDb,
  supabase,
  supabaseServiceRole,
};