/**
 * CRM Manager Controller
 *
 * Thin layer between HTTP routes and the CRM service.
 * Responsibilities: request parsing, validation, calling service, formatting response.
 * Business logic lives entirely in crm.service.ts.
 */
import { FastifyRequest, FastifyReply } from "fastify";
import { z } from "zod";
import {
  successResponse,
  paginatedResponse,
} from "../../shared/utils/response.util";
import { audit } from "../../shared/middleware/audit.middleware";
import {
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
  crmListServiceRequests,
  crmGetServiceRequestDetail,
  crmEscalateServiceRequest,
  crmTagServiceRequest,
  crmGetServiceRequestTrends,
  crmGetTechnicianPerformance,
  crmGetCustomerAnalytics,
  crmGetRevenueAnalytics,
  crmGetSubscriptionAnalytics,
  crmGetConversionAnalytics,
  crmGetWalletOverview,
  crmGetFailedPayments,
  crmListCampaigns,
  crmGetCampaignDetail,
  crmCreateCampaign,
  crmUpdateCampaign,
  crmActivateCampaign,
  crmGetHighValueCustomers,
  crmGetChurnAnalysis,
  crmGetLoyaltyOverview,
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

// ─── §1 Customer Management ────────────────────────────────────────────────

export async function listCustomers(req: FastifyRequest, reply: FastifyReply) {
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
}

export async function getCustomerSegment(
  req: FastifyRequest,
  reply: FastifyReply,
) {
  const { segment } = req.params as { segment: string };
  const { page, limit } = z
    .object({
      page: z.coerce.number().default(1),
      limit: z.coerce.number().max(100).default(20),
    })
    .parse(req.query);
  const result = await crmSegmentCustomers(segment, page, limit);
  return reply.send(
    paginatedResponse(
      result.customers,
      result.total,
      page,
      limit,
      `Segment: ${segment}`,
    ),
  );
}

export async function getCustomer(req: FastifyRequest, reply: FastifyReply) {
  const { customerId } = req.params as { customerId: string };
  const data = await crmGetCustomerDetail(customerId);
  return reply.send(successResponse(data, "Customer detail fetched"));
}

export async function updateCustomer(req: FastifyRequest, reply: FastifyReply) {
  const { customerId } = req.params as { customerId: string };
  const updates = z
    .object({
      username: z.string().min(2).max(100).optional(),
      phone: z.string().optional(),
      avatar: z.string().url().optional(),
    })
    .parse(req.body);
  const customer = await crmUpdateCustomer(
    customerId,
    updates,
    req.admin!.userId,
  );
  await audit(req, "UPDATE", "customers", {
    targetId: customerId,
    targetModel: "User",
    metadata: { updates },
  });
  return reply.send(successResponse(customer, "Customer updated"));
}

export async function blockCustomer(req: FastifyRequest, reply: FastifyReply) {
  const { customerId } = req.params as { customerId: string };
  const { reason } = z.object({ reason: z.string().min(5) }).parse(req.body);
  const result = await crmBlockCustomer(customerId, req.admin!.userId, reason);
  await audit(req, "BLOCK", "customers", {
    targetId: customerId,
    targetModel: "User",
    metadata: { reason },
  });
  return reply.send(successResponse(result, "Customer blocked"));
}

export async function unblockCustomer(
  req: FastifyRequest,
  reply: FastifyReply,
) {
  const { customerId } = req.params as { customerId: string };
  const result = await crmUnblockCustomer(customerId, req.admin!.userId);
  await audit(req, "UNBLOCK", "customers", {
    targetId: customerId,
    targetModel: "User",
  });
  return reply.send(successResponse(result, "Customer unblocked"));
}

export async function getCustomerInteractions(
  req: FastifyRequest,
  reply: FastifyReply,
) {
  const { customerId } = req.params as { customerId: string };
  const { page, limit } = z
    .object({
      page: z.coerce.number().default(1),
      limit: z.coerce.number().default(20),
    })
    .parse(req.query);
  const data = await crmGetCustomerInteractions(customerId, page, limit);
  return reply.send(
    paginatedResponse(
      data.serviceRequests,
      data.total,
      page,
      limit,
      "Customer interactions",
    ),
  );
}

export async function getCustomerSubscription(
  req: FastifyRequest,
  reply: FastifyReply,
) {
  const { customerId } = req.params as { customerId: string };
  const data = await crmGetCustomerSubscriptions(customerId);
  return reply.send(successResponse(data, "Customer subscriptions"));
}

export async function manageSubscription(
  req: FastifyRequest,
  reply: FastifyReply,
) {
  const { customerId } = req.params as { customerId: string };
  const { action, reason } = z
    .object({
      action: z.enum(["cancel", "pause", "reactivate"]),
      reason: z.string().optional(),
    })
    .parse(req.body);
  const result = await crmManageSubscription(
    customerId,
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
    targetId: customerId,
    targetModel: "User",
    metadata: { action, reason },
  });
  return reply.send(successResponse(result, `Subscription ${action}ed`));
}

export async function getCustomerWallet(
  req: FastifyRequest,
  reply: FastifyReply,
) {
  const { customerId } = req.params as { customerId: string };
  const { page, limit } = z
    .object({
      page: z.coerce.number().default(1),
      limit: z.coerce.number().default(20),
    })
    .parse(req.query);
  const data = await crmGetCustomerWalletTransactions(customerId, page, limit);
  return reply.send(
    paginatedResponse(
      data.transactions,
      data.total,
      page,
      limit,
      "Wallet transactions",
    ),
  );
}

// ─── §2 Service Requests ──────────────────────────────────────────────────

export async function listServiceRequests(
  req: FastifyRequest,
  reply: FastifyReply,
) {
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
}

export async function getSRTrends(req: FastifyRequest, reply: FastifyReply) {
  const { from, to } = dateRangeSchema.parse(req.query);
  const data = await crmGetServiceRequestTrends(from, to);
  return reply.send(successResponse(data, "SR trends"));
}

export async function getServiceRequest(
  req: FastifyRequest,
  reply: FastifyReply,
) {
  const { requestId } = req.params as { requestId: string };
  const data = await crmGetServiceRequestDetail(requestId);
  return reply.send(successResponse(data, "Service request detail"));
}

export async function escalateSR(req: FastifyRequest, reply: FastifyReply) {
  const { requestId } = req.params as { requestId: string };
  const { note } = z.object({ note: z.string().min(5) }).parse(req.body);
  const sr = await crmEscalateServiceRequest(
    requestId,
    req.admin!.userId,
    note,
  );
  await audit(req, "ESCALATE_SR", "service_requests", {
    targetId: requestId,
    targetModel: "ServiceRequest",
    metadata: { note },
  });
  return reply.send(successResponse(sr, "Service request escalated"));
}

export async function tagSR(req: FastifyRequest, reply: FastifyReply) {
  const { requestId } = req.params as { requestId: string };
  const { tag } = z.object({ tag: z.string().min(1) }).parse(req.body);
  const sr = await crmTagServiceRequest(requestId, tag, req.admin!.userId);
  await audit(req, "TAG_SR", "service_requests", {
    targetId: requestId,
    targetModel: "ServiceRequest",
    metadata: { tag },
  });
  return reply.send(successResponse(sr, "Service request tagged"));
}

// ─── §3 Notifications ─────────────────────────────────────────────────────

export async function broadcastNotificationHandler(
  req: FastifyRequest,
  reply: FastifyReply,
) {
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
}

export async function getNotificationStatsHandler(
  _req: FastifyRequest,
  reply: FastifyReply,
) {
  const stats = await getNotificationStats();
  return reply.send(successResponse(stats, "Notification stats"));
}

// ─── §4 Analytics ─────────────────────────────────────────────────────────

export async function getCustomerAnalytics(
  _req: FastifyRequest,
  reply: FastifyReply,
) {
  const data = await crmGetCustomerAnalytics();
  return reply.send(successResponse(data, "Customer analytics"));
}

export async function getRevenueAnalytics(
  req: FastifyRequest,
  reply: FastifyReply,
) {
  const { from, to } = dateRangeSchema.parse(req.query);
  const data = await crmGetRevenueAnalytics(from, to);
  return reply.send(successResponse(data, "Revenue analytics"));
}

export async function getSubscriptionAnalytics(
  _req: FastifyRequest,
  reply: FastifyReply,
) {
  const data = await crmGetSubscriptionAnalytics();
  return reply.send(successResponse(data, "Subscription analytics"));
}

export async function getConversionAnalytics(
  req: FastifyRequest,
  reply: FastifyReply,
) {
  const { from, to } = dateRangeSchema.parse(req.query);
  const data = await crmGetConversionAnalytics(from, to);
  return reply.send(successResponse(data, "Conversion analytics"));
}

export async function getHighValueCustomers(
  req: FastifyRequest,
  reply: FastifyReply,
) {
  const { limit } = z
    .object({ limit: z.coerce.number().default(20) })
    .parse(req.query);
  const data = await crmGetHighValueCustomers(limit);
  return reply.send(successResponse(data, "High value customers"));
}

export async function getChurnAnalysis(
  req: FastifyRequest,
  reply: FastifyReply,
) {
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
}

// ─── §5 Tickets ───────────────────────────────────────────────────────────

export async function listTicketsHandler(
  req: FastifyRequest,
  reply: FastifyReply,
) {
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
}

export async function createTicketHandler(
  req: FastifyRequest,
  reply: FastifyReply,
) {
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
      priority: z.enum(["low", "medium", "high", "critical"]).default("medium"),
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
}

export async function assignTicketHandler(
  req: FastifyRequest,
  reply: FastifyReply,
) {
  const { ticketId } = req.params as { ticketId: string };
  const { assignedTo } = z.object({ assignedTo: z.string() }).parse(req.body);
  const ticket = await assignTicket(ticketId, assignedTo);
  return reply.send(successResponse(ticket, "Ticket assigned"));
}

export async function resolveTicketHandler(
  req: FastifyRequest,
  reply: FastifyReply,
) {
  const { ticketId } = req.params as { ticketId: string };
  const { resolutionNote } = z
    .object({ resolutionNote: z.string().min(10) })
    .parse(req.body);
  const ticket = await resolveTicket(
    ticketId,
    req.admin!.userId,
    resolutionNote,
  );
  return reply.send(successResponse(ticket, "Ticket resolved"));
}

export async function escalateTicketHandler(
  req: FastifyRequest,
  reply: FastifyReply,
) {
  const { ticketId } = req.params as { ticketId: string };
  const { escalatedTo, note } = z
    .object({ escalatedTo: z.string(), note: z.string().min(5) })
    .parse(req.body);
  const ticket = await escalateTicket(ticketId, escalatedTo, note);
  return reply.send(successResponse(ticket, "Ticket escalated"));
}

export async function compensateTicketHandler(
  req: FastifyRequest,
  reply: FastifyReply,
) {
  const { ticketId } = req.params as { ticketId: string };
  const { customerId, amount, reason } = z
    .object({
      customerId: z.string().min(1),
      amount: z.number().positive().max(5000),
      reason: z.string().min(10),
    })
    .parse(req.body);
  const wallet = await adjustWalletBalance({
    userId: customerId,
    type: "credit",
    amount,
    description: `Compensation: ${reason} (Ticket: ${ticketId})`,
    referenceId: ticketId,
    referenceModel: "SupportTicket",
    performedBy: req.admin!.userId,
  });
  await audit(req, "COMPENSATE", "tickets", {
    targetId: ticketId,
    targetModel: "SupportTicket",
    metadata: { customerId, amount, reason },
  });
  return reply.send(
    successResponse(
      { wallet, amount, customerId },
      `₹${amount} compensation credited`,
    ),
  );
}

// ─── §6 Wallet/Payments ───────────────────────────────────────────────────

export async function getWalletOverview(
  _req: FastifyRequest,
  reply: FastifyReply,
) {
  const data = await crmGetWalletOverview();
  return reply.send(successResponse(data, "Wallet overview"));
}

export async function getFailedPayments(
  req: FastifyRequest,
  reply: FastifyReply,
) {
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
}

// ─── §7 Campaigns ─────────────────────────────────────────────────────────

export async function listCampaigns(req: FastifyRequest, reply: FastifyReply) {
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
}

export async function getCampaign(req: FastifyRequest, reply: FastifyReply) {
  const { campaignId } = req.params as { campaignId: string };
  const data = await crmGetCampaignDetail(campaignId);
  return reply.send(successResponse(data, "Campaign detail"));
}

export async function createCampaignHandler(
  req: FastifyRequest,
  reply: FastifyReply,
) {
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
    metadata: { title: campaign.title },
  });
  return reply.code(201).send(successResponse(campaign, "Campaign created"));
}

export async function updateCampaignHandler(
  req: FastifyRequest,
  reply: FastifyReply,
) {
  const { campaignId } = req.params as { campaignId: string };
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
      status: z.enum(["draft", "scheduled", "paused", "cancelled"]).optional(),
    })
    .parse(req.body);
  const campaign = await crmUpdateCampaign(
    campaignId,
    updates,
    req.admin!.userId,
  );
  await audit(req, "UPDATE_CAMPAIGN", "campaigns", {
    targetId: campaignId,
    targetModel: "Campaign",
  });
  return reply.send(successResponse(campaign, "Campaign updated"));
}

export async function activateCampaignHandler(
  req: FastifyRequest,
  reply: FastifyReply,
) {
  const { campaignId } = req.params as { campaignId: string };
  const campaign = await crmActivateCampaign(campaignId, req.admin!.userId);
  await audit(req, "ACTIVATE_CAMPAIGN", "campaigns", {
    targetId: campaignId,
    targetModel: "Campaign",
  });
  return reply.send(successResponse(campaign, "Campaign activated"));
}

// ─── §8 Reviews ───────────────────────────────────────────────────────────

export async function listReviews(req: FastifyRequest, reply: FastifyReply) {
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
}

export async function getReviewAnalyticsHandler(
  _req: FastifyRequest,
  reply: FastifyReply,
) {
  const data = await crmGetReviewAnalytics();
  return reply.send(successResponse(data, "Review analytics"));
}

// ─── §9 Loyalty ───────────────────────────────────────────────────────────

export async function getLoyaltyOverview(
  _req: FastifyRequest,
  reply: FastifyReply,
) {
  const data = await crmGetLoyaltyOverview();
  return reply.send(successResponse(data, "Loyalty overview"));
}

// ─── Technician Performance ───────────────────────────────────────────────

export async function getTechnicianPerformance(
  req: FastifyRequest,
  reply: FastifyReply,
) {
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
}
