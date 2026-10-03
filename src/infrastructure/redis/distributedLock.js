const { v4: uuidv4 } = require('uuid');
const { getRedisClient } = require('../../config/redis');
const logger = require('../../config/logger');

/**
 * Distributed Mutex Lock (Redlock Pattern)
 * Used to ensure atomic operations (e.g. inventory allocations, order state transitions, payments)
 */
class DistributedLock {
  constructor() {
    this.redis = getRedisClient();
  }

  /**
   * Acquire a distributed lock on a resource
   * @param {string} resourceKey - e.g. 'lock:inventory:item_123' or 'lock:order:tenant_456:order_789'
   * @param {number} ttlMs - Time to live in milliseconds (default 10,000ms)
   * @returns {Promise<string|null>} Returns lock token if acquired, null otherwise
   */
  async acquire(resourceKey, ttlMs = 10000) {
    const lockToken = uuidv4();
    try {
      // SET resourceKey lockToken PX ttlMs NX
      const result = await this.redis.set(resourceKey, lockToken, 'PX', ttlMs, 'NX');
      if (result === 'OK') {
        return lockToken;
      }
      return null;
    } catch (error) {
      logger.error('Failed to acquire distributed lock:', { resourceKey, error: error.message });
      return null;
    }
  }

  /**
   * Release a distributed lock safely using Lua script (only if token matches)
   * @param {string} resourceKey
   * @param {string} lockToken
   * @returns {Promise<boolean>}
   */
  async release(resourceKey, lockToken) {
    if (!lockToken) return false;

    // Lua script: only delete if current value equals lockToken
    const luaScript = `
      if redis.call("get", KEYS[1]) == ARGV[1] then
        return redis.call("del", KEYS[1])
      else
        return 0
      end
    `;

    try {
      const result = await this.redis.eval(luaScript, 1, resourceKey, lockToken);
      return result === 1;
    } catch (error) {
      logger.error('Failed to release distributed lock:', { resourceKey, error: error.message });
      return false;
    }
  }

  /**
   * Execute a function with a distributed lock wrapper
   * @param {string} resourceKey
   * @param {number} ttlMs
   * @param {Function} task - Async function to execute
   */
  async withLock(resourceKey, ttlMs, task) {
    const token = await this.acquire(resourceKey, ttlMs);
    if (!token) {
      const err = new Error(`Resource '${resourceKey}' is locked by another concurrent process.`);
      err.statusCode = 409;
      err.code = 'RESOURCE_LOCKED';
      throw err;
    }

    try {
      return await task();
    } finally {
      await this.release(resourceKey, token);
    }
  }
}

module.exports = new DistributedLock();
