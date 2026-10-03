const { getQueue, queueConnection } = require('./queueFactory');
const { createWorker, closeAllWorkers } = require('./workerFactory');

module.exports = {
  getQueue,
  createWorker,
  closeAllWorkers,
  queueConnection,
};
