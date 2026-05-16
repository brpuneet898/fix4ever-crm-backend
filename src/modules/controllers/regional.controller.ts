/**
 * Regional Manager Controller
 *
 * Thin layer between HTTP routes and the regional service.
 * All region-scoping is enforced here via getRegion().
 */
import { FastifyRequest, FastifyReply } from "fastify";
import { z } from "zod";
import {
  successResponse,
  paginatedResponse,
} from "../../shared/utils/response.util";
import { ApiError } from "../../shared/errors/ApiError";
import { audit } from "../../shared/middleware/audit.middleware";
import {
  getRegionalDashboard,
  getRegionalTechnicians,
  getRegionalTechnicianDetail,
  getTechnicianWorkload,
  getRegionalTechnicianPerformance,
  getRegionalSlaReport,
  assignRegionalServiceRequest,
  reassignRegionalServiceRequest,
  cancelRegionalServiceRequest,
  tagRegionalServiceRequest,
  getRegionalCustomerInsights,
  getRegionalLoyaltyInsights,
  getRegionalAnalytics,
  getResourcePlanningData,
  getRegionalCampaigns,
  reviewRegionalCampaign,
  getRegionalFinancialOverview,
  getRegionalProfitabilityAnalysis,
  getRegionalGrowthOpportunities,
  getRegionalBenchmark,
} from "../../shared/services/regional.service";
import { listServiceRequests } from "../../shared/services/admin";
import { getAuditLogs } from "../../shared/services/auditLog.service";

export function getRegion(req: FastifyRequest, queryRegion?: string): string {
  const isAdmin =
    req.admin?.role === "admin" || req.admin?.role === "super_admin";
  const region = isAdmin
    ? (queryRegion ?? req.admin?.region)
    : req.admin?.region;
  if (!region)
    throw ApiError.badRequest(
      "No region assigned. Ask a super admin to set your region.",
    );
  return region;
}

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
  region: z.string().optional(),
});

// ─── §1 Dashboard ─────────────────────────────────────────────────────────

export async function getDashboard(req: FastifyRequest, reply: FastifyReply) {
  const { region: rq } = z
    .object({ region: z.string().optional() })
    .parse(req.query);
  const region = getRegion(req, rq);
  const data = await getRegionalDashboard(region);
  return reply.send(successResponse(data, "Regional dashboard"));
}

// ─── §2 Technicians ───────────────────────────────────────────────────────

export async function listTechnicians(
  req: FastifyRequest,
  reply: FastifyReply,
) {
  const {
    region: rq,
    search,
    onboardingStatus,
    minRating,
    page,
    limit,
  } = z
    .object({
      region: z.string().optional(),
      search: z.string().optional(),
      onboardingStatus: z.string().optional(),
      minRating: z.coerce.number().min(0).max(5).optional(),
      page: z.coerce.number().default(1),
      limit: z.coerce.number().default(20),
    })
    .parse(req.query);
  const region = getRegion(req, rq);
  const result = await getRegionalTechnicians(region, {
    search,
    onboardingStatus,
    minRating,
    page,
    limit,
  });
  return reply.send(
    paginatedResponse(
      result.vendors,
      result.total,
      page,
      limit,
      "Regional technicians",
    ),
  );
}

export async function getTechnicianDetail(
  req: FastifyRequest,
  reply: FastifyReply,
) {
  const { vendorId } = req.params as { vendorId: string };
  const { region: rq } = z
    .object({ region: z.string().optional() })
    .parse(req.query);
  const region = getRegion(req, rq);
  const data = await getRegionalTechnicianDetail(region, vendorId);
  return reply.send(successResponse(data, "Technician detail"));
}

export async function getTechnicianWorkloadHandler(
  req: FastifyRequest,
  reply: FastifyReply,
) {
  const { region: rq } = z
    .object({ region: z.string().optional() })
    .parse(req.query);
  const region = getRegion(req, rq);
  const data = await getTechnicianWorkload(region);
  return reply.send(successResponse(data, "Technician workload"));
}

export async function getTechnicianPerformanceHandler(
  req: FastifyRequest,
  reply: FastifyReply,
) {
  const { vendorId } = req.params as { vendorId: string };
  const { from, to, region: rq } = dateRangeSchema.parse(req.query);
  const region = getRegion(req, rq);
  const data = await getRegionalTechnicianPerformance(
    region,
    vendorId,
    from,
    to,
  );
  return reply.send(successResponse(data, "Technician performance"));
}

// ─── §3 SLA ───────────────────────────────────────────────────────────────

export async function getSlaReport(req: FastifyRequest, reply: FastifyReply) {
  const { region: rq } = z
    .object({ region: z.string().optional() })
    .parse(req.query);
  const region = getRegion(req, rq);
  const data = await getRegionalSlaReport(region);
  return reply.send(successResponse(data, "SLA compliance report"));
}

// ─── §2 Service Request Operations ────────────────────────────────────────

export async function listRegionalSRs(
  req: FastifyRequest,
  reply: FastifyReply,
) {
  const {
    region: rq,
    status,
    page,
    limit,
  } = z
    .object({
      region: z.string().optional(),
      status: z.string().optional(),
      page: z.coerce.number().default(1),
      limit: z.coerce.number().default(20),
    })
    .parse(req.query);
  const region = getRegion(req, rq);
  const result = await listServiceRequests({
    city: region,
    status,
    page,
    limit,
  });
  return reply.send(
    paginatedResponse(
      result.requests,
      result.total,
      page,
      limit,
      "Regional service requests",
    ),
  );
}

export async function assignSR(req: FastifyRequest, reply: FastifyReply) {
  const { requestId } = req.params as { requestId: string };
  const { vendorId, region: rq } = z
    .object({ vendorId: z.string().min(1), region: z.string().optional() })
    .parse(req.body);
  const region = getRegion(req, rq);
  const sr = await assignRegionalServiceRequest(
    region,
    requestId,
    vendorId,
    req.admin!.userId,
  );
  await audit(req, "ASSIGN_SR", "service_requests", {
    targetId: requestId,
    targetModel: "ServiceRequest",
    metadata: { vendorId, region },
  });
  return reply.send(successResponse(sr, "Service request assigned"));
}

export async function reassignSR(req: FastifyRequest, reply: FastifyReply) {
  const { requestId } = req.params as { requestId: string };
  const {
    vendorId,
    reason,
    region: rq,
  } = z
    .object({
      vendorId: z.string().min(1),
      reason: z.string().min(10),
      region: z.string().optional(),
    })
    .parse(req.body);
  const region = getRegion(req, rq);
  const sr = await reassignRegionalServiceRequest(
    region,
    requestId,
    vendorId,
    req.admin!.userId,
    reason,
  );
  await audit(req, "REASSIGN_SR", "service_requests", {
    targetId: requestId,
    targetModel: "ServiceRequest",
    metadata: { vendorId, reason, region },
  });
  return reply.send(successResponse(sr, "Service request reassigned"));
}

export async function cancelSR(req: FastifyRequest, reply: FastifyReply) {
  const { requestId } = req.params as { requestId: string };
  const { reason, region: rq } = z
    .object({ reason: z.string().min(10), region: z.string().optional() })
    .parse(req.body);
  const region = getRegion(req, rq);
  const sr = await cancelRegionalServiceRequest(
    region,
    requestId,
    req.admin!.userId,
    reason,
  );
  await audit(req, "CANCEL_SR", "service_requests", {
    targetId: requestId,
    targetModel: "ServiceRequest",
    metadata: { reason, region },
  });
  return reply.send(successResponse(sr, "Service request cancelled"));
}

export async function tagSR(req: FastifyRequest, reply: FastifyReply) {
  const { requestId } = req.params as { requestId: string };
  const { tag, region: rq } = z
    .object({ tag: z.string().min(1), region: z.string().optional() })
    .parse(req.body);
  const region = getRegion(req, rq);
  const sr = await tagRegionalServiceRequest(
    region,
    requestId,
    tag,
    req.admin!.userId,
  );
  await audit(req, "TAG_SR", "service_requests", {
    targetId: requestId,
    targetModel: "ServiceRequest",
    metadata: { tag, region },
  });
  return reply.send(successResponse(sr, "Service request tagged"));
}

// ─── §4 Customer Insights ─────────────────────────────────────────────────

export async function getCustomerInsights(
  req: FastifyRequest,
  reply: FastifyReply,
) {
  const {
    region: rq,
    page,
    limit,
  } = z
    .object({
      region: z.string().optional(),
      page: z.coerce.number().default(1),
      limit: z.coerce.number().default(20),
    })
    .parse(req.query);
  const region = getRegion(req, rq);
  const data = await getRegionalCustomerInsights(region, page, limit);
  return reply.send(
    paginatedResponse(
      data.customers,
      data.total,
      page,
      limit,
      "Regional customer insights",
    ),
  );
}

export async function getLoyaltyInsights(
  req: FastifyRequest,
  reply: FastifyReply,
) {
  const { region: rq } = z
    .object({ region: z.string().optional() })
    .parse(req.query);
  const region = getRegion(req, rq);
  const data = await getRegionalLoyaltyInsights(region);
  return reply.send(successResponse(data, "Regional loyalty insights"));
}

// ─── §5 Analytics ─────────────────────────────────────────────────────────

export async function getAnalytics(req: FastifyRequest, reply: FastifyReply) {
  const { from, to, region: rq } = dateRangeSchema.parse(req.query);
  const region = getRegion(req, rq);
  const data = await getRegionalAnalytics(region, from, to);
  return reply.send(successResponse(data, "Regional analytics"));
}

// ─── §6 Resource Planning ─────────────────────────────────────────────────

export async function getResourcePlanning(
  req: FastifyRequest,
  reply: FastifyReply,
) {
  const { region: rq } = z
    .object({ region: z.string().optional() })
    .parse(req.query);
  const region = getRegion(req, rq);
  const data = await getResourcePlanningData(region);
  return reply.send(successResponse(data, "Resource planning data"));
}

// ─── §7 Campaigns ─────────────────────────────────────────────────────────

export async function listCampaigns(req: FastifyRequest, reply: FastifyReply) {
  const {
    region: rq,
    status,
    page,
    limit,
  } = z
    .object({
      region: z.string().optional(),
      status: z.string().optional(),
      page: z.coerce.number().default(1),
      limit: z.coerce.number().default(20),
    })
    .parse(req.query);
  const region = getRegion(req, rq);
  const data = await getRegionalCampaigns(region, { status, page, limit });
  return reply.send(
    paginatedResponse(
      data.campaigns,
      data.total,
      data.page,
      data.limit,
      "Regional campaigns",
    ),
  );
}

export async function reviewCampaign(req: FastifyRequest, reply: FastifyReply) {
  const { campaignId } = req.params as { campaignId: string };
  const {
    action,
    rejectionReason,
    region: rq,
  } = z
    .object({
      action: z.enum(["approve", "reject"]),
      rejectionReason: z.string().optional(),
      region: z.string().optional(),
    })
    .parse(req.body);
  if (action === "reject" && !rejectionReason)
    throw ApiError.badRequest("rejectionReason is required when rejecting");
  const region = getRegion(req, rq);
  const campaign = await reviewRegionalCampaign(
    region,
    campaignId,
    action,
    req.admin!.userId,
    rejectionReason,
  );
  const campaignAuditAction =
    action === "approve"
      ? ("CAMPAIGN_APPROVE" as const)
      : ("CAMPAIGN_REJECT" as const);
  await audit(req, campaignAuditAction, "campaigns", {
    targetId: campaignId,
    targetModel: "Campaign",
    metadata: { action, region },
  });
  return reply.send(successResponse(campaign, `Campaign ${action}d`));
}

// ─── §8 Finance ───────────────────────────────────────────────────────────

export async function getFinance(req: FastifyRequest, reply: FastifyReply) {
  const { from, to, region: rq } = dateRangeSchema.parse(req.query);
  const region = getRegion(req, rq);
  const data = await getRegionalFinancialOverview(region, from, to);
  return reply.send(successResponse(data, "Regional financial overview"));
}

export async function getFinanceBreakdown(
  req: FastifyRequest,
  reply: FastifyReply,
) {
  const { from, to, region: rq } = dateRangeSchema.parse(req.query);
  const region = getRegion(req, rq);
  const data = await getRegionalFinancialOverview(region, from, to);
  return reply.send(
    successResponse(
      {
        region,
        dateRange: { from, to },
        revenueByServiceType: data.revenueByServiceType,
        topVendorsByRevenue: data.topVendorsByRevenue,
      },
      "Revenue breakdown",
    ),
  );
}

export async function getProfitability(
  req: FastifyRequest,
  reply: FastifyReply,
) {
  const { from, to, region: rq } = dateRangeSchema.parse(req.query);
  const region = getRegion(req, rq);
  const data = await getRegionalProfitabilityAnalysis(region, from, to);
  return reply.send(successResponse(data, "Profitability analysis"));
}

// ─── §9 Audit ─────────────────────────────────────────────────────────────

export async function getAuditLogsHandler(
  req: FastifyRequest,
  reply: FastifyReply,
) {
  const { page, limit } = z
    .object({
      page: z.coerce.number().default(1),
      limit: z.coerce.number().default(50),
    })
    .parse(req.query);
  const result = await getAuditLogs(
    { module: "service_requests" },
    page,
    limit,
  );
  return reply.send(
    paginatedResponse(result.logs, result.total, page, limit, "Audit logs"),
  );
}

// ─── §10 Strategic ────────────────────────────────────────────────────────

export async function getGrowthOpportunities(
  req: FastifyRequest,
  reply: FastifyReply,
) {
  const { region: rq } = z
    .object({ region: z.string().optional() })
    .parse(req.query);
  const region = getRegion(req, rq);
  const data = await getRegionalGrowthOpportunities(region);
  return reply.send(successResponse(data, "Regional growth opportunities"));
}

export async function getBenchmark(req: FastifyRequest, reply: FastifyReply) {
  const { from, to, region: rq } = dateRangeSchema.parse(req.query);
  const region = getRegion(req, rq);
  const data = await getRegionalBenchmark(region, from, to);
  return reply.send(successResponse(data, "Regional KPI benchmark"));
}
