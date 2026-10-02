# NEXORA — Enterprise Multi-Tenant Order Orchestration & Fulfillment Engine (OMS)

[![Node.js](https://img.shields.io/badge/Node.js-v18%2B-green.svg)](https://nodejs.org/)
[![Express.js](https://img.shields.io/badge/Express.js-v4-blue.svg)](https://expressjs.com/)
[![Supabase](https://img.shields.io/badge/Database-Supabase%20%28PostgreSQL%20RLS%29-3ECF8E.svg)](https://supabase.com/)
[![Redis](https://img.shields.io/badge/Cache%20%26%20Lock-Redis%207-DC382D.svg)](https://redis.io/)
[![Architecture](https://img.shields.io/badge/Architecture-Event--Driven%20%2B%20Transactional%20Outbox-orange.svg)]()

---

## 📌 Overview

**NEXORA** is a high-throughput, enterprise-grade multi-tenant Order Management System (OMS) engineered for modern retail networks, marketplace facilitators, and e-commerce platforms.

It decouples and orchestrates:
- **Order Ingestion & Snapshots**
- **Atomic Real-Time Inventory Allocation & 15-Minute Soft Holds**
- **Deterministic Forward-Only State Machine**
- **Payment Ingestion, Idempotency & Automated Webhooks**
- **Multi-Warehouse Routing & 3PL Carrier Fulfillment**
- **Transactional Outbox Event Bus with Guaranteed Delivery**

---

## 🛠️ Technology Stack

```
                               ┌───────────────────────────────────┐
                               │           Client Ingress          │
                               │     (Web / Mobile / Third-Party)  │
                               └─────────────────┬─────────────────┘
                                                 │
                        ┌────────────────────────▼────────────────────────┐
                        │      Node.js + Express.js API Gateway           │
                        │  - Multi-Tenant Context Injection Middleware    │
                        │  - RS256 JWT Authentication & Granular RBAC     │
                        │  - Idempotency & Rate Limiting Guard            │
                        └──────────────┬───────────────────┬──────────────┘
                                       │                   │
                     ┌─────────────────▼─────┐       ┌─────▼────────────────┐
                     │        Redis 7        │       │       Supabase       │
                     │  - Cache-Aside Layer  │       │  (PostgreSQL 16)     │
                     │  - Distributed Mutex  │       │  - Row-Level Security│
                     │  - 15-Min Soft Holds  │       │  - Outbox Table      │
                     │  - BullMQ Job Queue   │       │  - Immutable Audits  │
                     └───────────────────────┘       └──────────┬───────────┘
                                                                │
                                              ┌─────────────────▼───────────┐
                                              │ Background Outbox Worker    │
                                              │ (BullMQ / Cron / Dispatcher)│
                                              └─────────────────────────────┘
```

| Layer | Technology | Purpose |
| :--- | :--- | :--- |
| **Runtime & Server** | **Node.js + Express.js** | Core REST API gateway and domain routing |
| **Primary Database** | **Supabase (PostgreSQL 16)** | Relational storage with **Row-Level Security (RLS)** for hard tenant isolation |
| **Caching & Locking** | **Redis 7 (ioredis)** | High-speed cache-aside, distributed mutex locks, rate limiting |
| **Async Worker & Queues**| **BullMQ** | 15-minute reservation release timers, background outbox workers, DLQ |
| **Data Validation** | **Zod** | Strict DTO and payload validation schemas |
| **Security & Auth** | **RS256 JWT & Argon2** | Stateless tokens, token rotation, password hashing |
| **Logging & Tracing** | **Pino / Winston** | High-performance structured JSON logging with correlation IDs |
| **Testing** | **Jest + Supertest** | Automated unit, integration, and concurrency testing |

---

## 🚀 Key Operational Benchmarks

* **Throughput:** Sustained benchmark target of **5,000 write TPS** at peak.
* **Latency:** **Sub-150ms P95 API response latency** across all mutating routes.
* **Tenant Isolation:** Native PostgreSQL Row-Level Security (`app.current_tenant_id`).
* **Zero Overselling:** Atomic Lua/Redis inventory locks combined with DB row locking.
* **Zero Double Charge:** Mandatory `Idempotency-Key` header with Redis distributed lock.

---

## 📁 Directory Structure

```
nexora_backend/
├── docs/                      # Architectural specs & MVP requirements
│   └── mvp.md                 # Complete 44-Domain MVP Specification
├── src/
│   ├── config/                # Environment variables, Supabase & Redis configs
│   ├── modules/               # Domain-Driven Design (DDD) Feature Modules
│   │   ├── auth/              # Authentication & JWT RS256 token rotation
│   │   ├── tenant/            # Tenant onboarding, quotas & RLS context
│   │   ├── catalog/           # Products, SKUs, pricing & categories
│   │   ├── warehouse/         # Warehouse locations & capacity nodes
│   │   ├── inventory/         # Stock accounting & 15-min soft reservations
│   │   ├── order/             # Order ingestion & deterministic state engine
│   │   ├── payment/           # Payment processing, idempotency & webhooks
│   │   ├── fulfillment/       # Warehouse routing & packing manifests
│   │   └── shipment/          # Carrier logistics & tracking lifecycle
│   ├── routes/                # Versioned API routes (/v1)
│   ├── shared/                # Core utilities, errors & middlewares
│   │   ├── errors/            # Custom AppError classes
│   │   ├── middleware/        # Tenant context, auth, rate limiters, error handler
│   │   └── utils/             # Standard ApiResponse, catchAsync wrappers
│   ├── app.js                 # Express application configuration
│   └── server.js              # Server entry point & graceful shutdown
├── tests/                     # Unit, integration & concurrency test suites
├── .env.example               # Environment variables template
├── package.json
└── readme.md
```

---

## ⚡ Quick Start

### 1. Prerequisites
- **Node.js:** v18.0.0 or later
- **Redis Server:** v7.x (local or cloud instance)
- **Supabase Account / Local CLI:** PostgreSQL instance with RLS enabled

### 2. Environment Configuration
Copy the `.env.example` file and configure your credentials:
```bash
cp .env.example .env
```

Set the following variables in `.env`:
```env
PORT=5000
NODE_ENV=development

# Supabase PostgreSQL
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-supabase-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-supabase-service-role-key
DATABASE_URL=postgresql://postgres:[password]@db.your-project.supabase.co:5432/postgres

# Redis
REDIS_HOST=127.0.0.1
REDIS_PORT=6379
REDIS_PASSWORD=

# JWT Secrets
JWT_ACCESS_SECRET=your_jwt_access_secret_key
JWT_REFRESH_SECRET=your_jwt_refresh_secret_key
JWT_EXPIRES_IN=15m
```

### 3. Installation
```bash
npm install
```

### 4. Running the Application
```bash
# Start development server with auto-reload
npm run dev

# Start production server
npm start
```

---

## 🚦 Order Lifecycle State Flow

```
[ PENDING ] ──► [ CONFIRMED ] ──► [ PROCESSING ] ──► [ READY ] ──► [ FULFILLED ] ──► [ COMPLETED ]
     │                │
     ▼                ▼
[ CANCELLED ]    [ CANCELLED ]
```

---

## 📖 Standard API Response Format

### Success Response (`200 OK`)
```json
{
  "success": true,
  "statusCode": 200,
  "message": "Resource retrieved successfully",
  "data": {},
  "timestamp": "2026-10-02T18:00:00.000Z",
  "correlationId": "req_01J8ZX11234AB"
}
```

### Error Response (`4xx / 5xx`)
```json
{
  "success": false,
  "statusCode": 409,
  "error": {
    "code": "INSUFFICIENT_INVENTORY",
    "message": "Requested quantity exceeds available unreserved stock."
  },
  "timestamp": "2026-10-02T18:00:00.000Z",
  "correlationId": "req_01J8ZX11234AB"
}
```

---

## 📄 License

ISC License © 2026 Shivanshu Kashyap.
