const swaggerJSDoc = require('swagger-jsdoc');
const swaggerUi = require('swagger-ui-express');
const environment = require('./environment');

const swaggerDefinition = {
  openapi: '3.0.0',
  info: {
    title: 'NEXORA Core OMS API',
    version: environment.app_version || '1.0.0',
    description:
      'Enterprise-grade multi-tenant order orchestration, real-time inventory allocation, and fulfillment engine API documentation.',
    contact: {
      name: 'Shivanshu Kashyap',
      email: 'kashyapshivanshu63@gmail.com',
    },
  },
  servers: [
    {
      url: `http://localhost:${environment.port}/api/v1`,
      description: 'Local Development Server (API v1)',
    },
    {
      url: `http://localhost:${environment.port}`,
      description: 'Root Server',
    },
  ],
  components: {
    securitySchemes: {
      bearerAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        description: 'Enter your RS256 JWT access token',
      },
      apiKeyAuth: {
        type: 'apiKey',
        in: 'header',
        name: 'X-API-Key',
        description: 'M2M API Key header for external system integrations',
      },
      tenantHeader: {
        type: 'apiKey',
        in: 'header',
        name: 'X-Tenant-ID',
        description: 'Tenant organization context identifier',
      },
    },
    responses: {
      UnauthorizedError: {
        description: 'Authorization token is missing or invalid',
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                success: { type: 'boolean', example: false },
                status: { type: 'string', example: 'fail' },
                statusCode: { type: 'integer', example: 401 },
                message: { type: 'string', example: 'Unauthorized access' },
              },
            },
          },
        },
      },
      NotFoundError: {
        description: 'The requested resource does not exist',
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                success: { type: 'boolean', example: false },
                status: { type: 'string', example: 'fail' },
                statusCode: { type: 'integer', example: 404 },
                message: { type: 'string', example: 'Resource not found' },
              },
            },
          },
        },
      },
      InternalServerError: {
        description: 'Unexpected internal server error',
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                success: { type: 'boolean', example: false },
                status: { type: 'string', example: 'error' },
                statusCode: { type: 'integer', example: 500 },
                message: { type: 'string', example: 'Internal server error' },
              },
            },
          },
        },
      },
    },
  },
  security: [
    {
      bearerAuth: [],
    },
  ],
};

const options = {
  swaggerDefinition,
  apis: [
    './src/app.js',
    './src/routes/**/*.js',
    './src/modules/**/*.routes.js',
    './src/modules/**/*.js',
  ],
};

const swaggerSpec = swaggerJSDoc(options);

module.exports = {
  swaggerUi,
  swaggerSpec,
};