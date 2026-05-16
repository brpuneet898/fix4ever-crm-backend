# Fix4Ever Backend — Implementation Guide

Aligned with **Fix4Ever Features 2026** (product scope).  
**Roles in scope**: Admin, Editor, CRM Manager, Regional Manager  
**Excluded**: Customer, Technician, Captain

The sections below distinguish **what exists in the repo today** from **roadmap** items that are not implemented or only partially covered.

---

## Current codebase snapshot (matches `src/`)

Use this as the source of truth for paths; the phased checklist below references the same structure.

| Layer | Location | Notes |
|-------|-----------|--------|
| Entry | `main.ts`, `app.ts` | Health at `/health`; API at `/api/v1` |
| Config | `config/env.config.ts` | Only env config file today |
| RBAC | `access/*.ts` | `permissions`, `roles`, `effective-permissions`, `index` |
| HTTP | `modules/controllers`, `modules/routes` | All handlers and route plugins |
| Domain | `shared/models`, `shared/repositories`, `shared/services` | Includes `shared/services/admin/index.ts` barrel |
| Infra | `infrastructure/database`, `infrastructure/websocket` | No Redis/BullMQ/email modules in tree yet |
| Scripts | `scripts/seed.ts` | Seed script |
| Tests | — | No `tests/` directory yet |

**Auth service path**: `shared/services/auth.service.ts` (not `shared/services/auth/auth.service.ts`).

**Errors**: `shared/errors/ApiError.ts`, `shared/errors/errorHandler.ts` (no separate `ValidationError` / `NotFoundError` files).

**Middleware** (actual files): `auth`, `permission`, `requireAdmin`, `audit`, `requestContext`, `adminRateLimit`.

**Real-time**: `infrastructure/websocket/socket.server.ts`, `infrastructure/websocket/events/notification.event.ts` — not a separate `src/events/` event bus.

---

## Phase 1: Foundation

### Step 1.1: Config & environment

- [x] `src/config/env.config.ts` — env vars (NODE_ENV, DB, JWT, CORS, etc.)
- [ ] `src/config/database.config.ts` — optional split if you outgrow env-based DB config
- [ ] `src/config/redis.config.ts` — when Redis is added
- [ ] `src/config/security.config.ts` — optional extract from `app.ts`
- [ ] `src/config/logger.config.ts` — optional; Fastify/Pino configured in `app.ts` today

### Step 1.2: Shared layer

- [x] `src/access/roles.ts`, `permissions.ts`, `effective-permissions.ts`, `index.ts`
- [ ] `src/shared/constants/statusCodes.ts` — not present; use inline or add later
- [x] `src/shared/errors/` — `ApiError.ts`, `errorHandler.ts`
- [x] `src/shared/utils/` — `jwt`, `password`, `pagination`, `response`, `date`, `role-validation`
- [x] `src/shared/types/fastify.d.ts`
- [x] `src/shared/middleware/` — see snapshot above
- [x] `src/shared/logger/logger.ts`

### Step 1.3: Infrastructure

- [x] `src/infrastructure/database/mongo.connection.ts`
- [ ] `src/infrastructure/database/indexes.ts` — optional; index sync runs from `main.ts` on selected models
- [ ] `src/infrastructure/cache/redis.client.ts` — not present
- [ ] `src/infrastructure/messaging/**` — BullMQ not wired in tree
- [x] `src/infrastructure/websocket/socket.server.ts`
- [x] `src/infrastructure/websocket/events/notification.event.ts`
- [ ] `src/infrastructure/external/**` — email/SMS/payment stubs not in repo

### Step 1.4: Policies

Role and permission resolution is implemented in **`src/access/`**. A separate `src/policies/**` layer is optional.

---

## Phase 2: Auth (all internal roles)

### Step 2.1: Auth HTTP + services

- [x] `src/shared/models/user.model.ts` — roles, permission overrides, etc.
- [x] `src/shared/repositories/user.repository.ts`
- [x] `src/shared/services/auth.service.ts`
- [x] `src/modules/controllers/auth.controller.ts`
- [x] `src/modules/routes/auth.routes.ts` — mounted at `/api/v1/auth`

**Product doc**: Email/Password, OTP, Google SSO, etc. — implement or extend in `auth.service` + controller as needed.

**Login restriction**: Enforce allowed role set in auth flow (see `access/roles` and your product rules).

---

## Phase 3: Shared data

- [x] Models under `src/shared/models/**` (user, invitation, audit, campaigns, coupons, payments, subscriptions, service requests, vendors, reviews, notifications, tickets, …)
- [x] Repositories: `user`, `invitation`, `auditLog`
- [x] Services: `auth`, `crm`, `regional`, `wallet`, `campaign`, `invitation`, `auditLog`, `admin/*`, `legacy/role-assignment`

---

## Phase 4–7: Product features vs code layout

The **2026 feature lists** (16 admin areas, editor, CRM, regional) are product scope. In **this** codebase, work is grouped by **route/controller** files and **`shared/services/admin/*`** — not by folders like `admin/userManagement/`.

### Where implemented today (indicative)

| Area | Typical HTTP surface | Services / notes |
|------|----------------------|------------------|
| User management (admin) | `adminUserManagement.routes.ts`, `adminUserManagement.controller.ts` | `userManagement.service.ts` |
| Dashboard / analytics (admin) | `adminDashboard.controller.ts`, routes in `admin.routes.ts` | `dashboard.service.ts`, `reportsAnalytics.service.ts` |
| Customers, vendors, SRs, payments | `admin*.controller.ts`, `admin.routes.ts` | `customerManagement`, `vendorManagement`, `serviceRequestManagement`, `paymentManagement` |
| Subscriptions, coupons, notifications, tickets | `admin.routes.ts` (inline + imports) | `subscriptionManagement`, `couponManagement`, `notificationManagement`, `supportTicket` |
| CRM | `crm.routes.ts`, `crm.controller.ts` | `crm.service.ts` |
| Regional | `regional.routes.ts`, `regional.controller.ts` | `regional.service.ts` |
| Editor | `editor.routes.ts` | Per routes file |
| Invitations | `invitation.routes.ts` | `invitation.service.ts` |
| Legacy role assignment | `role-assignment.routes.ts` | `legacy/role-assignment.service.ts` |

Remaining rows from the original **16/10/4** feature matrices are **roadmap** until corresponding routes and services exist.

---

## Phase 8: Events & notifications

- [ ] `src/events/**` — **not** in repo; use roadmap if you want an app-wide event bus
- [x] WebSocket notification helpers — `infrastructure/websocket/events/notification.event.ts`
- [x] `main.ts` attaches Socket.IO after HTTP listen

---

## Phase 9: API & bootstrap

- [x] `src/api/v1/routes.ts` — mounts auth, admin (legacy + invitations + admin + users), crm, regional, editor
- [x] `src/app.ts` — plugins, Swagger, `/health`, registers `apiV1Routes` with prefix `/api/v1`
- [x] `src/main.ts` — Mongo, index sync, `buildApp`, listen, Socket.IO
- [ ] `src/bootstrap/**` — optional split of `main`/`app` for larger apps

---

## Phase 10: Scripts & tests

- [x] `src/scripts/seed.ts`
- [ ] `src/scripts/migrate.ts` — add when you introduce migrations
- [ ] Unit / integration tests — add `tests/` (or `src/tests/`) when ready

---

## Route prefixes (`app.register(..., { prefix })`)

Base URL: **`/api/v1`**.

| Prefix | Purpose |
|--------|---------|
| `/auth` | Authentication |
| `/admin/legacy` | Legacy role-assignment API |
| `/admin` | Invitations (`/invitations/...`) and main admin API (see `admin.routes.ts`) |
| `/admin/users` | Admin user management |
| `/crm` | CRM Manager |
| `/regional` | Regional Manager |
| `/editor` | Editor |

---

## Suggested build order (still valid)

1. Foundation (`config`, `access`, `shared`, `infrastructure/database`) → Auth → expand `shared/services`
2. Flesh out `admin.routes` / controllers and `shared/services/admin` by product priority
3. CRM, regional, editor parity with product doc
4. Add Redis/queues/external adapters when needed
5. Tests and migrations when the API surface stabilizes
