# NEXORA Core OMS — Universal Commerce & Master Feature Specification

> **Document Version:** 2.0.0  
> **Platform Classification:** Universal Headless Commerce Backbone, Multi-Tenant Order Orchestration & Fulfillment Engine  
> **Document Scope:** Complete End-to-End 53-Domain Master Feature, Universal Storefront Plugin Ecosystem & Technical Architecture Specification  

---

## Executive Architecture Overview

**NEXORA** is an enterprise-grade, high-throughput multi-tenant order orchestration and fulfillment platform engineered for modern e-commerce enterprises, retail brand networks, and marketplace facilitators. It acts as a universal headless commerce backbone connecting seamlessly with any e-commerce storefront or marketplace (**Shopify, WooCommerce, Magento, BigCommerce, Amazon, Flipkart, Headless React/Next.js/Mobile**) via plug-and-play plugins and connectors. This specification outlines all **53 functional and operational feature domains** required to power global multi-channel retail operations, complete with domain architecture visual workflows, technical benchmarks, and deterministic state models.

```
 ┌─────────────────┐   ┌─────────────────┐   ┌──────────────────┐   ┌─────────────────┐
 │  Shopify Store  │   │   WooCommerce   │   │  Amazon / Mkp    │   │ Custom Headless │
 │  (NEXORA App)   │   │(NEXORA WP Plugin│   │(NEXORA Connector)│   │  (NEXORA SDK)   │
 └────────┬────────┘   └────────┬────────┘   └────────┬─────────┘   └────────┬────────┘
          │                     │                     │                      │
          └─────────────────────┼─────────────────────┴──────────────────────┘
                                │  Webhooks & Ingress APIs (Encrypted, Signed & Idempotent)
                                ▼
 ┌───────────────────────────────────────────────────────────────────────────────────┐
 │               NEXORA Client Ingress & Universal Channel Gateway Layer             │
 │  - Storefront Plugins & Channel Normalization Adapters (Shopify/Woo/Amazon -> DTO)│
 │  - Multi-Tenant RLS Context Injector & Per-Tenant Scope Router                    │
 │  - RS256 JWT Authentication, Granular RBAC & API Key Guard                        │
 │  - Idempotency Interceptor, Distributed Locks & Rate Limiters                     │
 └─────────────────────────┬───────────────────────────────────┬─────────────────────┘
                           │                                   │
 ┌─────────────────────────▼───────────────────────────────────▼─────────────────────┐
 │                            NEXORA Core Backend Engine                             │
 │  - Deterministic Order State Machine & Snapshot Immutability                      │
 │  - Multi-Warehouse DOM & Intelligent Routing Engine                               │
 │  - Global Inventory Pool & Real-Time Cross-Channel Allocation Engine              │
 │  - Financial Double-Entry Reconciliation & Automated Tax Engines                  │
 └─────────────┬───────────────────────────────────────────────────────┬─────────────┘
               │                                                       │
 ┌─────────────▼─────────┐                               ┌─────────────▼─────────────┐
 │   Redis 7 In-Memory   │                               │    PostgreSQL 16 (RLS)    │
 │  - Cache-Aside Layer  │                               │  - Hard Multi-Tenant Data │
 │  - Distributed Mutex  │                               │  - Transactional Outbox   │
 │  - 15-Min Soft Holds  │                               │  - Double-Entry Ledgers   │
 │  - Rate Limit Keys    │                               │  - Immutable Audit Trails │
 └───────────────────────┘                               └─────────────┬─────────────┘
                                                                       │
                                                         ┌─────────────▼─────────────┐
                                                         │ Async Transactional Outbox│
                                                         │ CDC Relay / BullMQ Worker │
                                                         └─────────────┬─────────────┘
                                                                       │
                         ┌─────────────────────────────────────────────┴─────────────────────────────────────────────┐
                         ▼                                                                                           ▼
           ┌───────────────────────────┐                                                               ┌───────────────────────────┐
           │  Event Bus (CloudEvents)  │                                                               │ Bi-Directional Channel    │
           │  (Email / Webhooks / DLQ) │                                                               │ Sync & Carrier Adapters   │
           │  (Warehouse WMS, ERPs)    │                                                               │ (Stock & Tracking Push)   │
           └───────────────────────────┘                                                               └───────────────────────────┘
```

---

## System Operational Benchmarks

| Metric | Operational Target |
| :--- | :--- |
| **Write Throughput** | Sustained **5,000 write TPS** at peak operational load |
| **API Latency SLA** | **Sub-150ms P95** response latency across all core mutating endpoints |
| **Data Isolation** | Hard PostgreSQL **Row-Level Security (RLS)** with session-level tenant context |
| **Inventory Concurrency** | Lock-free atomic reservation with **15-minute soft expiration TTL** |
| **Event Delivery** | Guaranteed **At-Least-Once Delivery** via Transactional Outbox pattern |
| **Financial Integrity** | Double-entry ledger matching with **$0.00 discrepancy tolerance** |
| **Disaster Recovery** | Cross-region asynchronous WAL replication (**RPO < 5s, RTO < 15m**) |

---

## Complete 53-Domain Master Feature Specification

---

### 1. Multi-Tenancy

```
1. INCOMING CLIENT REQUEST
Extract HTTP Headers (X-Tenant-ID) or JWT Claims
▼
2. API GATEWAY / INGRESS LAYER
Validate JWT Signature (RS256) & Parse Scope/Tenant Metadata
▼
3. APP CONNECTION POOL INITIALIZATION
Execute SET LOCAL app.current_tenant_id = '...'
▼
4. POSTGRESQL ROW-LEVEL SECURITY (RLS) POLICY
Enforce SELECT * FROM orders WHERE tenant_id = current_tenant()
```

* **Organization/Tenant Registration:** Provisioning new tenant entities with isolated organizational context.
* **Organization Profile:** Tenant profile management, business legal name, contact, and branding settings.
* **Organization Status:** Lifecycle states (`PENDING`, `ACTIVE`, `SUSPENDED`, `OFFBOARDED`).
* **Tenant Isolation:** Enforced via PostgreSQL Row-Level Security (`app.current_tenant_id`).
* **Tenant Context:** Dynamic middleware context extraction from headers (`X-Tenant-ID`) or JWT claims.
* **Tenant Quotas:** Resource limits, API rate quotas, storage thresholds, and SKU limits.
* **Tenant Configuration:** Per-tenant settings, webhook endpoints, and currency/locale rules.
* **Tenant Suspension:** Instant platform-level and tenant-level access revocation.
* **Tenant Reactivation:** Restoring suspended organizations to active operational state.
* **Tenant Deactivation:** Graceful termination of tenant active workloads.
* **Tenant Offboarding:** Tenant shutdown workflow, data archival, and active session termination.
* **Tenant Data Export:** GDPR/Compliance data dump generation in JSON/CSV formats.

---

### 2. Authentication

```
Client Application ──► Auth Service API ──► Keycloak / Auth0 / Native JWT
  (Credentials)          (Issue Tokens)             (JWT RS256 Issuer)
                                                            │
                                                            ▼
                                                   Redis Session Store
                                              RefreshToken TTL & Session Mgmt
```

* **User Registration:** Secure identity creation with credential validation.
* **Login:** Authentication with email/password, returning RS256 access and refresh tokens.
* **Logout:** Invalidation of active refresh tokens and session cleanup in Redis.
* **Email Verification:** Tokenized email verification links with expiration timers.
* **Password Reset:** Secure cryptographically random reset token generation and delivery.
* **Password Change:** In-session password updates with current password verification.
* **Access Token:** Asymmetric RS256 JWT access tokens (15-min TTL).
* **Refresh Token:** Cryptographically secure refresh tokens for rolling session renewal.
* **Refresh Token Rotation:** Automatic single-use refresh token invalidation and reissue.
* **Session Management:** Centralized user session tracking across multiple active devices.
* **Session Revocation:** Force logout on specific devices or global tenant-wide revocation.
* **Login Attempt Tracking:** Failed login counter monitoring per IP and user account.
* **Account Lockout:** Automated progressive account lockout on successive failed attempts.
* **Authentication Events:** Emitting domain events (`UserRegistered`, `LoginSuccess`, `PasswordChanged`).

---

### 3. User Management

```
Tenant Admin ──► User Invite Flow ──► Email Activation ──► Tenant User Profile
(Initiate Invite)  (Token Generation)  (User Verification)   (Multi-Org Binding)
```

* **User Invitation:** Admin-initiated email invitations with pre-assigned roles.
* **User Activation:** User claim and password set workflow via secure invitation tokens.
* **User Suspension:** Temporary blocking of specific user accounts within a tenant.
* **User Deactivation:** Permanent deactivation of user memberships.
* **User Profile:** Personal profile information, display name, avatar, and contact preferences.
* **Organization Membership:** Binding user identities to specific tenant organizations.
* **Multiple Organization Membership:** Seamless context switching for users across multiple tenants.
* **User Session Management:** Granular tracking and termination of user-specific sessions.

---

### 4. Roles & Permissions (RBAC)

```
Subject Request ──► Extract Token Roles ──► Verify Permission ──► Authorize Context
 (API Endpoint)     Scopes & JWT Claims      Interceptor Matrix     (200 OK Executed)
```

* **RBAC Engine:** Fine-grained Role-Based Access Control authorization engine.
* **Role Management:** Creation and customization of platform and tenant-level roles.
* **Permission Management:** Granular permission definition (e.g., `orders:create`, `inventory:reserve`).
* **Role Assignment:** Dynamic role binding to users within organizational scopes.
* **Role Removal:** Revocation of assigned roles with immediate token/cache invalidation.
* **Permission-Based Authorization:** Controller-level declarative permission guards.
* **Organization-Level Authorization:** Scoping actions to tenant-bound boundary checks.
* **Resource-Level Authorization:** Object ownership verification (e.g., User A modifying Order B).
* **Platform-Level Authorization:** Super-admin cross-tenant oversight guards.

---

### 5. API Keys

```
┌───────────────────┐     ┌───────────────────┐     ┌───────────────────┐
│ Key Creation API  │ ──► │ Hash API Key      │ ──► │ Store Key Metadata│
│ (Generate Secret) │     │ (SHA-256 Digest)  │     │ Scopes & Expiry   │
└───────────────────┘     └───────────────────┘     └───────────────────┘
                                                             │
                                                             ▼
                                                   ┌───────────────────┐
                                                   │ Usage Tracking &  │
                                                   │ Rotation Engine   │
                                                   └───────────────────┘
```

* **API Key Creation:** Generation of high-entropy Machine-to-Machine (M2M) secrets.
* **API Key Rotation:** Zero-downtime key rotation with grace period overlapping.
* **API Key Revocation:** Instant invalidation of compromised or decommissioned keys.
* **API Key Expiration:** Automated enforcement of predefined expiration timestamps.
* **API Key Scopes:** Restricting API keys to specific resource endpoints and verbs.
* **API Key Usage Tracking:** Real-time logging of last used timestamps and IP addresses.

---

### 6. Product Catalog

```
┌───────────────────┐     ┌───────────────────┐     ┌───────────────────┐
│ Create / Update   │ ──► │ Database Persist  │ ──► │ Cache Invalidation│
│ Product Payload   │     │ (products / skus) │     │ Key Invalidation  │
└───────────────────┘     └───────────────────┘     └───────────────────┘
                                                             │
                                                             ▼
                                                   ┌───────────────────┐
                                                   │ Catalog Indexer / │
                                                   │ Search Pipeline   │
                                                   └───────────────────┘
```

* **Product Creation:** Comprehensive product definitions with title, description, and metadata.
* **Product Update:** Modifying existing catalog entities with optimistic lock protection.
* **Product Archive:** Soft deletion and catalog archiving preserving order historical snapshots.
* **Product Status:** Lifecycle states (`DRAFT`, `ACTIVE`, `OUT_OF_STOCK`, `ARCHIVED`).
* **Product SKU:** Unique Stock Keeping Unit identification, barcode, and UPC indexing.
* **Product Pricing:** Multi-currency base pricing, MSRP, and discount pricing tiers.
* **Product Description:** Rich text and multi-language product description support.
* **Product Metadata:** Extensible JSONB custom key-value attributes.
* **Product Weight:** Unit weight measurement for carrier shipping calculation.
* **Product Dimensions:** Length, width, height volumetric metrics.
* **Product Images:** Image URL attachment mappings, display order, and alt text.
* **Product Search:** Sub-string, exact match, and SKU lookup pipelines.
* **Product Filtering:** Multi-facet filtering by category, price, brand, and status.
* **Product Sorting:** Dynamic sorting by price, creation date, popularity, and name.
* **Product Pagination:** Fast cursor-based and offset pagination strategies.

---

### 7. Categories

```
┌───────────────────┐     ┌───────────────────┐     ┌───────────────────┐
│ Parent Category   │ ──► │ Child Node Mapping│ ──► │ Category Cache    │
│ Entity Hierarchy  │     │ (Tree Traversals) │     │ Warmup Pipeline   │
└───────────────────┘     └───────────────────┘     └───────────────────┘
```

* **Category Creation:** Root and sub-category definition with slug and metadata.
* **Category Update:** Reorganizing category names, metadata, and parent bindings.
* **Category Deletion/Archiving:** Safeguards preventing deletion of non-empty parent categories.
* **Hierarchical Categories:** Nested tree traversals (Adjacency List / Materialized Path).
* **Category Search:** Full-text lookup across category taxonomy trees.
* **Category Listing:** Hierarchical tree serialization and flat list projection.

---

### 8. Customer Management

```
┌───────────────────┐     ┌───────────────────┐     ┌───────────────────┐
│ Customer Record   │ ──► │ Address Mapping   │ ──► │ Order History     │
│ Creation / Edit   │     │ (Billing/Shipping)│     │ Aggregator        │
└───────────────────┘     └───────────────────┘     └───────────────────┘
```

* **Customer Creation:** Ingestion of customer profiles, email, phone, and metadata.
* **Customer Update:** Profile updates with audit logging.
* **Customer Profile:** Consolidated overview of customer metrics, lifetime value (LTV), and status.
* **Customer Status:** Lifecycle flags (`ACTIVE`, `INACTIVE`, `BLACKLISTED`).
* **Customer Addresses:** Multi-address registry per customer account.
* **Billing Address:** Dedicated billing address mapping for invoice generation.
* **Shipping Address:** Multiple destination delivery address records.
* **Customer Search:** Searching by customer email, phone, name, or external ID.
* **Customer Filtering:** Segmenting customers by order count, registration date, and status.
* **Customer Order History:** Fast aggregated query of past orders and return requests.

---

### 9. Warehouse Management

```
┌───────────────────┐     ┌───────────────────┐     ┌───────────────────┐
│ Provision         │ ──► │ Physical Address  │ ──► │ Warehouse-Level   │
│ Warehouse Node    │     │ & Contact Spec    │     │ Inventory Bindings│
└───────────────────┘     └───────────────────┘     └───────────────────┘
```

* **Warehouse Creation:** Provisioning fulfillment nodes with unique warehouse codes.
* **Warehouse Update:** Operating hours, capacity limits, and configuration changes.
* **Warehouse Activation:** Opening a warehouse node for live order allocation.
* **Warehouse Deactivation:** Gracefully routing fulfillment away from inactive facilities.
* **Warehouse Address:** Physical address, geospatial coordinates, and tax zone mapping.
* **Warehouse Contact:** Facility manager contact, dispatch desk phone, and email dispatch.
* **Warehouse Code:** Short unique alphanumeric code for carrier manifests.
* **Multiple Warehouses:** Multi-node distributed fulfillment network topology.
* **Warehouse-Level Inventory:** Dedicated stock accounting isolated per physical warehouse.

---

### 10. Inventory Management

```
┌────────────────────┐    ┌────────────────────┐    ┌────────────────────┐
│ Order Reservation  │ ─► │ Atomic Redis DECR  │ ─► │ Sync DB Allocation │
│ Request            │    │ (Lua Lock-Free)    │    │ (SELECT FOR UPDATE)│
└────────────────────┘    └────────────────────┘    └────────────────────┘
                                                             │
                                                             ▼
                                                    ┌────────────────────┐
                                                    │ Prevent Over-Sale  │
                                                    │ Emit Outbox Event  │
                                                    └────────────────────┘
```

* **Stock Management:** Real-time ledger accounting for all SKU movements.
* **Stock Receiving:** Inbound purchase order ingestion and stock incrementing.
* **Stock Adjustment:** Manual cycle counts, damage adjustments, and discrepancy audits.
* **Stock Reservation:** Atomic soft hold deduction during checkout.
* **Stock Release:** Releasing uncommitted reservations on checkout timeout.
* **Stock Commitment:** Hard deduction of stock on successful payment confirmation.
* **Stock Return:** Ingesting returned goods back into active or damaged inventory.
* **Damaged Stock:** Quarantining damaged goods to prevent allocation.
* **Available Stock:** Real-time calculation: $\text{Available} = \text{On-Hand} - \text{Reserved} - \text{Damaged}$.
* **Reserved Stock:** Total units held under active checkout or unfulfilled orders.
* **On-Hand Stock:** Total physical units physically located within the warehouse.
* **Inventory Transactions:** Double-entry immutable transaction log for every stock delta.
* **Inventory History:** Audit trail for inventory balance audits over time.
* **Low Stock Detection:** Automated threshold triggers alerting when stock crosses reorder levels.
* **Warehouse-Level Inventory:** Inventory isolation partitioned by physical facility.
* **SKU-Level Inventory:** Global rollup inventory balances aggregated across warehouses.
* **Inventory Concurrency Control:** High-concurrency Lua scripts and row-level locks preventing race conditions.
* **Overselling Prevention:** Zero-tolerance hard constraint preventing negative available stock.

---

### 11. Inventory Reservation

```
┌──────────────────┐     ┌───────────────────┐     ┌─────────────────────┐
│ Soft Reservation │ ──► │ Redis TTL Clock   │ ──► │ Commitment on Paid  │
│ Initialized      │     │ (15-Min Expiry)   │     │ OR Release Timeout  │
└──────────────────┘     └───────────────────┘     └─────────────────────┘
```

* **Reservation Creation:** Initializing temporary soft reservation on order intent.
* **Reservation Expiration:** Automated 15-minute TTL clock enforcement in Redis.
* **Reservation Release:** Reclaiming reserved inventory on expiration or customer exit.
* **Reservation Commitment:** Transitioning soft hold into hard commitment on `OrderConfirmed`.
* **Reservation Status:** Tracking state (`ACTIVE`, `COMMITTED`, `EXPIRED`, `RELEASED`).
* **Reservation History:** Historical logs of all reservation creations, timeouts, and commits.
* **Concurrent Reservation Handling:** Mutex-guarded atomic reservations during flash sales.

---

### 12. Order Management

```
┌───────────────────┐     ┌───────────────────┐     ┌───────────────────┐
│ Order Ingestion   │ ──► │ Price / Tax       │ ──► │ State Machine     │
│ Payload (JSON)    │     │ Snapshot Engine   │     │ Initialization    │
└───────────────────┘     └───────────────────┘     └───────────────────┘
                                                             │
                                                             ▼
                                                   ┌───────────────────┐
                                                   │ Order Search &    │
                                                   │ Pagination Store  │
                                                   └───────────────────┘
```

* **Order Creation:** High-throughput order ingestion endpoint with payload validation.
* **Order Retrieval:** Fetching order details by UUID, external ID, or tracking number.
* **Order Update:** Modifying customer notes, shipping addresses before processing begins.
* **Order Cancellation:** Reversing allocations and triggering refund workflows.
* **Order Confirmation:** Transitioning order to confirmed status upon verified payment.
* **Order Processing:** Dispatching order to warehouse queue for pick and pack.
* **Order Fulfillment:** Generating shipment records and tracking bindings.
* **Order Completion:** Marking orders finalized upon successful carrier delivery.
* **Order Status:** Querying current state machine status.
* **Order Status History:** Immutable log of every status transition with actor and timestamp.
* **Order Items:** Line items snapshotting SKU, quantity, unit price, tax, and discount.
* **Order Pricing Snapshot:** Immutable snapshot of price parameters at transaction time.
* **Tax Calculation:** Snapshotting calculated regional, state, and local taxes.
* **Discount Handling:** Applying item-level and order-level coupon promotions.
* **Shipping Charges:** Calculating and recording delivery service freight fees.
* **Order Search:** Fast search across customer name, order ID, SKU, and address.
* **Order Filtering:** Filtering by status, date range, warehouse, and payment status.
* **Order Sorting:** Multi-attribute sorting by created date, total value, and status.
* **Order Pagination:** High-performance cursor and offset pagination.
* **Order History:** Complete historical lifecycle view for customer support and audit.

---

### 13. Order State Machine

```
   ┌────────────────────────────────────────────────────────┐
   │                        PENDING                         │
   └───────────┬────────────────────────────────┬───────────┘
               │ (Payment Success)              │ (Timeout / Failure)
               ▼                                ▼
   ┌───────────────────────┐            ┌───────────────┐
   │       CONFIRMED       │            │   CANCELLED   │
   └───────────┬───────────┘            └───────────────┘
               │ (Pick/Pack Start)
               ▼
   ┌───────────────────────┐
   │      PROCESSING       │
   └───────────┬───────────┘
               │ (Packed & Manifested)
               ▼
   ┌───────────────────────┐
   │         READY         │
   └───────────┬───────────┘
               │ (Handed to Carrier)
               ▼
   ┌───────────────────────┐
   │       FULFILLED       │
   └───────────┬───────────┘
               │ (Delivered)
               ▼
   ┌───────────────────────┐
   │       COMPLETED       │
   └───────────────────────┘
```

* **Valid State Transitions:** Deterministic state machine enforcing strict forward lifecycle.
* **Invalid State Transition Prevention:** Hard error exceptions blocking illegal jumps (e.g., `PENDING` $\rightarrow$ `FULFILLED`).
* **Fulfilled:** Transitioning to `FULFILLED` only when valid carrier tracking is attached.
* **Completed:** Reaching terminal state upon verified delivery.
* **Payment Failed:** Transitioning uncommitted orders to `CANCELLED` on payment decline.
* **Cancelled:** Automatic reversal of inventory holds and audit logging on cancellation.

---

### 14. Payment Management

```
┌───────────────────┐     ┌───────────────────┐     ┌───────────────────┐
│ Webhook Ingress   │ ──► │ SHA-256 HMAC      │ ──► │ Deduplication Key │
│ (Stripe / Adyen)  │     │ Verification      │     │ Insert Check      │
└───────────────────┘     └───────────────────┘     └───────────────────┘
                                                             │
                                                             ▼
                                                   ┌───────────────────┐
                                                   │ Order Paid State  │
                                                   │ Machine Dispatch  │
                                                   └───────────────────┘
```

* **Payment Creation:** Initiating payment sessions with external PSPs (Stripe, Adyen, Razorpay).
* **Payment Attempts:** Tracking multiple retry attempts per order intent.
* **Payment Status:** Real-time state tracking (`PENDING`, `AUTHORIZED`, `CAPTURED`, `FAILED`, `REFUNDED`).
* **Payment Authorization:** Two-step payment pre-authorization holds.
* **Payment Capture:** Capturing authorized funds on order confirmation.
* **Payment Failure:** Capturing decline reasons and notifying customer checkout.
* **Payment Cancellation:** Releasing authorizations on order abort.
* **Payment Records:** Detailed financial transactions stored with currency, fees, and net values.
* **Payment History:** Chronological audit trail of all payment events per tenant.
* **Payment Provider Integration:** Pluggable adapter layer supporting multiple payment gateways.
* **Payment Webhooks:** Ingress endpoint receiving asynchronous payment event notifications.
* **Webhook Verification:** Cryptographic HMAC signature validation on all incoming webhooks.
* **Webhook Replay Protection:** Timestamp and nonce validation preventing replay attacks.
* **Webhook Idempotency:** Event ID deduplication guaranteeing single execution of webhook actions.

---

### 15. Payment Idempotency

```
┌───────────────────┐     ┌───────────────────┐     ┌───────────────────┐
│ Inbound Request   │ ──► │ Redis Lock Check  │ ──► │ DB Unique         │
│ (Idempotency-Key) │     │ (lock:payment:key)│     │ Constraint Exec   │
└───────────────────┘     └───────────────────┘     └───────────────────┘
                                                             │
                                                             ▼
                                                   ┌───────────────────┐
                                                   │ Return Stored     │
                                                   │ Cached Response   │
                                                   └───────────────────┘
```

* **Idempotency Keys:** Mandatory `Idempotency-Key` header enforcement on mutating routes.
* **Duplicate Request Detection:** Redis mutex check detecting concurrent identical requests.
* **Idempotent Payment Creation:** Returning existing payment record if repeated within TTL.
* **Idempotent Order Creation:** Preventing duplicate order placement on network retries.
* **Idempotent Refunds:** Eliminating risk of double-refunding customer accounts.
* **Idempotent Webhook Processing:** Ingesting duplicate webhook deliveries safely.
* **Idempotency Conflict Handling:** Returning `409 Conflict` if concurrent requests attempt duplicate operations.
* **Idempotency Record Retention:** 24-hour retention of cached idempotent responses in Redis.

---

### 16. Refund Management

```
┌───────────────────┐     ┌───────────────────┐     ┌───────────────────┐
│ Customer Service  │ ──► │ Validate Refund   │ ──► │ PSP Gateway       │
│ Trigger Refund    │     │ Limit & Order     │     │ Reversal Execution│
└───────────────────┘     └───────────────────┘     └───────────────────┘
                                                             │
                                                             ▼
                                                   ┌───────────────────┐
                                                   │ Ledger Credit     │
                                                   │ Entry Appended    │
                                                   └───────────────────┘
```

* **Refund Creation:** Initiating refund requests for eligible confirmed/completed orders.
* **Full Refund:** Complete reversal of order total including taxes and shipping.
* **Partial Refund:** Itemized partial refund calculation with line item validation.
* **Refund Validation:** Guarding against refunding amounts exceeding captured payment total.
* **Refund Status:** Real-time state tracking (`REQUESTED`, `PROCESSING`, `SUCCEEDED`, `FAILED`).
* **Refund History:** Complete audit trail of refund requests and authorizing actors.
* **Refund Failure Handling:** Handling PSP reversal rejections and notifying finance ops.
* **Refund Cancellation:** Aborting un-submitted refund requests.
* **Refund Limits:** Role-based policy limits on maximum refundable amount without senior approval.

---

### 17. Payment Reconciliation

```
┌────────────────────┐    ┌────────────────────┐    ┌─────────────────────┐
│ PSP Settlement Log │ ─► │ Match Processor    │ ─► │ Identify Discrepancy│
│ & Internal Ledger  │    │ ($0.00 Variance)   │    │ & Alert Ops Flag    │
└────────────────────┘    └────────────────────┘    └─────────────────────┘
```

* **Internal Payment Records:** Ledger of all internally recorded payments and refunds.
* **External Payment Records:** Automated ingestion of settlement and payout logs from PSPs.
* **Payment Comparison:** Automated matching engine comparing transaction IDs, amounts, and fees.
* **Matched Payments:** Identifying clean 1-to-1 reconciliations.
* **Missing Payments:** Flagging orphan payments present in PSP but absent internally (or vice versa).
* **Amount Mismatch:** Alerting on rounding or partial charge discrepancies ($0.00 target).
* **Status Mismatch:** Detecting discrepancies between internal order state and PSP settlement state.
* **Duplicate Payments:** Flagging multiple captures against a single order.
* **Reconciliation Reports:** Daily/monthly financial reconciliation summary exports.
* **Reconciliation Status:** Operational status of daily reconciliation job runs.
* **Reconciliation Audit:** Immutable log of manual adjustments and reconciliations.

---

### 18. Fulfillment Management

```
┌───────────────────┐     ┌───────────────────┐     ┌───────────────────┐
│ Paid Order        │ ──► │ Warehouse Routing │ ──► │ Packing Manifest  │
│ Dispatch Trigger  │     │ Assignment Logic  │     │ Generation        │
└───────────────────┘     └───────────────────┘     └───────────────────┘
                                                             │
                                                             ▼
                                                   ┌───────────────────┐
                                                   │ Dispatch Carrier  │
                                                   │ Adapter Trigger   │
                                                   └───────────────────┘
```

* **Fulfillment Creation:** Creating fulfillment orders upon order payment confirmation.
* **Fulfillment Processing:** Dispatching picking instructions to designated warehouse staff.
* **Fulfillment Status:** State tracking (`PENDING`, `PICKING`, `PACKED`, `SHIPPED`, `CANCELLED`).
* **Warehouse Assignment:** Smart routing logic assigning fulfillment to optimal warehouse node.
* **Packing:** Generating packing verification steps and item barcoding validation.
* **Shipment Creation:** Binding packed units to carrier dispatch records.
* **Fulfillment History:** End-to-end operational log of warehouse fulfillment actions.

---

### 19. Shipment Management

```
┌───────────────────┐     ┌───────────────────┐     ┌───────────────────┐
│ Carrier Strategy  │ ──► │ Express API Call  │ ──► │ Tracking Code &   │
│ (FedEx / DHL)     │     │ (Circuit Breaker) │     │ Label PDF Store   │
└───────────────────┘     └───────────────────┘     └───────────────────┘
```

* **Shipment Creation:** Creating physical consignment records with carrier references.
* **Shipment Update:** Updating weight, package dimensions, and carrier references.
* **Shipment Tracking:** Querying live tracking status from carrier APIs.
* **Tracking Number:** Storing and associating carrier tracking identifiers.
* **Carrier Information:** Storing carrier metadata, service tier (Ground, Express, Overnight).
* **Shipment Status:** Real-time synchronization of carrier status updates.
* **Shipment History:** Chronological log of package transit scans and checkpoints.
* **Shipment Cancellation:** Voiding shipping labels and cancelling pickups.
* **Delivery Failure:** Ingesting failed delivery attempts and initiating return-to-origin (RTO).
* **Shipment Events:** Emitting domain events (`ShipmentCreated`, `ShipmentShipped`, `ShipmentDelivered`).

---

### 20. Shipment Lifecycle

```
CREATED ──► PACKED ──► SHIPPED ──► IN_TRANSIT ──► DELIVERED
                                                      │
                                                      ▼
                                           DELIVERY_FAILED / CANCELLED
```

* **Created:** Initial package consignment generated.
* **Packed:** Items verified and sealed in shipping box.
* **Shipped:** Handed over to logistics carrier and initial dispatch scan received.
* **In-Transit:** Out for delivery through carrier network nodes.
* **Delivered:** Package successfully delivered to recipient address.
* **Delivery Failed:** Carrier delivery exception or incorrect address.
* **Cancelled:** Consignment voided prior to dispatch.

---

### 21. Notification System

```
┌───────────────────┐     ┌───────────────────┐     ┌───────────────────┐
│ System Event      │ ──► │ Notification      │ ──► │ Email / Webhook   │
│ Dispatched        │     │ Template Engine   │     │ Provider Gateway  │
└───────────────────┘     └───────────────────┘     └───────────────────┘
                                                             │
                                                             ▼
                                                   ┌───────────────────┐
                                                   │ Retry Engine &    │
                                                   │ Delivery Tracker  │
                                                   └───────────────────┘
```

* **Email Notifications:** Transactional email dispatch via SMTP / AWS SES / SendGrid.
* **Notification Creation:** Ingesting notification requests from system domain events.
* **Notification Templates:** Handlebars-based HTML template rendering engine.
* **Notification Preferences:** Customer and tenant opt-in/opt-out notification channel settings.
* **Notification Status:** State tracking (`QUEUED`, `SENDING`, `SENT`, `FAILED`, `DELIVERED`).
* **Notification Delivery Attempts:** Logging timestamped delivery attempts.
* **Notification Retry:** Exponential backoff retry engine for temporary provider outages.
* **Failed Notification Handling:** Routing undeliverable notifications to Dead-Letter Queue.
* **Notification History:** Auditable log of all dispatched messages and recipient addresses.

---

### 22. Notification Events

```
┌───────────────────┐     ┌───────────────────┐     ┌───────────────────┐
│ Event Publisher   │ ──► │ Router Filtering  │ ──► │ Target Channels   │
│ (Kafka / Redis)   │     │ (Tenant & Event)  │     │ (Email/SMS/HTTP)  │
└───────────────────┘     └───────────────────┘     └───────────────────┘
```

* **Account Created:** Welcome email and verification link dispatch.
* **Email Verified:** Confirmation of verified identity.
* **User Invited:** Organization invitation link delivery.
* **Order Created:** Order receipt acknowledgement to customer.
* **Order Confirmed:** Payment confirmation and invoice delivery.
* **Payment Successful:** Payment receipt with transaction ID snapshot.
* **Payment Failed:** Payment failure alert with checkout recovery link.
* **Order Cancelled:** Order cancellation notice with refund status.
* **Shipment Created:** Shipping label created notification.
* **Shipment Shipped:** Carrier tracking link and estimated delivery date delivery.
* **Shipment Delivered:** Delivery confirmation notification.
* **Refund Completed:** Refund credit confirmation notice.

---

### 23. Audit System

```
┌───────────────────┐     ┌───────────────────┐     ┌───────────────────┐
│ State Mutation    │ ──► │ Capture Actor, IP,│ ──► │ Append-Only DB    │
│ Operational Inter.│     │ Payload Diff Hash │     │ Audit Record Table│
└───────────────────┘     └───────────────────┘     └───────────────────┘
                                                             │
                                                             ▼
                                                   ┌───────────────────┐
                                                   │ Mirror to S3      │
                                                   │ Object Lock (WORM)│
                                                   └───────────────────┘
```

* **Audit Events:** Recording every state-changing mutation across the platform.
* **Authentication Audit:** Login, logout, failed attempt, and password reset records.
* **Authorization Audit:** Access denied events, role assignments, and permission changes.
* **User Activity Audit:** User profile edits, invitations, and status changes.
* **Organization Audit:** Tenant configuration changes, quota updates, and status modifications.
* **Product Audit:** SKU creation, price edits, and inventory metadata adjustments.
* **Inventory Audit:** Inbound stock receipts, manual cycle count adjustments, and write-offs.
* **Order Audit:** Order state transitions, address edits, and manual price overrides.
* **Payment Audit:** Charges, captures, refunds, and gateway webhook payloads.
* **Refund Audit:** Refund requests, authorizations, and PSP reversal execution.
* **Shipment Audit:** Label generation, carrier dispatches, and tracking updates.
* **Administrative Audit:** Platform-wide superadmin operations.
* **Actor Tracking:** Logging `actor_id`, `actor_type` (`USER`, `API_KEY`, `SYSTEM`).
* **IP Tracking:** Recording client IP address and user-agent.
* **Timestamp Tracking:** High-precision UTC timestamp recording.
* **Resource Tracking:** Capturing target `resource_type` and `resource_id`.
* **Change Tracking:** Full `before` and `after` JSON diff snapshot of mutated state.
* **Immutable Audit Records:** PostgreSQL append-only tables with disallowed `UPDATE`/`DELETE` triggers.

---

### 24. Event-Driven Architecture (EDA)

```
┌───────────────────┐     ┌───────────────────┐     ┌───────────────────┐
│ Domain Service    │ ──► │ Publish Event     │ ──► │ Event Bus (Kafka) │
│ Transaction Commit│     │ (CloudEvents)     │     │ Partitioned Keys  │
└───────────────────┘     └───────────────────┘     └───────────────────┘
                                                             │
                                                             ▼
                                                   ┌───────────────────┐
                                                   │ Downstream Consum.│
                                                   │ Deduplication     │
                                                   └───────────────────┘
```

* **Domain Events:** First-class events representing core business occurrences.
* **Event Publishing:** Publishing events to internal messaging bus (Kafka / Redis Streams).
* **Event Consumption:** Async consumer workers processing domain events.
* **Event IDs:** Unique UUIDv7 event identifiers for deterministic tracking.
* **Event Types:** Strict taxonomy formatting (`com.nexora.order.created`).
* **Tenant Context:** Mandatory `tenant_id` propagation in all event headers.
* **Entity Context:** Entity identifiers and entity type metadata attached.
* **Correlation IDs:** End-to-end request tracing spanning HTTP and event boundaries.
* **Causation IDs:** Tracking the root event that caused the current event.
* **Event Versioning:** SemVer schema versioning (`1.0.0`) supporting backward compatibility.
* **Event Ordering:** Partition keys ensuring strict sequence per tenant/order.
* **Duplicate Event Handling:** Idempotent consumer logic rejecting duplicate event IDs.
* **Event Retry:** Configurable retry schedules with exponential backoff.
* **Dead-Letter Handling:** Moving unprocessable poisonous events to DLQ for triage.

---

### 25. Transactional Outbox

```
1. DATABASE TRANSACTION (PostgreSQL ACID)
Write Business Mutation + Insert outbox_events Record
▼
2. OUTBOX CDC POLLER / DEBEZIUM RELAY
Process Unprocessed Events (FOR UPDATE SKIP LOCKED)
▼
3. MESSAGE BROKER (Apache Kafka / Redis Streams)
Publish CloudEvent JSON to Partitioned Broker Topic
```

* **Outbox Events:** Atomic event persistence alongside entity database state.
* **Transactional Event Creation:** Writing outbox record inside active PostgreSQL transaction.
* **Event Publishing:** Outbox worker polling or CDC relay pushing events to message broker.
* **Event Status:** State tracking (`PENDING`, `PUBLISHED`, `FAILED`).
* **Failed Event Retry:** Scheduled retry loop for un-published outbox records.
* **Outbox Monitoring:** Metrics measuring outbox backlog lag and publishing latency.
* **Duplicate Event Protection:** Unique constraints ensuring zero duplicate outbox records.

---

### 26. Background Processing

```
┌───────────────────┐     ┌───────────────────┐     ┌───────────────────┐
│ Async Job Queue   │ ──► │ Worker Execution  │ ──► │ Exponential       │
│ Enqueue Trigger   │     │ Engine            │     │ Backoff Retry     │
└───────────────────┘     └───────────────────┘     └───────────────────┘
                                                             │
                                                             ▼
                                                   ┌───────────────────┐
                                                   │ Move to Dead-     │
                                                   │ Letter Queue (DLQ)│
                                                   └───────────────────┘
```

* **Background Jobs:** Asynchronous tasks for heavy workloads (re-indexing, report exports).
* **Scheduled Jobs:** Cron-like scheduled workflows (e.g., reservation release, nightly reconciliation).
* **Job Retry:** Auto-retrying failed jobs with configurable retry counts.
* **Exponential Backoff:** Increasing retry intervals with randomized jitter.
* **Retry Limits:** Hard threshold preventing infinite worker execution loops.
* **Job Status:** Real-time visibility into job states (`QUEUED`, `ACTIVE`, `COMPLETED`, `FAILED`).
* **Failed Jobs:** Detailed error stack capture and root-cause logging.
* **Dead-Letter Queue (DLQ):** Quarantine queue for permanently failed jobs.
* **Job Monitoring:** Prometheus metrics on queue depth, processing duration, and failure rates.
* **Job Recovery:** Auto-recovering stalled or orphaned worker tasks on node restart.
* **Tenant-Aware Jobs:** Strict tenant context encapsulation inside background job execution.

---

### 27. Redis / Caching

```
┌───────────────────┐     ┌───────────────────┐     ┌───────────────────┐
│ Cache Read Request│ ──► │ Key Lookup        │ ──► │ Hit: Return Cache │
│ (Tenant Namespace)│     │ (volatile-lru)    │     │ Miss: DB Fallback │
└───────────────────┘     └───────────────────┘     └───────────────────┘
```

* **Product Caching:** In-memory caching of high-frequency product catalog reads.
* **Category Caching:** Caching full category hierarchical taxonomy trees.
* **Permission Caching:** Caching user RBAC role-permission matrices (5-min TTL).
* **Session Storage:** High-speed token blacklist and active user session states.
* **Rate Limiting:** Sliding-window rate limit counters stored in Redis.
* **Temporary Data:** Storage for OTPs, reservation locks, and idempotency responses.
* **Cache Expiration:** Configurable TTL enforcement preventing stale data buildup.
* **Cache Invalidation:** Targeted key eviction on catalog/permission write mutations.
* **Tenant-Aware Cache Keys:** Strict namespace formatting: `nexora:{tenantId}:{entity}:{key}`.
* **Cache Failure Handling:** Graceful fallback to PostgreSQL database when Redis is unreachable.

---

### 28. Rate Limiting

```
┌───────────────────┐     ┌───────────────────┐     ┌───────────────────┐
│ Gateway Request   │ ──► │ Redis Token Bucket│ ──► │ Under Limit: Pass │
│ Evaluation        │     │ Sliding Window    │     │ Over Limit: 429   │
└───────────────────┘     └───────────────────┘     └───────────────────┘
```

* **IP-Based Rate Limiting:** Protecting public ingress from DDoS and brute force.
* **User-Based Rate Limiting:** Limiting authenticated user request volume.
* **Tenant-Based Rate Limiting:** Enforcing contractual tenant tier quotas (e.g., 500 req/sec).
* **Endpoint-Based Rate Limiting:** Strict custom rate limits for sensitive routes.
* **Login Rate Limiting:** 5 requests/minute per IP to defeat credential stuffing.
* **Password Reset Rate Limiting:** Strict throttles on password recovery submissions.
* **Payment Rate Limiting:** Throttling payment initiation to prevent card testing attacks.
* **Refund Rate Limiting:** Guarding refund submission endpoints against automated spam.
* **Order Creation Rate Limiting:** Balancing high-volume order ingestion during flash sales.
* **API Key Rate Limiting:** Dedicated rate buckets configured per M2M API key.
* **Rate Limit Headers:** Standard `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset` responses.

---

### 29. Search

```
┌───────────────────┐     ┌───────────────────┐     ┌───────────────────┐
│ Entity Mutation   │ ──► │ Async Reindex     │ ──► │ Full-Text Search  │
│ Event             │     │ Pipeline          │     │ Engine Queries    │
└───────────────────┘     └───────────────────┘     └───────────────────┘
```

* **Product Search:** Fast sub-string and full-text search across titles and descriptions.
* **SKU Search:** Instant lookup by exact SKU code, barcode, or UPC.
* **Customer Search:** Searching customer directories by email, phone, or name.
* **Order Search:** Querying orders by order number, tracking code, or customer email.
* **Full-Text Search:** PostgreSQL `tsvector`/GIN indexed search pipelines.
* **Filtering:** Composable multi-criteria filtering across attributes.
* **Sorting:** Dynamic multi-column sorting capabilities.
* **Pagination:** Fast pagination with accurate total count aggregations.
* **Search Indexing:** Automatic background index updates on entity write mutations.
* **Search Reindexing:** Bulk reindexing tools for maintenance and schema migrations.

---

### 30. API Management

```
┌───────────────────┐     ┌───────────────────┐     ┌───────────────────┐
│ Client REST Call  │ ──► │ Request DTO       │ ──► │ Controller Logic  │
│ (Version Header)  │     │ Validation        │     │ Exec & Response   │
└───────────────────┘     └───────────────────┘     └───────────────────┘
```

* **REST APIs:** Predictable, resource-oriented HTTP APIs with standard verbs.
* **API Versioning:** Clean URI path versioning (`/v1/...`).
* **API Documentation:** OpenAPI 3.0 (Swagger) specification auto-generation.
* **Request Validation:** Strict JSON schema / DTO validation rejecting malformed payloads.
* **Response Validation:** Standardized JSON envelope serialization.
* **Pagination:** Standard `page`, `limit`, `total`, `totalPages` meta wrappers.
* **Filtering:** Standard URL query filter syntax (`?status=ACTIVE&category=electronics`).
* **Sorting:** Standard URL sort parameters (`?sort=-createdAt,price`).
* **API Error Handling:** Centralized global error handling middleware.
* **Standard Error Codes:** Uniform machine-readable error codes (e.g., `INSUFFICIENT_INVENTORY`).
* **API Deprecation:** Structured `Sunset` and `Deprecation` HTTP header signaling.
* **API Inventory:** Documented catalog of all public and internal endpoints.

---

### 31. API Security

```
┌───────────────────┐     ┌───────────────────┐     ┌───────────────────┐
│ Ingress Security  │ ──► │ JWT/Scope Check   │ ──► │ Input Sanitizat.  │
│ Guard (mTLS/CORS) │     │ & BOLA Guards     │     │ & Rate Bucket     │
└───────────────────┘     └───────────────────┘     └───────────────────┘
```

* **Authentication Guards:** Rejecting unauthenticated requests at the ingress gateway.
* **Authorization Checks:** Enforcing role and permission bindings per endpoint.
* **Object-Level Authorization (BOLA Protection):** Verifying entity ownership before data return.
* **Function-Level Authorization (BFLA Protection):** Restricting administrative verbs to authorized roles.
* **Property-Level Authorization:** Stripping sensitive fields based on requester role.
* **Input Validation:** Strict sanitization preventing SQL injection and XSS.
* **Request Size Limits:** Hard body limits (10MB) mitigating payload bomb attacks.
* **Rate Limiting:** Multi-tiered rate limiters protecting upstream services.
* **SSRF Protection:** Whitelisting external webhook destination IP addresses.
* **CORS:** Configurable Cross-Origin Resource Sharing whitelist per tenant domain.
* **Security Headers:** Enforcing `Helmet` protections (`HSTS`, `X-Frame-Options`, `CSP`).
* **API Key Security:** Constant-time hash comparisons preventing timing attacks.
* **Webhook Security:** HMAC SHA-256 signature verification on all incoming webhooks.
* **Sensitive Data Protection:** Masking PII, credit card tokens, and secrets in logs.

---

### 32. Observability

```
┌───────────────────┐     ┌───────────────────┐     ┌───────────────────┐
│ Application Trace │ ──► │ OpenTelemetry     │ ──► │ Grafana Metrics   │
│ Logs & Metrics    │     │ Collector         │     │ & Prometheus      │
└───────────────────┘     └───────────────────┘     └───────────────────┘
```

* **Structured Logging:** JSON logs containing level, timestamp, correlationId, and message.
* **Application Metrics:** Response time, HTTP status code distributions, error rates.
* **Business Metrics:** Order volume, GMV, reservation drop-off, payment decline rates.
* **Distributed Tracing:** OpenTelemetry tracing passing W3C tracecontext headers.
* **Trace IDs:** Unique trace identifiers linking frontend requests to backend database queries.
* **Correlation IDs:** `X-Correlation-ID` header propagation throughout all services.
* **Request IDs:** Unique request tracking for rapid log querying.
* **Health Checks:** Basic `/health` endpoint returning system alive status.
* **Readiness Checks:** `/ready` probe verifying DB and Redis connection pool availability.
* **Liveness Checks:** `/live` probe confirming application loop is non-blocking.
* **Dependency Monitoring:** Tracking latency and uptime of external payment/shipping gateways.
* **Error Tracking:** Integration with Sentry/Datadog for unhandled exception capture.
* **Alerting:** Automated Slack/PagerDuty alerts on elevated 5xx error rates.
* **Dashboards:** Real-time Grafana dashboards visualizing throughput, latency, and worker lag.

---

### 33. Performance

```
┌─────────────────────┐   ┌─────────────────────┐   ┌─────────────────────┐
│ Sub-150ms P95 Target│ ─►│ Connection Pool     │ ─►│ High Throughput     │
│ Benchmark           │   │ PgBouncer Tuning    │   │ Latency SLA Monitor │
└─────────────────────┘   └─────────────────────┘   └─────────────────────┘
```

* **API Performance Monitoring:** Continuous percentile latency tracking.
* **Database Query Monitoring:** Slow query log capture (queries > 50ms).
* **Database Indexing:** Compound and partial indexes optimizing high-volume read paths.
* **Connection Pool Monitoring:** Real-time metrics on PgBouncer / HikariCP active vs idle pools.
* **Cache Performance:** Tracking Redis cache hit/miss ratios.
* **Queue Performance:** Monitoring async background queue job processing throughput.
* **Concurrent Request Testing:** Validating system stability under simultaneous write bursts.
* **Load Testing:** Automated k6 benchmark test suites.
* **Stress Testing:** Identifying breaking points and graceful degradation limits.
* **Latency Monitoring:** Granular latency breakdown across middleware, logic, and DB.
* **Throughput Monitoring:** Tracking total requests per second (RPS) and write TPS.
* **p50 Monitoring:** Ensuring baseline median latency remains below 40ms.
* **p95 Monitoring:** Strict adherence to sub-150ms P95 latency SLA.
* **p99 Monitoring:** Mitigating tail latency spikes under peak load.

---

### 34. Reliability

```
┌───────────────────┐     ┌───────────────────┐     ┌───────────────────┐
│ Dependency Fault  │ ──► │ Circuit Breaker   │ ──► │ Graceful Fallback │
│ Detected          │     │ (Resilience4j)    │     │ Response          │
└───────────────────┘     └───────────────────┘     └───────────────────┘
```

* **Timeout Handling:** Explicit HTTP client timeouts on all third-party network calls.
* **Retry Mechanisms:** Configurable automatic retries on idempotent network failures.
* **Exponential Backoff:** Progressively delayed retries avoiding thundering herd problems.
* **Jitter:** Adding randomized jitter to retry intervals.
* **Circuit Breaker:** Auto-tripping circuit breakers when external PSPs or carriers fail.
* **Failure Isolation:** Preventing downstream microservice failures from cascading upstream.
* **Graceful Degradation:** Serving cached read-only catalog when write paths are stressed.
* **Dependency Failure Handling:** Fallback strategies for external API unavailability.
* **Duplicate Request Handling:** Idempotent locking safeguarding against duplicate actions.
* **Duplicate Event Handling:** Idempotent event consumers discarding repeated events.
* **Crash Recovery:** Fast container restart and clean state re-initialization.
* **Job Recovery:** Automatic reclaiming of stranded background jobs.
* **Data Recovery:** Point-in-time recovery mechanisms for PostgreSQL.

---

### 35. Database

```
┌───────────────────┐     ┌───────────────────┐     ┌───────────────────┐
│ Primary Aurora DB │ ──► │ WAL Streaming     │ ──► │ Secondary Replica │
│ (PostgreSQL 16)   │     │ Replication       │     │ Query Routing     │
└───────────────────┘     └───────────────────┘     └───────────────────┘
```

* **Relational Data Model:** Normalized relational schema optimized for OMS operations.
* **Referential Integrity:** Foreign key constraints enforcing relational validity.
* **Foreign Keys:** Cascade rules safeguarding data consistency.
* **Unique Constraints:** Database-level uniqueness constraints preventing duplicate SKUs/emails.
* **Check Constraints:** Enforcing non-negative stock and valid enum values at database layer.
* **Database Transactions:** ACID compliance for all multi-table mutating operations.
* **Transaction Isolation:** `READ COMMITTED` default with `SELECT FOR UPDATE` where needed.
* **Row-Level Locking:** High-precision pessimistic locking on inventory balance rows.
* **Optimistic Concurrency:** Version column checking (`version = version + 1`) for conflict detection.
* **Database Indexing:** B-Tree, GIN, and Hash indexes on query filter predicates.
* **Query Optimization:** Eliminating N+1 queries using targeted joins and projections.
* **Database Migrations:** Versioned migration scripts (Umzug / Flyway / Knex).
* **Connection Pooling:** PgBouncer pooling optimizing database connection reuse.
* **Backup:** Automated daily snapshots and continuous WAL archival.
* **Restore:** Verified automated database restore validation procedures.
* **Data Retention:** Configurable data archival policies for aged audit records.

---

### 36. Security & Threat Protection

```
┌───────────────────┐     ┌───────────────────┐     ┌───────────────────┐
│ STRIDE Threat     │ ──► │ Key Rotation &    │ ──► │ TLS 1.3 / mTLS    │
│ Mitigation Model  │     │ Secrets Manager   │     │ Encrypted Ingress │
└───────────────────┘     └───────────────────┘     └───────────────────┘
```

* **Threat Modeling:** STRIDE security architecture documentation.
* **OWASP API Security:** Comprehensive defense against OWASP API Top 10 vulnerabilities.
* **Broken Access Control Protection:** Layered RBAC and RLS checks on every query.
* **Authentication Security:** Argon2id / bcrypt password hashing with salt.
* **Password Security:** Minimum 12-char complexity and breach dictionary checking.
* **Session Security:** Cryptographically random session tokens with secure cookie attributes.
* **Token Security:** Asymmetric RS256 key signing with private key stored in Secrets Manager.
* **Replay Attack Protection:** Timestamp validation and nonce checking on sensitive routes.
* **Brute Force Protection:** Progressive IP/User throttling and CAPTCHA integration.
* **Credential Stuffing Protection:** Threat intelligence IP blocking on login routes.
* **Secrets Management:** AWS Secrets Manager / HashiCorp Vault for credential storage.
* **Sensitive Data Classification:** Data catalog categorizing PII and financial records.
* **Security Auditing:** Automated dependency vulnerability scans (npm audit, Snyk, Trivy).

---

### 37. Reporting

```
┌───────────────────┐     ┌───────────────────┐     ┌───────────────────┐
│ Analytics Query   │ ──► │ Read-Replica      │ ──► │ Generated Report  │
│ Request           │     │ Data Extraction   │     │ Document / Stream │
└───────────────────┘     └───────────────────┘     └───────────────────┘
```

* **Order Reports:** Aggregated order volume, revenue, and status breakdown reports.
* **Payment Reports:** Daily payment capture totals, gateway fees, and net revenue.
* **Refund Reports:** Refund totals, return reasons, and dispute rate analysis.
* **Inventory Reports:** Valuation reports, stock turnover rates, and dead stock metrics.
* **Warehouse Reports:** Fulfillment throughput, average pick-and-pack times per node.
* **Failed Payment Reports:** Decline code breakdown and loss analysis.
* **Failed Notification Reports:** Undelivered email/webhook tracking reports.
* **Fulfillment Reports:** Carrier on-time delivery performance benchmarks.
* **Reconciliation Reports:** Daily ledger variance summary audits.
* **Operational Reports:** System uptime, latency percentiles, and resource utilization.

---

### 38. Tenant Operations

```
┌───────────────────┐     ┌───────────────────┐     ┌───────────────────┐
│ Quotas / Limit    │ ──► │ Provisioning &    │ ──► │ Export / Offboard │
│ Operational Track.│     │ Status Control    │     │ Data Engine       │
└───────────────────┘     └───────────────────┘     └───────────────────┘
```

* **Tenant Quotas:** Enforcing SKU, order volume, and storage tier limits.
* **Tenant Usage:** Real-time billing metric aggregation for tenant resource consumption.
* **Tenant Configuration:** Per-tenant feature flags, webhook endpoints, and locale settings.
* **Tenant Suspension:** Administrative locking of delinquent or compromised tenants.
* **Tenant Reactivation:** Seamless unlocking of suspended tenant environments.
* **Tenant Deactivation:** Scheduled deprecation of tenant access.
* **Tenant Offboarding:** Complete purge or archival of tenant database records.
* **Tenant Data Export:** Automated export of all tenant-specific data assets.
* **Tenant Resource Limits:** Dynamic throttling based on contractual service tiers.
* **Tenant Activity Tracking:** Aggregated operational telemetry per tenant.

---

### 39. Platform Administration

```
┌───────────────────┐     ┌───────────────────┐     ┌───────────────────┐
│ Platform Admin    │ ──► │ Multi-Tenant Cross│ ──► │ Global Security & │
│ Dashboard Portal  │     │ Telemetry View    │     │ Health Control    │
└───────────────────┘     └───────────────────┘     └───────────────────┘
```

* **Tenant Management:** Global portal for provisioning, editing, and viewing all tenants.
* **Platform User Management:** Superadmin access control and privilege delegation.
* **Tenant Suspension:** Immediate global killswitch for abusive tenants.
* **Tenant Reactivation:** Restoring tenant service access.
* **Platform Health:** Consolidated multi-region system health status dashboard.
* **Failed Job Monitoring:** Global view of Dead-Letter Queue items across all workers.
* **Reconciliation Monitoring:** Global overview of un-reconciled financial discrepancies.
* **Security Event Monitoring:** Real-time alerts on brute force attacks and rate limit breaches.
* **Platform Audit Logs:** Global immutable audit log of superadmin operations.

---

### 40. Testing

```
┌───────────────────┐     ┌───────────────────┐     ┌───────────────────┐
│ CI Test Suite     │ ──► │ Integration &     │ ──► │ Synthetic Load    │
│ (Unit/Contract)   │     │ Penetration Runs  │     │ & Stress Scen.    │
└───────────────────┘     └───────────────────┘     └───────────────────┘
```

* **Unit Testing:** Comprehensive test suite for isolated domain services and utilities.
* **Integration Testing:** Testing API controllers against real PostgreSQL and Redis instances.
* **API Testing:** Automated REST endpoint contract testing via Supertest.
* **Database Testing:** Verifying migration rollbacks and RLS policy boundaries.
* **Authentication Testing:** Validating JWT token signing, verification, and revocation.
* **Authorization Testing:** Testing RBAC permission matrix enforcement.
* **Tenant Isolation Testing:** Rigorous tests verifying zero cross-tenant data leakage.
* **Concurrency Testing:** Validating inventory decrement accuracy under 500 concurrent threads.
* **Idempotency Testing:** Replaying identical mutation requests to ensure single execution.
* **Event Testing:** Verifying event bus publishing and consumer handling.
* **Webhook Testing:** Mocking PSP and carrier webhook payloads.
* **Failure Testing:** Simulating database disconnections and Redis timeouts.
* **Load Testing:** k6 scripts validating 5,000 write TPS benchmark.
* **Stress Testing:** Pushing system past breaking threshold to test graceful degradation.
* **Security Testing:** OWASP ZAP and static security code analysis in CI pipeline.
* **Contract Testing:** Pact/OpenAPI schema validation preventing breaking API changes.

---

### 41. CI/CD & DevOps

```
┌───────────────────┐     ┌───────────────────┐     ┌───────────────────┐
│ Git Push Event    │ ──► │ Build & Container │ ──► │ ArgoCD Zero-      │
│                   │     │ Vulnerability Scan│     │ Downtime Deploy   │
└───────────────────┘     └───────────────────┘     └───────────────────┘
```

* **Source Control:** Git trunk-based development with branch protection rules.
* **Pull Request Checks:** Automated CI test runs, linting, and security scan gates.
* **Automated Tests:** Unit and integration test execution blocking failing builds.
* **Code Quality Checks:** ESLint, Prettier, and SonarQube static code quality analysis.
* **Security Scanning:** Trivy container vulnerability scans and npm audit checks.
* **Containerization:** Multi-stage production Dockerfiles with minimal Alpine/Distroless bases.
* **Image Scanning:** Automated registry scanning on image push.
* **Automated Build:** Fast reproducible builds via GitHub Actions / GitLab CI.
* **Automated Deployment:** GitOps continuous deployment via ArgoCD.
* **Environment Management:** Isolated configurations for dev, staging, and prod.
* **Configuration Management:** 12-factor application environment variable configuration.
* **Secrets Management:** Injected runtime secrets from AWS Secrets Manager.
* **Health Checks:** Deployment validation via Kubernetes readiness and liveness probes.
* **Deployment Rollback:** Automated instant rollback upon post-deployment probe failures.

---

### 42. Infrastructure

```
┌───────────────────┐     ┌───────────────────┐     ┌───────────────────┐
│ AWS Cloud ALB     │ ──► │ EKS Pod Cluster   │ ──► │ HPA Auto-Scaling  │
│ Ingress Gateway   │     │ (Multi-AZ Nodes)  │     │ Target Scaling    │
└───────────────────┘     └───────────────────┘     └───────────────────┘
```

* **Local Environment:** Docker Compose setup for instant local developer bootstrapping.
* **Test Environment:** Ephemeral CI test environments backed by Testcontainers.
* **Staging Environment:** Production-mirror staging environment on AWS EKS.
* **Production Environment:** Multi-AZ high-availability production cluster.
* **Docker:** Standardized container runtime specifications.
* **Container Orchestration:** Kubernetes (EKS) managing microservice pods.
* **Load Balancing:** AWS Application Load Balancers (ALB) with SSL/TLS termination.
* **Service Discovery:** Kubernetes CoreDNS internal service mesh discovery.
* **Horizontal Scaling:** Horizontal Pod Autoscaler (HPA) scaling on CPU and request latency.
* **Resource Limits:** Strict CPU and memory requests/limits per container pod.
* **Application Health Checks:** Ingress routing based on deep health probes.

---

### 43. Disaster Recovery

```
┌───────────────────┐     ┌───────────────────┐     ┌───────────────────┐
│ Primary Region    │ ──► │ Cross-Region WAL  │ ──► │ Failover Trigger  │
│ (us-east-1)       │     │ Replication       │     │ (us-west-2 Standb)│
└───────────────────┘     └───────────────────┘     └───────────────────┘
```

* **Database Backups:** Automated continuous snapshotting and WAL archiving.
* **Backup Encryption:** AES-256 KMS encryption for all stored database snapshots.
* **Backup Retention:** 30-day automated backup retention policy.
* **Restore Testing:** Monthly automated disaster restore simulation drills.
* **Disaster Recovery Procedure:** Documented step-by-step failover execution runbook.
* **Recovery Point Objective (RPO):** Strict **RPO < 5 seconds** cross-region replication target.
* **Recovery Time Objective (RTO):** Strict **RTO < 15 minutes** failover promotion target.
* **Failure Recovery:** Automated database read-replica promotion upon master failure.
* **Data Recovery:** Point-in-time recovery (PITR) to restore state prior to catastrophic error.

---

### 44. Documentation

```
┌───────────────────┐     ┌───────────────────┐     ┌───────────────────┐
│ System Blueprint  │ ──► │ OpenAPI Specs &   │ ──► │ Operational Runb. │
│ Architecture Specs│     │ Threat Models     │     │ & Disaster Plan   │
└───────────────────┘     └───────────────────┘     └───────────────────┘
```

* **Product Requirements:** Detailed PRDs and functional capability specifications.
* **Domain Model:** Ubiquitous language dictionary and entity relationship diagrams.
* **Architecture Documentation:** High-level system blueprints and component interactions.
* **Database Documentation:** Schema definitions, index catalogs, and RLS policies.
* **API Documentation:** Interactive Swagger UI and OpenAPI 3.0 specifications.
* **Security Documentation:** STRIDE security controls and OWASP mitigation policies.
* **Threat Model:** Comprehensive threat surface analysis and mitigations.
* **Event Documentation:** CloudEvents catalog with schema definitions for all domain events.
* **Failure Scenarios:** Documented failure matrix and automated system recovery behaviors.
* **Architecture Decision Records (ADRs):** Versioned logs of key architectural decisions.
* **Deployment Documentation:** Step-by-step GitOps deployment guides.
* **Disaster Recovery Documentation:** Runbooks for cross-region failover and restore.
* **Operational Runbook:** On-call incident response playbooks and triage guides.
* **Incident Response Documentation:** Severity classification and post-mortem templates.

---

### 45. Universal Channel & Storefront Integrations (Marketplace & E-Commerce Connectors)

```
┌────────────────────────────────────────────────────────────────────────┐
│ External Channels (Shopify / WooCommerce / Magento / Amazon / SDK)     │
└──────────────────────────────────┬─────────────────────────────────────┘
                                   │ Inbound Webhooks & REST/GraphQL Ingress
                                   ▼
┌────────────────────────────────────────────────────────────────────────┐
│ Channel Normalization Adapter Layer                                    │
│ (Transforms platform-specific payloads into Canonical NEXORA DTOs)     │
└──────────────────────────────────┬─────────────────────────────────────┘
                                   │ Standardized Order / Inventory Mutation
                                   ▼
┌────────────────────────────────────────────────────────────────────────┐
│ NEXORA Core Engine (Multi-Tenant RLS & 15-Min Soft Reservation Pool)   │
└──────────────────────────────────┬─────────────────────────────────────┘
                                   │ Outbound Sync (Stock Updates & Tracking Push)
                                   ▼
┌────────────────────────────────────────────────────────────────────────┐
│ Channel Outbox Dispatcher (Shopify Fulfilled + Carrier Tracking Link)  │
└────────────────────────────────────────────────────────────────────────┘
```

* **Shopify App & Plugin Integration:** Certified Shopify public/custom app with OAuth 2.0 handshake, webhook HMAC-SHA256 signature verification, and Shopify GraphQL Admin API bi-directional synchronization.
* **WooCommerce Plugin Integration:** Native WordPress/WooCommerce plugin utilizing WooCommerce REST API v3, custom Action Scheduler queues, and HMAC webhook authentication.
* **Magento 2 (Adobe Commerce) Connector:** Enterprise connector utilizing Magento Asynchronous & Bulk REST APIs for high-volume catalog, stock, and order ingestions.
* **BigCommerce & SFCC Connectors:** Turnkey webhooks and API bridges for BigCommerce and Salesforce Commerce Cloud.
* **Marketplace Connectors (Amazon SP-API & Flipkart):** Automated integration with Amazon Selling Partner API (SP-API) and Flipkart Seller API for order ingestion, order acknowledgment, and settlement tracking.
* **Headless Storefront SDK (`@nexora/commerce-sdk`):** Lightweight TypeScript/Node.js/React SDK allowing custom storefronts (Next.js Commerce, Nuxt, React Native, Flutter) to communicate directly with NEXORA core APIs.
* **Canonical Data Normalization (Adapter Layer):** Domain adapter pattern converting diverse platform schemas into standardized NEXORA entities (`OrderDTO`, `CustomerDTO`, `InventoryDTO`).
* **Bi-Directional Order Synchronization:** Real-time ingestion of new orders from storefronts, and automated status push (`CONFIRMED`, `SHIPPED`, `CANCELLED`) back to connected storefronts.
* **Bi-Directional Real-Time Inventory Sync:** Atomic inventory updates in NEXORA trigger automated stock updates across all active connected sales channels within < 2 seconds, preventing cross-channel overselling.
* **Fulfillment & Tracking Push:** Packaging and carrier dispatch in NEXORA automatically pushes tracking numbers and marks orders as "Fulfilled" in the customer's native storefront.
* **Channel-Specific Inventory Buffers & Safety Stock:** Configurable rules per channel (e.g., reserve 80% stock for Shopify, 20% for Amazon, or hold a 5-unit safety buffer).
* **Channel Rate-Limit & Leaky Bucket Handling:** Dynamic queuing and exponential backoff honoring storefront API limits (e.g., Shopify 40 req/sec bucket).
* **Channel Webhook Auto-Recovery:** Automated webhook replay and reconciliation jobs to recover missed events during external platform downtime.

---

### 46. Returns, Exchanges & Reverse Logistics (RMA)

```
┌──────────────────┐     ┌──────────────────┐     ┌──────────────────┐
│ Customer Portal  │ ──► │ RMA Authorization│ ──► │ Reverse Carrier  │
│ Return Request   │     │ & Policy Check   │     │ Pickup Scheduled │
└──────────────────┘     └──────────────────┘     └──────────────────┘
                                                           │
                                                           ▼
┌──────────────────┐     ┌──────────────────┐     ┌──────────────────┐
│ Resolution:      │ ◄── │ Warehouse Intake │ ◄── │ Carrier In-Transit│
│ Restock/Refund/  │     │ & QA Grading     │     │ Package Scans    │
│ Exchange Order   │     │ (Sellable/Scrap) │     │                  │
└──────────────────┘     └──────────────────┘     └──────────────────┘
```

* **Customer Self-Service Return Portal:** Branded customer-facing interface to submit return and exchange requests against eligible orders.
* **Return Policy Validation Engine:** Configurable return eligibility rules (e.g., 7/15/30-day return windows, non-returnable categories, hygiene seal verification).
* **RMA (Return Merchandise Authorization) Generation:** System-generated unique RMA identifier tracking goods from customer dispatch to warehouse intake.
* **Reverse Shipping Label Generation:** Instant automated generation of prepaid return shipping labels via integrated carrier APIs (Delhivery, BlueDart, FedEx).
* **Reverse Logistics Tracking:** Real-time carrier milestone synchronization (`PICKUP_SCHEDULED`, `OUT_FOR_PICKUP`, `PICKED_UP`, `IN_TRANSIT_RTO`, `RECEIVED_AT_HUB`).
* **Warehouse Return Intake & QA Inspection:** Warehouse tablet/scanner workflow for inspecting returned merchandise and assigning quality grades (`SELLABLE`, `REFURBISHABLE`, `DAMAGED_SCRAP`).
* **Automated Stock Disposition & Restocking:** Automatic ledger credit back to active sellable inventory for passed items, or quarantined damaged inventory ledger.
* **Product Exchange & Replacement Order Automation:** Creation of linked zero-value replacement orders with instant inventory soft holds and warehouse dispatch triggers.
* **Return Fraud Detection:** AI and rules-based flagging for suspicious return behavior (serial returners, empty box claims, tag tampering).

---

### 47. Omnichannel Retail Fulfillment (BOPIS, BORIS & Ship-from-Store)

```
┌──────────────────┐     ┌──────────────────┐     ┌──────────────────┐
│ Online Checkout  │ ──► │ Store Selection  │ ──► │ Store Associate  │
│ (BOPIS Selected) │     │ & Local Hold     │     │ Mobile Picking   │
└──────────────────┘     └──────────────────┘     └──────────────────┘
                                                           │
                                                           ▼
┌──────────────────┐     ┌──────────────────┐     ┌──────────────────┐
│ Post-Sale Return │     │ Customer Handover│ ◄── │ Staged & Ready   │
│ In Store (BORIS) │     │ via OTP / Barcode│     │ Customer Notified│
└──────────────────┘     └──────────────────┘     └──────────────────┘
```

* **BOPIS (Buy Online, Pick Up In Store):** Ingress routing allowing customers to select physical store locations at checkout for local collection.
* **Real-Time Store Inventory Visibility:** Localized inventory lookup enabling customer order allocation directly against retail store shelves.
* **Store Associate Mobile Fulfillment App:** Lightweight mobile UI for store associates to receive picking alerts, barcode-scan items off retail shelves, and stage packages.
* **Customer Pickup Verification:** Secure handover validation utilizing one-time PIN (OTP) or customer QR/Barcode scanning before order status moves to `COMPLETED`.
* **BORIS (Buy Online, Return In Store):** In-store return desk capability allowing customers to return online purchases at physical retail counters with instant validation and refund.
* **Ship-from-Store (SFS) Routing:** Intelligent DOM routing enabling retail stores to act as localized fulfillment micro-hubs, minimizing carrier transit time and delivery expenses.
* **Store Capacity & Shift Quotas:** Configurable daily fulfillment thresholds per store preventing retail staff overload during peak shopping hours.

---

### 48. Advanced Promotions, Discounts & Coupon Engine

```
┌──────────────────┐     ┌──────────────────┐     ┌──────────────────┐
│ Cart Items &     │ ──► │ Promotion Rule   │ ──► │ Discount Split & │
│ Tenant Context   │     │ Evaluation Matrix│     │ Line-Item Apport.│
└──────────────────┘     └──────────────────┘     └──────────────────┘
                                                           │
                                                           ▼
                                                  ┌──────────────────┐
                                                  │ Order Snapshot & │
                                                  │ Financial Ledger │
                                                  └──────────────────┘
```

* **Voucher & Coupon Management:** Multi-tenant coupon code generation with configurable redemption limits (single-use, per-customer, total platform cap).
* **Tiered & Cart-Level Discounts:** Percentage discounts, flat monetary deductions, and spend-threshold tiers (e.g., "Spend $100, get $20 off").
* **Complex Promotional Rule Sets:** BOGO (Buy One Get One), Buy X Get Y at Z% discount, free shipping promotions, and gift-with-purchase (GWP) automation.
* **Promotional Stacking & Exclusivity Rules:** Granular configuration determining whether multiple promotions, coupons, or automatic discounts can be combined.
* **Channel & Category Scoping:** Restricting promotions to specific sales channels (e.g., "Shopify App Exclusive"), product categories, or customer tiers (VIP/Gold).
* **Dynamic Campaign Scheduling:** Timezone-aware promotion start and end triggers with automated cache invalidation.
* **Line-Item Discount Apportionment:** Pro-rata allocation of cart-level discounts across line items for mathematically precise tax and refund handling.

---

### 49. Product Bundling, Kitting & Bill of Materials (BOM)

```
┌──────────────────┐     ┌──────────────────┐     ┌──────────────────┐
│ Bundle SKU       │ ──► │ BOM Resolution   │ ──► │ Atomic Multi-SKU │
│ Ordered          │     │ (Components A+B) │     │ Inventory Hold   │
└──────────────────┘     └──────────────────┘     └──────────────────┘
                                                           │
                                                           ▼
                                                  ┌──────────────────┐
                                                  │ Warehouse Kit    │
                                                  │ Assembly Picking │
                                                  └──────────────────┘
```

* **Virtual Bundles & Composite SKUs:** Defining aggregate parent SKUs composed of multiple independent physical inventory components (Bill of Materials - BOM).
* **Dynamic Stock Resolution:** Live calculation of bundle availability based strictly on the limiting component:
  $$	ext{Stock}_{	ext{Bundle}} = \min \left( \left\lfloor rac{	ext{Stock}_i}{	ext{Qty}_i} 
ight
floor 
ight) \quad orall \, i \in 	ext{Components}$$
* **Atomic Multi-SKU Inventory Lock:** Simultaneous distributed locking and reservation across all component SKUs upon order ingestion.
* **Physical Kitting & Assembly Workflows:** Warehouse work-order generation for pre-packing bundles prior to dispatch.
* **Bundle De-Kitting & Component Returns:** Dynamic breakdown of bundle components during returns, allowing partial restocking of undamaged constituent items.
* **Component-Level Tax & Revenue Recognition:** Itemized accounting allocation across bundle items compliant with statutory financial reporting standards.

---

### 50. Tax Compliance, Invoicing & Legal Document Generation

```
┌──────────────────┐     ┌──────────────────┐     ┌──────────────────┐
│ Order Confirmed  │ ──► │ Tax Calculation  │ ──► │ PDF Generation & │
│ & Paid           │     │ Engine (Avalara) │     │ Digital Signature│
└──────────────────┘     └──────────────────┘     └──────────────────┘
                                                           │
                                                           ▼
                                                  ┌──────────────────┐
                                                  │ S3 Storage &     │
                                                  │ Customer/WMS URL │
                                                  └──────────────────┘
```

* **Automated Tax Engine Integrations:** Plug-and-play adapters for leading enterprise tax engines (Avalara AvaTax, TaxJar, Stripe Tax, Vertex).
* **Regional & Statutory Tax Support:** Dynamic tax computation across jurisdictions: US State/County Sales Tax, Canadian GST/PST, European VAT, and Indian GST (CGST, SGST, IGST with HSN/SAC codes).
* **Legal Tax Invoice Generation:** Deterministic PDF rendering of branded tax invoices complete with sequential numbering, QR codes, and digital verification signatures.
* **Credit Notes & Debit Notes:** Automated generation of legally compliant credit notes upon partial/full refund or return completion.
* **Warehouse Documentation:** High-speed batch rendering of thermal shipping labels (ZPL/PDF), packing manifests, pick lists, and box labels.
* **Government Portal Compliance:** Automated e-Way bill and e-Invoicing API integration for applicable cross-border and regional logistics mandates.

---

### 51. Pre-Orders, Backorders & Split Shipment Allocation

```
┌──────────────────┐     ┌──────────────────┐     ┌──────────────────┐
│ Stock = 0        │ ──► │ Policy Check     │ ──► │ Pre-Order Queue  │
│ Order Placement  │     │ (Allow Backorder)│     │ Created & Locked │
└──────────────────┘     └──────────────────┘     └──────────────────┘
                                                           │
                                                           ▼
┌──────────────────┐     ┌──────────────────┐     ┌──────────────────┐
│ Warehouse        │ ◄── │ Wave Allocation  │ ◄── │ Inbound Supplier │
│ Dispatch Order   │     │ (FIFO Priority)  │     │ Shipment Docked  │
└──────────────────┘     └──────────────────┘     └──────────────────┘
```

* **Pre-Order Launch Engine:** Product launch management allowing customer pre-purchases with promised fulfillment release dates.
* **Backorder Management System:** Configurable per-SKU backorder policies allowing continuous order intake beyond physical inventory limits.
* **Automated Fulfillment Wave Triggers:** As soon as inbound replenishment shipments (ASNs) dock and are scanned into inventory, the backorder queue is atomically allocated based on First-In, First-Out (FIFO) priority.
* **Intelligent Split Shipments:** Dynamic splitting of mixed orders into separate fulfillment consignments (shipping in-stock items immediately and holding backordered items for second-wave dispatch).
* **Consolidated Parent-Child Tracking:** Single unified customer order view linking multiple independent carrier tracking numbers and packages.

---

### 52. Vendor & Drop-Shipping Management

```
┌──────────────────┐     ┌──────────────────┐     ┌──────────────────┐
│ Multi-Vendor     │ ──► │ Vendor Order     │ ──► │ Vendor Portal /  │
│ Order Ingested   │     │ Split Routing    │     │ EDI Transmission │
└──────────────────┘     └──────────────────┘     └──────────────────┘
                                                           │
                                                           ▼
┌──────────────────┐     ┌──────────────────┐     ┌──────────────────┐
│ Customer Delivery│ ◄── │ Carrier Tracking │ ◄── │ Vendor Pack &    │
│ & Vendor Payout  │     │ Ingested via API │     │ Dispatch Manifest│
└──────────────────┘     └──────────────────┘     └──────────────────┘
```

* **Vendor & Supplier Onboarding:** Comprehensive vendor profiles, commission rules, SLA targets, and warehouse address mapping.
* **Automated Drop-Ship Routing:** Automatic routing of line items directly to third-party suppliers based on vendor SKU assignment and contracts.
* **Supplier Self-Service Portal:** Secure portal for drop-ship suppliers to acknowledge orders, download tenant-branded packing slips, and upload dispatch tracking IDs.
* **EDI & B2B API Bridges:** Support for enterprise electronic data interchange (EDI 850, 856, 810) and REST webhooks for automated supplier synchronization.
* **Purchase Order (PO) Lifecycle:** End-to-end PO creation, approval workflow, supplier transmission, and warehouse dock receiving against PO line items.
* **Vendor Settlement & Commission Accounting:** Automated calculation of vendor cost-of-goods, commission deductions, and payment remittance statements.

---

### 53. Cash on Delivery (COD) & Predictive Risk Engine

```
┌──────────────────┐     ┌──────────────────┐     ┌──────────────────┐
│ COD Order Placed │ ──► │ NDR/RTO AI Risk  │ ──► │ Automated Verify │
│ Ingress Layer    │     │ Scoring Model    │     │ (WhatsApp/OTP)   │
└──────────────────┘     └──────────────────┘     └──────────────────┘
                                                           │
                                                           ▼
┌──────────────────┐     ┌──────────────────┐     ┌──────────────────┐
│ Remittance Ledger│ ◄── │ Cash Collected   │ ◄── │ Carrier Out For  │
│ Reconciliation   │     │ by Courier Agent │     │ Delivery Scan    │
└──────────────────┘     └──────────────────┘     └──────────────────┘
```

* **Automated COD Verification:** Multi-channel automated buyer verification workflows (Interactive WhatsApp confirmation, SMS one-time passcode, automated IVR call) prior to warehouse dispatch.
* **Predictive Non-Delivery (NDR) & RTO Risk Scoring:** Machine learning / heuristic scoring analyzing customer address completeness, past return history, pin-code risk, and order value to flag high-risk orders.
* **Fraud & Risk Action Matrix:** Automated actions based on risk threshold (auto-hold for manual review, require pre-payment deposit, or request address correction).
* **Courier Cash-in-Transit (CIT) Tracking:** Dedicated ledger tracking expected vs actual physical cash collected by 3PL courier partners.
* **COD Remittance Reconciliation:** Daily/weekly automated reconciliation matching 3PL bank deposits and payout statements against collected cash amounts, flagging courier settlement discrepancies.
* **Tenant COD Policies & Limits:** Dynamic rule configuration capping maximum allowed COD order value, restricting high-fraud postal codes, or charging non-refundable COD handling fees.


---

## 🗄️ Complete 45-Table Master Data Dictionary & Column Specification

This section provides the exhaustive, production-verified database schema definition across all 45 tables and 420 columns with data types, nullability, and default constraints.

### 1. `api_keys`

| Column | Data Type | Nullable | Default Value | Description / Constraint |
| :--- | :--- | :---: | :--- | :--- |
| `id` | `UUID` | **NOT NULL** | `gen_random_uuid()` | Primary Key (UUID) |
| `tenant_id` | `UUID` | **NOT NULL** | - | Tenant Isolation Key (RLS scoped FK) |
| `name` | `VARCHAR` | **NOT NULL** | - | name attribute |
| `key_prefix` | `VARCHAR` | **NOT NULL** | - | key_prefix attribute |
| `key_hash` | `VARCHAR` | **NOT NULL** | - | key_hash attribute |
| `scopes` | `ARRAY` | Nullable | `'{read}'[]` | scopes attribute |
| `is_active` | `BOOLEAN` | **NOT NULL** | `true` | is_active attribute |
| `expires_at` | `TIMESTAMP WITH TIME ZONE` | Nullable | - | expires_at attribute |
| `last_used_at` | `TIMESTAMP WITH TIME ZONE` | Nullable | - | last_used_at attribute |
| `created_at` | `TIMESTAMP WITH TIME ZONE` | **NOT NULL** | `now()` | Record creation timestamp |

### 2. `audit_logs`

| Column | Data Type | Nullable | Default Value | Description / Constraint |
| :--- | :--- | :---: | :--- | :--- |
| `id` | `UUID` | **NOT NULL** | `gen_random_uuid()` | Primary Key (UUID) |
| `tenant_id` | `UUID` | **NOT NULL** | - | Tenant Isolation Key (RLS scoped FK) |
| `actor_id` | `UUID` | Nullable | - | Foreign Key reference (actor) |
| `actor_type` | `VARCHAR` | **NOT NULL** | - | actor_type attribute |
| `action` | `VARCHAR` | **NOT NULL** | - | action attribute |
| `resource_type` | `VARCHAR` | **NOT NULL** | - | resource_type attribute |
| `resource_id` | `VARCHAR` | **NOT NULL** | - | Foreign Key reference (resource) |
| `ip_address` | `VARCHAR` | Nullable | - | ip_address attribute |
| `user_agent` | `TEXT` | Nullable | - | user_agent attribute |
| `diff_payload` | `JSONB` | Nullable | `'{}'` | diff_payload attribute |
| `correlation_id` | `VARCHAR` | Nullable | - | Foreign Key reference (correlation) |
| `created_at` | `TIMESTAMP WITH TIME ZONE` | **NOT NULL** | `now()` | Record creation timestamp |

### 3. `backorder_queues`

| Column | Data Type | Nullable | Default Value | Description / Constraint |
| :--- | :--- | :---: | :--- | :--- |
| `id` | `UUID` | **NOT NULL** | `gen_random_uuid()` | Primary Key (UUID) |
| `tenant_id` | `UUID` | **NOT NULL** | - | Tenant Isolation Key (RLS scoped FK) |
| `product_id` | `UUID` | **NOT NULL** | - | Foreign Key reference (product) |
| `order_id` | `UUID` | **NOT NULL** | - | Foreign Key reference (order) |
| `quantity` | `INTEGER` | **NOT NULL** | - | quantity attribute |
| `priority` | `INTEGER` | **NOT NULL** | `1` | priority attribute |
| `is_allocated` | `BOOLEAN` | **NOT NULL** | `false` | is_allocated attribute |
| `created_at` | `TIMESTAMP WITH TIME ZONE` | **NOT NULL** | `now()` | Record creation timestamp |

### 4. `bopis_pickups`

| Column | Data Type | Nullable | Default Value | Description / Constraint |
| :--- | :--- | :---: | :--- | :--- |
| `id` | `UUID` | **NOT NULL** | `gen_random_uuid()` | Primary Key (UUID) |
| `tenant_id` | `UUID` | **NOT NULL** | - | Tenant Isolation Key (RLS scoped FK) |
| `order_id` | `UUID` | **NOT NULL** | - | Foreign Key reference (order) |
| `store_warehouse_id` | `UUID` | **NOT NULL** | - | Foreign Key reference (store_warehouse) |
| `pickup_pin_hash` | `VARCHAR` | **NOT NULL** | - | pickup_pin_hash attribute |
| `is_staged` | `BOOLEAN` | **NOT NULL** | `false` | is_staged attribute |
| `picked_up_at` | `TIMESTAMP WITH TIME ZONE` | Nullable | - | picked_up_at attribute |
| `picked_up_by_name` | `VARCHAR` | Nullable | - | picked_up_by_name attribute |
| `created_at` | `TIMESTAMP WITH TIME ZONE` | **NOT NULL** | `now()` | Record creation timestamp |

### 5. `bundles`

| Column | Data Type | Nullable | Default Value | Description / Constraint |
| :--- | :--- | :---: | :--- | :--- |
| `id` | `UUID` | **NOT NULL** | `gen_random_uuid()` | Primary Key (UUID) |
| `tenant_id` | `UUID` | **NOT NULL** | - | Tenant Isolation Key (RLS scoped FK) |
| `bundle_product_id` | `UUID` | **NOT NULL** | - | Foreign Key reference (bundle_product) |
| `component_product_id` | `UUID` | **NOT NULL** | - | Foreign Key reference (component_product) |
| `quantity` | `INTEGER` | **NOT NULL** | `1` | quantity attribute |
| `created_at` | `TIMESTAMP WITH TIME ZONE` | **NOT NULL** | `now()` | Record creation timestamp |

### 6. `categories`

| Column | Data Type | Nullable | Default Value | Description / Constraint |
| :--- | :--- | :---: | :--- | :--- |
| `id` | `UUID` | **NOT NULL** | `gen_random_uuid()` | Primary Key (UUID) |
| `tenant_id` | `UUID` | **NOT NULL** | - | Tenant Isolation Key (RLS scoped FK) |
| `parent_id` | `UUID` | Nullable | - | Foreign Key reference (parent) |
| `slug` | `VARCHAR` | **NOT NULL** | - | slug attribute |
| `name` | `VARCHAR` | **NOT NULL** | - | name attribute |
| `description` | `TEXT` | Nullable | - | description attribute |
| `created_at` | `TIMESTAMP WITH TIME ZONE` | **NOT NULL** | `now()` | Record creation timestamp |

### 7. `channel_sync_logs`

| Column | Data Type | Nullable | Default Value | Description / Constraint |
| :--- | :--- | :---: | :--- | :--- |
| `id` | `UUID` | **NOT NULL** | `gen_random_uuid()` | Primary Key (UUID) |
| `tenant_id` | `UUID` | **NOT NULL** | - | Tenant Isolation Key (RLS scoped FK) |
| `channel_id` | `UUID` | **NOT NULL** | - | Foreign Key reference (channel) |
| `sync_type` | `VARCHAR` | **NOT NULL** | - | sync_type attribute |
| `status` | `VARCHAR` | **NOT NULL** | - | Status state enum |
| `details` | `JSONB` | Nullable | `'{}'` | details attribute |
| `created_at` | `TIMESTAMP WITH TIME ZONE` | **NOT NULL** | `now()` | Record creation timestamp |

### 8. `channels`

| Column | Data Type | Nullable | Default Value | Description / Constraint |
| :--- | :--- | :---: | :--- | :--- |
| `id` | `UUID` | **NOT NULL** | `gen_random_uuid()` | Primary Key (UUID) |
| `tenant_id` | `UUID` | **NOT NULL** | - | Tenant Isolation Key (RLS scoped FK) |
| `code` | `VARCHAR` | **NOT NULL** | - | code attribute |
| `name` | `VARCHAR` | **NOT NULL** | - | name attribute |
| `type` | `VARCHAR` | **NOT NULL** | - | type attribute |
| `is_active` | `BOOLEAN` | **NOT NULL** | `true` | is_active attribute |
| `credentials` | `JSONB` | Nullable | `'{}'` | credentials attribute |
| `settings` | `JSONB` | Nullable | `'{"auto_fulfill": true, "auto_sync_stock": true, "stock_buffer_percentage": 0}'` | settings attribute |
| `created_at` | `TIMESTAMP WITH TIME ZONE` | **NOT NULL** | `now()` | Record creation timestamp |
| `updated_at` | `TIMESTAMP WITH TIME ZONE` | **NOT NULL** | `now()` | Last update timestamp |

### 9. `coupon_redemptions`

| Column | Data Type | Nullable | Default Value | Description / Constraint |
| :--- | :--- | :---: | :--- | :--- |
| `id` | `UUID` | **NOT NULL** | `gen_random_uuid()` | Primary Key (UUID) |
| `tenant_id` | `UUID` | **NOT NULL** | - | Tenant Isolation Key (RLS scoped FK) |
| `promotion_id` | `UUID` | **NOT NULL** | - | Foreign Key reference (promotion) |
| `order_id` | `UUID` | **NOT NULL** | - | Foreign Key reference (order) |
| `customer_id` | `UUID` | Nullable | - | Foreign Key reference (customer) |
| `discount_applied` | `NUMERIC` | **NOT NULL** | - | discount_applied attribute |
| `redeemed_at` | `TIMESTAMP WITH TIME ZONE` | **NOT NULL** | `now()` | redeemed_at attribute |

### 10. `credit_notes`

| Column | Data Type | Nullable | Default Value | Description / Constraint |
| :--- | :--- | :---: | :--- | :--- |
| `id` | `UUID` | **NOT NULL** | `gen_random_uuid()` | Primary Key (UUID) |
| `tenant_id` | `UUID` | **NOT NULL** | - | Tenant Isolation Key (RLS scoped FK) |
| `invoice_id` | `UUID` | **NOT NULL** | - | Foreign Key reference (invoice) |
| `credit_note_number` | `VARCHAR` | **NOT NULL** | - | credit_note_number attribute |
| `amount` | `NUMERIC` | **NOT NULL** | - | Financial / monetary value |
| `pdf_url` | `TEXT` | Nullable | - | pdf_url attribute |
| `created_at` | `TIMESTAMP WITH TIME ZONE` | **NOT NULL** | `now()` | Record creation timestamp |

### 11. `customers`

| Column | Data Type | Nullable | Default Value | Description / Constraint |
| :--- | :--- | :---: | :--- | :--- |
| `id` | `UUID` | **NOT NULL** | `gen_random_uuid()` | Primary Key (UUID) |
| `tenant_id` | `UUID` | **NOT NULL** | - | Tenant Isolation Key (RLS scoped FK) |
| `email` | `VARCHAR` | **NOT NULL** | - | email attribute |
| `first_name` | `VARCHAR` | Nullable | - | first_name attribute |
| `last_name` | `VARCHAR` | Nullable | - | last_name attribute |
| `phone` | `VARCHAR` | Nullable | - | phone attribute |
| `shipping_addresses` | `JSONB` | Nullable | `'[]'` | shipping_addresses attribute |
| `is_blacklisted` | `BOOLEAN` | **NOT NULL** | `false` | is_blacklisted attribute |
| `created_at` | `TIMESTAMP WITH TIME ZONE` | **NOT NULL** | `now()` | Record creation timestamp |
| `updated_at` | `TIMESTAMP WITH TIME ZONE` | **NOT NULL** | `now()` | Last update timestamp |

### 12. `fulfillment_items`

| Column | Data Type | Nullable | Default Value | Description / Constraint |
| :--- | :--- | :---: | :--- | :--- |
| `id` | `UUID` | **NOT NULL** | `gen_random_uuid()` | Primary Key (UUID) |
| `tenant_id` | `UUID` | **NOT NULL** | - | Tenant Isolation Key (RLS scoped FK) |
| `fulfillment_id` | `UUID` | **NOT NULL** | - | Foreign Key reference (fulfillment) |
| `order_item_id` | `UUID` | **NOT NULL** | - | Foreign Key reference (order_item) |
| `quantity` | `INTEGER` | **NOT NULL** | - | quantity attribute |
| `created_at` | `TIMESTAMP WITH TIME ZONE` | **NOT NULL** | `now()` | Record creation timestamp |

### 13. `fulfillments`

| Column | Data Type | Nullable | Default Value | Description / Constraint |
| :--- | :--- | :---: | :--- | :--- |
| `id` | `UUID` | **NOT NULL** | `gen_random_uuid()` | Primary Key (UUID) |
| `tenant_id` | `UUID` | **NOT NULL** | - | Tenant Isolation Key (RLS scoped FK) |
| `order_id` | `UUID` | **NOT NULL** | - | Foreign Key reference (order) |
| `warehouse_id` | `UUID` | **NOT NULL** | - | Foreign Key reference (warehouse) |
| `status` | `fulfillment_status` | **NOT NULL** | `'PENDING'` | Status state enum |
| `created_at` | `TIMESTAMP WITH TIME ZONE` | **NOT NULL** | `now()` | Record creation timestamp |
| `updated_at` | `TIMESTAMP WITH TIME ZONE` | **NOT NULL** | `now()` | Last update timestamp |

### 14. `inventory_adjustments`

| Column | Data Type | Nullable | Default Value | Description / Constraint |
| :--- | :--- | :---: | :--- | :--- |
| `id` | `UUID` | **NOT NULL** | `gen_random_uuid()` | Primary Key (UUID) |
| `tenant_id` | `UUID` | **NOT NULL** | - | Tenant Isolation Key (RLS scoped FK) |
| `warehouse_id` | `UUID` | **NOT NULL** | - | Foreign Key reference (warehouse) |
| `product_id` | `UUID` | **NOT NULL** | - | Foreign Key reference (product) |
| `quantity_delta` | `INTEGER` | **NOT NULL** | - | quantity_delta attribute |
| `reason` | `VARCHAR` | **NOT NULL** | - | reason attribute |
| `adjusted_by` | `UUID` | Nullable | - | adjusted_by attribute |
| `created_at` | `TIMESTAMP WITH TIME ZONE` | **NOT NULL** | `now()` | Record creation timestamp |

### 15. `inventory_items`

| Column | Data Type | Nullable | Default Value | Description / Constraint |
| :--- | :--- | :---: | :--- | :--- |
| `id` | `UUID` | **NOT NULL** | `gen_random_uuid()` | Primary Key (UUID) |
| `tenant_id` | `UUID` | **NOT NULL** | - | Tenant Isolation Key (RLS scoped FK) |
| `warehouse_id` | `UUID` | **NOT NULL** | - | Foreign Key reference (warehouse) |
| `product_id` | `UUID` | **NOT NULL** | - | Foreign Key reference (product) |
| `on_hand` | `INTEGER` | **NOT NULL** | `0` | on_hand attribute |
| `reserved` | `INTEGER` | **NOT NULL** | `0` | reserved attribute |
| `safety_stock` | `INTEGER` | **NOT NULL** | `0` | safety_stock attribute |
| `damaged` | `INTEGER` | **NOT NULL** | `0` | damaged attribute |
| `updated_at` | `TIMESTAMP WITH TIME ZONE` | **NOT NULL** | `now()` | Last update timestamp |

### 16. `inventory_reservations`

| Column | Data Type | Nullable | Default Value | Description / Constraint |
| :--- | :--- | :---: | :--- | :--- |
| `id` | `UUID` | **NOT NULL** | `gen_random_uuid()` | Primary Key (UUID) |
| `tenant_id` | `UUID` | **NOT NULL** | - | Tenant Isolation Key (RLS scoped FK) |
| `order_id` | `UUID` | Nullable | - | Foreign Key reference (order) |
| `product_id` | `UUID` | **NOT NULL** | - | Foreign Key reference (product) |
| `warehouse_id` | `UUID` | **NOT NULL** | - | Foreign Key reference (warehouse) |
| `quantity` | `INTEGER` | **NOT NULL** | - | quantity attribute |
| `expires_at` | `TIMESTAMP WITH TIME ZONE` | **NOT NULL** | - | expires_at attribute |
| `is_released` | `BOOLEAN` | **NOT NULL** | `false` | is_released attribute |
| `created_at` | `TIMESTAMP WITH TIME ZONE` | **NOT NULL** | `now()` | Record creation timestamp |

### 17. `invoices`

| Column | Data Type | Nullable | Default Value | Description / Constraint |
| :--- | :--- | :---: | :--- | :--- |
| `id` | `UUID` | **NOT NULL** | `gen_random_uuid()` | Primary Key (UUID) |
| `tenant_id` | `UUID` | **NOT NULL** | - | Tenant Isolation Key (RLS scoped FK) |
| `order_id` | `UUID` | **NOT NULL** | - | Foreign Key reference (order) |
| `invoice_number` | `VARCHAR` | **NOT NULL** | - | invoice_number attribute |
| `pdf_url` | `TEXT` | Nullable | - | pdf_url attribute |
| `tax_breakdown` | `JSONB` | **NOT NULL** | `'{}'` | tax_breakdown attribute |
| `total_amount` | `NUMERIC` | **NOT NULL** | - | Financial / monetary value |
| `currency` | `VARCHAR` | **NOT NULL** | - | currency attribute |
| `created_at` | `TIMESTAMP WITH TIME ZONE` | **NOT NULL** | `now()` | Record creation timestamp |

### 18. `order_holds`

| Column | Data Type | Nullable | Default Value | Description / Constraint |
| :--- | :--- | :---: | :--- | :--- |
| `id` | `UUID` | **NOT NULL** | `gen_random_uuid()` | Primary Key (UUID) |
| `tenant_id` | `UUID` | **NOT NULL** | - | Tenant Isolation Key (RLS scoped FK) |
| `order_id` | `UUID` | **NOT NULL** | - | Foreign Key reference (order) |
| `reason` | `VARCHAR` | **NOT NULL** | - | reason attribute |
| `is_resolved` | `BOOLEAN` | **NOT NULL** | `false` | is_resolved attribute |
| `resolved_by` | `UUID` | Nullable | - | resolved_by attribute |
| `resolved_at` | `TIMESTAMP WITH TIME ZONE` | Nullable | - | resolved_at attribute |
| `created_at` | `TIMESTAMP WITH TIME ZONE` | **NOT NULL** | `now()` | Record creation timestamp |

### 19. `order_items`

| Column | Data Type | Nullable | Default Value | Description / Constraint |
| :--- | :--- | :---: | :--- | :--- |
| `id` | `UUID` | **NOT NULL** | `gen_random_uuid()` | Primary Key (UUID) |
| `tenant_id` | `UUID` | **NOT NULL** | - | Tenant Isolation Key (RLS scoped FK) |
| `order_id` | `UUID` | **NOT NULL** | - | Foreign Key reference (order) |
| `product_id` | `UUID` | **NOT NULL** | - | Foreign Key reference (product) |
| `sku` | `VARCHAR` | **NOT NULL** | - | sku attribute |
| `title` | `VARCHAR` | **NOT NULL** | - | title attribute |
| `quantity` | `INTEGER` | **NOT NULL** | - | quantity attribute |
| `unit_price` | `NUMERIC` | **NOT NULL** | - | Financial / monetary value |
| `tax_amount` | `NUMERIC` | **NOT NULL** | `0` | Financial / monetary value |
| `discount_amount` | `NUMERIC` | **NOT NULL** | `0` | Financial / monetary value |
| `total_price` | `NUMERIC` | **NOT NULL** | - | Financial / monetary value |
| `created_at` | `TIMESTAMP WITH TIME ZONE` | **NOT NULL** | `now()` | Record creation timestamp |

### 20. `order_state_history`

| Column | Data Type | Nullable | Default Value | Description / Constraint |
| :--- | :--- | :---: | :--- | :--- |
| `id` | `UUID` | **NOT NULL** | `gen_random_uuid()` | Primary Key (UUID) |
| `tenant_id` | `UUID` | **NOT NULL** | - | Tenant Isolation Key (RLS scoped FK) |
| `order_id` | `UUID` | **NOT NULL** | - | Foreign Key reference (order) |
| `previous_state` | `order_status` | Nullable | - | previous_state attribute |
| `new_state` | `order_status` | **NOT NULL** | - | new_state attribute |
| `transition_reason` | `VARCHAR` | Nullable | - | transition_reason attribute |
| `triggered_by` | `UUID` | Nullable | - | triggered_by attribute |
| `created_at` | `TIMESTAMP WITH TIME ZONE` | **NOT NULL** | `now()` | Record creation timestamp |

### 21. `orders`

| Column | Data Type | Nullable | Default Value | Description / Constraint |
| :--- | :--- | :---: | :--- | :--- |
| `id` | `UUID` | **NOT NULL** | `gen_random_uuid()` | Primary Key (UUID) |
| `tenant_id` | `UUID` | **NOT NULL** | - | Tenant Isolation Key (RLS scoped FK) |
| `channel_id` | `UUID` | Nullable | - | Foreign Key reference (channel) |
| `channel_order_id` | `VARCHAR` | Nullable | - | Foreign Key reference (channel_order) |
| `order_number` | `VARCHAR` | **NOT NULL** | - | order_number attribute |
| `customer_id` | `UUID` | Nullable | - | Foreign Key reference (customer) |
| `status` | `order_status` | **NOT NULL** | `'PENDING'` | Status state enum |
| `payment_status` | `payment_status` | **NOT NULL** | `'PENDING'` | Status state enum |
| `currency` | `VARCHAR` | **NOT NULL** | `'USD'` | currency attribute |
| `subtotal` | `NUMERIC` | **NOT NULL** | `0` | Financial / monetary value |
| `tax_total` | `NUMERIC` | **NOT NULL** | `0` | Financial / monetary value |
| `discount_total` | `NUMERIC` | **NOT NULL** | `0` | Financial / monetary value |
| `shipping_total` | `NUMERIC` | **NOT NULL** | `0` | Financial / monetary value |
| `total_amount` | `NUMERIC` | **NOT NULL** | - | Financial / monetary value |
| `shipping_address` | `JSONB` | **NOT NULL** | - | shipping_address attribute |
| `billing_address` | `JSONB` | **NOT NULL** | - | billing_address attribute |
| `is_cod` | `BOOLEAN` | **NOT NULL** | `false` | is_cod attribute |
| `idempotency_key` | `VARCHAR` | Nullable | - | idempotency_key attribute |
| `metadata` | `JSONB` | Nullable | `'{}'` | Extensible JSONB metadata |
| `created_at` | `TIMESTAMP WITH TIME ZONE` | **NOT NULL** | `now()` | Record creation timestamp |
| `updated_at` | `TIMESTAMP WITH TIME ZONE` | **NOT NULL** | `now()` | Last update timestamp |

### 22. `outbox_events`

| Column | Data Type | Nullable | Default Value | Description / Constraint |
| :--- | :--- | :---: | :--- | :--- |
| `id` | `UUID` | **NOT NULL** | `gen_random_uuid()` | Primary Key (UUID) |
| `tenant_id` | `UUID` | **NOT NULL** | - | Tenant Isolation Key (RLS scoped FK) |
| `aggregate_type` | `VARCHAR` | **NOT NULL** | - | aggregate_type attribute |
| `aggregate_id` | `VARCHAR` | **NOT NULL** | - | Foreign Key reference (aggregate) |
| `event_type` | `VARCHAR` | **NOT NULL** | - | event_type attribute |
| `payload` | `JSONB` | **NOT NULL** | - | payload attribute |
| `status` | `outbox_status` | **NOT NULL** | `'PENDING'` | Status state enum |
| `retry_count` | `INTEGER` | **NOT NULL** | `0` | retry_count attribute |
| `last_error` | `TEXT` | Nullable | - | last_error attribute |
| `scheduled_at` | `TIMESTAMP WITH TIME ZONE` | **NOT NULL** | `now()` | scheduled_at attribute |
| `created_at` | `TIMESTAMP WITH TIME ZONE` | **NOT NULL** | `now()` | Record creation timestamp |
| `updated_at` | `TIMESTAMP WITH TIME ZONE` | **NOT NULL** | `now()` | Last update timestamp |

### 23. `payment_reconciliations`

| Column | Data Type | Nullable | Default Value | Description / Constraint |
| :--- | :--- | :---: | :--- | :--- |
| `id` | `UUID` | **NOT NULL** | `gen_random_uuid()` | Primary Key (UUID) |
| `tenant_id` | `UUID` | **NOT NULL** | - | Tenant Isolation Key (RLS scoped FK) |
| `gateway` | `VARCHAR` | **NOT NULL** | - | gateway attribute |
| `settlement_id` | `VARCHAR` | **NOT NULL** | - | Foreign Key reference (settlement) |
| `total_expected` | `NUMERIC` | **NOT NULL** | - | Financial / monetary value |
| `total_settled` | `NUMERIC` | **NOT NULL** | - | Financial / monetary value |
| `discrepancy` | `NUMERIC` | **NOT NULL** | `0` | discrepancy attribute |
| `status` | `VARCHAR` | **NOT NULL** | `'MATCHED'` | Status state enum |
| `reconciled_at` | `TIMESTAMP WITH TIME ZONE` | **NOT NULL** | `now()` | reconciled_at attribute |

### 24. `payments`

| Column | Data Type | Nullable | Default Value | Description / Constraint |
| :--- | :--- | :---: | :--- | :--- |
| `id` | `UUID` | **NOT NULL** | `gen_random_uuid()` | Primary Key (UUID) |
| `tenant_id` | `UUID` | **NOT NULL** | - | Tenant Isolation Key (RLS scoped FK) |
| `order_id` | `UUID` | **NOT NULL** | - | Foreign Key reference (order) |
| `payment_method` | `VARCHAR` | **NOT NULL** | - | payment_method attribute |
| `gateway` | `VARCHAR` | **NOT NULL** | - | gateway attribute |
| `gateway_transaction_id` | `VARCHAR` | Nullable | - | Foreign Key reference (gateway_transaction) |
| `amount` | `NUMERIC` | **NOT NULL** | - | Financial / monetary value |
| `currency` | `VARCHAR` | **NOT NULL** | - | currency attribute |
| `status` | `payment_status` | **NOT NULL** | `'PENDING'` | Status state enum |
| `idempotency_key` | `VARCHAR` | **NOT NULL** | - | idempotency_key attribute |
| `metadata` | `JSONB` | Nullable | `'{}'` | Extensible JSONB metadata |
| `created_at` | `TIMESTAMP WITH TIME ZONE` | **NOT NULL** | `now()` | Record creation timestamp |
| `updated_at` | `TIMESTAMP WITH TIME ZONE` | **NOT NULL** | `now()` | Last update timestamp |

### 25. `permissions`

| Column | Data Type | Nullable | Default Value | Description / Constraint |
| :--- | :--- | :---: | :--- | :--- |
| `id` | `UUID` | **NOT NULL** | `gen_random_uuid()` | Primary Key (UUID) |
| `code` | `VARCHAR` | **NOT NULL** | - | code attribute |
| `description` | `VARCHAR` | **NOT NULL** | - | description attribute |
| `module` | `VARCHAR` | **NOT NULL** | - | module attribute |

### 26. `product_variants`

| Column | Data Type | Nullable | Default Value | Description / Constraint |
| :--- | :--- | :---: | :--- | :--- |
| `id` | `UUID` | **NOT NULL** | `gen_random_uuid()` | Primary Key (UUID) |
| `tenant_id` | `UUID` | **NOT NULL** | - | Tenant Isolation Key (RLS scoped FK) |
| `product_id` | `UUID` | **NOT NULL** | - | Foreign Key reference (product) |
| `variant_sku` | `VARCHAR` | **NOT NULL** | - | variant_sku attribute |
| `title` | `VARCHAR` | **NOT NULL** | - | title attribute |
| `attributes` | `JSONB` | **NOT NULL** | `'{}'` | attributes attribute |
| `price_override` | `NUMERIC` | Nullable | - | Financial / monetary value |
| `created_at` | `TIMESTAMP WITH TIME ZONE` | **NOT NULL** | `now()` | Record creation timestamp |

### 27. `products`

| Column | Data Type | Nullable | Default Value | Description / Constraint |
| :--- | :--- | :---: | :--- | :--- |
| `id` | `UUID` | **NOT NULL** | `gen_random_uuid()` | Primary Key (UUID) |
| `tenant_id` | `UUID` | **NOT NULL** | - | Tenant Isolation Key (RLS scoped FK) |
| `category_id` | `UUID` | Nullable | - | Foreign Key reference (category) |
| `sku` | `VARCHAR` | **NOT NULL** | - | sku attribute |
| `name` | `VARCHAR` | **NOT NULL** | - | name attribute |
| `description` | `TEXT` | Nullable | - | description attribute |
| `is_bundle` | `BOOLEAN` | **NOT NULL** | `false` | is_bundle attribute |
| `is_active` | `BOOLEAN` | **NOT NULL** | `true` | is_active attribute |
| `price_base` | `NUMERIC` | **NOT NULL** | - | Financial / monetary value |
| `currency` | `VARCHAR` | **NOT NULL** | `'USD'` | currency attribute |
| `weight_grams` | `NUMERIC` | Nullable | `0` | weight_grams attribute |
| `dimensions_cm` | `JSONB` | Nullable | `'{"width": 0, "height": 0, "length": 0}'` | dimensions_cm attribute |
| `metadata` | `JSONB` | Nullable | `'{}'` | Extensible JSONB metadata |
| `created_at` | `TIMESTAMP WITH TIME ZONE` | **NOT NULL** | `now()` | Record creation timestamp |
| `updated_at` | `TIMESTAMP WITH TIME ZONE` | **NOT NULL** | `now()` | Last update timestamp |

### 28. `promotions`

| Column | Data Type | Nullable | Default Value | Description / Constraint |
| :--- | :--- | :---: | :--- | :--- |
| `id` | `UUID` | **NOT NULL** | `gen_random_uuid()` | Primary Key (UUID) |
| `tenant_id` | `UUID` | **NOT NULL** | - | Tenant Isolation Key (RLS scoped FK) |
| `code` | `VARCHAR` | **NOT NULL** | - | code attribute |
| `title` | `VARCHAR` | **NOT NULL** | - | title attribute |
| `discount_type` | `discount_type` | **NOT NULL** | - | discount_type attribute |
| `discount_value` | `NUMERIC` | **NOT NULL** | - | discount_value attribute |
| `min_order_value` | `NUMERIC` | Nullable | `0` | min_order_value attribute |
| `max_discount_amount` | `NUMERIC` | Nullable | - | Financial / monetary value |
| `usage_limit_total` | `INTEGER` | Nullable | - | Financial / monetary value |
| `usage_limit_per_customer` | `INTEGER` | Nullable | `1` | usage_limit_per_customer attribute |
| `current_redemptions` | `INTEGER` | **NOT NULL** | `0` | current_redemptions attribute |
| `starts_at` | `TIMESTAMP WITH TIME ZONE` | **NOT NULL** | `now()` | starts_at attribute |
| `ends_at` | `TIMESTAMP WITH TIME ZONE` | Nullable | - | ends_at attribute |
| `is_active` | `BOOLEAN` | **NOT NULL** | `true` | is_active attribute |
| `created_at` | `TIMESTAMP WITH TIME ZONE` | **NOT NULL** | `now()` | Record creation timestamp |

### 29. `purchase_orders`

| Column | Data Type | Nullable | Default Value | Description / Constraint |
| :--- | :--- | :---: | :--- | :--- |
| `id` | `UUID` | **NOT NULL** | `gen_random_uuid()` | Primary Key (UUID) |
| `tenant_id` | `UUID` | **NOT NULL** | - | Tenant Isolation Key (RLS scoped FK) |
| `vendor_id` | `UUID` | **NOT NULL** | - | Foreign Key reference (vendor) |
| `po_number` | `VARCHAR` | **NOT NULL** | - | po_number attribute |
| `status` | `VARCHAR` | **NOT NULL** | `'DRAFT'` | Status state enum |
| `total_cost` | `NUMERIC` | **NOT NULL** | - | Financial / monetary value |
| `expected_delivery_date` | `DATE` | Nullable | - | expected_delivery_date attribute |
| `created_at` | `TIMESTAMP WITH TIME ZONE` | **NOT NULL** | `now()` | Record creation timestamp |

### 30. `refunds`

| Column | Data Type | Nullable | Default Value | Description / Constraint |
| :--- | :--- | :---: | :--- | :--- |
| `id` | `UUID` | **NOT NULL** | `gen_random_uuid()` | Primary Key (UUID) |
| `tenant_id` | `UUID` | **NOT NULL** | - | Tenant Isolation Key (RLS scoped FK) |
| `payment_id` | `UUID` | **NOT NULL** | - | Foreign Key reference (payment) |
| `order_id` | `UUID` | **NOT NULL** | - | Foreign Key reference (order) |
| `amount` | `NUMERIC` | **NOT NULL** | - | Financial / monetary value |
| `reason` | `VARCHAR` | Nullable | - | reason attribute |
| `gateway_refund_id` | `VARCHAR` | Nullable | - | Foreign Key reference (gateway_refund) |
| `status` | `VARCHAR` | **NOT NULL** | `'SUCCEEDED'` | Status state enum |
| `created_at` | `TIMESTAMP WITH TIME ZONE` | **NOT NULL** | `now()` | Record creation timestamp |

### 31. `return_items`

| Column | Data Type | Nullable | Default Value | Description / Constraint |
| :--- | :--- | :---: | :--- | :--- |
| `id` | `UUID` | **NOT NULL** | `gen_random_uuid()` | Primary Key (UUID) |
| `tenant_id` | `UUID` | **NOT NULL** | - | Tenant Isolation Key (RLS scoped FK) |
| `return_id` | `UUID` | **NOT NULL** | - | Foreign Key reference (return) |
| `order_item_id` | `UUID` | **NOT NULL** | - | Foreign Key reference (order_item) |
| `quantity` | `INTEGER` | **NOT NULL** | - | quantity attribute |
| `qa_grade` | `qa_grade` | Nullable | - | qa_grade attribute |
| `is_restocked` | `BOOLEAN` | **NOT NULL** | `false` | is_restocked attribute |
| `inspected_at` | `TIMESTAMP WITH TIME ZONE` | Nullable | - | inspected_at attribute |
| `created_at` | `TIMESTAMP WITH TIME ZONE` | **NOT NULL** | `now()` | Record creation timestamp |

### 32. `returns`

| Column | Data Type | Nullable | Default Value | Description / Constraint |
| :--- | :--- | :---: | :--- | :--- |
| `id` | `UUID` | **NOT NULL** | `gen_random_uuid()` | Primary Key (UUID) |
| `tenant_id` | `UUID` | **NOT NULL** | - | Tenant Isolation Key (RLS scoped FK) |
| `order_id` | `UUID` | **NOT NULL** | - | Foreign Key reference (order) |
| `rma_number` | `VARCHAR` | **NOT NULL** | - | rma_number attribute |
| `status` | `rma_status` | **NOT NULL** | `'REQUESTED'` | Status state enum |
| `reason` | `VARCHAR` | **NOT NULL** | - | reason attribute |
| `reverse_tracking_number` | `VARCHAR` | Nullable | - | reverse_tracking_number attribute |
| `reverse_label_url` | `TEXT` | Nullable | - | reverse_label_url attribute |
| `created_at` | `TIMESTAMP WITH TIME ZONE` | **NOT NULL** | `now()` | Record creation timestamp |
| `updated_at` | `TIMESTAMP WITH TIME ZONE` | **NOT NULL** | `now()` | Last update timestamp |

### 33. `role_permissions`

| Column | Data Type | Nullable | Default Value | Description / Constraint |
| :--- | :--- | :---: | :--- | :--- |
| `role_id` | `UUID` | **NOT NULL** | - | Foreign Key reference (role) |
| `permission_id` | `UUID` | **NOT NULL** | - | Foreign Key reference (permission) |

### 34. `roles`

| Column | Data Type | Nullable | Default Value | Description / Constraint |
| :--- | :--- | :---: | :--- | :--- |
| `id` | `UUID` | **NOT NULL** | `gen_random_uuid()` | Primary Key (UUID) |
| `tenant_id` | `UUID` | Nullable | - | Tenant Isolation Key (RLS scoped FK) |
| `name` | `VARCHAR` | **NOT NULL** | - | name attribute |
| `description` | `VARCHAR` | Nullable | - | description attribute |
| `is_system_role` | `BOOLEAN` | **NOT NULL** | `false` | is_system_role attribute |
| `created_at` | `TIMESTAMP WITH TIME ZONE` | **NOT NULL** | `now()` | Record creation timestamp |

### 35. `shipment_tracking_events`

| Column | Data Type | Nullable | Default Value | Description / Constraint |
| :--- | :--- | :---: | :--- | :--- |
| `id` | `UUID` | **NOT NULL** | `gen_random_uuid()` | Primary Key (UUID) |
| `tenant_id` | `UUID` | **NOT NULL** | - | Tenant Isolation Key (RLS scoped FK) |
| `shipment_id` | `UUID` | **NOT NULL** | - | Foreign Key reference (shipment) |
| `checkpoint_status` | `VARCHAR` | **NOT NULL** | - | Status state enum |
| `location` | `VARCHAR` | Nullable | - | location attribute |
| `event_timestamp` | `TIMESTAMP WITH TIME ZONE` | **NOT NULL** | - | event_timestamp attribute |
| `raw_payload` | `JSONB` | Nullable | `'{}'` | raw_payload attribute |
| `created_at` | `TIMESTAMP WITH TIME ZONE` | **NOT NULL** | `now()` | Record creation timestamp |

### 36. `shipments`

| Column | Data Type | Nullable | Default Value | Description / Constraint |
| :--- | :--- | :---: | :--- | :--- |
| `id` | `UUID` | **NOT NULL** | `gen_random_uuid()` | Primary Key (UUID) |
| `tenant_id` | `UUID` | **NOT NULL** | - | Tenant Isolation Key (RLS scoped FK) |
| `fulfillment_id` | `UUID` | **NOT NULL** | - | Foreign Key reference (fulfillment) |
| `carrier` | `VARCHAR` | **NOT NULL** | - | carrier attribute |
| `service_tier` | `VARCHAR` | Nullable | `'Standard'` | service_tier attribute |
| `tracking_number` | `VARCHAR` | **NOT NULL** | - | tracking_number attribute |
| `tracking_url` | `TEXT` | Nullable | - | tracking_url attribute |
| `shipping_label_url` | `TEXT` | Nullable | - | shipping_label_url attribute |
| `status` | `shipment_status` | **NOT NULL** | `'CREATED'` | Status state enum |
| `shipped_at` | `TIMESTAMP WITH TIME ZONE` | Nullable | - | shipped_at attribute |
| `delivered_at` | `TIMESTAMP WITH TIME ZONE` | Nullable | - | delivered_at attribute |
| `created_at` | `TIMESTAMP WITH TIME ZONE` | **NOT NULL** | `now()` | Record creation timestamp |
| `updated_at` | `TIMESTAMP WITH TIME ZONE` | **NOT NULL** | `now()` | Last update timestamp |

### 37. `tenant_configs`

| Column | Data Type | Nullable | Default Value | Description / Constraint |
| :--- | :--- | :---: | :--- | :--- |
| `tenant_id` | `UUID` | **NOT NULL** | - | Tenant Isolation Key (RLS scoped FK) |
| `soft_hold_duration_minutes` | `INTEGER` | **NOT NULL** | `15` | soft_hold_duration_minutes attribute |
| `auto_capture_payment` | `BOOLEAN` | **NOT NULL** | `true` | auto_capture_payment attribute |
| `auto_route_fulfillment` | `BOOLEAN` | **NOT NULL** | `true` | auto_route_fulfillment attribute |
| `enable_cod` | `BOOLEAN` | **NOT NULL** | `false` | enable_cod attribute |
| `enable_bopis` | `BOOLEAN` | **NOT NULL** | `false` | enable_bopis attribute |
| `webhook_secret` | `VARCHAR` | Nullable | - | webhook_secret attribute |
| `notification_settings` | `JSONB` | Nullable | `'{"sms": false, "email": true, "whatsapp": false}'` | notification_settings attribute |
| `updated_at` | `TIMESTAMP WITH TIME ZONE` | **NOT NULL** | `now()` | Last update timestamp |

### 38. `tenant_profiles`

| Column | Data Type | Nullable | Default Value | Description / Constraint |
| :--- | :--- | :---: | :--- | :--- |
| `tenant_id` | `UUID` | **NOT NULL** | - | Tenant Isolation Key (RLS scoped FK) |
| `logo_url` | `TEXT` | Nullable | - | logo_url attribute |
| `brand_color_primary` | `VARCHAR` | Nullable | `'#0F172A'` | brand_color_primary attribute |
| `tax_identifier` | `VARCHAR` | Nullable | - | tax_identifier attribute |
| `registered_address` | `JSONB` | Nullable | `'{}'` | registered_address attribute |
| `support_email` | `VARCHAR` | Nullable | - | support_email attribute |
| `support_phone` | `VARCHAR` | Nullable | - | support_phone attribute |
| `custom_domain` | `VARCHAR` | Nullable | - | custom_domain attribute |
| `is_custom_domain_verified` | `BOOLEAN` | Nullable | `false` | is_custom_domain_verified attribute |
| `updated_at` | `TIMESTAMP WITH TIME ZONE` | **NOT NULL** | `now()` | Last update timestamp |

### 39. `tenant_quotas`

| Column | Data Type | Nullable | Default Value | Description / Constraint |
| :--- | :--- | :---: | :--- | :--- |
| `tenant_id` | `UUID` | **NOT NULL** | - | Tenant Isolation Key (RLS scoped FK) |
| `max_orders_per_month` | `INTEGER` | **NOT NULL** | `10000` | max_orders_per_month attribute |
| `max_skus` | `INTEGER` | **NOT NULL** | `5000` | max_skus attribute |
| `max_warehouses` | `INTEGER` | **NOT NULL** | `5` | max_warehouses attribute |
| `max_users` | `INTEGER` | **NOT NULL** | `10` | max_users attribute |
| `max_connected_channels` | `INTEGER` | **NOT NULL** | `3` | max_connected_channels attribute |
| `rate_limit_rpm` | `INTEGER` | **NOT NULL** | `1200` | rate_limit_rpm attribute |
| `current_orders_this_month` | `INTEGER` | **NOT NULL** | `0` | current_orders_this_month attribute |
| `quota_reset_at` | `TIMESTAMP WITH TIME ZONE` | **NOT NULL** | `(date_trunc('month', now()) + '1 mon')` | quota_reset_at attribute |
| `updated_at` | `TIMESTAMP WITH TIME ZONE` | **NOT NULL** | `now()` | Last update timestamp |

### 40. `tenant_users`

| Column | Data Type | Nullable | Default Value | Description / Constraint |
| :--- | :--- | :---: | :--- | :--- |
| `id` | `UUID` | **NOT NULL** | `gen_random_uuid()` | Primary Key (UUID) |
| `tenant_id` | `UUID` | **NOT NULL** | - | Tenant Isolation Key (RLS scoped FK) |
| `user_id` | `UUID` | **NOT NULL** | - | Foreign Key reference (user) |
| `role_id` | `UUID` | Nullable | - | Foreign Key reference (role) |
| `role_name` | `VARCHAR` | **NOT NULL** | `'operator'` | role_name attribute |
| `is_active` | `BOOLEAN` | **NOT NULL** | `true` | is_active attribute |
| `created_at` | `TIMESTAMP WITH TIME ZONE` | **NOT NULL** | `now()` | Record creation timestamp |

### 41. `tenants`

| Column | Data Type | Nullable | Default Value | Description / Constraint |
| :--- | :--- | :---: | :--- | :--- |
| `id` | `UUID` | **NOT NULL** | `gen_random_uuid()` | Primary Key (UUID) |
| `slug` | `VARCHAR` | **NOT NULL** | - | slug attribute |
| `name` | `VARCHAR` | **NOT NULL** | - | name attribute |
| `legal_name` | `VARCHAR` | Nullable | - | legal_name attribute |
| `status` | `tenant_status` | **NOT NULL** | `'PENDING'` | Status state enum |
| `tier` | `tenant_tier` | **NOT NULL** | `'STARTER'` | tier attribute |
| `primary_email` | `VARCHAR` | **NOT NULL** | - | primary_email attribute |
| `primary_currency` | `VARCHAR` | **NOT NULL** | `'USD'` | primary_currency attribute |
| `timezone` | `VARCHAR` | **NOT NULL** | `'UTC'` | timezone attribute |
| `is_deleted` | `BOOLEAN` | **NOT NULL** | `false` | is_deleted attribute |
| `deleted_at` | `TIMESTAMP WITH TIME ZONE` | Nullable | - | deleted_at attribute |
| `metadata` | `JSONB` | Nullable | `'{}'` | Extensible JSONB metadata |
| `created_at` | `TIMESTAMP WITH TIME ZONE` | **NOT NULL** | `now()` | Record creation timestamp |
| `updated_at` | `TIMESTAMP WITH TIME ZONE` | **NOT NULL** | `now()` | Last update timestamp |

### 42. `user_sessions`

| Column | Data Type | Nullable | Default Value | Description / Constraint |
| :--- | :--- | :---: | :--- | :--- |
| `id` | `UUID` | **NOT NULL** | `gen_random_uuid()` | Primary Key (UUID) |
| `user_id` | `UUID` | **NOT NULL** | - | Foreign Key reference (user) |
| `refresh_token_hash` | `VARCHAR` | **NOT NULL** | - | refresh_token_hash attribute |
| `user_agent` | `TEXT` | Nullable | - | user_agent attribute |
| `ip_address` | `VARCHAR` | Nullable | - | ip_address attribute |
| `expires_at` | `TIMESTAMP WITH TIME ZONE` | **NOT NULL** | - | expires_at attribute |
| `is_revoked` | `BOOLEAN` | **NOT NULL** | `false` | is_revoked attribute |
| `created_at` | `TIMESTAMP WITH TIME ZONE` | **NOT NULL** | `now()` | Record creation timestamp |

### 43. `users`

| Column | Data Type | Nullable | Default Value | Description / Constraint |
| :--- | :--- | :---: | :--- | :--- |
| `id` | `UUID` | **NOT NULL** | `gen_random_uuid()` | Primary Key (UUID) |
| `email` | `VARCHAR` | **NOT NULL** | - | email attribute |
| `password_hash` | `VARCHAR` | **NOT NULL** | - | password_hash attribute |
| `first_name` | `VARCHAR` | Nullable | - | first_name attribute |
| `last_name` | `VARCHAR` | Nullable | - | last_name attribute |
| `phone` | `VARCHAR` | Nullable | - | phone attribute |
| `is_active` | `BOOLEAN` | **NOT NULL** | `true` | is_active attribute |
| `is_verified` | `BOOLEAN` | **NOT NULL** | `false` | is_verified attribute |
| `failed_login_attempts` | `INTEGER` | **NOT NULL** | `0` | failed_login_attempts attribute |
| `locked_until` | `TIMESTAMP WITH TIME ZONE` | Nullable | - | locked_until attribute |
| `last_login_at` | `TIMESTAMP WITH TIME ZONE` | Nullable | - | last_login_at attribute |
| `created_at` | `TIMESTAMP WITH TIME ZONE` | **NOT NULL** | `now()` | Record creation timestamp |
| `updated_at` | `TIMESTAMP WITH TIME ZONE` | **NOT NULL** | `now()` | Last update timestamp |

### 44. `vendors`

| Column | Data Type | Nullable | Default Value | Description / Constraint |
| :--- | :--- | :---: | :--- | :--- |
| `id` | `UUID` | **NOT NULL** | `gen_random_uuid()` | Primary Key (UUID) |
| `tenant_id` | `UUID` | **NOT NULL** | - | Tenant Isolation Key (RLS scoped FK) |
| `code` | `VARCHAR` | **NOT NULL** | - | code attribute |
| `name` | `VARCHAR` | **NOT NULL** | - | name attribute |
| `email` | `VARCHAR` | **NOT NULL** | - | email attribute |
| `phone` | `VARCHAR` | Nullable | - | phone attribute |
| `commission_percentage` | `NUMERIC` | Nullable | `0` | commission_percentage attribute |
| `is_active` | `BOOLEAN` | **NOT NULL** | `true` | is_active attribute |
| `created_at` | `TIMESTAMP WITH TIME ZONE` | **NOT NULL** | `now()` | Record creation timestamp |

### 45. `warehouses`

| Column | Data Type | Nullable | Default Value | Description / Constraint |
| :--- | :--- | :---: | :--- | :--- |
| `id` | `UUID` | **NOT NULL** | `gen_random_uuid()` | Primary Key (UUID) |
| `tenant_id` | `UUID` | **NOT NULL** | - | Tenant Isolation Key (RLS scoped FK) |
| `code` | `VARCHAR` | **NOT NULL** | - | code attribute |
| `name` | `VARCHAR` | **NOT NULL** | - | name attribute |
| `is_active` | `BOOLEAN` | **NOT NULL** | `true` | is_active attribute |
| `is_retail_store` | `BOOLEAN` | **NOT NULL** | `false` | is_retail_store attribute |
| `priority` | `INTEGER` | **NOT NULL** | `1` | priority attribute |
| `address` | `JSONB` | **NOT NULL** | - | address attribute |
| `created_at` | `TIMESTAMP WITH TIME ZONE` | **NOT NULL** | `now()` | Record creation timestamp |

