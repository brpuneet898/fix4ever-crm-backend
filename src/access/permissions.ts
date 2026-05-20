/**
 * Global permission registry — Fix4Ever CRM
 *
 * Single source of truth for permission string values. Effective JWT permissions are
 * built in `./effective-permissions` (admin/super_admin = full set; others = DB grants only).
 */

export const PERMISSIONS = {
  // ─── DASHBOARD & OVERVIEW ────────────────────────────────────────────────
  // PDF: Admin p.10 — real-time KPIs, live orders, revenue widgets
  DASHBOARD_VIEW: "dashboard.read",
  DASHBOARD_KPI_CONFIG: "dashboard.configure",
  DASHBOARD_LIVE_MONITOR: "dashboard.live_monitor",

  // ─── CUSTOMER MANAGEMENT ─────────────────────────────────────────────────
  // PDF: Admin p.11, CRM Manager p.14
  CUSTOMERS_CREATE: "customers.create",
  CUSTOMERS_READ: "customers.read",
  CUSTOMERS_UPDATE: "customers.update",
  CUSTOMERS_DELETE: "customers.delete",
  CUSTOMERS_BLOCK: "customers.block", // block / suspend account
  CUSTOMERS_EXPORT: "customers.export",
  CUSTOMERS_WALLET_VIEW: "customers.wallet_view",
  CUSTOMERS_WALLET_ADJUST: "customers.wallet_adjust", // manual credit / debit
  CUSTOMERS_SUBSCRIPTION_MANAGE: "customers.subscription_manage",
  CUSTOMERS_REFERRAL_VIEW: "customers.referral_view",
  CUSTOMERS_SEGMENT: "customers.segment", // build segments / cohorts
  CUSTOMERS_DISCOUNT_ASSIGN: "customers.discount_assign",
  CUSTOMERS_REPAIR_HISTORY_VIEW: "customers.repair_history.view",
  CUSTOMERS_PAYMENTS_VIEW: "customers.payments.view",

  // ─── VENDOR / TECHNICIAN MANAGEMENT ──────────────────────────────────────
  // PDF: Admin p.11, Regional Manager p.16
  VENDORS_CREATE: "vendors.create",
  VENDORS_READ: "vendors.read",
  VENDORS_UPDATE: "vendors.update",
  VENDORS_DELETE: "vendors.delete",
  VENDORS_APPROVE: "vendors.approve", // approve KYC / onboarding
  VENDORS_REJECT: "vendors.reject",
  VENDORS_SUSPEND: "vendors.suspend",
  VENDORS_MONITOR: "vendors.monitor", // performance dashboards
  VENDORS_PAYOUT_MANAGE: "vendors.payout_manage",
  VENDORS_COMMISSION_MANAGE: "vendors.commission_manage",
  VENDORS_ANNOUNCE: "vendors.announce", // broadcast to technicians
  VENDORS_EXPORT: "vendors.export",

  // ─── SERVICE REQUEST MANAGEMENT ──────────────────────────────────────────
  // PDF: Admin p.11, Regional Manager p.16
  SERVICE_REQUESTS_CREATE: "service_requests.create",
  SERVICE_REQUESTS_READ: "service_requests.read",
  SERVICE_REQUESTS_UPDATE: "service_requests.update", // modify / reschedule
  SERVICE_REQUESTS_DELETE: "service_requests.delete", // cancel / remove
  SERVICE_REQUESTS_ASSIGN: "service_requests.assign",
  SERVICE_REQUESTS_REASSIGN: "service_requests.reassign",
  SERVICE_REQUESTS_OVERRIDE: "service_requests.override", // force-assign
  SERVICE_REQUESTS_ESCALATE: "service_requests.escalate",
  SERVICE_REQUESTS_SLA_MONITOR: "service_requests.sla_monitor",
  SERVICE_REQUESTS_TAG: "service_requests.tag",
  SERVICE_REQUESTS_EXPORT: "service_requests.export",
  // Keep legacy alias so existing route guards still compile
  SERVICE_REQUESTS_CANCEL: "service_requests.delete",
  SERVICE_REQUESTS_MODIFY: "service_requests.update",

  // ─── CATEGORIES & SERVICES ───────────────────────────────────────────────
  // PDF: Admin p.11 — manage service catalogue, sub-categories
  CATEGORIES_CREATE: "categories.create",
  CATEGORIES_READ: "categories.read",
  CATEGORIES_UPDATE: "categories.update",
  CATEGORIES_DELETE: "categories.delete",

  // ─── PRICING ─────────────────────────────────────────────────────────────
  // PDF: Admin p.11 — set base prices, surge rules, regional overrides
  PRICING_READ: "pricing.read",
  PRICING_CREATE: "pricing.create",
  PRICING_MANAGE: "pricing.update", // alias kept for route guards
  PRICING_DELETE: "pricing.delete",
  PRICING_SURGE: "pricing.surge",
  PRICING_REGIONAL: "pricing.regional",

  // ─── PAYMENTS & FINANCIAL ────────────────────────────────────────────────
  // PDF: Admin p.12, CRM Manager p.15
  PAYMENTS_VIEW: "payments.read",
  PAYMENTS_CREATE: "payments.create", // manual payment entry
  PAYMENTS_REFUND: "payments.refund",
  PAYMENTS_EXPORT: "payments.export",
  PAYMENTS_INVOICE: "payments.invoice",
  PAYMENTS_FLAG_SUSPICIOUS: "payments.flag_suspicious",
  PAYMENTS_GATEWAY_CONFIG: "payments.gateway_config",

  // ─── WALLET ──────────────────────────────────────────────────────────────
  WALLET_VIEW: "wallet.read",
  WALLET_ADJUST: "wallet.update",
  WALLET_MONITOR: "wallet.monitor",

  // ─── SETTLEMENTS ─────────────────────────────────────────────────────────
  // PDF: Admin p.12 — vendor settlement cycles
  SETTLEMENTS_VIEW: "settlements.read",
  SETTLEMENTS_APPROVE: "settlements.approve",
  SETTLEMENTS_EXPORT: "settlements.export",

  // ─── SUBSCRIPTIONS & MEMBERSHIP ──────────────────────────────────────────
  // PDF: Admin p.12 — plan creation, user assignment, trial management
  SUBSCRIPTIONS_CREATE: "subscriptions.create",
  SUBSCRIPTIONS_READ: "subscriptions.read",
  SUBSCRIPTIONS_UPDATE: "subscriptions.update",
  SUBSCRIPTIONS_DELETE: "subscriptions.delete",
  SUBSCRIPTIONS_CANCEL: "subscriptions.cancel",
  SUBSCRIPTIONS_TRIAL: "subscriptions.trial",
  SUBSCRIPTIONS_ANALYTICS: "subscriptions.analytics",

  // ─── COUPONS & PROMOTIONS ────────────────────────────────────────────────
  // PDF: Admin p.12, Editor role
  COUPONS_CREATE: "coupons.create",
  COUPONS_READ: "coupons.read",
  COUPONS_UPDATE: "coupons.update",
  COUPONS_DELETE: "coupons.delete",
  COUPONS_ASSIGN: "coupons.assign",
  COUPONS_ANALYTICS: "coupons.analytics",

  // ─── REFERRALS ───────────────────────────────────────────────────────────
  REFERRALS_VIEW: "referrals.read",
  REFERRALS_MANAGE: "referrals.update",

  // ─── NOTIFICATIONS & COMMUNICATION ───────────────────────────────────────
  // PDF: Admin p.12, CRM Manager p.15
  NOTIFICATIONS_VIEW: "notifications.read",
  NOTIFICATIONS_BROADCAST: "notifications.create", // push / SMS / email blast
  NOTIFICATIONS_TEMPLATES: "notifications.update", // manage templates
  NOTIFICATIONS_DELETE: "notifications.delete",
  NOTIFICATIONS_SCHEDULE: "notifications.schedule",
  NOTIFICATIONS_ANALYTICS: "notifications.analytics",

  // ─── CAMPAIGNS ───────────────────────────────────────────────────────────
  // PDF: CRM Manager p.15, Regional Manager p.17
  CAMPAIGNS_CREATE: "campaigns.create",
  CAMPAIGNS_READ: "campaigns.read",
  CAMPAIGNS_MANAGE: "campaigns.update", // alias kept for route guards
  CAMPAIGNS_DELETE: "campaigns.delete",
  CAMPAIGNS_APPROVE: "campaigns.approve", // regional approval workflow
  CAMPAIGNS_ANALYTICS: "campaigns.analytics",

  // ─── RATINGS, REVIEWS & QUALITY ──────────────────────────────────────────
  // PDF: Admin p.12, CRM Manager p.15
  REVIEWS_READ: "reviews.read",
  REVIEWS_MODERATE: "reviews.update", // edit / moderate
  REVIEWS_FLAG: "reviews.flag",
  REVIEWS_RESPOND: "reviews.respond",
  REVIEWS_DELETE: "reviews.delete",
  REVIEWS_ANALYTICS: "reviews.analytics",

  // ─── SUPPORT & TICKETING ─────────────────────────────────────────────────
  // PDF: Admin p.12, CRM Manager p.15
  TICKETS_CREATE: "tickets.create",
  TICKETS_READ: "tickets.read",
  TICKETS_ASSIGN: "tickets.update", // assign / resolve maps to update
  TICKETS_DELETE: "tickets.delete",
  TICKETS_RESOLVE: "tickets.resolve",
  TICKETS_ESCALATE: "tickets.escalate",
  TICKETS_COMPENSATE: "tickets.compensate",
  TICKETS_EXPORT: "tickets.export",

  // ─── REPORTS & ANALYTICS ─────────────────────────────────────────────────
  // PDF: Admin p.13, CRM Manager p.15, Regional Manager p.17
  REPORTS_VIEW: "reports.read",
  REPORTS_CREATE: "reports.create", // custom report builder
  REPORTS_EXPORT: "reports.export",
  REPORTS_CUSTOM: "reports.create", // alias kept for existing guards
  ANALYTICS_CUSTOMER: "analytics.customers",
  ANALYTICS_REGION: "analytics.region",
  ANALYTICS_REVENUE: "analytics.revenue",
  ANALYTICS_TECHNICIAN: "analytics.technician",

  // ─── SYSTEM CONFIGURATION ────────────────────────────────────────────────
  // PDF: Admin p.13 — roles, feature flags, integrations, SLA rules
  SYSTEM_CONFIG: "system.update",
  SYSTEM_READ: "system.read",
  SYSTEM_ROLES_MANAGE: "system.roles_manage",
  SYSTEM_PERMISSIONS_MANAGE: "system.permissions_manage",
  SYSTEM_SLA_CONFIG: "system.sla_config",
  SYSTEM_INTEGRATIONS: "system.integrations",
  SYSTEM_MODULE_TOGGLE: "system.module_toggle",

  // ─── AUDIT & SECURITY ────────────────────────────────────────────────────
  // PDF: Admin p.13, CRM/Regional p.15/17
  AUDIT_LOGS_VIEW: "audit_logs.read",
  AUDIT_LOGS_EXPORT: "audit_logs.export",
  SECURITY_MANAGE: "security.update",
  SECURITY_MONITOR: "security.read",

  // ─── REGIONS / ZONES ─────────────────────────────────────────────────────
  // PDF: Admin p.13, Regional Manager p.16
  REGIONS_CREATE: "regions.create",
  REGIONS_READ: "regions.read",
  REGIONS_UPDATE: "regions.update",
  REGIONS_DELETE: "regions.delete",
  REGIONS_EXPAND: "regions.expand", // city/zone expansion requests

  // ─── SLA MANAGEMENT ──────────────────────────────────────────────────────
  // PDF: Regional Manager p.16
  SLA_VIEW: "sla.read",
  SLA_CONFIGURE: "sla.update",
  SLA_ALERTS: "sla.alerts",

  // ─── RESOURCE & CAPACITY PLANNING ────────────────────────────────────────
  // PDF: Regional Manager p.17
  RESOURCE_PLANNING_VIEW: "resource_planning.read",
  RESOURCE_PLANNING_MANAGE: "resource_planning.update",

  // ─── PLATFORM GROWTH & OPTIMISATION ──────────────────────────────────────
  // PDF: Admin p.13 — A/B tests, CLV models, partner onboarding
  GROWTH_READ: "growth.read",
  GROWTH_AB_TEST: "growth.ab_test",
  GROWTH_CLV: "growth.clv",
  GROWTH_EXPANSION: "growth.expansion",
  GROWTH_PARTNER_ONBOARD: "growth.partner_onboard",

  // ─── ADMIN USER MANAGEMENT ───────────────────────────────────────────────
  // PDF: Admin p.13 — create/edit/delete admin accounts, role assignment
  ADMIN_USERS_CREATE: "admin_users.create",
  ADMIN_USERS_VIEW: "admin_users.read",
  ADMIN_USERS_UPDATE: "admin_users.update",
  ADMIN_USERS_DELETE: "admin_users.delete",
  ADMIN_ROLES_ASSIGN: "admin_roles.assign",
  ADMIN_PERMISSIONS_OVERRIDE: "admin_permissions.override",

  // ─── CAPTAINS (DELIVERY DRIVERS) ─────────────────────────────────────────
  CAPTAINS_READ: "captains.read",             // view list + profile
  CAPTAINS_UPDATE: "captains.update",          // edit info + documents
  CAPTAINS_APPROVE: "captains.approve",        // approve / reject onboarding
  CAPTAINS_SUSPEND: "captains.suspend",        // suspend / reactivate
  CAPTAINS_WALLET_VIEW: "captains.wallet_view", // balance, transactions, analytics
  CAPTAINS_SETTLEMENTS_APPROVE: "captains.settlements_approve", // approve/reject withdrawals
  CAPTAINS_EXPORT: "captains.export",          // export captain data
  CAPTAINS_LIVE_ORDERS: "captains.live_orders", // live assigned trips
  CAPTAINS_HISTORY: "captains.history",        // completed trip history

  // ─── LOYALTY & RETENTION ─────────────────────────────────────────────────
  // PDF: CRM Manager p.15
  LOYALTY_VIEW: "loyalty.read",
  LOYALTY_MANAGE: "loyalty.update",
} as const;

export type Permission = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

/** Flat list of every permission string — used for super_admin, admin, and the permission panel. */
export const ALL_PERMISSIONS: Permission[] = [
  ...new Set(Object.values(PERMISSIONS) as Permission[]),
];
