# Fix4Ever Admin/CRM Backend — Folder Structure

> **Scope**: Admin, Editor, CRM Manager, Regional Manager only  
> **Excluded**: Customer, Technician, Captain

This document matches the **current** `src/` layout. Business logic and Mongoose models live under `shared/`; HTTP adapters live under `modules/`; RBAC definitions and effective permission resolution live under `access/`.

---

## Top-level `src/` layout

```
src/
├── main.ts                 # Entry: Mongo connect, index sync, buildApp, listen, Socket.IO
├── app.ts                  # Fastify factory: security, CORS, rate limit, Swagger, /health, /api/v1
├── config/
│   └── env.config.ts       # Environment (only config file present today)
├── api/
│   └── v1/
│       └── routes.ts       # Registers all v1 route plugins (see table below)
├── access/                 # RBAC: catalog, roles, effective permissions for JWT
├── modules/
│   ├── controllers/        # All HTTP handlers (*.controller.ts)
│   └── routes/             # All Fastify route plugins (*.routes.ts)
├── shared/                 # Models, repositories, services, middleware, errors, utils, logger, types
├── infrastructure/
│   ├── database/
│   │   └── mongo.connection.ts
│   └── websocket/
│       ├── socket.server.ts
│       └── events/
│           └── notification.event.ts
└── scripts/
    └── seed.ts
```

There is **no** `src/tests/` tree yet (add at repo root or under `src/` when you introduce tests). There is **no** `api/v2/` until you add it.

---

## `modules/` — universal HTTP layer

All route plugins and controllers are **flat** — no `modules/admin/`, `modules/crm/`, etc.

| File                                                                  | Role / area                                                                                                    |
| --------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `auth.routes.ts` + `auth.controller.ts`                               | Login, signup, auth                                                                                            |
| `admin.routes.ts` + `admin*.controller.ts`                            | Admin dashboard, customers, vendors, SRs, payments, coupons, subscriptions, notifications, tickets, reports, … |
| `adminUserManagement.routes.ts` + `adminUserManagement.controller.ts` | Admin user CRUD under `/admin/users`                                                                           |
| `role-assignment.routes.ts` + `role-assignment.controller.ts`         | Legacy user/role APIs under `/admin/legacy`                                                                    |
| `invitation.routes.ts` + `invitation.controller.ts`                   | Invitations under `/admin/invitations`                                                                         |
| `crm.routes.ts` + `crm.controller.ts`                                 | CRM Manager                                                                                                    |
| `regional.routes.ts` + `regional.controller.ts`                       | Regional Manager                                                                                               |
| `editor.routes.ts`                                                    | Editor                                                                                                         |

Authorization uses **`access/`** plus per-user `permissionOverrides` in the DB — not different folder trees per “role bundle.”

---

## `access/` — RBAC

| File                       | Purpose                                                            |
| -------------------------- | ------------------------------------------------------------------ |
| `permissions.ts`           | Permission string catalog                                          |
| `roles.ts`                 | Role keys, assignable roles, helpers                               |
| `effective-permissions.ts` | Build effective permission set for JWT (overrides, admin defaults) |
| `index.ts`                 | Re-exports                                                         |

---

## `shared/` — domain layer

```
shared/
├── models/                 # Mongoose: user, invitation, auditLog, supportTicket, campaign, coupon,
│                           # notification templates, payment/*, subscription/*, serviceRequest,
│                           # vendor, review, …
├── repositories/           # user, invitation, auditLog
├── services/
│   ├── auth.service.ts
│   ├── crm.service.ts
│   ├── regional.service.ts
│   ├── wallet.service.ts
│   ├── campaign.service.ts
│   ├── invitation.service.ts
│   ├── auditLog.service.ts
│   ├── admin/              # dashboard, customer/vendor/SR/payment/subscription/coupon/
│   │                       # notification/supportTicket/reportsAnalytics/userManagement
│   │   └── index.ts        # Barrel re-export
│   └── legacy/
│       └── role-assignment.service.ts
├── middleware/             # auth, permission, requireAdmin, audit, requestContext, adminRateLimit
├── errors/                 # ApiError, errorHandler
├── utils/                  # jwt, password, pagination, response, date, role-validation
├── types/
│   └── fastify.d.ts
└── logger/
    └── logger.ts
```

Controllers import from `shared/**` (and `access/` for permission constants). **No** duplicate models under `modules/`.

---

## `infrastructure/`

| Path                                     | Purpose                                   |
| ---------------------------------------- | ----------------------------------------- |
| `database/mongo.connection.ts`           | MongoDB connect / disconnect              |
| `websocket/socket.server.ts`             | Socket.IO on the HTTP server              |
| `websocket/events/notification.event.ts` | Socket event helpers (e.g. notifications) |

Redis, BullMQ, and external email/SMS/payment clients are **not** present as separate modules yet (add under `infrastructure/` when implemented).

---

## API versioning

```
api/v1/routes.ts    # Single aggregation point for v1
```

Mount prefixes (all under **`/api/v1`**):

| Prefix          | Source                                                                   |
| --------------- | ------------------------------------------------------------------------ |
| `/auth`         | `authRoutes`                                                             |
| `/admin/legacy` | Legacy role-assignment                                                   |
| `/admin`        | Invitations plugin + main `adminRoutes` (order: invitations, then admin) |
| `/admin/users`  | Admin user management                                                    |
| `/crm`          | CRM routes                                                               |
| `/regional`     | Regional routes                                                          |
| `/editor`       | Editor routes                                                            |

Exact paths on each plugin (e.g. `/admin/invitations`) are defined in the corresponding `*.routes.ts` files.

---

## Naming conventions

- **Route / controller files**: `*.routes.ts`, `*.controller.ts` in `modules/routes` and `modules/controllers`
- **Models**: PascalCase Mongoose models in `shared/models`
- **URL prefixes**: `/admin`, `/crm`, `/regional`, `/editor`, `/auth` — authorization comes from permissions, not from folder names

---

## Principles

1. **One HTTP tree** — extend `modules/controllers` and `modules/routes` only.
2. **Shared domain** — data and business rules stay in `shared/`.
3. **RBAC** — `access/` + DB-stored overrides; admins assign capabilities, not fixed feature folders.
4. **API evolution** — add `api/v2/` when you need a new major surface.
