const { getRedisClient } = require('../../config/redis');
const environment = require('../../config/environment');
const { RateLimitError } = require('../errors');
const logger = require('../../config/logger');

/**
 * Sliding Window Redis Rate Limiter Middleware
 * @param {object} customOptions - { windowMs, max, keyGenerator }
 */
const rateLimiter = (customOptions = {}) => {
  const windowMs = customOptions.windowMs || environment.rate_limit.window_ms;
  const max = customOptions.max || environment.rate_limit.max_requests;
  const windowSeconds = Math.ceil(windowMs / 1000);

  return async (req, res, next) => {
    try {
      const redis = getRedisClient();
      const identifier = customOptions.keyGenerator
        ? customOptions.keyGenerator(req)
        : req.tenantId || req.ip || 'global_ip';

      const key = `ratelimit:${identifier}:${req.baseUrl || req.path}`;
      const now = Date.now();
      const clearBefore = now - windowMs;

      // Sliding window using Redis Sorted Sets (ZSET)
      const pipeline = redis.pipeline();
      pipeline.zremrangebyscore(key, 0, clearBefore); // Remove expired timestamps
      pipeline.zadd(key, now, `${now}-${Math.random()}`); // Add current timestamp
      pipeline.zcard(key); // Count requests in window
      pipeline.expire(key, windowSeconds);

      const results = await pipeline.exec();
      const currentCount = results[2][1];

      const remaining = Math.max(0, max - currentCount);
      const resetTime = Math.ceil((now + windowMs) / 1000);

      res.setHeader('X-RateLimit-Limit', max);
      res.setHeader('X-RateLimit-Remaining', remaining);
      res.setHeader('X-RateLimit-Reset', resetTime);

      if (currentCount > max) {
        logger.warn(`Rate limit exceeded for [${identifier}] on path [${req.originalUrl}]`);
        return next(new RateLimitError(`Rate limit exceeded. Maximum ${max} requests per ${windowSeconds}s.`));
      }

      next();
    } catch (err) {
      // Fail open if Redis is down for rate limiting to prevent blocking legitimate traffic
      logger.error('Rate limiter evaluation error, failing open:', { error: err.message });
      next();
    }
  };
};

module.exports = rateLimiter;
