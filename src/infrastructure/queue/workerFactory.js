const { Worker } = require('bullmq');
const { queueConnection } = require('./queueFactory');
const logger = require('../../config/logger');

const workers = new Map();

/**
 * Create and register a BullMQ Worker
 * @param {string} queueName
 * @param {Function} processor - async (job) => { ... }
 * @param {object} options - worker options (e.g. concurrency)
 */
const createWorker = (queueName, processor, options = {}) => {
  const worker = new Worker(queueName, processor, {
    connection: queueConnection,
    concurrency: options.concurrency || 5,
    ...options,
  });

  worker.on('completed', (job) => {
    logger.info(`Job [${job.id}] completed on queue [${queueName}]`);
  });

  worker.on('failed', (job, err) => {
    logger.error(`Job [${job?.id}] FAILED on queue [${queueName}]:`, {
      attemptsMade: job?.attemptsMade,
      error: err.message,
      stack: err.stack,
    });
  });

  worker.on('error', (err) => {
    logger.error(`BullMQ Worker [${queueName}] error:`, { error: err.message });
  });

  workers.set(queueName, worker);
  return worker;
};

/**
 * Gracefully close all workers on application shutdown
 */
const closeAllWorkers = async () => {
  logger.info('Closing all BullMQ background workers...');
  for (const [name, worker] of workers.entries()) {
    try {
      await worker.close();
      logger.info(`Worker [${name}] closed successfully.`);
    } catch (err) {
      logger.error(`Error closing worker [${name}]:`, { error: err.message });
    }
  }
};

module.exports = {
  createWorker,
  closeAllWorkers,
  workers,
};
