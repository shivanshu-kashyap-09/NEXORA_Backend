require('dotenv').config();

const config = {
  // Application & Server
  node_env: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT, 10) || 5000,
  app_version: process.env.APP_VERSION || '1.0.0',
  cors_origin: process.env.CORS_ORIGIN || '*',

  // Supabase Project Meta
  supabase_project_name: process.env.SUPABASE_PROJECT_NAME || 'NEXORA',
  supabase_project_id: process.env.SUPABASE_PROJECT_ID || '',
  supabase_project_region: process.env.SUPABASE_PROJECT_REGION || 'ap-southeast-2',

  // Database / Supabase Auth & Direct Connection
  supabase_url: process.env.SUPABASE_URL || '',
  supabase_anon_key: process.env.SUPABASE_ANON_KEY || '',
  supabase_service_role_key: process.env.SUPABASE_SERVICE_ROLE_KEY || '',
  database_url: process.env.DATABASE_URL || '',
  db_pool_max: parseInt(process.env.DB_POOL_MAX, 10) || 20,
  db_pool_idle_timeout_ms: parseInt(process.env.DB_POOL_IDLE_TIMEOUT_MS, 10) || 30000,

  // Redis Configuration
  redis: {
    host: process.env.REDIS_HOST || '127.0.0.1',
    port: parseInt(process.env.REDIS_PORT, 10) || 6379,
    password: process.env.REDIS_PASSWORD || undefined,
    db: parseInt(process.env.REDIS_DB, 10) || 0,
    key_prefix: process.env.REDIS_KEY_PREFIX || 'nexora:',
  },

  // JWT & Security
  jwt: {
    access_secret: process.env.JWT_ACCESS_SECRET || 'nexora_default_jwt_access_secret_2026',
    expires_in: process.env.JWT_EXPIRES_IN || '15m',
    refresh_secret: process.env.JWT_REFRESH_SECRET || 'nexora_default_jwt_refresh_secret_2026',
    refresh_expires_in: process.env.JWT_REFRESH_EXPIRES_IN || '7d',
  },

  // Rate Limiting
  rate_limit: {
    window_ms: parseInt(process.env.RATE_LIMIT_WINDOW_MS, 10) || 60000,
    max_requests: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS, 10) || 100,
  },

  // Idempotency TTL
  idempotency_ttl_seconds: parseInt(process.env.IDEMPOTENCY_TTL_SECONDS, 10) || 86400,

  // SMTP / Email Configuration
  email: {
    host: process.env.SMTP_HOST || 'smtp.mailtrap.io',
    port: parseInt(process.env.SMTP_PORT, 10) || 2525,
    user: process.env.SMTP_USER || '',
    pass: process.env.SMTP_PASS || '',
    from: process.env.EMAIL_FROM || 'NEXORA Platform <noreply@nexora.io>',
  },
};

module.exports = config;