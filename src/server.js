const app = require('./app');
const environment = require('./config/environment');
const logger = require('./config/logger');
const { testDbConnection, pool } = require('./config/database');
const { testRedisConnection, closeRedisConnection } = require('./config/redis');
const { closeAllWorkers } = require('./infrastructure/queue');

let server;

async function startServer() {
  try {
    logger.info('Initializing NEXORA OMS Core Infrastructure...');

    // 1. Verify Database Connection
    await testDbConnection();

    // 2. Verify Redis In-Memory Engine Connection
    await testRedisConnection();

    // 3. Start HTTP Server Gateway
    server = app.listen(environment.port, () => {
      logger.info(`=======================================================`);
      logger.info(`🚀 NEXORA Server running on port ${environment.port} [${environment.node_env}]`);
      logger.info(`📚 Swagger Docs UI: http://localhost:${environment.port}/api-docs`);
      logger.info(`🩺 Liveness Probe:  http://localhost:${environment.port}/health`);
      logger.info(`🛡️ Readiness Probe: http://localhost:${environment.port}/ready`);
      logger.info(`=======================================================`);
    });
  } catch (error) {
    logger.error('Failed to start NEXORA server:', { error: error.message, stack: error.stack });
    process.exit(1);
  }
}

// Graceful Shutdown Coordinator
const gracefulShutdown = async (signal) => {
  logger.info(`Received ${signal}. Starting graceful shutdown...`);

  if (server) {
    server.close(async () => {
      logger.info('HTTP server closed. Draining connections...');
      try {
        // 1. Close background workers
        await closeAllWorkers();

        // 2. Close Redis client
        await closeRedisConnection();

        // 3. Close PostgreSQL connection pool
        if (pool) {
          await pool.end();
          logger.info('PostgreSQL connection pool closed.');
        }

        logger.info('All subsystems shut down gracefully. Exiting process.');
        process.exit(0);
      } catch (err) {
        logger.error('Error during subsystem shutdown:', { error: err.message });
        process.exit(1);
      }
    });
  } else {
    process.exit(0);
  }

  // Force shutdown safeguard if cleanup hangs
  setTimeout(() => {
    logger.error('Forcefully terminating process due to shutdown timeout.');
    process.exit(1);
  }, 10000);
};

// Process Signal Listeners
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Uncaught Exceptions & Unhandled Rejections
process.on('uncaughtException', (err) => {
  logger.error('UNCAUGHT EXCEPTION! Shutting down...', { error: err.message, stack: err.stack });
  process.exit(1);
});

process.on('unhandledRejection', (err) => {
  logger.error('UNHANDLED REJECTION! Shutting down...', { error: err?.message || err, stack: err?.stack });
  if (server) {
    server.close(() => process.exit(1));
  } else {
    process.exit(1);
  }
});

startServer();