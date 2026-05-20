/**
 * CRM Manager Routes — /crm prefix
 *
 * PDF ref: CRM Manager Functionality (Sections 1–10)
 * Access: users with roles[] containing "crm_manager" OR base role "admin"
 *
 * Route map:
 *  §1  Customer Management
 *      GET    /customers                       — list + filter
 *      GET    /customers/export                — CSV export
 *      GET    /customers/segments/:segment     — pre-built segments
 *      GET    /customers/:id                   — detail
 *      PATCH  /customers/:id                   — update profile
 *      PATCH  /customers/:id/block             — block
 *      PATCH  /customers/:id/unblock           — unblock
 *      GET    /customers/:id/interactions      — SR history
 *      GET    /customers/:id/subscription      — subscription history
 *      PATCH  /customers/:id/subscription      — manage subscription
 *      GET    /customers/:id/wallet            — wallet transactions
 *
 *  §2  Service Request Oversight
 *      GET    /service-requests                — list + filter
 *      GET    /service-requests/trends         — trend analysis
 *      GET    /service-requests/:id            — detail
 *      PATCH  /service-requests/:id/escalate   — escalate
 *      PATCH  /service-requests/:id/tag        — tag
 *
 *  §3  Communication
 *      POST   /notifications/broadcast         — broadcast
 *      GET    /notifications/stats             — stats
 *
 *  §4  Analytics
 *      GET    /analytics/customers             — customer KPIs
 *      GET    /analytics/revenue               — revenue analytics
 *      GET    /analytics/subscriptions         — subscription analytics
 *      GET    /analytics/conversions           — conversion rates
 *      GET    /analytics/high-value-customers  — loyalty
 *      GET    /analytics/churn                 — churn analysis
 *
 *  §5  Ticketing
 *      GET    /tickets                         — list
 *      POST   /tickets                         — create
 *      PATCH  /tickets/:id/assign              — assign
 *      PATCH  /tickets/:id/resolve             — resolve
 *      PATCH  /tickets/:id/escalate            — escalate
 *      PATCH  /tickets/:id/compensate          — compensate (wallet credit)
 *
 *  §6  Payments & Wallet
 *      GET    /analytics/wallet                — wallet overview
 *      GET    /analytics/payments/failed       — failed payments
 *
 *  §7  Campaigns
 *      GET    /campaigns                       — list
 *      POST   /campaigns                       — create
 *      GET    /campaigns/:id                   — detail
 *      PATCH  /campaigns/:id                   — update
 *      PATCH  /campaigns/:id/activate          — activate
 *
 *  §8  Reviews
 *      GET    /reviews                         — list reviews
 *      GET    /reviews/analytics               — review analytics
 *
 *  §9  Loyalty
 *      GET    /loyalty                         — loyalty overview
 *
 *  §3  Technician Performance (read-only)
 *      GET    /technicians/performance         — technician metrics
 */
import { FastifyInstance } from "fastify";
import { z } from "zod";
import { requireRole } from "../../shared/middleware/permission.middleware";
import { authMiddleware } from "../../shared/middleware/auth.middleware";
import { policyMiddleware } from "../../policies/policy.middleware";
import { PERMISSIONS, ROLES } from "../../access";
import {
  successResponse,
  paginatedResponse,
} from "../../shared/utils/response.util";
import { audit } from "../../shared/middleware/audit.middleware";
import {
  // §1 Customer Management
  crmListCustomers,
  crmGetCustomerDetail,
  crmSegmentCustomers,
  crmUpdateCustomer,
  crmBlockCustomer,
  crmUnblockCustomer,
  crmGetCustomerInteractions,
  crmGetCustomerServiceHistory,
  crmGetCustomerPaymentHistory,
  crmManageSubscription,
  crmGetCustomerSubscriptions,
  crmGetCustomerWalletTransactions,
  // §2 Service Request
  crmListServiceRequests,
  crmGetServiceRequestDetail,
  crmEscalateServiceRequest,
  crmTagServiceRequest,
  crmUpdateServiceRequest,
  crmGetServiceRequestTrends,
  crmGetTechnicianPerformance,
  // §4 Analytics
  crmGetCustomerAnalytics,
  crmGetRevenueAnalytics,
  crmGetSubscriptionAnalytics,
  crmGetConversionAnalytics,
  // §6 Wallet/Payments
  crmGetWalletOverview,
  crmGetFailedPayments,
  // §7 Campaigns
  crmListCampaigns,
  crmGetCampaignDetail,
  crmCreateCampaign,
  crmUpdateCampaign,
  crmActivateCampaign,
  crmDeleteCampaign,
  crmRestartCampaign,
  // §8 Campaign Templates
  crmListCampaignTemplates,
  crmCreateCampaignTemplate,
  crmUpdateCampaignTemplate,
  crmDeleteCampaignTemplate,
  // §9 Follow-up Rules
  crmListFollowUpRules,
  crmCreateFollowUpRule,
  crmUpdateFollowUpRule,
  crmDeleteFollowUpRule,
  crmToggleFollowUpRule,
  crmRunFollowUpRule,
  // §10 Loyalty
  crmGetHighValueCustomers,
  crmGetChurnAnalysis,
  crmGetLoyaltyOverview,
  // §3 Reviews
  crmListReviews,
  crmGetReviewAnalytics,
  crmRespondToReview,
  crmAssignReview,
  crmUpdateReviewStatus,
  crmGetTeamMembers,
  // §1 Segment overview
  crmGetSegmentOverview,
  // §3 Segment notification delivery (main-app bridge)
  crmDeliverNotificationToSegment,
} from "../../shared/services/crm.service";
import {
  listTickets,
  createTicket,
  assignTicket,
  resolveTicket,
  escalateTicket,
  broadcastNotification,
  getNotificationStats,
} from "../../shared/services/admin";
import { adjustWalletBalance } from "../../shared/services/wallet.service";

/**
 * PBAC helper: creates a policyMiddleware with resource auto-derived from the
 * action string (e.g. "customers.read" → resource "customers").
 * Used by all CRM endpoints as the DB-backed enforcement layer.
 */
const crmPolicy = (action: string) =>
  policyMiddleware({ action, resource: action.split(".")[0] });

const dateRangeSchema = z.object({
  from: z
    .string()
    .datetime()
    .optional()
    .transform((v) =>
      v
        ? new Date(v)
        : new Date(new Date().getFullYear(), new Date().getMonth(), 1),
    ),
  to: z
    .string()
    .datetime()
    .optional()
    .transform((v) => (v ? new Date(v) : new Date())),
});

export async function crmRoutes(app: FastifyInstance) {
  // ── Auth guards: authenticated + crm_manager role (or admin) ──────────────
  app.addHook("preHandler", authMiddleware);
  app.addHook(
    "preHandler",
    requireRole([ROLES.CRM_MANAGER, ROLES.ADMIN, ROLES.SUPER_ADMIN]),
  );

  // ═══════════════════════════════════════════════════════════════════════════
  // §1  CUSTOMER MANAGEMENT
  // ═══════════════════════════════════════════════════════════════════════════

  app.get(
    "/customers",
    { preHandler: [crmPolicy(PERMISSIONS.CUSTOMERS_READ)] },
    async (req, reply) => {
      const filter = z
        .object({
          search: z.string().optional(),
          isActive: z
            .enum(["true", "false"])
            .optional()
            .transform((v) => (v !== undefined ? v === "true" : undefined)),
          segment: z.string().optional(),
          page: z.coerce.number().default(1),
          limit: z.coerce.number().max(100).default(20),
        })
        .parse(req.query);
      const result = await crmListCustomers(filter);
      return reply.send(
        paginatedResponse(
          result.customers,
          result.total,
          filter.page,
          filter.limit,
          "Customers fetched",
        ),
      );
    },
  );

  /** Pre-built customer segments */
  app.get(
    "/customers/segments/:segment",
    { preHandler: [crmPolicy(PERMISSIONS.CUSTOMERS_SEGMENT)] },
    async (req: any, reply) => {
      const { page, limit } = z
        .object({
          page: z.coerce.number().default(1),
          limit: z.coerce.number().max(100).default(20),
        })
        .parse(req.query);
      const result = await crmSegmentCustomers(req.params.segment, page, limit);
      return reply.send(
        paginatedResponse(
          result.customers,
          result.total,
          page,
          limit,
          `Segment: ${req.params.segment}`,
        ),
      );
    },
  );

  /** Full customer profile with wallet, subscription, recent SRs */
  app.get(
    "/customers/:customerId",
    { preHandler: [crmPolicy(PERMISSIONS.CUSTOMERS_READ)] },
    async (req: any, reply) => {
      const data = await crmGetCustomerDetail(req.params.customerId);
      return reply.send(successResponse(data, "Customer detail fetched"));
    },
  );

  /** Update customer mutable fields (username, phone, avatar) */
  app.patch(
    "/customers/:customerId",
    { preHandler: [crmPolicy(PERMISSIONS.CUSTOMERS_UPDATE)] },
    async (req: any, reply) => {
      const updates = z
        .object({
          username: z.string().min(2).max(100).optional(),
          phone: z.string().optional(),
          avatar: z.string().url().optional(),
        })
        .parse(req.body);
      const customer = await crmUpdateCustomer(
        req.params.customerId,
        updates,
        req.admin!.userId,
      );
      await audit(req, "UPDATE", "customers", {
        targetId: req.params.customerId,
        targetModel: "User",
        metadata: { updates },
      });
      return reply.send(successResponse(customer, "Customer updated"));
    },
  );

  /** Block a customer (isActive = false) */
  app.patch(
    "/customers/:customerId/block",
    { preHandler: [crmPolicy(PERMISSIONS.CUSTOMERS_BLOCK)] },
    async (req: any, reply) => {
      const { reason } = z
        .object({ reason: z.string().min(5, "Provide a reason (min 5 chars)") })
        .parse(req.body);
      const result = await crmBlockCustomer(
        req.params.customerId,
        req.admin!.userId,
        reason,
      );
      await audit(req, "BLOCK", "customers", {
        targetId: req.params.customerId,
        targetModel: "User",
        metadata: { reason },
      });
      return reply.send(successResponse(result, "Customer blocked"));
    },
  );

  /** Reactivate a blocked customer */
  app.patch(
    "/customers/:customerId/unblock",
    { preHandler: [crmPolicy(PERMISSIONS.CUSTOMERS_BLOCK)] },
    async (req: any, reply) => {
      const result = await crmUnblockCustomer(
        req.params.customerId,
        req.admin!.userId,
      );
      await audit(req, "UNBLOCK", "customers", {
        targetId: req.params.customerId,
        targetModel: "User",
      });
      return reply.send(successResponse(result, "Customer unblocked"));
    },
  );

  /** Customer interaction history (service requests timeline) */
  app.get(
    "/customers/:customerId/interactions",
    { preHandler: [crmPolicy(PERMISSIONS.CUSTOMERS_READ)] },
    async (req: any, reply) => {
      const { page, limit } = z
        .object({
          page: z.coerce.number().default(1),
          limit: z.coerce.number().default(20),
        })
        .parse(req.query);
      const data = await crmGetCustomerInteractions(
        req.params.customerId,
        page,
        limit,
      );
      return reply.send(
        paginatedResponse(
          data.serviceRequests,
          data.total,
          page,
          limit,
          "Customer interactions",
        ),
      );
    },
  );

  /** Customer subscription history */
  app.get(
    "/customers/:customerId/subscription",
    { preHandler: [crmPolicy(PERMISSIONS.SUBSCRIPTIONS_READ)] },
    async (req: any, reply) => {
      const data = await crmGetCustomerSubscriptions(req.params.customerId);
      return reply.send(successResponse(data, "Customer subscriptions"));
    },
  );

  /** Cancel / pause / reactivate subscription */
  app.patch(
    "/customers/:customerId/subscription",
    { preHandler: [crmPolicy(PERMISSIONS.SUBSCRIPTIONS_CANCEL)] },
    async (req: any, reply) => {
      const { action, reason } = z
        .object({
          action: z.enum(["cancel", "pause", "reactivate"]),
          reason: z.string().optional(),
        })
        .parse(req.body);
      const result = await crmManageSubscription(
        req.params.customerId,
        action,
        req.admin!.userId,
        reason,
      );
      const auditActionMap = {
        cancel: "SUBSCRIPTION_CANCEL" as const,
        pause: "SUBSCRIPTION_PAUSE" as const,
        reactivate: "SUBSCRIPTION_REACTIVATE" as const,
      };
      await audit(req, auditActionMap[action], "subscriptions", {
        targetId: req.params.customerId,
        targetModel: "User",
        metadata: { action, reason },
      });
      return reply.send(successResponse(result, `Subscription ${action}ed`));
    },
  );

  /** Customer wallet transactions (paginated, covers archive too) */
  app.get(
    "/customers/:customerId/wallet",
    { preHandler: [crmPolicy(PERMISSIONS.WALLET_VIEW)] },
    async (req: any, reply) => {
      const { page, limit } = z
        .object({
          page: z.coerce.number().default(1),
          limit: z.coerce.number().default(20),
        })
        .parse(req.query);
      const data = await crmGetCustomerWalletTransactions(
        req.params.customerId,
        page,
        limit,
      );
      return reply.send(
        paginatedResponse(
          data.transactions,
          data.total,
          page,
          limit,
          "Wallet transactions",
        ),
      );
    },
  );

  /** Full paginated service request history for a customer with filters */
  app.get(
    "/customers/:customerId/service-requests",
    { preHandler: [crmPolicy(PERMISSIONS.CUSTOMERS_REPAIR_HISTORY_VIEW)] },
    async (req: any, reply) => {
      const filter = z
        .object({
          status: z.string().optional(),
          serviceType: z.string().optional(),
          from: z
            .string()
            .datetime()
            .optional()
            .transform((v) => (v ? new Date(v) : undefined)),
          to: z
            .string()
            .datetime()
            .optional()
            .transform((v) => (v ? new Date(v) : undefined)),
          page: z.coerce.number().default(1),
          limit: z.coerce.number().max(100).default(20),
        })
        .parse(req.query);
      const data = await crmGetCustomerServiceHistory(
        req.params.customerId,
        filter,
      );
      return reply.send(
        paginatedResponse(
          data.requests,
          data.total,
          data.page,
          data.limit,
          "Customer service history",
        ),
      );
    },
  );

  /** Payment transaction history for a customer */
  app.get(
    "/customers/:customerId/payments",
    { preHandler: [crmPolicy(PERMISSIONS.CUSTOMERS_PAYMENTS_VIEW)] },
    async (req: any, reply) => {
      const filter = z
        .object({
          status: z.string().optional(),
          page: z.coerce.number().default(1),
          limit: z.coerce.number().max(100).default(20),
        })
        .parse(req.query);
      const data = await crmGetCustomerPaymentHistory(
        req.params.customerId,
        filter,
      );
      return reply.send(
        paginatedResponse(
          data.payments,
          data.total,
          data.page,
          data.limit,
          "Customer payment history",
        ),
      );
    },
  );

  // ═══════════════════════════════════════════════════════════════════════════
  // §2  SERVICE REQUEST OVERSIGHT
  // ═══════════════════════════════════════════════════════════════════════════

  app.get(
    "/service-requests",
    { preHandler: [crmPolicy(PERMISSIONS.SERVICE_REQUESTS_READ)] },
    async (req, reply) => {
      const filter = z
        .object({
          status: z.string().optional(),
          city: z.string().optional(),
          priority: z.string().optional(),
          search: z.string().optional(),
          from: z
            .string()
            .datetime()
            .optional()
            .transform((v) => (v ? new Date(v) : undefined)),
          to: z
            .string()
            .datetime()
            .optional()
            .transform((v) => (v ? new Date(v) : undefined)),
          page: z.coerce.number().default(1),
          limit: z.coerce.number().default(20),
        })
        .parse(req.query);
      const result = await crmListServiceRequests(filter);
      return reply.send(
        paginatedResponse(
          result.requests,
          result.total,
          filter.page,
          filter.limit,
          "Service requests fetched",
        ),
      );
    },
  );

  /** SR trend analysis: volume, status, city, brand breakdowns */
  app.get(
    "/service-requests/trends",
    { preHandler: [crmPolicy(PERMISSIONS.SERVICE_REQUESTS_READ)] },
    async (req, reply) => {
      const { from, to } = dateRangeSchema.parse(req.query);
      const data = await crmGetServiceRequestTrends(from, to);
      return reply.send(successResponse(data, "SR trends"));
    },
  );

  /** Full detail for a single SR */
  app.get(
    "/service-requests/:requestId",
    { preHandler: [crmPolicy(PERMISSIONS.SERVICE_REQUESTS_READ)] },
    async (req: any, reply) => {
      const data = await crmGetServiceRequestDetail(req.params.requestId);
      return reply.send(successResponse(data, "Service request detail"));
    },
  );

  /** Escalate a service request */
  app.patch(
    "/service-requests/:requestId/escalate",
    { preHandler: [crmPolicy(PERMISSIONS.SERVICE_REQUESTS_ESCALATE)] },
    async (req: any, reply) => {
      const { note } = z.object({ note: z.string().min(5) }).parse(req.body);
      const sr = await crmEscalateServiceRequest(
        req.params.requestId,
        req.admin!.userId,
        note,
      );
      await audit(req, "ESCALATE_SR", "service_requests", {
        targetId: req.params.requestId,
        targetModel: "ServiceRequest",
        metadata: { note },
      });
      return reply.send(successResponse(sr, "Service request escalated"));
    },
  );

  /** Tag a service request */
  app.patch(
    "/service-requests/:requestId/tag",
    { preHandler: [crmPolicy(PERMISSIONS.SERVICE_REQUESTS_TAG)] },
    async (req: any, reply) => {
      const { tag } = z.object({ tag: z.string().min(1) }).parse(req.body);
      const sr = await crmTagServiceRequest(
        req.params.requestId,
        tag,
        req.admin!.userId,
      );
      await audit(req, "TAG_SR", "service_requests", {
        targetId: req.params.requestId,
        targetModel: "ServiceRequest",
        metadata: { tag },
      });
      return reply.send(successResponse(sr, "Service request tagged"));
    },
  );

  /** Full-field CRM edit — all editable fields of a service request */
  app.patch(
    "/service-requests/:requestId",
    { preHandler: [crmPolicy(PERMISSIONS.SERVICE_REQUESTS_UPDATE)] },
    async (req: any, reply) => {
      const bodySchema = z.object({
        // Customer
        userName: z.string().optional(),
        userPhone: z.string().optional(),
        beneficiaryName: z.string().optional(),
        beneficiaryPhone: z.string().optional(),
        requestType: z.enum(["self", "other"]).optional(),
        // Location
        address: z.string().optional(),
        city: z.string().optional(),
        location: z
          .object({
            address: z.string().optional(),
            lat: z.number().optional(),
            lng: z.number().optional(),
          })
          .optional(),
        customerLocation: z
          .object({
            latitude: z.number().optional(),
            longitude: z.number().optional(),
          })
          .optional(),
        // Device
        brand: z.string().optional(),
        model: z.string().optional(),
        deviceType: z.string().optional(),
        deviceBrand: z.string().optional(),
        deviceModel: z.string().optional(),
        // Service
        serviceType: z.enum(["pickup-drop", "visit-shop", "onsite"]).optional(),
        status: z.string().optional(),
        priority: z.enum(["low", "medium", "high", "urgent"]).optional(),
        isUrgent: z.boolean().optional(),
        // Problem
        mainProblem: z
          .object({ id: z.string(), title: z.string() })
          .optional(),
        subProblem: z
          .object({ id: z.string(), title: z.string() })
          .optional(),
        relationalBehaviors: z.array(z.unknown()).optional(),
        minPrice: z.number().optional(),
        maxPrice: z.number().optional(),
        level: z.string().optional(),
        problemDescription: z.string().optional(),
        // Scheduling
        preferredDate: z.string().optional(),
        preferredTime: z.string().optional(),
        scheduledDate: z.string().optional(),
        scheduledTime: z.string().optional(),
        scheduledSlot: z.string().optional(),
        // Pricing
        adminFinalPrice: z.number().optional(),
        adminPricingNotes: z.string().optional(),
        adminComponentCharges: z.number().optional(),
        adminComponentNotes: z.string().optional(),
        // Assignment
        assignedTechnician: z.string().optional(),
        assignedVendor: z.string().optional(),
        assignedCaptain: z.string().optional(),
        // Notes
        technicianNotes: z.string().optional(),
        scheduleNotes: z.string().optional(),
      });

      const updates = bodySchema.parse(req.body);

      if (Object.keys(updates).length === 0) {
        return reply.status(400).send({ success: false, message: "No fields provided to update" });
      }

      const sr = await crmUpdateServiceRequest(
        req.params.requestId,
        updates,
        req.admin!.userId,
      );
      await audit(req, "UPDATE_SR", "service_requests", {
        targetId: req.params.requestId,
        targetModel: "ServiceRequest",
        metadata: { updatedFields: Object.keys(updates) },
      });
      return reply.send(successResponse(sr, "Service request updated"));
    },
  );

  // ═══════════════════════════════════════════════════════════════════════════
  // §3  COMMUNICATION & NOTIFICATIONS
  // ═══════════════════════════════════════════════════════════════════════════

  app.post(
    "/notifications/broadcast",
    { preHandler: [crmPolicy(PERMISSIONS.NOTIFICATIONS_BROADCAST)] },
    async (req, reply) => {
      const body = z
        .object({
          title: z.string().min(1),
          message: z.string().min(1),
          type: z.string().optional(),
          targetRole: z.string().optional(),
          targetUsers: z.array(z.string()).optional(),
          // Segment-based delivery — routes through main-app bridge for
          // real-time Socket.IO push + correct notification type enum
          targetSegment: z.string().optional(),
        })
        .parse(req.body);

      let result: { sent: number; failed?: number; total?: number };

      if (body.targetSegment) {
        // Segment path: resolve users via main-app bridge
        result = await crmDeliverNotificationToSegment({
          segment: body.targetSegment,
          title: body.title,
          message: body.message,
        });
        await audit(req, "BROADCAST_NOTIFICATION", "notifications", {
          metadata: {
            targetSegment: body.targetSegment,
            title: body.title,
            sent: result.sent,
            failed: result.failed ?? 0,
            total: result.total ?? 0,
          },
        });
      } else {
        // Legacy path: role or explicit user list via existing broadcastNotification
        result = await broadcastNotification({
          title: body.title,
          message: body.message,
          type: body.type ?? "promotional",
          targetRole: body.targetRole,
          targetUsers: body.targetUsers,
        });
        await audit(req, "BROADCAST_NOTIFICATION", "notifications", {
          metadata: {
            targetRole: body.targetRole,
            targetUsers: body.targetUsers?.length ?? 0,
            sent: result.sent,
          },
        });
      }

      return reply.send(successResponse(result, "Broadcast sent"));
    },
  );

  app.get(
    "/notifications/stats",
    { preHandler: [crmPolicy(PERMISSIONS.NOTIFICATIONS_ANALYTICS)] },
    async (_req, reply) => {
      const stats = await getNotificationStats();
      return reply.send(successResponse(stats, "Notification stats"));
    },
  );

  // ═══════════════════════════════════════════════════════════════════════════
  // §4  ANALYTICS & REPORTING
  // ═══════════════════════════════════════════════════════════════════════════

  app.get(
    "/analytics/customers",
    { preHandler: [crmPolicy(PERMISSIONS.ANALYTICS_CUSTOMER)] },
    async (_req, reply) => {
      const data = await crmGetCustomerAnalytics();
      return reply.send(successResponse(data, "Customer analytics"));
    },
  );

  app.get(
    "/analytics/revenue",
    { preHandler: [crmPolicy(PERMISSIONS.ANALYTICS_REVENUE)] },
    async (req, reply) => {
      const { from, to } = dateRangeSchema.parse(req.query);
      const data = await crmGetRevenueAnalytics(from, to);
      return reply.send(successResponse(data, "Revenue analytics"));
    },
  );

  app.get(
    "/analytics/subscriptions",
    { preHandler: [crmPolicy(PERMISSIONS.SUBSCRIPTIONS_ANALYTICS)] },
    async (_req, reply) => {
      const data = await crmGetSubscriptionAnalytics();
      return reply.send(successResponse(data, "Subscription analytics"));
    },
  );

  app.get(
    "/analytics/conversions",
    { preHandler: [crmPolicy(PERMISSIONS.ANALYTICS_CUSTOMER)] },
    async (req, reply) => {
      const { from, to } = dateRangeSchema.parse(req.query);
      const data = await crmGetConversionAnalytics(from, to);
      return reply.send(successResponse(data, "Conversion analytics"));
    },
  );

  app.get(
    "/analytics/high-value-customers",
    { preHandler: [crmPolicy(PERMISSIONS.LOYALTY_VIEW)] },
    async (req, reply) => {
      const { limit } = z
        .object({ limit: z.coerce.number().default(20) })
        .parse(req.query);
      const data = await crmGetHighValueCustomers(limit);
      return reply.send(successResponse(data, "High value customers"));
    },
  );

  /** Churn analysis: customers with no orders in N days */
  app.get(
    "/analytics/churn",
    { preHandler: [crmPolicy(PERMISSIONS.ANALYTICS_CUSTOMER)] },
    async (req, reply) => {
      const { inactiveDays, page, limit } = z
        .object({
          inactiveDays: z.coerce.number().default(90),
          page: z.coerce.number().default(1),
          limit: z.coerce.number().default(20),
        })
        .parse(req.query);
      const data = await crmGetChurnAnalysis(inactiveDays, page, limit);
      return reply.send(
        paginatedResponse(
          data.customers,
          data.total,
          data.page,
          data.limit,
          "Churn analysis",
        ),
      );
    },
  );

  // ═══════════════════════════════════════════════════════════════════════════
  // §5  SUPPORT TICKETS
  // ═══════════════════════════════════════════════════════════════════════════

  app.get(
    "/tickets",
    { preHandler: [crmPolicy(PERMISSIONS.TICKETS_READ)] },
    async (req, reply) => {
      const filter = z
        .object({
          status: z.string().optional(),
          priority: z.string().optional(),
          page: z.coerce.number().default(1),
          limit: z.coerce.number().default(20),
        })
        .parse(req.query);
      const result = await listTickets(filter);
      return reply.send(
        paginatedResponse(
          result.tickets,
          result.total,
          filter.page,
          filter.limit,
          "Tickets fetched",
        ),
      );
    },
  );

  app.post(
    "/tickets",
    { preHandler: [crmPolicy(PERMISSIONS.TICKETS_CREATE)] },
    async (req, reply) => {
      const body = z
        .object({
          title: z.string(),
          description: z.string(),
          category: z.enum([
            "payment_issue",
            "service_quality",
            "technician_complaint",
            "app_issue",
            "refund_request",
            "account_issue",
            "other",
          ]),
          priority: z
            .enum(["low", "medium", "high", "critical"])
            .default("medium"),
          relatedServiceRequest: z.string().optional(),
        })
        .parse(req.body);
      const ticket = await createTicket({
        ...body,
        source: "internal",
        raisedBy: req.admin!.userId,
        raisedByRole: "crm_manager",
      });
      return reply.code(201).send(successResponse(ticket, "Ticket created"));
    },
  );

  app.patch(
    "/tickets/:ticketId/assign",
    { preHandler: [crmPolicy(PERMISSIONS.TICKETS_ASSIGN)] },
    async (req: any, reply) => {
      const { assignedTo } = z
        .object({ assignedTo: z.string() })
        .parse(req.body);
      const ticket = await assignTicket(req.params.ticketId, assignedTo);
      return reply.send(successResponse(ticket, "Ticket assigned"));
    },
  );

  app.patch(
    "/tickets/:ticketId/resolve",
    { preHandler: [crmPolicy(PERMISSIONS.TICKETS_RESOLVE)] },
    async (req: any, reply) => {
      const { resolutionNote } = z
        .object({ resolutionNote: z.string().min(10) })
        .parse(req.body);
      const ticket = await resolveTicket(
        req.params.ticketId,
        req.admin!.userId,
        resolutionNote,
      );
      return reply.send(successResponse(ticket, "Ticket resolved"));
    },
  );

  app.patch(
    "/tickets/:ticketId/escalate",
    { preHandler: [crmPolicy(PERMISSIONS.TICKETS_ESCALATE)] },
    async (req: any, reply) => {
      const { escalatedTo, note } = z
        .object({ escalatedTo: z.string(), note: z.string().min(5) })
        .parse(req.body);
      const ticket = await escalateTicket(
        req.params.ticketId,
        escalatedTo,
        note,
      );
      return reply.send(successResponse(ticket, "Ticket escalated"));
    },
  );

  /**
   * Compensate a customer from a ticket: credits the customer's wallet.
   * CRM Manager can grant compensation up to a platform limit.
   */
  app.patch(
    "/tickets/:ticketId/compensate",
    { preHandler: [crmPolicy(PERMISSIONS.TICKETS_COMPENSATE)] },
    async (req: any, reply) => {
      const { customerId, amount, reason } = z
        .object({
          customerId: z.string().min(1),
          amount: z.number().positive().max(5000, "Max compensation is ₹5000"),
          reason: z.string().min(10),
        })
        .parse(req.body);

      const wallet = await adjustWalletBalance({
        userId: customerId,
        type: "credit",
        amount,
        description: `Compensation: ${reason} (Ticket: ${req.params.ticketId})`,
        referenceId: req.params.ticketId,
        referenceModel: "SupportTicket",
        performedBy: req.admin!.userId,
      });

      await audit(req, "COMPENSATE", "tickets", {
        targetId: req.params.ticketId,
        targetModel: "SupportTicket",
        metadata: { customerId, amount, reason },
      });

      return reply.send(
        successResponse(
          { wallet, amount, customerId },
          `₹${amount} compensation credited to customer wallet`,
        ),
      );
    },
  );

  // ── Segment overview — all segment counts in one call ─────────────────────
  app.get(
    "/analytics/segment-overview",
    { preHandler: [crmPolicy(PERMISSIONS.CUSTOMERS_SEGMENT)] },
    async (_req, reply) => {
      const data = await crmGetSegmentOverview();
      return reply.send(successResponse(data, "Segment overview"));
    },
  );

  // ═══════════════════════════════════════════════════════════════════════════
  // §6  WALLET & PAYMENTS OVERVIEW
  // ═══════════════════════════════════════════════════════════════════════════

  app.get(
    "/analytics/wallet",
    { preHandler: [crmPolicy(PERMISSIONS.WALLET_MONITOR)] },
    async (_req, reply) => {
      const data = await crmGetWalletOverview();
      return reply.send(successResponse(data, "Wallet overview"));
    },
  );

  app.get(
    "/analytics/payments/failed",
    { preHandler: [crmPolicy(PERMISSIONS.WALLET_MONITOR)] },
    async (req, reply) => {
      const { page, limit } = z
        .object({
          page: z.coerce.number().default(1),
          limit: z.coerce.number().default(20),
        })
        .parse(req.query);
      const data = await crmGetFailedPayments(page, limit);
      return reply.send(
        paginatedResponse(
          data.payments,
          data.total,
          page,
          limit,
          "Failed/pending payments",
        ),
      );
    },
  );

  // ═══════════════════════════════════════════════════════════════════════════
  // §7  MARKETING AUTOMATION — CAMPAIGNS
  // ═══════════════════════════════════════════════════════════════════════════

  app.get(
    "/campaigns",
    { preHandler: [crmPolicy(PERMISSIONS.CAMPAIGNS_READ)] },
    async (req, reply) => {
      const filter = z
        .object({
          status: z.string().optional(),
          type: z.string().optional(),
          segment: z.string().optional(),
          page: z.coerce.number().default(1),
          limit: z.coerce.number().default(20),
        })
        .parse(req.query);
      const data = await crmListCampaigns(filter);
      return reply.send(
        paginatedResponse(
          data.campaigns,
          data.total,
          data.page,
          data.limit,
          "Campaigns fetched",
        ),
      );
    },
  );

  app.get(
    "/campaigns/:campaignId",
    { preHandler: [crmPolicy(PERMISSIONS.CAMPAIGNS_READ)] },
    async (req: any, reply) => {
      const data = await crmGetCampaignDetail(req.params.campaignId);
      return reply.send(successResponse(data, "Campaign detail"));
    },
  );

  app.post(
    "/campaigns",
    { preHandler: [crmPolicy(PERMISSIONS.CAMPAIGNS_CREATE)] },
    async (req, reply) => {
      const body = z
        .object({
          title: z.string().min(1).max(200),
          description: z.string().optional(),
          type: z.enum(["email", "sms", "in_app", "push"]),
          targetSegment: z.enum([
            "all",
            "active_subscribers",
            "inactive",
            "new_this_month",
            "high_value",
            "regional",
            "custom",
          ]),
          targetRegion: z.string().optional(),
          targetUserIds: z.array(z.string()).optional(),
          content: z.object({
            subject: z.string().optional(),
            body: z.string().min(1),
            callToAction: z.string().optional(),
          }),
          scheduledAt: z
            .string()
            .datetime()
            .optional()
            .transform((v) => (v ? new Date(v) : undefined)),
        })
        .parse(req.body);
      const campaign = await crmCreateCampaign(body, req.admin!.userId);
      await audit(req, "CREATE_CAMPAIGN", "campaigns", {
        targetId: String(campaign._id),
        targetModel: "Campaign",
        metadata: { title: campaign.title, type: campaign.type },
      });
      return reply
        .code(201)
        .send(successResponse(campaign, "Campaign created"));
    },
  );

  app.patch(
    "/campaigns/:campaignId",
    { preHandler: [crmPolicy(PERMISSIONS.CAMPAIGNS_MANAGE)] },
    async (req: any, reply) => {
      const updates = z
        .object({
          title: z.string().optional(),
          description: z.string().optional(),
          scheduledAt: z
            .string()
            .datetime()
            .optional()
            .transform((v) => (v ? new Date(v) : undefined)),
          content: z
            .object({
              subject: z.string().optional(),
              body: z.string().min(1).optional(),
              callToAction: z.string().optional(),
            })
            .optional(),
          status: z
            .enum(["draft", "scheduled", "paused", "cancelled"])
            .optional(),
        })
        .parse(req.body);
      const campaign = await crmUpdateCampaign(
        req.params.campaignId,
        updates,
        req.admin!.userId,
      );
      await audit(req, "UPDATE_CAMPAIGN", "campaigns", {
        targetId: req.params.campaignId,
        targetModel: "Campaign",
      });
      return reply.send(successResponse(campaign, "Campaign updated"));
    },
  );

  app.patch(
    "/campaigns/:campaignId/activate",
    { preHandler: [crmPolicy(PERMISSIONS.CAMPAIGNS_MANAGE)] },
    async (req: any, reply) => {
      const campaign = await crmActivateCampaign(
        req.params.campaignId,
        req.admin!.userId,
      );
      await audit(req, "ACTIVATE_CAMPAIGN", "campaigns", {
        targetId: req.params.campaignId,
        targetModel: "Campaign",
      });
      return reply.send(successResponse(campaign, "Campaign activated"));
    },
  );

  app.delete(
    "/campaigns/:campaignId",
    { preHandler: [crmPolicy(PERMISSIONS.CAMPAIGNS_DELETE)] },
    async (req: any, reply) => {
      await crmDeleteCampaign(req.params.campaignId);
      await audit(req, "DELETE_CAMPAIGN", "campaigns", {
        targetId: req.params.campaignId,
        targetModel: "Campaign",
      });
      return reply.send(successResponse(null, "Campaign deleted"));
    },
  );

  app.patch(
    "/campaigns/:campaignId/restart",
    { preHandler: [crmPolicy(PERMISSIONS.CAMPAIGNS_MANAGE)] },
    async (req: any, reply) => {
      const campaign = await crmRestartCampaign(req.params.campaignId);
      await audit(req, "RESTART_CAMPAIGN", "campaigns", {
        targetId: req.params.campaignId,
        targetModel: "Campaign",
      });
      return reply.send(successResponse(campaign, "Campaign restarted"));
    },
  );

  // ═══════════════════════════════════════════════════════════════════════════
  // §8  CAMPAIGN TEMPLATES
  // ═══════════════════════════════════════════════════════════════════════════

  app.get(
    "/campaign-templates",
    { preHandler: [crmPolicy(PERMISSIONS.CAMPAIGNS_READ)] },
    async (req, reply) => {
      const { channel } = z
        .object({ channel: z.string().optional() })
        .parse(req.query);
      const templates = await crmListCampaignTemplates(channel);
      return reply.send(successResponse(templates, "Templates fetched"));
    },
  );

  app.post(
    "/campaign-templates",
    { preHandler: [crmPolicy(PERMISSIONS.CAMPAIGNS_CREATE)] },
    async (req, reply) => {
      const body = z
        .object({
          name: z.string().min(1).max(100),
          description: z.string().optional(),
          channel: z.enum(["email", "sms", "in_app", "push"]),
          subject: z.string().optional(),
          body: z.string().min(1),
          callToAction: z.string().optional(),
        })
        .parse(req.body);
      const template = await crmCreateCampaignTemplate(body, req.admin!.userId);
      await audit(req, "CREATE_TEMPLATE", "campaign-templates", {
        targetId: String(template._id),
        targetModel: "CampaignTemplate",
        metadata: { name: template.name, channel: template.channel },
      });
      return reply.code(201).send(successResponse(template, "Template created"));
    },
  );

  app.patch(
    "/campaign-templates/:templateId",
    { preHandler: [crmPolicy(PERMISSIONS.CAMPAIGNS_MANAGE)] },
    async (req: any, reply) => {
      const updates = z
        .object({
          name: z.string().min(1).max(100).optional(),
          description: z.string().optional(),
          subject: z.string().optional(),
          body: z.string().min(1).optional(),
          callToAction: z.string().optional(),
          isActive: z.boolean().optional(),
        })
        .parse(req.body);
      const template = await crmUpdateCampaignTemplate(
        req.params.templateId,
        updates,
        req.admin!.userId,
      );
      await audit(req, "UPDATE_TEMPLATE", "campaign-templates", {
        targetId: req.params.templateId,
        targetModel: "CampaignTemplate",
      });
      return reply.send(successResponse(template, "Template updated"));
    },
  );

  app.delete(
    "/campaign-templates/:templateId",
    { preHandler: [crmPolicy(PERMISSIONS.CAMPAIGNS_DELETE)] },
    async (req: any, reply) => {
      await crmDeleteCampaignTemplate(req.params.templateId);
      await audit(req, "DELETE_TEMPLATE", "campaign-templates", {
        targetId: req.params.templateId,
        targetModel: "CampaignTemplate",
      });
      return reply.send(successResponse(null, "Template deleted"));
    },
  );

  // ═══════════════════════════════════════════════════════════════════════════
  // §9  AUTOMATED FOLLOW-UP RULES
  // ═══════════════════════════════════════════════════════════════════════════

  app.get(
    "/follow-up-rules",
    { preHandler: [crmPolicy(PERMISSIONS.CAMPAIGNS_READ)] },
    async (_req, reply) => {
      const rules = await crmListFollowUpRules();
      return reply.send(successResponse(rules, "Follow-up rules fetched"));
    },
  );

  app.post(
    "/follow-up-rules",
    { preHandler: [crmPolicy(PERMISSIONS.CAMPAIGNS_CREATE)] },
    async (req, reply) => {
      const body = z
        .object({
          name: z.string().min(1).max(100),
          description: z.string().optional(),
          trigger: z.enum([
            "service_completed",
            "subscription_expiry",
            "subscription_renewed",
          ]),
          delayHours: z.coerce.number().int().min(0).default(24),
          daysBeforeExpiry: z.coerce.number().int().min(1).optional(),
          channel: z.enum(["email", "sms", "in_app", "push"]),
          content: z.object({
            subject: z.string().optional(),
            body: z.string().min(1),
            callToAction: z.string().optional(),
          }),
        })
        .parse(req.body);
      const rule = await crmCreateFollowUpRule(body, req.admin!.userId);
      await audit(req, "CREATE", "follow-up-rules", {
        targetId: String(rule._id),
        targetModel: "FollowUpRule",
        metadata: { name: rule.name, trigger: rule.trigger },
      });
      return reply.code(201).send(successResponse(rule, "Follow-up rule created"));
    },
  );

  app.patch(
    "/follow-up-rules/:ruleId",
    { preHandler: [crmPolicy(PERMISSIONS.CAMPAIGNS_MANAGE)] },
    async (req: any, reply) => {
      const updates = z
        .object({
          name: z.string().min(1).max(100).optional(),
          description: z.string().optional(),
          trigger: z
            .enum([
              "service_completed",
              "subscription_expiry",
              "subscription_renewed",
            ])
            .optional(),
          delayHours: z.coerce.number().int().min(0).optional(),
          daysBeforeExpiry: z.coerce.number().int().min(1).optional(),
          channel: z.enum(["email", "sms", "in_app", "push"]).optional(),
          content: z
            .object({
              subject: z.string().optional(),
              body: z.string().min(1).optional(),
              callToAction: z.string().optional(),
            })
            .optional(),
          isActive: z.boolean().optional(),
        })
        .parse(req.body);
      const rule = await crmUpdateFollowUpRule(
        req.params.ruleId,
        updates,
        req.admin!.userId,
      );
      await audit(req, "UPDATE", "follow-up-rules", {
        targetId: req.params.ruleId,
        targetModel: "FollowUpRule",
      });
      return reply.send(successResponse(rule, "Follow-up rule updated"));
    },
  );

  app.delete(
    "/follow-up-rules/:ruleId",
    { preHandler: [crmPolicy(PERMISSIONS.CAMPAIGNS_DELETE)] },
    async (req: any, reply) => {
      await crmDeleteFollowUpRule(req.params.ruleId);
      await audit(req, "DELETE", "follow-up-rules", {
        targetId: req.params.ruleId,
        targetModel: "FollowUpRule",
      });
      return reply.send(successResponse(null, "Follow-up rule deleted"));
    },
  );

  app.patch(
    "/follow-up-rules/:ruleId/toggle",
    { preHandler: [crmPolicy(PERMISSIONS.CAMPAIGNS_MANAGE)] },
    async (req: any, reply) => {
      const rule = await crmToggleFollowUpRule(req.params.ruleId);
      await audit(req, "UPDATE", "follow-up-rules", {
        targetId: req.params.ruleId,
        targetModel: "FollowUpRule",
        metadata: { isActive: rule.isActive },
      });
      return reply.send(
        successResponse(rule, `Rule ${rule.isActive ? "enabled" : "disabled"}`),
      );
    },
  );

  app.post(
    "/follow-up-rules/:ruleId/run",
    { preHandler: [crmPolicy(PERMISSIONS.CAMPAIGNS_MANAGE)] },
    async (req: any, reply) => {
      const result = await crmRunFollowUpRule(req.params.ruleId);
      await audit(req, "UPDATE", "follow-up-rules", {
        targetId: req.params.ruleId,
        targetModel: "FollowUpRule",
        metadata: { manualRun: true },
      });
      return reply.send(successResponse(result, "Rule executed"));
    },
  );

  // ═══════════════════════════════════════════════════════════════════════════
  // §8  REVIEWS MANAGEMENT (read + analytics)
  // ═══════════════════════════════════════════════════════════════════════════

  app.get(
    "/reviews",
    { preHandler: [crmPolicy(PERMISSIONS.REVIEWS_READ)] },
    async (req, reply) => {
      const filter = z
        .object({
          minRating: z.coerce.number().min(1).max(5).optional(),
          maxRating: z.coerce.number().min(1).max(5).optional(),
          reviewStatus: z.string().optional(),
          hasResponse: z
            .enum(["true", "false"])
            .optional()
            .transform((v) => (v !== undefined ? v === "true" : undefined)),
          page: z.coerce.number().default(1),
          limit: z.coerce.number().default(20),
        })
        .parse(req.query);
      const data = await crmListReviews(filter);
      return reply.send(
        paginatedResponse(
          data.reviews,
          data.total,
          data.page,
          data.limit,
          "Reviews fetched",
        ),
      );
    },
  );

  app.get(
    "/reviews/analytics",
    { preHandler: [crmPolicy(PERMISSIONS.REVIEWS_ANALYTICS)] },
    async (_req, reply) => {
      const data = await crmGetReviewAnalytics();
      return reply.send(successResponse(data, "Review analytics"));
    },
  );

  app.post(
    "/reviews/:id/respond",
    { preHandler: [crmPolicy(PERMISSIONS.REVIEWS_RESPOND)] },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      const { text } = z
        .object({ text: z.string().min(1).max(1000) })
        .parse(req.body);
      const data = await crmRespondToReview(id, text, req.admin!.userId);
      return reply.send(successResponse(data, "Response posted"));
    },
  );

  app.post(
    "/reviews/:id/assign",
    { preHandler: [crmPolicy(PERMISSIONS.REVIEWS_MODERATE)] },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      const { assignedTo } = z
        .object({ assignedTo: z.string().min(1) })
        .parse(req.body);
      const data = await crmAssignReview(id, assignedTo, req.admin!.userId);
      return reply.send(successResponse(data, "Review assigned"));
    },
  );

  app.patch(
    "/reviews/:id/status",
    { preHandler: [crmPolicy(PERMISSIONS.REVIEWS_MODERATE)] },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      const { status } = z
        .object({
          status: z.enum([
            "pending",
            "assigned",
            "responded",
            "resolved",
            "flagged",
          ]),
        })
        .parse(req.body);
      const data = await crmUpdateReviewStatus(id, status);
      return reply.send(successResponse(data, "Review status updated"));
    },
  );

  app.get(
    "/team-members",
    { preHandler: [crmPolicy(PERMISSIONS.CUSTOMERS_READ)] },
    async (_req, reply) => {
      const data = await crmGetTeamMembers();
      return reply.send(successResponse(data, "Team members fetched"));
    },
  );

  // ═══════════════════════════════════════════════════════════════════════════
  // §9  LOYALTY & RETENTION
  // ═══════════════════════════════════════════════════════════════════════════

  app.get(
    "/loyalty",
    { preHandler: [crmPolicy(PERMISSIONS.LOYALTY_VIEW)] },
    async (_req, reply) => {
      const data = await crmGetLoyaltyOverview();
      return reply.send(successResponse(data, "Loyalty overview"));
    },
  );

  // ═══════════════════════════════════════════════════════════════════════════
  // §2  TECHNICIAN PERFORMANCE (read-only for CRM)
  // ═══════════════════════════════════════════════════════════════════════════

  app.get(
    "/technicians/performance",
    { preHandler: [crmPolicy(PERMISSIONS.ANALYTICS_TECHNICIAN)] },
    async (req, reply) => {
      const { page, limit } = z
        .object({
          page: z.coerce.number().default(1),
          limit: z.coerce.number().default(20),
        })
        .parse(req.query);
      const data = await crmGetTechnicianPerformance(page, limit);
      return reply.send(
        paginatedResponse(
          data.technicians,
          data.total,
          page,
          limit,
          "Technician performance",
        ),
      );
    },
  );
}
