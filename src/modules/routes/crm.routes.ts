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
import {
  requirePermission,
  requireRole,
} from "../../shared/middleware/permission.middleware";
import { authMiddleware } from "../../shared/middleware/auth.middleware";
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
  crmManageSubscription,
  crmGetCustomerSubscriptions,
  crmGetCustomerWalletTransactions,
  // §2 Service Request
  crmListServiceRequests,
  crmGetServiceRequestDetail,
  crmEscalateServiceRequest,
  crmTagServiceRequest,
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
  // §9 Loyalty
  crmGetHighValueCustomers,
  crmGetChurnAnalysis,
  crmGetLoyaltyOverview,
  // §3 Reviews
  crmListReviews,
  crmGetReviewAnalytics,
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
    { preHandler: [requirePermission(PERMISSIONS.CUSTOMERS_READ)] },
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
    { preHandler: [requirePermission(PERMISSIONS.CUSTOMERS_SEGMENT)] },
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
    { preHandler: [requirePermission(PERMISSIONS.CUSTOMERS_READ)] },
    async (req: any, reply) => {
      const data = await crmGetCustomerDetail(req.params.customerId);
      return reply.send(successResponse(data, "Customer detail fetched"));
    },
  );

  /** Update customer mutable fields (username, phone, avatar) */
  app.patch(
    "/customers/:customerId",
    { preHandler: [requirePermission(PERMISSIONS.CUSTOMERS_UPDATE)] },
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
    { preHandler: [requirePermission(PERMISSIONS.CUSTOMERS_BLOCK)] },
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
    { preHandler: [requirePermission(PERMISSIONS.CUSTOMERS_BLOCK)] },
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
    { preHandler: [requirePermission(PERMISSIONS.CUSTOMERS_READ)] },
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
    { preHandler: [requirePermission(PERMISSIONS.SUBSCRIPTIONS_READ)] },
    async (req: any, reply) => {
      const data = await crmGetCustomerSubscriptions(req.params.customerId);
      return reply.send(successResponse(data, "Customer subscriptions"));
    },
  );

  /** Cancel / pause / reactivate subscription */
  app.patch(
    "/customers/:customerId/subscription",
    { preHandler: [requirePermission(PERMISSIONS.SUBSCRIPTIONS_CANCEL)] },
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
    { preHandler: [requirePermission(PERMISSIONS.WALLET_VIEW)] },
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

  // ═══════════════════════════════════════════════════════════════════════════
  // §2  SERVICE REQUEST OVERSIGHT
  // ═══════════════════════════════════════════════════════════════════════════

  app.get(
    "/service-requests",
    { preHandler: [requirePermission(PERMISSIONS.SERVICE_REQUESTS_READ)] },
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
    { preHandler: [requirePermission(PERMISSIONS.SERVICE_REQUESTS_READ)] },
    async (req, reply) => {
      const { from, to } = dateRangeSchema.parse(req.query);
      const data = await crmGetServiceRequestTrends(from, to);
      return reply.send(successResponse(data, "SR trends"));
    },
  );

  /** Full detail for a single SR */
  app.get(
    "/service-requests/:requestId",
    { preHandler: [requirePermission(PERMISSIONS.SERVICE_REQUESTS_READ)] },
    async (req: any, reply) => {
      const data = await crmGetServiceRequestDetail(req.params.requestId);
      return reply.send(successResponse(data, "Service request detail"));
    },
  );

  /** Escalate a service request */
  app.patch(
    "/service-requests/:requestId/escalate",
    { preHandler: [requirePermission(PERMISSIONS.SERVICE_REQUESTS_ESCALATE)] },
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
    { preHandler: [requirePermission(PERMISSIONS.SERVICE_REQUESTS_TAG)] },
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

  // ═══════════════════════════════════════════════════════════════════════════
  // §3  COMMUNICATION & NOTIFICATIONS
  // ═══════════════════════════════════════════════════════════════════════════

  app.post(
    "/notifications/broadcast",
    { preHandler: [requirePermission(PERMISSIONS.NOTIFICATIONS_BROADCAST)] },
    async (req, reply) => {
      const body = z
        .object({
          title: z.string(),
          message: z.string(),
          type: z.string(),
          targetRole: z.string().optional(),
          targetUsers: z.array(z.string()).optional(),
        })
        .parse(req.body);
      const result = await broadcastNotification(body);
      await audit(req, "BROADCAST_NOTIFICATION", "notifications", {
        metadata: { ...body, sent: result.sent },
      });
      return reply.send(successResponse(result, "Broadcast sent"));
    },
  );

  app.get(
    "/notifications/stats",
    { preHandler: [requirePermission(PERMISSIONS.NOTIFICATIONS_ANALYTICS)] },
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
    { preHandler: [requirePermission(PERMISSIONS.ANALYTICS_CUSTOMER)] },
    async (_req, reply) => {
      const data = await crmGetCustomerAnalytics();
      return reply.send(successResponse(data, "Customer analytics"));
    },
  );

  app.get(
    "/analytics/revenue",
    { preHandler: [requirePermission(PERMISSIONS.ANALYTICS_REVENUE)] },
    async (req, reply) => {
      const { from, to } = dateRangeSchema.parse(req.query);
      const data = await crmGetRevenueAnalytics(from, to);
      return reply.send(successResponse(data, "Revenue analytics"));
    },
  );

  app.get(
    "/analytics/subscriptions",
    { preHandler: [requirePermission(PERMISSIONS.SUBSCRIPTIONS_ANALYTICS)] },
    async (_req, reply) => {
      const data = await crmGetSubscriptionAnalytics();
      return reply.send(successResponse(data, "Subscription analytics"));
    },
  );

  app.get(
    "/analytics/conversions",
    { preHandler: [requirePermission(PERMISSIONS.ANALYTICS_CUSTOMER)] },
    async (req, reply) => {
      const { from, to } = dateRangeSchema.parse(req.query);
      const data = await crmGetConversionAnalytics(from, to);
      return reply.send(successResponse(data, "Conversion analytics"));
    },
  );

  app.get(
    "/analytics/high-value-customers",
    { preHandler: [requirePermission(PERMISSIONS.LOYALTY_VIEW)] },
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
    { preHandler: [requirePermission(PERMISSIONS.ANALYTICS_CUSTOMER)] },
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
    { preHandler: [requirePermission(PERMISSIONS.TICKETS_READ)] },
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
    { preHandler: [requirePermission(PERMISSIONS.TICKETS_CREATE)] },
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
    { preHandler: [requirePermission(PERMISSIONS.TICKETS_ASSIGN)] },
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
    { preHandler: [requirePermission(PERMISSIONS.TICKETS_RESOLVE)] },
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
    { preHandler: [requirePermission(PERMISSIONS.TICKETS_ESCALATE)] },
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
    { preHandler: [requirePermission(PERMISSIONS.TICKETS_COMPENSATE)] },
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

  // ═══════════════════════════════════════════════════════════════════════════
  // §6  WALLET & PAYMENTS OVERVIEW
  // ═══════════════════════════════════════════════════════════════════════════

  app.get(
    "/analytics/wallet",
    { preHandler: [requirePermission(PERMISSIONS.WALLET_MONITOR)] },
    async (_req, reply) => {
      const data = await crmGetWalletOverview();
      return reply.send(successResponse(data, "Wallet overview"));
    },
  );

  app.get(
    "/analytics/payments/failed",
    { preHandler: [requirePermission(PERMISSIONS.WALLET_MONITOR)] },
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
    { preHandler: [requirePermission(PERMISSIONS.CAMPAIGNS_READ)] },
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
    { preHandler: [requirePermission(PERMISSIONS.CAMPAIGNS_READ)] },
    async (req: any, reply) => {
      const data = await crmGetCampaignDetail(req.params.campaignId);
      return reply.send(successResponse(data, "Campaign detail"));
    },
  );

  app.post(
    "/campaigns",
    { preHandler: [requirePermission(PERMISSIONS.CAMPAIGNS_CREATE)] },
    async (req, reply) => {
      const body = z
        .object({
          title: z.string().min(3).max(200),
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
            body: z.string().min(10),
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
    { preHandler: [requirePermission(PERMISSIONS.CAMPAIGNS_MANAGE)] },
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
    { preHandler: [requirePermission(PERMISSIONS.CAMPAIGNS_MANAGE)] },
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

  // ═══════════════════════════════════════════════════════════════════════════
  // §8  REVIEWS MANAGEMENT (read + analytics)
  // ═══════════════════════════════════════════════════════════════════════════

  app.get(
    "/reviews",
    { preHandler: [requirePermission(PERMISSIONS.REVIEWS_READ)] },
    async (req, reply) => {
      const filter = z
        .object({
          minRating: z.coerce.number().min(1).max(5).optional(),
          maxRating: z.coerce.number().min(1).max(5).optional(),
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
    { preHandler: [requirePermission(PERMISSIONS.REVIEWS_ANALYTICS)] },
    async (_req, reply) => {
      const data = await crmGetReviewAnalytics();
      return reply.send(successResponse(data, "Review analytics"));
    },
  );

  // ═══════════════════════════════════════════════════════════════════════════
  // §9  LOYALTY & RETENTION
  // ═══════════════════════════════════════════════════════════════════════════

  app.get(
    "/loyalty",
    { preHandler: [requirePermission(PERMISSIONS.LOYALTY_VIEW)] },
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
    { preHandler: [requirePermission(PERMISSIONS.ANALYTICS_TECHNICIAN)] },
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
