const express = require('express');
const environment = require('./config/environment');
const { swaggerUi, swaggerSpec } = require('./config/swagger');
const routes = require('./routes/v1');
const errorHandler = require('./shared/middleware/errorHandler');
const AppError = require('./shared/errors/AppError');

const app = express();

// Body Parsing Middleware
app.use(express.json()); // For parsing application/json
app.use(express.urlencoded({ extended: true })); // For parsing application/x-www-form-urlencoded

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
 *     summary: Welcome Root Endpoint
 *     description: Returns basic API status greeting.
 *     tags:
 *       - System
 *     responses:
 *       200:
 *         description: API greeting message
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Welcome to Nexora API
 */
app.get('/', (req, res) => {
  res.json({ message: 'Welcome to Nexora API' });
});

/**
 * @openapi
 * /health:
 *   get:
 *     summary: System Health & Uptime Probe
 *     description: Returns server health status, uptime, environment, and version.
 *     tags:
 *       - System
 *     responses:
 *       200:
 *         description: System is healthy and operational
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: integer
 *                   example: 200
 *                 message:
 *                   type: string
 *                   example: OK
 *                 uptime:
 *                   type: number
 *                   example: 123.45
 *                 timestamp:
 *                   type: string
 *                   example: "2026-10-03T01:22:10.000Z"
 *                 environment:
 *                   type: string
 *                   example: development
 *                 version:
 *                   type: string
 *                   example: 1.0.0
 *       500:
 *         description: Internal Server Error
 */
app.get('/health', (req, res) => {
  try {
    return res.json({
      status: 200,
      message: 'OK',
      uptime: process.uptime(), // seconds
      timestamp: new Date().toISOString(), // iso string
      environment: environment.node_env, // environment
      version: environment.app_version, // app version
    });
  } catch (error) {
    return res.json({
      status: 500,
      message: 'Internal server error',
      timestamp: new Date().toISOString(),
    });
  }
});

// API Routes
app.use('/api/v1', routes);

// Handle 404 Not Found
app.use((req, res, next) => {
  next(new AppError(`Route ${req.originalUrl} not found`, 404));
});

// Error handling middleware must be last
app.use(errorHandler);

module.exports = app;
