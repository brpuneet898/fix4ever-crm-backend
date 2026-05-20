/**
 * Admin Routes
 * Registers all admin sub-modules under /admin prefix.
 * All routes protected by requireAdmin (base role = "admin").
 */
import { FastifyInstance } from "fastify";
import { requireAdmin } from "../../shared/middleware/requireAdmin.middleware";
import { requirePermission } from "../../shared/middleware/permission.middleware";
import { PERMISSIONS } from "../../access";

// Controllers
import {
  dashboardStatsController,
  revenueAnalyticsController,
  liveActivityController,
} from "../controllers/adminDashboard.controller";

import {
  listCustomersController,
  getCustomerController,
  blockCustomerController,
  activateCustomerController,
  walletAdjustController,
  customerServiceHistoryController,
  customerWalletHistoryController,
  customerPaymentHistoryController,
  cancelSubscriptionController,
  assignDiscountController,
} from "../controllers/adminCustomer.controller";

import {
  listVendorsController,
  getVendorController,
  approveVendorController,
  rejectVendorController,
  suspendVendorController,
  vendorPerformanceController,
  clarificationController,
} from "../controllers/adminVendor.controller";

import {
  listSRController,
  getSRController,
  forceAssignController,
  cancelSRController,
  setAdminPriceController,
  slaViolationsController,
  tagSRController,
} from "../controllers/adminServiceRequest.controller";

import {
  listTransactionsController,
  financialSummaryController,
  processRefundController,
  listSettlementsController,
  approveSettlementController,
  rejectSettlementController,
  flagTransactionController,
} from "../controllers/adminPayment.controller";

// Inline controllers for remaining modules
import { z } from "zod";
import {
  successResponse,
  paginatedResponse,
} from "../../shared/utils/response.util";
import { audit } from "../../shared/middleware/audit.middleware";
import {
  listSubscriptionPlans,
  createSubscriptionPlan,
  updateSubscriptionPlan,
  deleteSubscriptionPlan,
  getSubscriptionAnalytics,
  listUserSubscriptions,
  listCoupons,
  createCoupon,
  updateCoupon,
  deleteCoupon,
  getCouponAnalytics,
  broadcastNotification,
  listNotificationTemplates,
  createNotificationTemplate,
  updateNotificationTemplate,
  getNotificationStats,
  listTickets,
  createTicket,
  assignTicket,
  addTicketMessage,
  resolveTicket,
  escalateTicket,
  issueCompensation,
  generateRevenueReport,
  generateServiceReport,
  generateTechnicianReport,
  generateCustomerReport,
  getRegionalReport,
} from "../../shared/services/admin";
import { getAuditLogs } from "../../shared/services/auditLog.service";

export async function adminRoutes(app: FastifyInstance) {
  // ── Auth guard for all routes ─────────────────────────────────────────────
  app.addHook("preHandler", requireAdmin);

  // ═══════════════════════════════════════════════════════════════════════════
  // DASHBOARD
  // ═══════════════════════════════════════════════════════════════════════════
  app.get(
    "/dashboard/stats",
    { preHandler: [requirePermission(PERMISSIONS.DASHBOARD_VIEW)] },
    dashboardStatsController,
  );
  app.get(
    "/dashboard/revenue",
    { preHandler: [requirePermission(PERMISSIONS.ANALYTICS_REVENUE)] },
    revenueAnalyticsController,
  );
  app.get(
    "/dashboard/live",
    { preHandler: [requirePermission(PERMISSIONS.DASHBOARD_LIVE_MONITOR)] },
    liveActivityController,
  );

  // ═══════════════════════════════════════════════════════════════════════════
  // CUSTOMERS
  // ═══════════════════════════════════════════════════════════════════════════
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const r = (fn: unknown) => fn as any;

  app.get(
    "/customers",
    { preHandler: [requirePermission(PERMISSIONS.CUSTOMERS_READ)] },
    r(listCustomersController),
  );
  app.get(
    "/customers/:customerId",
    { preHandler: [requirePermission(PERMISSIONS.CUSTOMERS_READ)] },
    r(getCustomerController),
  );
  app.get(
    "/customers/:customerId/services",
    { preHandler: [requirePermission(PERMISSIONS.CUSTOMERS_READ)] },
    r(customerServiceHistoryController),
  );
  app.get(
    "/customers/:customerId/wallet",
    { preHandler: [requirePermission(PERMISSIONS.CUSTOMERS_WALLET_VIEW)] },
    r(customerWalletHistoryController),
  );
  app.patch(
    "/customers/:customerId/block",
    { preHandler: [requirePermission(PERMISSIONS.CUSTOMERS_BLOCK)] },
    r(blockCustomerController),
  );
  app.patch(
    "/customers/:customerId/activate",
    { preHandler: [requirePermission(PERMISSIONS.CUSTOMERS_UPDATE)] },
    r(activateCustomerController),
  );
  app.post(
    "/customers/:customerId/wallet/adjust",
    { preHandler: [requirePermission(PERMISSIONS.CUSTOMERS_WALLET_ADJUST)] },
    r(walletAdjustController),
  );
  app.patch(
    "/customers/:customerId/subscription/cancel",
    {
      preHandler: [
        requirePermission(PERMISSIONS.CUSTOMERS_SUBSCRIPTION_MANAGE),
      ],
    },
    r(cancelSubscriptionController),
  );
  app.post(
    "/customers/:customerId/discount",
    { preHandler: [requirePermission(PERMISSIONS.CUSTOMERS_DISCOUNT_ASSIGN)] },
    r(assignDiscountController),
  );
  app.get(
    "/customers/:customerId/payments",
    { preHandler: [requirePermission(PERMISSIONS.CUSTOMERS_PAYMENTS_VIEW)] },
    r(customerPaymentHistoryController),
  );

  // ═══════════════════════════════════════════════════════════════════════════
  // VENDORS / TECHNICIANS
  // ═══════════════════════════════════════════════════════════════════════════
  app.get(
    "/vendors",
    { preHandler: [requirePermission(PERMISSIONS.VENDORS_READ)] },
    r(listVendorsController),
  );
  app.get(
    "/vendors/:vendorId",
    { preHandler: [requirePermission(PERMISSIONS.VENDORS_READ)] },
    r(getVendorController),
  );
  app.get(
    "/vendors/:vendorId/performance",
    { preHandler: [requirePermission(PERMISSIONS.VENDORS_MONITOR)] },
    r(vendorPerformanceController),
  );
  app.patch(
    "/vendors/:vendorId/approve",
    { preHandler: [requirePermission(PERMISSIONS.VENDORS_APPROVE)] },
    r(approveVendorController),
  );
  app.patch(
    "/vendors/:vendorId/reject",
    { preHandler: [requirePermission(PERMISSIONS.VENDORS_REJECT)] },
    r(rejectVendorController),
  );
  app.patch(
    "/vendors/:vendorId/suspend",
    { preHandler: [requirePermission(PERMISSIONS.VENDORS_SUSPEND)] },
    r(suspendVendorController),
  );
  app.post(
    "/vendors/:vendorId/clarification",
    { preHandler: [requirePermission(PERMISSIONS.VENDORS_UPDATE)] },
    r(clarificationController),
  );

  // ═══════════════════════════════════════════════════════════════════════════
  // SERVICE REQUESTS
  // ═══════════════════════════════════════════════════════════════════════════
  app.get(
    "/service-requests",
    { preHandler: [requirePermission(PERMISSIONS.SERVICE_REQUESTS_READ)] },
    r(listSRController),
  );
  app.get(
    "/service-requests/sla-violations",
    {
      preHandler: [requirePermission(PERMISSIONS.SERVICE_REQUESTS_SLA_MONITOR)],
    },
    r(slaViolationsController),
  );
  app.get(
    "/service-requests/:requestId",
    { preHandler: [requirePermission(PERMISSIONS.SERVICE_REQUESTS_READ)] },
    r(getSRController),
  );
  app.post(
    "/service-requests/:requestId/force-assign",
    { preHandler: [requirePermission(PERMISSIONS.SERVICE_REQUESTS_OVERRIDE)] },
    r(forceAssignController),
  );
  app.patch(
    "/service-requests/:requestId/cancel",
    { preHandler: [requirePermission(PERMISSIONS.SERVICE_REQUESTS_CANCEL)] },
    r(cancelSRController),
  );
  app.patch(
    "/service-requests/:requestId/price",
    { preHandler: [requirePermission(PERMISSIONS.SERVICE_REQUESTS_OVERRIDE)] },
    r(setAdminPriceController),
  );
  app.patch(
    "/service-requests/:requestId/tags",
    { preHandler: [requirePermission(PERMISSIONS.SERVICE_REQUESTS_TAG)] },
    r(tagSRController),
  );

  // ═══════════════════════════════════════════════════════════════════════════
  // PAYMENTS & SETTLEMENTS
  // ═══════════════════════════════════════════════════════════════════════════
  app.get(
    "/payments",
    { preHandler: [requirePermission(PERMISSIONS.PAYMENTS_VIEW)] },
    r(listTransactionsController),
  );
  app.get(
    "/payments/summary",
    { preHandler: [requirePermission(PERMISSIONS.PAYMENTS_VIEW)] },
    r(financialSummaryController),
  );
  app.post(
    "/payments/:transactionId/refund",
    { preHandler: [requirePermission(PERMISSIONS.PAYMENTS_REFUND)] },
    r(processRefundController),
  );
  app.patch(
    "/payments/:transactionId/flag",
    { preHandler: [requirePermission(PERMISSIONS.PAYMENTS_FLAG_SUSPICIOUS)] },
    r(flagTransactionController),
  );
  app.get(
    "/settlements",
    { preHandler: [requirePermission(PERMISSIONS.SETTLEMENTS_VIEW)] },
    r(listSettlementsController),
  );
  app.patch(
    "/settlements/:settlementId/approve",
    { preHandler: [requirePermission(PERMISSIONS.SETTLEMENTS_APPROVE)] },
    r(approveSettlementController),
  );
  app.patch(
    "/settlements/:settlementId/reject",
    { preHandler: [requirePermission(PERMISSIONS.SETTLEMENTS_APPROVE)] },
    r(rejectSettlementController),
  );

  // ═══════════════════════════════════════════════════════════════════════════
  // SUBSCRIPTIONS
  // ═══════════════════════════════════════════════════════════════════════════
  app.get(
    "/subscriptions/plans",
    { preHandler: [requirePermission(PERMISSIONS.SUBSCRIPTIONS_READ)] },
    async (_req, reply) => {
      const plans = await listSubscriptionPlans();
      return reply.send(successResponse(plans, "Plans fetched"));
    },
  );
  app.post(
    "/subscriptions/plans",
    { preHandler: [requirePermission(PERMISSIONS.SUBSCRIPTIONS_CREATE)] },
    async (req, reply) => {
      const body = z
        .object({
          name: z.string(),
          slug: z.string(),
          description: z.string(),
          price: z.number().nonnegative(),
          billingCycle: z.enum(["monthly", "quarterly", "annual", "one_time"]),
          trialDays: z.number().default(0),
          benefits: z.array(z.string()).default([]),
          features: z.record(z.string(), z.unknown()).default({}),
        })
        .parse(req.body);
      const plan = await createSubscriptionPlan({
        ...body,
        createdBy: req.admin!.userId,
      });
      await audit(req, "CREATE", "subscriptions", {
        targetId: String(plan._id),
        targetModel: "SubscriptionPlan",
      });
      return reply.code(201).send(successResponse(plan, "Plan created"));
    },
  );
  app.patch(
    "/subscriptions/plans/:planId",
    { preHandler: [requirePermission(PERMISSIONS.SUBSCRIPTIONS_UPDATE)] },
    async (req: any, reply) => {
      const plan = await updateSubscriptionPlan(
        req.params.planId,
        req.body as Record<string, unknown>,
      );
      await audit(req, "UPDATE", "subscriptions", {
        targetId: req.params.planId,
      });
      return reply.send(successResponse(plan, "Plan updated"));
    },
  );
  app.delete(
    "/subscriptions/plans/:planId",
    { preHandler: [requirePermission(PERMISSIONS.SUBSCRIPTIONS_DELETE)] },
    async (req: any, reply) => {
      await deleteSubscriptionPlan(req.params.planId);
      await audit(req, "DELETE", "subscriptions", {
        targetId: req.params.planId,
      });
      return reply.send(successResponse(null, "Plan deleted"));
    },
  );
  app.get(
    "/subscriptions/analytics",
    { preHandler: [requirePermission(PERMISSIONS.SUBSCRIPTIONS_ANALYTICS)] },
    async (_req, reply) => {
      const data = await getSubscriptionAnalytics();
      return reply.send(
        successResponse(data, "Subscription analytics fetched"),
      );
    },
  );
  app.get(
    "/subscriptions",
    { preHandler: [requirePermission(PERMISSIONS.SUBSCRIPTIONS_READ)] },
    async (req, reply) => {
      const { status, planId, page, limit } = z
        .object({
          status: z.string().optional(),
          planId: z.string().optional(),
          page: z.coerce.number().default(1),
          limit: z.coerce.number().default(20),
        })
        .parse(req.query);
      const result = await listUserSubscriptions(status, planId, page, limit);
      return reply.send(
        paginatedResponse(
          result.subs,
          result.total,
          page,
          limit,
          "Subscriptions fetched",
        ),
      );
    },
  );

  // ═══════════════════════════════════════════════════════════════════════════
  // COUPONS
  // ═══════════════════════════════════════════════════════════════════════════
  app.get(
    "/coupons",
    { preHandler: [requirePermission(PERMISSIONS.COUPONS_READ)] },
    async (req, reply) => {
      const { status, page, limit } = z
        .object({
          status: z.string().optional(),
          page: z.coerce.number().default(1),
          limit: z.coerce.number().default(20),
        })
        .parse(req.query);
      const result = await listCoupons(status, page, limit);
      return reply.send(
        paginatedResponse(
          result.coupons,
          result.total,
          page,
          limit,
          "Coupons fetched",
        ),
      );
    },
  );
  app.post(
    "/coupons",
    { preHandler: [requirePermission(PERMISSIONS.COUPONS_CREATE)] },
    async (req, reply) => {
      const body = z
        .object({
          code: z.string().min(3),
          title: z.string(),
          description: z.string().optional(),
          type: z.enum(["percentage", "flat", "cashback", "free_service"]),
          value: z.number().positive(),
          maxDiscountAmount: z.number().optional(),
          minOrderAmount: z.number().default(0),
          usageLimit: z.number().optional(),
          usagePerUser: z.number().default(1),
          eligibility: z
            .enum(["all", "new_users", "specific_users", "region"])
            .default("all"),
          eligibleRegions: z.array(z.string()).default([]),
          eligibleUsers: z.array(z.string()).default([]),
          expiresAt: z
            .string()
            .datetime()
            .optional()
            .transform((v) => (v ? new Date(v) : undefined)),
        })
        .parse(req.body);
      const coupon = await createCoupon({
        ...body,
        createdBy: req.admin!.userId,
      });
      await audit(req, "CREATE", "coupons", {
        targetId: String(coupon._id),
        targetModel: "Coupon",
      });
      return reply.code(201).send(successResponse(coupon, "Coupon created"));
    },
  );
  app.patch(
    "/coupons/:couponId",
    { preHandler: [requirePermission(PERMISSIONS.COUPONS_UPDATE)] },
    async (req: any, reply) => {
      const coupon = await updateCoupon(
        req.params.couponId,
        req.body as Record<string, unknown>,
      );
      await audit(req, "UPDATE", "coupons", { targetId: req.params.couponId });
      return reply.send(successResponse(coupon, "Coupon updated"));
    },
  );
  app.delete(
    "/coupons/:couponId",
    { preHandler: [requirePermission(PERMISSIONS.COUPONS_DELETE)] },
    async (req: any, reply) => {
      await deleteCoupon(req.params.couponId);
      await audit(req, "DELETE", "coupons", { targetId: req.params.couponId });
      return reply.send(successResponse(null, "Coupon deleted"));
    },
  );
  app.get(
    "/coupons/analytics",
    { preHandler: [requirePermission(PERMISSIONS.COUPONS_ANALYTICS)] },
    async (_req, reply) => {
      const data = await getCouponAnalytics();
      return reply.send(successResponse(data, "Coupon analytics fetched"));
    },
  );

  // ═══════════════════════════════════════════════════════════════════════════
  // NOTIFICATIONS
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
      await audit(req, "BROADCAST", "notifications", {
        metadata: { targetRole: body.targetRole, count: result.sent },
      });
      return reply.send(successResponse(result, "Notification broadcast sent"));
    },
  );
  app.get(
    "/notifications/templates",
    { preHandler: [requirePermission(PERMISSIONS.NOTIFICATIONS_TEMPLATES)] },
    async (_req, reply) => {
      const templates = await listNotificationTemplates();
      return reply.send(successResponse(templates, "Templates fetched"));
    },
  );
  app.post(
    "/notifications/templates",
    { preHandler: [requirePermission(PERMISSIONS.NOTIFICATIONS_TEMPLATES)] },
    async (req, reply) => {
      const body = z
        .object({
          name: z.string(),
          slug: z.string(),
          channel: z.enum(["email", "sms", "push", "in_app"]),
          trigger: z.string(),
          subject: z.string().optional(),
          bodyTemplate: z.string(),
          variables: z.array(z.string()).default([]),
        })
        .parse(req.body);
      const template = await createNotificationTemplate({
        ...body,
        createdBy: req.admin!.userId,
      });
      return reply
        .code(201)
        .send(successResponse(template, "Template created"));
    },
  );
  app.patch(
    "/notifications/templates/:templateId",
    { preHandler: [requirePermission(PERMISSIONS.NOTIFICATIONS_TEMPLATES)] },
    async (req: any, reply) => {
      const template = await updateNotificationTemplate(
        req.params.templateId,
        req.body as Record<string, unknown>,
        req.admin!.userId,
      );
      return reply.send(successResponse(template, "Template updated"));
    },
  );
  app.get(
    "/notifications/stats",
    { preHandler: [requirePermission(PERMISSIONS.NOTIFICATIONS_ANALYTICS)] },
    async (req, reply) => {
      const { from, to } = z
        .object({
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
        })
        .parse(req.query);
      const stats = await getNotificationStats(from, to);
      return reply.send(successResponse(stats, "Notification stats fetched"));
    },
  );

  // ═══════════════════════════════════════════════════════════════════════════
  // SUPPORT TICKETS
  // ═══════════════════════════════════════════════════════════════════════════
  app.get(
    "/tickets",
    { preHandler: [requirePermission(PERMISSIONS.TICKETS_READ)] },
    async (req, reply) => {
      const filter = z
        .object({
          status: z.string().optional(),
          priority: z.string().optional(),
          category: z.string().optional(),
          assignedTo: z.string().optional(),
          search: z.string().optional(),
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
          source: z
            .enum(["customer", "vendor", "internal", "chat", "email"])
            .default("internal"),
          relatedServiceRequest: z.string().optional(),
          relatedVendor: z.string().optional(),
        })
        .parse(req.body);
      const ticket = await createTicket({
        ...body,
        raisedBy: req.admin!.userId,
        raisedByRole: req.admin!.role,
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
  app.post(
    "/tickets/:ticketId/messages",
    { preHandler: [requirePermission(PERMISSIONS.TICKETS_READ)] },
    async (req: any, reply) => {
      const { message, attachments } = z
        .object({
          message: z.string().min(1),
          attachments: z.array(z.string()).optional(),
        })
        .parse(req.body);
      const ticket = await addTicketMessage(
        req.params.ticketId,
        req.admin!.userId,
        req.admin!.role,
        message,
        attachments,
      );
      return reply.send(successResponse(ticket, "Message added"));
    },
  );
  app.patch(
    "/tickets/:ticketId/resolve",
    { preHandler: [requirePermission(PERMISSIONS.TICKETS_RESOLVE)] },
    async (req: any, reply) => {
      const { resolutionNote } = z
        .object({ resolutionNote: z.string() })
        .parse(req.body);
      const ticket = await resolveTicket(
        req.params.ticketId,
        req.admin!.userId,
        resolutionNote,
      );
      await audit(req, "UPDATE", "tickets", { targetId: req.params.ticketId });
      return reply.send(successResponse(ticket, "Ticket resolved"));
    },
  );
  app.patch(
    "/tickets/:ticketId/escalate",
    { preHandler: [requirePermission(PERMISSIONS.TICKETS_ESCALATE)] },
    async (req: any, reply) => {
      const { escalatedTo, note } = z
        .object({ escalatedTo: z.string(), note: z.string() })
        .parse(req.body);
      const ticket = await escalateTicket(
        req.params.ticketId,
        escalatedTo,
        note,
      );
      await audit(req, "ESCALATE", "tickets", {
        targetId: req.params.ticketId,
      });
      return reply.send(successResponse(ticket, "Ticket escalated"));
    },
  );
  app.post(
    "/tickets/:ticketId/compensate",
    { preHandler: [requirePermission(PERMISSIONS.TICKETS_COMPENSATE)] },
    async (req: any, reply) => {
      const body = z
        .object({
          type: z.enum(["refund", "wallet_credit", "re_service", "discount"]),
          amount: z.number().optional(),
          note: z.string().optional(),
        })
        .parse(req.body);
      const ticket = await issueCompensation(
        req.params.ticketId,
        req.admin!.userId,
        body,
      );
      await audit(req, "COMPENSATE", "tickets", {
        targetId: req.params.ticketId,
        metadata: body,
      });
      return reply.send(successResponse(ticket, "Compensation issued"));
    },
  );

  // ═══════════════════════════════════════════════════════════════════════════
  // REPORTS
  // ═══════════════════════════════════════════════════════════════════════════
  const dateRangeSchema = z.object({
    from: z
      .string()
      .datetime()
      .transform((v) => new Date(v)),
    to: z
      .string()
      .datetime()
      .transform((v) => new Date(v)),
    region: z.string().optional(),
  });

  app.get(
    "/reports/revenue",
    { preHandler: [requirePermission(PERMISSIONS.REPORTS_VIEW)] },
    async (req, reply) => {
      const { from, to } = dateRangeSchema.parse(req.query);
      return reply.send(
        successResponse(
          await generateRevenueReport(from, to),
          "Report generated",
        ),
      );
    },
  );
  app.get(
    "/reports/services",
    { preHandler: [requirePermission(PERMISSIONS.REPORTS_VIEW)] },
    async (req, reply) => {
      const { from, to, region } = dateRangeSchema.parse(req.query);
      return reply.send(
        successResponse(
          await generateServiceReport(from, to, region),
          "Report generated",
        ),
      );
    },
  );
  app.get(
    "/reports/technicians",
    { preHandler: [requirePermission(PERMISSIONS.REPORTS_VIEW)] },
    async (req, reply) => {
      const { from, to, region } = dateRangeSchema.parse(req.query);
      return reply.send(
        successResponse(
          await generateTechnicianReport(from, to, region),
          "Report generated",
        ),
      );
    },
  );
  app.get(
    "/reports/customers",
    { preHandler: [requirePermission(PERMISSIONS.REPORTS_VIEW)] },
    async (req, reply) => {
      const { from, to } = dateRangeSchema.parse(req.query);
      return reply.send(
        successResponse(
          await generateCustomerReport(from, to),
          "Report generated",
        ),
      );
    },
  );
  app.get(
    "/reports/regional",
    { preHandler: [requirePermission(PERMISSIONS.ANALYTICS_REGION)] },
    async (req, reply) => {
      const { from, to } = dateRangeSchema.parse(req.query);
      return reply.send(
        successResponse(
          await getRegionalReport(from, to),
          "Regional report generated",
        ),
      );
    },
  );

  // ═══════════════════════════════════════════════════════════════════════════
  // AUDIT LOGS
  // ═══════════════════════════════════════════════════════════════════════════
  app.get(
    "/audit-logs",
    { preHandler: [requirePermission(PERMISSIONS.AUDIT_LOGS_VIEW)] },
    async (req, reply) => {
      const filter = z
        .object({
          module: z.string().optional(),
          action: z.string().optional(),
          performedBy: z.string().optional(),
          targetId: z.string().optional(),
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
          limit: z.coerce.number().default(50),
        })
        .parse(req.query);
      const { page, limit, ...auditFilter } = filter;
      const result = await getAuditLogs(auditFilter, page, limit);
      return reply.send(
        paginatedResponse(
          result.logs,
          result.total,
          page,
          limit,
          "Audit logs fetched",
        ),
      );
    },
  );
}
