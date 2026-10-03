const jwt = require('jsonwebtoken');
const environment = require('../../config/environment');
const { UnauthorizedError, ErrorCodes } = require('../errors');

/**
 * Authentication Guard Middleware
 * Verifies Bearer JWT tokens and attaches authenticated user claims to `req.user`.
 */
const authGuard = (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return next(new UnauthorizedError('Authentication token missing or invalid format', ErrorCodes.UNAUTHORIZED));
  }

  const token = authHeader.split(' ')[1];

  try {
    const decoded = jwt.verify(token, environment.jwt.access_secret);
    req.user = decoded;

    // Automatically bind tenantId from JWT if present
    if (decoded.tenantId && !req.tenantId) {
      req.tenantId = decoded.tenantId;
    }

    next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return next(new UnauthorizedError('Authentication token has expired', ErrorCodes.TOKEN_EXPIRED));
    }
    return next(new UnauthorizedError('Invalid authentication token', ErrorCodes.TOKEN_INVALID));
  }
};

module.exports = authGuard;
