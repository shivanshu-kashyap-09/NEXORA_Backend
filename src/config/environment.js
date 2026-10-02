require('dotenv').config();

const config = {
    node_env: process.env.NODE_ENV || 'development',
    port: process.env.PORT || 5000,
    app_version: process.env.APP_VERSION || '1.0.0',
    
    supabase_url: process.env.SUPABASE_URL,
    supabase_anon_key: process.env.SUPABASE_ANON_KEY,
    supabase_service_role_key: process.env.SUPABASE_SERVICE_ROLE_KEY,
    database_url: process.env.DATABASE_URL,
}

module.exports = config;