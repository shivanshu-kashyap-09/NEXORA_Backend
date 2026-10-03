const { Queue } = require('bullmq');
const environment = require('../../config/environment');
const logger = require('../../config/logger');

// Redis connection configuration for BullMQ
const queueConnection = {
  host: environment.redis.host,
  port: environment.redis.port,
  password: environment.redis.password || undefined,
  db: environment.redis.db,
  maxRetriesPerRequest: null, // Required by BullMQ
};

const queues = new Map();

/**
 * Get or create a BullMQ Queue
 * @param {string} queueName - e.g. 'outbox-events', 'inventory-reservations', 'email-notifications'
 */
const getQueue = (queueName) => {
  if (queues.has(queueName)) {
    return queues.get(queueName);
  }

  const queue = new Queue(queueName, {
    connection: queueConnection,
    defaultJobOptions: {
      attempts: 5,
      backoff: {
        type: 'exponential',
        delay: 1000,
      },
      removeOnComplete: {
        count: 500, // Keep last 500 completed jobs
        age: 86400, // 24 hours
      },
      removeOnFail: {
        count: 1000, // Keep last 1000 failed jobs for Dead-Letter inspection
      },
    },
  });

  queue.on('error', (err) => {
    logger.error(`BullMQ Queue [${queueName}] error:`, { error: err.message });
  });

  queues.set(queueName, queue);
  return queue;
};

module.exports = {
  queueConnection,
  getQueue,
  queues,
};
