const { getRedisClient } = require('../../config/redis');
const environment = require('../../config/environment');
const logger = require('../../config/logger');

/**
 * Idempotency Store
 * Ensures mutating operations (Orders, Payments, Refunds) are not executed twice.
 */
class IdempotencyStore {
  constructor() {
    this.redis = getRedisClient();
    this.ttl = environment.idempotency_ttl_seconds;
  }

  buildKey(tenantId, idempotencyKey) {
    const tId = tenantId || 'global';
    return `idempotency:${tId}:${idempotencyKey}`;
  }

  /**
   * Check if a request is already processed or in-flight
   * @returns {Promise<{ status: 'STARTED' | 'COMPLETED', response?: object } | null>}
   */
  async get(tenantId, idempotencyKey) {
    try {
      const key = this.buildKey(tenantId, idempotencyKey);
      const data = await this.redis.get(key);
      if (!data) return null;
      return JSON.parse(data);
    } catch (error) {
      logger.error('Error fetching idempotency key:', { error: error.message });
      return null;
    }
  }

  /**
   * Mark an idempotency key as IN_FLIGHT (STARTED)
   */
  async start(tenantId, idempotencyKey, requestFingerprint, lockTtlSeconds = 120) {
    try {
      const key = this.buildKey(tenantId, idempotencyKey);
      const payload = JSON.stringify({
        status: 'STARTED',
        fingerprint: requestFingerprint,
        createdAt: new Date().toISOString(),
      });
      // NX ensures only the first caller gets OK
      const result = await this.redis.set(key, payload, 'EX', lockTtlSeconds, 'NX');
      return result === 'OK';
    } catch (error) {
      logger.error('Error starting idempotency record:', { error: error.message });
      return false;
    }
  }

  /**
   * Save the final API response for this idempotency key (24-hour cache)
   */
  async complete(tenantId, idempotencyKey, statusCode, responseBody) {
    try {
      const key = this.buildKey(tenantId, idempotencyKey);
      const payload = JSON.stringify({
        status: 'COMPLETED',
        statusCode,
        body: responseBody,
        completedAt: new Date().toISOString(),
      });
      await this.redis.set(key, payload, 'EX', this.ttl);
      return true;
    } catch (error) {
      logger.error('Error saving completed idempotency record:', { error: error.message });
      return false;
    }
  }

  /**
   * Remove key if initial processing crashed before finishing
   */
  async abort(tenantId, idempotencyKey) {
    try {
      const key = this.buildKey(tenantId, idempotencyKey);
      await this.redis.del(key);
    } catch (error) {
      logger.error('Error aborting idempotency record:', { error: error.message });
    }
  }
}

module.exports = new IdempotencyStore();
