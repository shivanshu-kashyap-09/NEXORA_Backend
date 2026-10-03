const { v4: uuidv4 } = require('uuid');

/**
 * Correlation ID Middleware
 * Assigns or propagates a unique correlation ID across HTTP headers, request object, and response headers.
 */
const correlationId = (req, res, next) => {
  const incomingId = req.headers['x-correlation-id'] || req.headers['x-request-id'];
  const traceId = incomingId || `req_${uuidv4().replace(/-/g, '').slice(0, 16)}`;

  req.correlationId = traceId;
  res.setHeader('X-Correlation-ID', traceId);

  next();
};

module.exports = correlationId;
