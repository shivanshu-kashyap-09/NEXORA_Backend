# NEXORA Backend — Server Lifecycle & Architecture Reference Guide

> **Document Purpose:** Complete reference guide explaining the monolith architecture, `app.js` Express configuration, `server.js` lifecycle engine, database connection management, graceful shutdown mechanics, and process error safety nets.

---

## 1. Monolith Architecture & File Separation

In our modular monolith setup, responsibilities are strictly separated across distinct layers:

```
src/
├── config/
│   ├── environment.js  # Centralized environment variable parser (.env)
│   └── database.js     # Supabase client & PostgreSQL connection pool
├── app.js              # Express app definition, middlewares & routing (NO app.listen)
├── server.js           # Server bootstrap, DB health checks, lifecycle & shutdown
└── routes/v1/          # Versioned API routes routing into feature modules
```

| File | Primary Responsibility | Key Rule |
| :--- | :--- | :--- |
| **`environment.js`** | Validates and exports typed environment variables | Never use `process.env` directly in modules; always import from `config/environment`. |
| **`database.js`** | Manages PostgreSQL `Pool` & Supabase JS client | Configures SSL (`rejectUnauthorized: false`) and connection pooling limits. |
| **`app.js`** | Configures parsing middlewares, routes, 404 & error handlers | Never call `app.listen()` here. Export `app` so test runners (Supertest) can import it without binding ports. |
| **`server.js`** | Starts HTTP listener, tests DB connection, handles process signals | Manages `SIGINT`/`SIGTERM`, unhandled exceptions, and graceful shutdown. |

---

## 2. Complete Code & Breakdown: `src/app.js`

`app.js` serves as the Express Application Blueprint. It sets up parsing middlewares, health check endpoints, API routing, and the global error-handling pipeline.

### Source Code (`src/app.js`):
```javascript
const express = require('express');
const environment = require('./config/environment');
const routes = require('./routes/v1');
const errorHandler = require('./shared/middleware/errorHandler');
const AppError = require('./shared/errors/AppError');

const app = express();

// 1. Core Parsing Middlewares
app.use(express.json()); // For parsing application/json
app.use(express.urlencoded({ extended: true })); // For parsing application/x-www-form-urlencoded

// 2. Base Index Route
app.get('/', (req, res) => {
  res.json({ message: 'Welcome to Nexora API' });
});

// 3. Health Check Probe (For Load Balancers / Kubernetes)
app.get('/health', (req, res) => {
  try {
    return res.json({
      status: 200,
      message: 'OK',
      uptime: process.uptime(), // seconds
      timestamp: new Date().toISOString(),
      environment: environment.node_env,
      version: environment.app_version,
    });
  } catch (error) {
    return res.json({
      status: 500,
      message: 'Internal server error',
      timestamp: new Date().toISOString(),
    });
  }
});

// 4. Mount API v1 Routes
app.use('/api/v1', routes);

// 5. Handle 404 Route Not Found
app.use((req, res, next) => {
  next(new AppError(`Route ${req.originalUrl} not found`, 404));
});

// 6. Global Error Handling Middleware (Must ALWAYS be last)
app.use(errorHandler);

module.exports = app;
```

---

## 3. Complete Code & Breakdown: `src/server.js`

`server.js` is the server execution engine. It validates database connectivity before starting HTTP listening, registers operating system termination signals, and protects against unhandled promise crashes.

### Source Code (`src/server.js`):
```javascript
const app = require('./app');
const environment = require('./config/environment');
const { testDbConnection, pool } = require('./config/database');

let server;

// 1. Fail-Fast Server Bootstrap Flow
async function startServer() {
  try {
    // Verify Database Connection First
    await testDbConnection();

    // Start HTTP Server
    server = app.listen(environment.port, () => {
      console.log(`NEXORA Server running on port ${environment.port} in [${environment.node_env}] mode`);
      console.log(`Health check available at: http://localhost:${environment.port}/health`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

// 2. Graceful Shutdown Handler (Zero In-Flight Request Drops)
const gracefulShutdown = (signal) => {
  console.log(`\n Received ${signal}. Starting graceful shutdown...`);

  if (server) {
    server.close(async () => {
      console.log('HTTP server closed.');
      try {
        if (pool) {
          await pool.end();
          console.log('Database connection pool closed.');
        }
        process.exit(0);
      } catch (err) {
        console.error('Error during database pool shutdown:', err);
        process.exit(1);
      }
    });
  } else {
    process.exit(0);
  }

  // Force shutdown if cleanup hangs for more than 10 seconds
  setTimeout(() => {
    console.error('Forcefully shutting down due to timeout.');
    process.exit(1);
  }, 10000);
};

// 3. Process Termination Signals
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// 4. Uncaught Exceptions & Unhandled Rejections Safety Net
process.on('uncaughtException', (err) => {
  console.error('UNCAUGHT EXCEPTION! Shutting down...', err);
  process.exit(1);
});

process.on('unhandledRejection', (err) => {
  console.error('UNHANDLED REJECTION! Shutting down...', err);
  if (server) {
    server.close(() => process.exit(1));
  } else {
    process.exit(1);
  }
});

startServer();
```

---

## 4. Server Startup Flow (Fail-Fast Principle)

```
[ startServer() Triggered ]
           │
           ▼
1. await testDbConnection()
   ├── Success ──► Continue to Step 2
   └── Failure ──► Log error & process.exit(1) (Fail-Fast: Don't start on broken DB)
           │
           ▼
2. server = app.listen(port)
   └── Start accepting incoming HTTP requests on configured PORT
```

### Why Fail-Fast?
If the database credentials, network, or pooler fail, starting the web server would result in every incoming request failing with `500 Internal Server Errors`. Failing fast immediately alerts developers/DevOps and allows container orchestrators to auto-recover.

---

## 5. Graceful Shutdown Workflow

When the server needs to stop (e.g., during deployments, autoscaling events, or server restart):

```
Operating System Signal (SIGINT / SIGTERM)
                   │
                   ▼
       gracefulShutdown(signal)
                   │
         ┌─────────┴─────────┐
         ▼                   ▼
1. server.close()      2. 10-Second Safety Timer
   - Stop accepting        (setTimeout)
     new requests.         - If cleanup hangs,
   - Allow active            force exit:
     requests to finish.     process.exit(1)
         │
         ▼
3. pool.end()
   - Close all PostgreSQL
     connection pool threads.
         │
         ▼
4. process.exit(0)
   - Clean, zero-loss exit.
```

---

## 6. Process Signal Handling

| Signal | Origin | Action Taken |
| :--- | :--- | :--- |
| **`SIGINT`** | User presses `Ctrl + C` in terminal | Initiates `gracefulShutdown('SIGINT')` to close active DB connections cleanly before exiting. |
| **`SIGTERM`** | Docker, Kubernetes, or AWS ECS/EKS stopping a container | Initiates `gracefulShutdown('SIGTERM')` allowing in-flight orders/payments to finish processing before container termination. |

---

## 7. Unhandled Error Safety Nets

| Safety Net Handler | What it Catches | Why Exit Process? |
| :--- | :--- | :--- |
| **`uncaughtException`** | Synchronous runtime errors not wrapped in `try/catch` | Application memory state may be corrupted; exiting cleanly allows nodemon / Docker to restart a fresh instance. |
| **`unhandledRejection`** | Asynchronous `Promise` rejections missing `.catch()` or `await try/catch` | Prevents zombie background tasks from leaking memory or keeping dangling locks. |

---

## 8. How Future Feature Modules Mount Onto This Core

When building feature domains (e.g., Auth, Catalog, Order, Inventory, Payment):

```
src/modules/order/
├── routes/order.routes.js       # Express Router
├── controller/order.controller.js
└── service/order.service.js
             │
             ▼
src/routes/v1/index.js
   router.use('/orders', orderRoutes);
             │
             ▼
src/app.js
   app.use('/api/v1', routes);
```

1. **Step 1:** Build the feature module inside `src/modules/<feature_name>/`.
2. **Step 2:** Mount its router into `src/routes/v1/index.js`.
3. **Step 3:** The request automatically benefits from the global middlewares, tenant context, error handlers, and lifecycle protections defined in `app.js` and `server.js`.
