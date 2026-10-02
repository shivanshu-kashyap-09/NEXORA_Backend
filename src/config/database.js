const config = require('./environment');
const logger = require('./logger');
const { Pool } = require('pg'); // for direct db connection
const { createClient } = require('@supabase/supabase-js'); // for client-side db operations

const pool = new Pool({
  connectionString: config.database_url, // for direct db connection
  ssl: { rejectUnauthorized: false }, // for direct db connection
});

const supabase = createClient(
  config.supabase_url || '',
  config.supabase_anon_key || ''
); // for client-side db operations

const supabaseServiceRole = createClient(
  config.supabase_url || '',
  config.supabase_service_role_key || ''
); // for server-side db operations

const queryDb = (text, params) => pool.query(text, params); // for direct db connection

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
  pool, // for graceful shutdown and pool queries
  testDbConnection, // for db connection test
  queryDb, // for direct db connection
  supabase, // for client-side db operations
  supabaseServiceRole, // for server-side db operations
};