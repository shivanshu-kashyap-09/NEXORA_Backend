const Redis = require('ioredis');
const environment = require('./environment');
const logger = require('./logger');

let redisClient = null;

const createRedisClient = () => {
  const options = {
    host: environment.redis.host,
    port: environment.redis.port,
    password: environment.redis.password || undefined,
    db: environment.redis.db,
    keyPrefix: environment.redis.key_prefix,
    lazyConnect: true,
    maxRetriesPerRequest: 3,
    retryStrategy: (times) => {
      const delay = Math.min(times * 200, 2000);
      logger.warn(`Redis reconnecting... attempt ${times}, retry delay: ${delay}ms`);
      return delay;
    },
  };

  const client = new Redis(options);

  client.on('connect', () => {
    logger.info('Connected to Redis server');
  });

  client.on('ready', () => {
    logger.info('Redis client is ready to accept commands');
  });

  client.on('error', (err) => {
    logger.error('Redis connection error:', { error: err.message });
  });

  client.on('close', () => {
    logger.warn('Redis connection closed');
  });

  return client;
};

// Singleton Client
const getRedisClient = () => {
  if (!redisClient) {
    redisClient = createRedisClient();
  }
  return redisClient;
};

// Test Connection Helper (Used in Server Startup / Health Probe)
const testRedisConnection = async () => {
  try {
    const client = getRedisClient();
    if (client.status === 'wait') {
      await client.connect();
    }
    const ping = await client.ping();
    logger.info(`Redis ping successful: ${ping}`);
    return true;
  } catch (err) {
    logger.error('Redis ping/connection failed:', { error: err.message });
    return false;
  }
};

// Graceful Disconnect
const closeRedisConnection = async () => {
  if (redisClient) {
    try {
      await redisClient.quit();
      logger.info('Redis connection closed gracefully');
    } catch (err) {
      logger.error('Error closing Redis connection:', { error: err.message });
    }
  }
};

module.exports = {
  redisClient: getRedisClient(),
  getRedisClient,
  testRedisConnection,
  closeRedisConnection,
};
