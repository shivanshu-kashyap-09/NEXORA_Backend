const app = require('./app');
const environment = require('./config/environment');
const logger = require('./config/logger');
const { testDbConnection, pool } = require('./config/database');

let server;

async function startServer() {
  try {
    // Verify Database Connection
    await testDbConnection();

    // Start HTTP Server
    server = app.listen(environment.port, () => {
      logger.info(`NEXORA Server running on port ${environment.port} in [${environment.node_env}] mode`);
      logger.info(`Health check available at: http://localhost:${environment.port}/health`);
      logger.info(`Swagger UI at: http://localhost:${environment.port}/api-docs`);
    });
  } catch (error) {
    logger.error('Failed to start server:', { error: error.message, stack: error.stack });
    process.exit(1);
  }
}

// Graceful Shutdown Function
const gracefulShutdown = (signal) => {
  logger.info(`Received ${signal}. Starting graceful shutdown...`);

  if (server) {
    server.close(async () => {
      logger.info('HTTP server closed.');
      try {
        if (pool) {
          await pool.end();
          logger.info('Database connection pool closed.');
        }
        process.exit(0);
      } catch (err) {
        logger.error('Error during database pool shutdown:', { error: err.message });
        process.exit(1);
      }
    });
  } else {
    process.exit(0);
  }

  // Force shutdown if cleanup hangs for more than 10 seconds
  setTimeout(() => {
    logger.error('Forcefully shutting down due to timeout.');
    process.exit(1);
  }, 10000);
};

// Process Termination Signals
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Uncaught Exceptions & Unhandled Rejections Safety Net
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