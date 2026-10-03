const { getRedisClient } = require('../../config/redis');
const logger = require('../../config/logger');

/**
 * Cache Manager with Multi-Tenant Key Isolation
 * Pattern: nexora:{tenantId}:{entity}:{key}
 */
class CacheManager {
  constructor() {
    this.redis = getRedisClient();
  }

  /**
   * Build tenant-isolated cache key
   */
  buildKey(tenantId, entity, key) {
    const tId = tenantId || 'global';
    return `${tId}:${entity}:${key}`;
  }

  /**
   * Get cached data
   */
  async get(tenantId, entity, key) {
    try {
      const fullKey = this.buildKey(tenantId, entity, key);
      const raw = await this.redis.get(fullKey);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch (error) {
      logger.warn('Cache read error, falling back:', { error: error.message });
      return null;
    }
  }

  /**
   * Set cache with TTL (in seconds)
   */
  async set(tenantId, entity, key, data, ttlSeconds = 300) {
    try {
      const fullKey = this.buildKey(tenantId, entity, key);
      const serialized = JSON.stringify(data);
      if (ttlSeconds > 0) {
        await this.redis.set(fullKey, serialized, 'EX', ttlSeconds);
      } else {
        await this.redis.set(fullKey, serialized);
      }
      return true;
    } catch (error) {
      logger.warn('Cache write error:', { error: error.message });
      return false;
    }
  }

  /**
   * Invalidate specific key
   */
  async delete(tenantId, entity, key) {
    try {
      const fullKey = this.buildKey(tenantId, entity, key);
      await this.redis.del(fullKey);
      return true;
    } catch (error) {
      logger.warn('Cache delete error:', { error: error.message });
      return false;
    }
  }

  /**
   * Invalidate all keys matching entity pattern for tenant
   */
  async deletePattern(tenantId, entity) {
    try {
      const pattern = `${this.buildKey(tenantId, entity, '*')}`;
      const keys = await this.redis.keys(pattern);
      if (keys.length > 0) {
        await this.redis.del(...keys);
      }
      return true;
    } catch (error) {
      logger.warn('Cache pattern delete error:', { error: error.message });
      return false;
    }
  }
}

module.exports = new CacheManager();
