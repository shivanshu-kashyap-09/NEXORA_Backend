const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const environment = require('./config/environment');
const { swaggerUi, swaggerSpec } = require('./config/swagger');
const routes = require('./routes/v1');
const { correlationId, errorHandler } = require('./shared/middleware');
const { NotFoundError } = require('./shared/errors');
const { testDbConnection } = require('./config/database');
const { testRedisConnection } = require('./config/redis');

const app = express();

// Security Headers & Cross-Origin Resource Sharing
app.use(helmet());
app.use(cors({ origin: environment.cors_origin, credentials: true }));

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
app.get('/', (req, res) => {
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
app.get(['/health', '/live'], (req, res) => {
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
app.get('/ready', async (req, res) => {
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

// Versioned API Gateway Routes
app.use('/api/v1', routes);

// Handle 404 Not Found
app.use((req, res, next) => {
  next(new NotFoundError(`Route '${req.method} ${req.originalUrl}' not found on NEXORA Engine`));
});

// Centralized Error Handling Middleware
app.use(errorHandler);

module.exports = app;
