const environment = require('../../config/environment');
const logger = require('../../config/logger');

/**
 * Sends detailed error information during development for rapid debugging.
 * @param {Error} err - The error object.
 * @param {object} res - Express response object.
 */
const sendErrorDev = (err, res) => {
  logger.error(`[Dev Error] ${err.statusCode} - ${err.message}`, {
    stack: err.stack,
  });

  return res.status(err.statusCode).json({
    success: false,
    status: err.status,
    statusCode: err.statusCode,
    message: err.message,
    error: err,
    stack: err.stack,
    timestamp: new Date().toISOString(),
  });
};

/**
 * Sends clean, safe error responses in production without leaking internal server details.
 * @param {Error} err - The error object.
 * @param {object} res - Express response object.
 */
const sendErrorProd = (err, res) => {
  // 1. Operational, trusted error: send user-friendly message to client
  if (err.isOperational) {
    logger.warn(`[Operational Warning] ${err.statusCode} - ${err.message}`);

    return res.status(err.statusCode).json({
      success: false,
      status: err.status,
      statusCode: err.statusCode,
      message: err.message,
      timestamp: new Date().toISOString(),
    });
  }

  // 2. Programming or unknown error: don't leak error details to client
  logger.error('UNEXPECTED PRODUCTION ERROR:', {
    message: err.message,
    stack: err.stack,
  });

  return res.status(500).json({
    success: false,
    status: 'error',
    statusCode: 500,
    message: 'Something went wrong on our end. Please try again later.',
    timestamp: new Date().toISOString(),
  });
};

/**
 * Global Express Error Handling Middleware.
 * Automatically catches and formats errors from all routes and controllers.
 */
const errorHandler = (err, req, res, next) => {
  err.statusCode = err.statusCode || 500;
  err.status = err.status || 'error';

  if (environment.node_env === 'development') {
    sendErrorDev(err, res);
  } else {
    sendErrorProd(err, res);
  }
};

module.exports = errorHandler;
