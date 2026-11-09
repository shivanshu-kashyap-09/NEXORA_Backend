# NEXORA — Enterprise OMS Execution Roadmap & Blueprint

> **NEXORA** is an enterprise-grade, multi-tenant Order Orchestration & Fulfillment Engine (DOM / OMS) built on Domain-Driven Design (DDD), PostgreSQL Row-Level Security (RLS), Redis distributed locks, and Event-Driven Architecture (EDA).

---

## 📊 1. Current Progress & Milestone Summary

```
[✓] Step 1:  Identity, Multi-Factor Auth & Session Management (/auth)
[✓] Step 2:  Multi-Tenant Organization Management & RLS Isolation (/tenants)
[✓] Step 2b: Product Catalog, BOM Bundles & Warehouse Nodes (/categories, /products, /warehouses)
[✓] Step 3:  Real-Time Inventory & 15-Minute Soft Holds (/inventory)
[✓] Step 4:  Customer Profiles & Sales Channel Connectors (/customers, /channels)
[✓] Step 5:  Order Ingestion & State Machine Pipeline (/orders)
[✓] Step 6:  Payment Capture, Invoicing & Gateway Reconciliation (/payments)
[✓] Step 7:  Warehouse Fulfillment Waves & 3PL Logistics Dispatch (/fulfillments, /shipments)
[✓] Step 8:  Reverse Logistics, Returns & RMA Lifecycle (/returns)
[✓] Step 9:  Omnichannel Retail Fulfillment — BOPIS & BORIS (/omnichannel)
[✓] Step 10: Promotions, Discounts & Coupon Engine (/promotions)
------------------------------------------------------------------------------------------------
[ ] Step 11: Transactional Outbox Pattern & Event Publisher Engine (/events, outbox worker)
[ ] Step 12: Vendor & Drop-Shipping Portal, Purchase Orders (PO) (/vendors, /purchase-orders)
[ ] Step 13: Pre-Orders, Backorders & Priority Allocation Queue (/backorders)
[ ] Step 14: Comprehensive Audit Logging & Security Compliance (/audit-logs)
[ ] Step 15: Enterprise Analytics, Financial Reporting & Executive Metrics (/reports)
[ ] Step 16: Automated System Webhooks & Event Subscription Hub (/webhooks)
[ ] Step 17: Production Hardening, Rate Limiting, Observability & Docker CI/CD
```

* **Current Documented Swagger Endpoints:** `66` endpoints live in Swagger UI (`/api-docs`).
* **Active Database:** Supabase PostgreSQL with RLS enabled across all 41 tenant tables.
* **Distributed Locking:** Redis 7.x (`DistributedLock` with mutex redlock pattern).

---

## 🚀 2. Future Roadmap Steps (Step 11 — Step 17)

### Step 11: Transactional Outbox Pattern & Event Publisher Engine
* **Goal:** Eliminate the dual-write problem between database mutations and message brokers/external systems. Provide guaranteed at-least-once delivery for all domain events.
* **Database Tables:**
  * `outbox_events` (`id`, `tenant_id`, `aggregate_type`, `aggregate_id`, `event_type`, `payload`, `status: PENDING/PROCESSING/PUBLISHED/FAILED/DEAD`, `retry_count`, `published_at`, `error_log`, `created_at`).
* **Key Components:**
  1. **Transactional Outbox Writer:** Helper integrated into all existing domain services to emit events inside active DB transactions (`order.created`, `payment.captured`, `fulfillment.shipped`, `rma.requested`, `bopis.staged`).
  2. **Event Poller & Dispatcher Worker:** Background worker powered by BullMQ / Redis polling `PENDING` outbox records and publishing to Redis Pub/Sub channels.
  3. **Dead-Letter Queue (DLQ) & Replay Mechanism:** Failed events retry with exponential backoff; after 5 attempts, marked `DEAD` for manual replay.
* **API Endpoints:**
  * `GET /api/v1/events/outbox` — List outbox events filtered by aggregate, event type, status.
  * `GET /api/v1/events/outbox/:id` — Inspect full event payload and delivery trace.
  * `POST /api/v1/events/outbox/:id/replay` — Re-queue dead or failed outbox event for immediate retry.
* **Deliverable:** Live worker script `scripts/workers/outbox_publisher.js` + test suite `scripts/test_outbox_events.js`.

---

### Step 12: Vendor Management, Drop-Shipping & Purchase Orders (PO)
* **Goal:** Support multi-vendor marketplaces, 3rd-party drop-shippers, supplier catalogs, and procurement replenishment purchase orders.
* **Database Tables:**
  * `vendors` (`id`, `tenant_id`, `code`, `name`, `email`, `phone`, `commission_percentage`, `is_active`, `created_at`).
  * `purchase_orders` (`id`, `tenant_id`, `vendor_id`, `warehouse_id`, `po_number`, `status: DRAFT/ISSUED/PARTIALLY_RECEIVED/RECEIVED/CANCELLED`, `total_cost`, `expected_delivery_date`).
  * `po_items` (`id`, `tenant_id`, `po_id`, `product_id`, `quantity_ordered`, `quantity_received`, `unit_cost`).
* **Key Components:**
  1. **Drop-Shipping Splitter:** Orders containing vendor-fulfilled items automatically split into drop-ship purchase orders routed to external vendors.
  2. **PO Receiving & Auto-Stocking:** When goods arrive from supplier, receiving a PO atomically increments warehouse `inventory_items.on_hand` and logs `PO_RECEIVE` in adjustments.
* **API Endpoints:**
  * `POST /api/v1/vendors` — Register vendor supplier / drop-shipper.
  * `GET /api/v1/vendors` — List active vendors with commission rates.
  * `POST /api/v1/purchase-orders` — Create PO for inventory replenishment.
  * `PATCH /api/v1/purchase-orders/:id/receive` — Receive vendor shipment and automatically credit inventory stock.
* **Deliverable:** Test suite `scripts/test_vendor_po.js`.

---

### Step 13: Pre-Orders, Backorders & Priority Allocation Queue
* **Goal:** Enable selling out-of-stock items ("Available on Backorder" / "Pre-Order Summer 2026") and automatically allocating incoming stock according to customer priority.
* **Database Tables:**
  * `backorder_queues` (`id`, `tenant_id`, `order_id`, `order_item_id`, `product_id`, `quantity_needed`, `priority_rank`, `status: QUEUED/ALLOCATED/CANCELLED`, `created_at`).
* **Key Components:**
  1. **Zero-Stock Ingestion Guard:** Orders placed for products with `allow_backorder: true` bypass inventory stock-out rejection and enqueue in `backorder_queues`.
  2. **Automated PO Receipt Trigger:** When a Purchase Order or RMA Restock adds units to `inventory_items`, a hook pulls from `backorder_queues` in FIFO/VIP order and reserves stock, moving the order from `ON_HOLD` $\to$ `CONFIRMED`.
* **API Endpoints:**
  * `GET /api/v1/backorders` — View global queue of orders waiting for inventory.
  * `POST /api/v1/backorders/reallocate` — Manually trigger or reorder priority ranks for VIP clients.
* **Deliverable:** Test suite `scripts/test_backorders_queue.js`.

---

### Step 14: Comprehensive Audit Logging & Security Compliance
* **Goal:** Enterprise-grade non-repudiation audit trail tracking every write, status update, price modification, and administrative action across all tenants.
* **Database Tables:**
  * `audit_logs` (`id`, `tenant_id`, `user_id`, `action`, `resource_type`, `resource_id`, `previous_state: JSONB`, `new_state: JSONB`, `ip_address`, `user_agent`, `created_at`).
* **Key Components:**
  1. **Global Audit Interceptor Middleware:** Express middleware intercepting `POST`, `PATCH`, `PUT`, `DELETE` operations and persisting state diffs in `audit_logs`.
  2. **Immutability Protection:** PostgreSQL trigger disallowing `UPDATE` or `DELETE` on `audit_logs` to ensure compliance with SOC2 / ISO-27001 requirements.
* **API Endpoints:**
  * `GET /api/v1/audit-logs` — Query audit logs with date range, user filter, action, and resource type.
  * `GET /api/v1/audit-logs/resource/:resource_type/:resource_id` — Historical diff timeline of any specific order, customer, or inventory record.
* **Deliverable:** Test suite `scripts/test_audit_compliance.js`.

---

### Step 15: Enterprise Analytics, Financial Reporting & Executive Dashboards
* **Goal:** Provide real-time data insights, sales velocity calculations, gross margin reports, inventory valuation, and return rate analysis.
* **Key Components:**
  1. **Sales Velocity & Gross Revenue:** Daily, weekly, monthly aggregations across sales channels (`Shopify`, `WooCommerce`, `Amazon`, `POS`).
  2. **Inventory Valuation & Shrinkage:** Aggregate on-hand valuation ($) vs damaged/scrap quarantine costs.
  3. **Return Rate Analytics:** Percentage of orders returned broken down by reason (defective vs wrong size).
* **API Endpoints:**
  * `GET /api/v1/reports/sales-summary` — Aggregated revenue, tax, discount, and shipping breakdown.
  * `GET /api/v1/reports/inventory-valuation` — Total asset valuation across active warehouses.
  * `GET /api/v1/reports/return-rates` — Return KPIs and defect rates per product SKU.
* **Deliverable:** Test suite `scripts/test_reporting_analytics.js`.

---

### Step 16: Automated System Webhooks & Event Subscription Hub
* **Goal:** Allow tenants to subscribe their external ERPs, Shopify apps, or custom endpoints to receive cryptographically signed HTTP webhooks when NEXORA events fire.
* **Database Tables:**
  * `webhooks` (`id`, `tenant_id`, `target_url`, `event_types: TEXT[]`, `secret_token`, `is_active`, `created_at`).
  * `webhook_deliveries` (`id`, `tenant_id`, `webhook_id`, `event_id`, `status_code`, `response_body`, `attempt_count`, `delivered_at`).
* **Key Components:**
  1. **HMAC SHA-256 Signatures:** Every outgoing webhook payload carries an `X-Nexora-Signature` header computed using the tenant's secret key.
  2. **Exponential Backoff Dispatcher:** Worker retrying failed delivery responses (4xx/5xx) with jittered backoff.
* **API Endpoints:**
  * `POST /api/v1/webhooks` — Register a webhook endpoint.
  * `GET /api/v1/webhooks` — List configured webhook endpoints.
  * `POST /api/v1/webhooks/:id/test` — Send a test ping event with mock payload.
* **Deliverable:** Test suite `scripts/test_webhooks.js`.

---

### Step 17: Production Hardening, Rate Limiting & Deployment Infrastructure
* **Goal:** Final hardening for high-throughput enterprise scale, security audits, and zero-downtime deployment.
* **Key Components:**
  1. **Redis Sliding-Window Rate Limiter:** Per-tenant and per-IP throttling protecting sensitive endpoints (`/auth/login`, `/orders`, `/payments`).
  2. **Prometheus Metrics & Health Probes:** Exposing `/metrics` (request counts, latency p95/p99, active holds, DB pool saturation) and `/health/readiness`.
  3. **Docker Compose & Deployment Scripts:** Production-ready containerized deployment configuration.
* **Deliverables:**
  * `docker-compose.prod.yml`, `Dockerfile`.
  * Comprehensive smoke test suite `scripts/test_full_system_smoke.js`.

---

## 📅 3. Execution Sequence & Dependency Graph

```
┌────────────────────────────────────────────────────────┐
│  Step 11: Transactional Outbox Pattern & Event Publisher│
└───────────────────────────┬────────────────────────────┘
                            │
                            ▼
┌────────────────────────────────────────────────────────┐
│  Step 12: Vendor & Drop-Shipping Portal, Purchase Orders│
└───────────────────────────┬────────────────────────────┘
                            │
                            ▼
┌────────────────────────────────────────────────────────┐
│  Step 13: Pre-Orders, Backorders & Priority Allocations │
└───────────────────────────┬────────────────────────────┘
                            │
                            ▼
┌────────────────────────────────────────────────────────┐
│  Step 14: Comprehensive Audit Logging & Compliance     │
└───────────────────────────┬────────────────────────────┘
                            │
                            ▼
┌────────────────────────────────────────────────────────┐
│  Step 15: Enterprise Analytics & Reporting Engine      │
└───────────────────────────┬────────────────────────────┘
                            │
                            ▼
┌────────────────────────────────────────────────────────┐
│  Step 16: Automated System Webhooks & Subscriptions    │
└───────────────────────────┬────────────────────────────┘
                            │
                            ▼
┌────────────────────────────────────────────────────────┐
│  Step 17: Production Hardening, Metrics & Container CI │
└────────────────────────────────────────────────────────┘
```

---

## 🔒 Standing Operating Rules
1. **NO `git push`** without explicit user permission. All commits are strictly local.
2. **OpenAPI / Swagger Documentation:** Every newly added endpoint must have full `@openapi` JSDoc annotations with parameter, request body, and response schemas.
3. **Data Integrity & RLS:** All multi-tenant queries must enforce `tenant_id` isolation using `withTenantTransaction`.
4. **Distributed Concurrency:** High-contention operations (holds, allocations, redemptions, handovers) must acquire Redis mutex locks.

