/**
 * @class AppError
 * @extends Error
 * @description Custom application error class for handling operational/business logic errors.
 * 
 * Operational errors are expected errors (e.g. invalid user input, item out of stock,
 * unauthorized access, route not found), as opposed to unhandled programmer bugs.
 */
class AppError extends Error {
  /**
   * @param {string} message - Human-readable error message.
   * @param {number} statusCode - HTTP status code (400, 401, 403, 404, 409, 500, etc.).
   */
  constructor(message, statusCode = 500) {
    super(message);

    this.statusCode = statusCode; // 'fail' for 4xx client errors, 'error' for 5xx server errors
    this.status = `${statusCode}`.startsWith('4') ? 'fail' : 'error';
    this.isOperational = true; // Flag identifying expected business errors
    this.timestamp = new Date().toISOString();

    // Captures the call stack while keeping constructor off the stack trace
    Error.captureStackTrace(this, this.constructor);
  }
}

module.exports = AppError;
