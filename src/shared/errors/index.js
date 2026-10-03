const ErrorCodes = require('./ErrorCodes');

/**
 * Base Application Operational Error
 */
class AppError extends Error {
  constructor(message, statusCode = 500, errorCode = ErrorCodes.INTERNAL_SERVER_ERROR, details = null) {
    super(message);
    this.statusCode = statusCode;
    this.status = `${statusCode}`.startsWith('4') ? 'fail' : 'error';
    this.errorCode = errorCode;
    this.details = details;
    this.isOperational = true;
    this.timestamp = new Date().toISOString();

    Error.captureStackTrace(this, this.constructor);
  }
}

class BadRequestError extends AppError {
  constructor(message = 'Bad Request', errorCode = ErrorCodes.BAD_REQUEST, details = null) {
    super(message, 400, errorCode, details);
  }
}

class UnauthorizedError extends AppError {
  constructor(message = 'Unauthorized', errorCode = ErrorCodes.UNAUTHORIZED, details = null) {
    super(message, 401, errorCode, details);
  }
}

class ForbiddenError extends AppError {
  constructor(message = 'Forbidden', errorCode = ErrorCodes.FORBIDDEN, details = null) {
    super(message, 403, errorCode, details);
  }
}

class NotFoundError extends AppError {
  constructor(message = 'Resource not found', errorCode = ErrorCodes.NOT_FOUND, details = null) {
    super(message, 404, errorCode, details);
  }
}

class ConflictError extends AppError {
  constructor(message = 'Resource conflict', errorCode = ErrorCodes.CONFLICT, details = null) {
    super(message, 409, errorCode, details);
  }
}

class RateLimitError extends AppError {
  constructor(message = 'Too many requests, please slow down', errorCode = ErrorCodes.RATE_LIMIT_EXCEEDED, details = null) {
    super(message, 429, errorCode, details);
  }
}

module.exports = {
  AppError,
  BadRequestError,
  UnauthorizedError,
  ForbiddenError,
  NotFoundError,
  ConflictError,
  RateLimitError,
  ErrorCodes,
};
