const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const environment = require('./config/environment');
const { swaggerUi, swaggerSpec } = require('./config/swagger');
const routes = require('./routes/v1');
const { correlationId, errorHandler, rateLimiter } = require('./shared/middleware');
const { NotFoundError } = require('./shared/errors');
const { testDbConnection } = require('./config/database');
const { testRedisConnection } = require('./config/redis');

const app = express();

// Security Headers & Cross-Origin Resource Sharing
app.use(helmet());
app.use(cors({ origin: environment.cors_origin, credentials: true }));

let totalRequests = 0;
let totalErrors = 0;

// Request Metrics Middleware
app.use((req, res, next) => {
  totalRequests++;
  res.on('finish', () => {
    if (res.statusCode >= 500) {
      totalErrors++;
    }
  });
  next();
});

// Request Tracing & Correlation ID Injection
app.use(correlationId);

// Body Parsing Middleware with size limit mitigation
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Swagger API Documentation UI & Raw JSON Spec
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));
app.get('/api-docs.json', (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.send(swaggerSpec);
});

/**
 * @openapi
 * /:
 *   get:
 *     summary: Root Service Discovery & Information
 *     description: Returns engine identification, active version, current environment, and Swagger documentation links.
 *     tags:
 *       - System Probes
 *     responses:
 *       200:
 *         description: Service details retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 name:
 *                   type: string
 *                   example: NEXORA OMS Engine
 *                 version:
 *                   type: string
 *                   example: 1.0.0
 *                 environment:
 *                   type: string
 *                   example: development
 *                 docs:
 *                   type: string
 *                   example: /api-docs
 *                 timestamp:
 *                   type: string
 *                   example: "2026-10-03T10:15:30.000Z"
 *                 correlationId:
 *                   type: string
 *                   example: "req_01J8ZX11234AB"
 */
app.get(['/', '/api/v1'], (req, res) => {
  res.json({
    name: 'NEXORA OMS Engine',
    version: environment.app_version,
    environment: environment.node_env,
    docs: '/api-docs',
    timestamp: new Date().toISOString(),
    correlationId: req.correlationId,
  });
});

/**
 * @openapi
 * /health:
 *   get:
 *     summary: Liveness Health Probe
 *     description: Validates that the Node.js event loop is non-blocking and the application process is running.
 *     tags:
 *       - System Probes
 *     responses:
 *       200:
 *         description: Application process is alive
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: UP
 *                 statusCode:
 *                   type: integer
 *                   example: 200
 *                 uptime:
 *                   type: number
 *                   example: 452.12
 *                 timestamp:
 *                   type: string
 *                   example: "2026-10-03T10:15:30.000Z"
 *                 environment:
 *                   type: string
 *                   example: development
 *                 version:
 *                   type: string
 *                   example: 1.0.0
 *                 correlationId:
 *                   type: string
 *                   example: "req_01J8ZX11234AB"
 */
app.get(['/health', '/live', '/api/v1/health', '/api/v1/live'], (req, res) => {
  res.json({
    status: 'UP',
    statusCode: 200,
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    environment: environment.node_env,
    version: environment.app_version,
    correlationId: req.correlationId,
  });
});

/**
 * @openapi
 * /ready:
 *   get:
 *     summary: Deep Readiness Health Probe
 *     description: Deep probe verifying active connectivity to both PostgreSQL and Redis 7 in-memory subsystems.
 *     tags:
 *       - System Probes
 *     responses:
 *       200:
 *         description: All dependent subsystems are healthy and ready to accept incoming traffic
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: READY
 *                 statusCode:
 *                   type: integer
 *                   example: 200
 *                 dependencies:
 *                   type: object
 *                   properties:
 *                     database:
 *                       type: string
 *                       example: HEALTHY
 *                     redis:
 *                       type: string
 *                       example: HEALTHY
 *                 timestamp:
 *                   type: string
 *                   example: "2026-10-03T10:15:30.000Z"
 *                 correlationId:
 *                   type: string
 *                   example: "req_01J8ZX11234AB"
 *       503:
 *         description: One or more dependent subsystems are degraded or unavailable
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: DEGRADED
 *                 statusCode:
 *                   type: integer
 *                   example: 503
 *                 dependencies:
 *                   type: object
 *                   properties:
 *                     database:
 *                       type: string
 *                       example: DOWN
 *                     redis:
 *                       type: string
 *                       example: DOWN
 */
app.get(['/ready', '/health/readiness', '/api/v1/ready', '/api/v1/health/readiness'], async (req, res) => {
  const dbStatus = await testDbConnection();
  const redisStatus = await testRedisConnection();

  const isReady = dbStatus && redisStatus;
  const statusCode = isReady ? 200 : 503;

  return res.status(statusCode).json({
    status: isReady ? 'READY' : 'DEGRADED',
    statusCode,
    dependencies: {
      database: dbStatus ? 'HEALTHY' : 'DOWN',
      redis: redisStatus ? 'HEALTHY' : 'DOWN',
    },
    timestamp: new Date().toISOString(),
    correlationId: req.correlationId,
  });
});

/**
 * @openapi
 * /metrics:
 *   get:
 *     summary: Prometheus Observability Metrics
 *     description: Standard Prometheus text exposition format exposing system memory, uptime, and request counters.
 *     tags:
 *       - System Probes
 *     responses:
 *       200:
 *         description: Prometheus format metrics
 *         content:
 *           text/plain:
 *             schema:
 *               type: string
 */
app.get(['/metrics', '/api/v1/metrics'], (req, res) => {
  const mem = process.memoryUsage();
  const uptime = process.uptime();
  const metrics = [
    '# HELP process_uptime_seconds Total Node.js process uptime in seconds',
    '# TYPE process_uptime_seconds gauge',
    `process_uptime_seconds ${uptime.toFixed(2)}`,
    '',
    '# HELP process_resident_memory_bytes Resident Set Size (RSS) memory in bytes',
    '# TYPE process_resident_memory_bytes gauge',
    `process_resident_memory_bytes ${mem.rss}`,
    '',
    '# HELP process_heap_total_bytes Total process heap memory in bytes',
    '# TYPE process_heap_total_bytes gauge',
    `process_heap_total_bytes ${mem.heapTotal}`,
    '',
    '# HELP process_heap_used_bytes Used process heap memory in bytes',
    '# TYPE process_heap_used_bytes gauge',
    `process_heap_used_bytes ${mem.heapUsed}`,
    '',
    '# HELP nexora_http_requests_total Total number of HTTP requests processed',
    '# TYPE nexora_http_requests_total counter',
    `nexora_http_requests_total ${totalRequests}`,
    '',
    '# HELP nexora_http_errors_total Total number of 5xx HTTP server errors',
    '# TYPE nexora_http_errors_total counter',
    `nexora_http_errors_total ${totalErrors}`,
  ].join('\n');

  res.setHeader('Content-Type', 'text/plain; version=0.0.4; charset=utf-8');
  res.send(metrics);
});

// Versioned API Gateway Routes with Sliding-Window Rate Limiting
app.use('/api/v1', rateLimiter(), routes);

// Handle 404 Not Found
app.use((req, res, next) => {
  next(new NotFoundError(`Route '${req.method} ${req.originalUrl}' not found on NEXORA Engine`));
});

// Centralized Error Handling Middleware
app.use(errorHandler);

module.exports = app;
