const winston = require('winston');
const environment = require('./environment');

// Development Log Format (Colored & Human-Readable)
const devFormat = winston.format.combine(
  winston.format.colorize(),
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.printf(({ timestamp, level, message, ...meta }) => {
    const metaStr = Object.keys(meta).length ? `\n${JSON.stringify(meta, null, 2)}` : '';
    return `[${timestamp}] ${level}: ${message} ${metaStr}`;
  })
);

// Production Log Format (Structured JSON for Log Aggregators)
const prodFormat = winston.format.combine(
  winston.format.timestamp(),
  winston.format.json()
);

// Create Winston Logger Instance
const logger = winston.createLogger({
  level: environment.node_env === 'development' ? 'debug' : 'info',
  format: environment.node_env === 'development' ? devFormat : prodFormat,
  transports: [
    new winston.transports.Console({
      handleExceptions: true,
      handleRejections: true,
    }),
  ],
  exitOnError: false,
});

module.exports = logger;