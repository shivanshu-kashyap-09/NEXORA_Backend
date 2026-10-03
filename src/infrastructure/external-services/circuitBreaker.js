const CircuitBreaker = require('opossum');
const logger = require('../../config/logger');

const defaultOptions = {
  timeout: 5000, // 5 seconds
  errorThresholdPercentage: 50, // When 50% of requests fail, open circuit
  resetTimeout: 30000, // Try again after 30 seconds
};

/**
 * Create a Circuit Breaker around an external call (e.g. Stripe, FedEx, Carrier API)
 * @param {Function} asyncFunction
 * @param {string} serviceName
 * @param {object} customOptions
 */
const createCircuitBreaker = (asyncFunction, serviceName, customOptions = {}) => {
  const options = { ...defaultOptions, ...customOptions };
  const breaker = new CircuitBreaker(asyncFunction, options);

  breaker.on('open', () => {
    logger.error(`[Circuit Breaker: ${serviceName}] OPENED - External service is unhealthy. Requests failing fast.`);
  });

  breaker.on('halfOpen', () => {
    logger.warn(`[Circuit Breaker: ${serviceName}] HALF-OPEN - Probing external service health...`);
  });

  breaker.on('close', () => {
    logger.info(`[Circuit Breaker: ${serviceName}] CLOSED - External service is healthy and operational.`);
  });

  breaker.fallback((error, ...args) => {
    logger.warn(`[Circuit Breaker: ${serviceName}] Fallback triggered:`, { error: error.message });
    throw error;
  });

  return breaker;
};

module.exports = {
  createCircuitBreaker,
};
