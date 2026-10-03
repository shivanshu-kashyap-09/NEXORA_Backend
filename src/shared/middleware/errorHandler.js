const environment = require('../../config/environment');
const logger = require('../../config/logger');
const { ErrorCodes } = require('../errors');

/**
 * Global Express Error Handling Middleware
 * Ensures all API errors match the standardized NEXORA error contract.
 */
const errorHandler = (err, req, res, next) => {
  const statusCode = err.statusCode || 500;
  const errorCode = err.errorCode || ErrorCodes.INTERNAL_SERVER_ERROR;
  const correlationId = req.correlationId || res.getHeader('X-Correlation-ID');

  const errorResponse = {
    success: false,
    statusCode,
    error: {
      code: errorCode,
      message: err.message || 'Internal server error occurred',
    },
    timestamp: new Date().toISOString(),
    correlationId,
  };

  if (err.details) {
    errorResponse.error.details = err.details;
  }

  // Development mode: include error stack trace
  if (environment.node_env === 'development') {
    errorResponse.error.stack = err.stack;
    logger.error(`[Dev Error] ${statusCode} [${errorCode}] - ${err.message}`, {
      correlationId,
      path: req.originalUrl,
      stack: err.stack,
    });
  } else {
    // Production mode
    if (err.isOperational) {
      logger.warn(`[Operational Error] ${statusCode} [${errorCode}] - ${err.message}`, {
        correlationId,
        path: req.originalUrl,
      });
    } else {
      logger.error('UNEXPECTED PRODUCTION ERROR:', {
        correlationId,
        path: req.originalUrl,
        message: err.message,
        stack: err.stack,
      });
      // Sanitize non-operational messages in production
      errorResponse.error.message = 'An unexpected internal error occurred. Please contact support with the correlation ID.';
    }
  }

  return res.status(statusCode).json(errorResponse);
};

module.exports = errorHandler;
