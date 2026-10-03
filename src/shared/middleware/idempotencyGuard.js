const crypto = require('crypto');
const { idempotencyStore } = require('../../infrastructure/redis');
const { ConflictError, ErrorCodes } = require('../errors');
const logger = require('../../config/logger');

/**
 * Idempotency Interceptor Middleware
 * Enforces safe retries for mutating operations (Orders, Payments, Refunds)
 * Looks for 'Idempotency-Key' or 'X-Idempotency-Key' in request headers.
 */
const idempotencyGuard = (options = { required: false }) => {
  return async (req, res, next) => {
    // Only apply to mutating HTTP methods
    if (!['POST', 'PUT', 'PATCH'].includes(req.method)) {
      return next();
    }

    const idempotencyKey = req.headers['idempotency-key'] || req.headers['x-idempotency-key'];

    if (!idempotencyKey) {
      if (options.required) {
        return next(new ConflictError('Idempotency-Key header is required for this operation.', ErrorCodes.BAD_REQUEST));
      }
      return next();
    }

    const tenantId = req.tenantId || 'global';
    const requestFingerprint = crypto
      .createHash('sha256')
      .update(JSON.stringify({ body: req.body, url: req.originalUrl, method: req.method }))
      .digest('hex');

    try {
      // 1. Check existing record
      const existing = await idempotencyStore.get(tenantId, idempotencyKey);

      if (existing) {
        if (existing.status === 'COMPLETED') {
          logger.info(`Idempotent replay detected for key [${idempotencyKey}]. Returning cached response.`);
          return res.status(existing.statusCode).json(existing.body);
        }

        if (existing.status === 'STARTED') {
          return next(new ConflictError('A concurrent request with this Idempotency-Key is currently in-flight. Please retry shortly.', ErrorCodes.IDEMPOTENCY_CONFLICT));
        }
      }

      // 2. Lock and mark as STARTED
      const started = await idempotencyStore.start(tenantId, idempotencyKey, requestFingerprint);
      if (!started) {
        return next(new ConflictError('Concurrent request with this Idempotency-Key is already processing.', ErrorCodes.IDEMPOTENCY_CONFLICT));
      }

      // 3. Intercept res.json to capture and cache final response
      const originalJson = res.json.bind(res);
      res.json = (body) => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          idempotencyStore.complete(tenantId, idempotencyKey, res.statusCode, body).catch((err) => {
            logger.error('Failed to complete idempotency cache:', { error: err.message });
          });
        } else {
          // On error response, abort lock so user can retry
          idempotencyStore.abort(tenantId, idempotencyKey).catch(() => {});
        }
        return originalJson(body);
      };

      next();
    } catch (err) {
      logger.error('Idempotency middleware error:', { error: err.message });
      next(err);
    }
  };
};

module.exports = idempotencyGuard;
