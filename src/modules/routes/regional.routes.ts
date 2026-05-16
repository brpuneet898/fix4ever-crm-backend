/**
 * Regional Manager Routes — /regional prefix
 *
 * PDF ref: Regional Manager Functionality (Sections 1–10)
 * Access: users with roles[] containing "regional_manager" OR base role "admin"
 * ALL data is SCOPED to user's assigned region (from JWT)
 *
 * Route map:
 *  §1  Dashboard
 *      GET    /dashboard                            — regional KPIs
 *
 *  §2  Technician Management
 *      GET    /technicians                          — list with filter
 *      GET    /technicians/workload                 — active job load per technician
 *      GET    /technicians/:vendorId                — technician detail
 *      GET    /technicians/:vendorId/performance    — performance report
 *
 *  §3  Service Quality & SLA
 *      GET    /sla                                  — SLA compliance report
 *
 *  §2 (cont.) Service Request Operations
 *      GET    /service-requests                     — list region-scoped SRs
 *      GET    /service-requests/:id                 — SR detail
 *      PATCH  /service-requests/:id/assign          — assign to technician
 *      PATCH  /service-requests/:id/reassign        — reassign with reason
 *      PATCH  /service-requests/:id/cancel          — cancel with reason
 *      PATCH  /service-requests/:id/tag             — tag SR
 *
 *  §4  Customer Insights
 *      GET    /customer-insights                    — top customers in region
 *      GET    /loyalty-insights                     — subscription/wallet adoption
 *
 *  §5  Analytics & Reports
 *      GET    /analytics                            — full operational analytics
 *
 *  §6  Resource Planning
 *      GET    /resource-planning                    — capacity vs demand
 *
 *  §7  Campaign Oversight
 *      GET    /campaigns                            — campaigns for region
 *      PATCH  /campaigns/:id/review                 — approve/reject campaign
 *
 *  §8  Financial Oversight
 *      GET    /finance                              — revenue overview
 *      GET    /finance/breakdown                    — revenue by service type
 *      GET    /finance/profitability                — profitability analysis
 *
 *  §9  Audit Logs
 *      GET    /audit-logs                           — regional audit logs
 *
 *  §10 Strategic
 *      GET    /strategic/growth                     — growth opportunities
 *      GET    /strategic/benchmark                  — KPI benchmark vs platform
 */
import { FastifyInstance } from "fastify";
import { z } from "zod";
import {
  requireRole,
  requirePermission,
} from "../../shared/middleware/permission.middleware";
import { authMiddleware } from "../../shared/middleware/auth.middleware";
import { PERMISSIONS, ROLES, isFullAccessRole } from "../../access";
import {
  successResponse,
  paginatedResponse,
} from "../../shared/utils/response.util";
import { ApiError } from "../../shared/errors/ApiError";
import { audit } from "../../shared/middleware/audit.middleware";
import {
  // §1
  getRegionalDashboard,
  // §2 Technicians
  getRegionalTechnicians,
  getRegionalTechnicianDetail,
  getTechnicianWorkload,
  getRegionalTechnicianPerformance,
  // §3 SLA
  getRegionalSlaReport,
  // §2 SR Operations
  assignRegionalServiceRequest,
  reassignRegionalServiceRequest,
  cancelRegionalServiceRequest,
  tagRegionalServiceRequest,
  // §4 Customer Insights
  getRegionalCustomerInsights,
  getRegionalLoyaltyInsights,
  // §5 Analytics
  getRegionalAnalytics,
  // §6 Resource
  getResourcePlanningData,
  // §7 Campaigns
  getRegionalCampaigns,
  reviewRegionalCampaign,
  // §8 Finance
  getRegionalFinancialOverview,
  getRegionalProfitabilityAnalysis,
  // §10 Strategic
  getRegionalGrowthOpportunities,
  getRegionalBenchmark,
} from "../../shared/services/regional.service";
import { listServiceRequests } from "../../shared/services/admin";
import { getAuditLogs } from "../../shared/services/auditLog.service";

/** Extract region from JWT, with admin override via query param */
function getRegion(
  req: { admin?: { region?: string; role?: string } },
  queryRegion?: string,
): string {
  const isAdmin = isFullAccessRole(req.admin?.role);
  const region = isAdmin
    ? (queryRegion ?? req.admin?.region)
    : req.admin?.region;
  if (!region) {
    throw ApiError.badRequest(
      "No region assigned. Ask a super admin to set your region.",
    );
  }
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

export async function regionalRoutes(app: FastifyInstance) {
  app.addHook("preHandler", authMiddleware);
  app.addHook(
    "preHandler",
    requireRole([
      ROLES.REGIONAL_MANAGER,
      ROLES.ADMIN,
      ROLES.SUPER_ADMIN,
    ]),
  );

  // ═══════════════════════════════════════════════════════════════════════════
  // §1  REGIONAL DASHBOARD
  // ═══════════════════════════════════════════════════════════════════════════

  app.get(
    "/dashboard",
    { preHandler: [requirePermission(PERMISSIONS.DASHBOARD_VIEW)] },
    async (req, reply) => {
      const { region: rq } = z
        .object({ region: z.string().optional() })
        .parse(req.query);
      const region = getRegion(req, rq);
      const data = await getRegionalDashboard(region);
      return reply.send(successResponse(data, "Regional dashboard"));
    },
  );

  // ═══════════════════════════════════════════════════════════════════════════
  // §2  TECHNICIAN MANAGEMENT
  // ═══════════════════════════════════════════════════════════════════════════

  app.get(
    "/technicians",
    { preHandler: [requirePermission(PERMISSIONS.VENDORS_READ)] },
    async (req, reply) => {
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
    },
  );

  app.get(
    "/technicians/workload",
    { preHandler: [requirePermission(PERMISSIONS.VENDORS_MONITOR)] },
    async (req, reply) => {
      const { region: rq } = z
        .object({ region: z.string().optional() })
        .parse(req.query);
      const region = getRegion(req, rq);
      const data = await getTechnicianWorkload(region);
      return reply.send(successResponse(data, "Technician workload"));
    },
  );

  /** Technician detail (profile + job counts + recent reviews) */
  app.get(
    "/technicians/:vendorId",
    { preHandler: [requirePermission(PERMISSIONS.VENDORS_READ)] },
    async (req: any, reply) => {
      const { region: rq } = z
        .object({ region: z.string().optional() })
        .parse(req.query);
      const region = getRegion(req, rq);
      const data = await getRegionalTechnicianDetail(
        region,
        req.params.vendorId,
      );
      return reply.send(successResponse(data, "Technician detail"));
    },
  );

  /** Performance metrics for a specific technician in the region */
  app.get(
    "/technicians/:vendorId/performance",
    { preHandler: [requirePermission(PERMISSIONS.ANALYTICS_TECHNICIAN)] },
    async (req: any, reply) => {
      const { from, to, region: rq } = dateRangeSchema.parse(req.query);
      const region = getRegion(req, rq);
      const data = await getRegionalTechnicianPerformance(
        region,
        req.params.vendorId,
        from,
        to,
      );
      return reply.send(successResponse(data, "Technician performance"));
    },
  );

  // ═══════════════════════════════════════════════════════════════════════════
  // §3  SERVICE QUALITY & SLA
  // ═══════════════════════════════════════════════════════════════════════════

  app.get(
    "/sla",
    { preHandler: [requirePermission(PERMISSIONS.SLA_VIEW)] },
    async (req, reply) => {
      const { region: rq } = z
        .object({ region: z.string().optional() })
        .parse(req.query);
      const region = getRegion(req, rq);
      const data = await getRegionalSlaReport(region);
      return reply.send(successResponse(data, "SLA compliance report"));
    },
  );

  // ═══════════════════════════════════════════════════════════════════════════
  // §2 (cont.)  SERVICE REQUEST OPERATIONS
  // ═══════════════════════════════════════════════════════════════════════════

  app.get(
    "/service-requests",
    { preHandler: [requirePermission(PERMISSIONS.SERVICE_REQUESTS_READ)] },
    async (req, reply) => {
      const {
        region: rq,
        status,
        page,
        limit,
        priority,
      } = z
        .object({
          region: z.string().optional(),
          status: z.string().optional(),
          priority: z.string().optional(),
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
    },
  );

  /** Assign a service request to a technician within the region */
  app.patch(
    "/service-requests/:requestId/assign",
    { preHandler: [requirePermission(PERMISSIONS.SERVICE_REQUESTS_ASSIGN)] },
    async (req: any, reply) => {
      const { vendorId, region: rq } = z
        .object({
          vendorId: z.string().min(1, "vendorId is required"),
          region: z.string().optional(),
        })
        .parse(req.body);
      const region = getRegion(req, rq);
      const sr = await assignRegionalServiceRequest(
        region,
        req.params.requestId,
        vendorId,
        req.admin!.userId,
      );
      await audit(req, "ASSIGN_SR", "service_requests", {
        targetId: req.params.requestId,
        targetModel: "ServiceRequest",
        metadata: { vendorId, region },
      });
      return reply.send(successResponse(sr, "Service request assigned"));
    },
  );

  /** Reassign a service request to a different technician */
  app.patch(
    "/service-requests/:requestId/reassign",
    { preHandler: [requirePermission(PERMISSIONS.SERVICE_REQUESTS_REASSIGN)] },
    async (req: any, reply) => {
      const {
        vendorId,
        reason,
        region: rq,
      } = z
        .object({
          vendorId: z.string().min(1),
          reason: z
            .string()
            .min(10, "Provide a detailed reason (min 10 chars)"),
          region: z.string().optional(),
        })
        .parse(req.body);
      const region = getRegion(req, rq);
      const sr = await reassignRegionalServiceRequest(
        region,
        req.params.requestId,
        vendorId,
        req.admin!.userId,
        reason,
      );
      await audit(req, "REASSIGN_SR", "service_requests", {
        targetId: req.params.requestId,
        targetModel: "ServiceRequest",
        metadata: { vendorId, reason, region },
      });
      return reply.send(successResponse(sr, "Service request reassigned"));
    },
  );

  /** Cancel a service request within the region */
  app.patch(
    "/service-requests/:requestId/cancel",
    { preHandler: [requirePermission(PERMISSIONS.SERVICE_REQUESTS_CANCEL)] },
    async (req: any, reply) => {
      const { reason, region: rq } = z
        .object({
          reason: z
            .string()
            .min(10, "Provide a cancellation reason (min 10 chars)"),
          region: z.string().optional(),
        })
        .parse(req.body);
      const region = getRegion(req, rq);
      const sr = await cancelRegionalServiceRequest(
        region,
        req.params.requestId,
        req.admin!.userId,
        reason,
      );
      await audit(req, "CANCEL_SR", "service_requests", {
        targetId: req.params.requestId,
        targetModel: "ServiceRequest",
        metadata: { reason, region },
      });
      return reply.send(successResponse(sr, "Service request cancelled"));
    },
  );

  /** Tag a service request */
  app.patch(
    "/service-requests/:requestId/tag",
    { preHandler: [requirePermission(PERMISSIONS.SERVICE_REQUESTS_TAG)] },
    async (req: any, reply) => {
      const { tag, region: rq } = z
        .object({
          tag: z.string().min(1),
          region: z.string().optional(),
        })
        .parse(req.body);
      const region = getRegion(req, rq);
      const sr = await tagRegionalServiceRequest(
        region,
        req.params.requestId,
        tag,
        req.admin!.userId,
      );
      await audit(req, "TAG_SR", "service_requests", {
        targetId: req.params.requestId,
        targetModel: "ServiceRequest",
        metadata: { tag, region },
      });
      return reply.send(successResponse(sr, "Service request tagged"));
    },
  );

  // ═══════════════════════════════════════════════════════════════════════════
  // §4  CUSTOMER INSIGHTS
  // ═══════════════════════════════════════════════════════════════════════════

  app.get(
    "/customer-insights",
    { preHandler: [requirePermission(PERMISSIONS.CUSTOMERS_READ)] },
    async (req, reply) => {
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
    },
  );

  /** Subscription & wallet adoption rates in the region */
  app.get(
    "/loyalty-insights",
    { preHandler: [requirePermission(PERMISSIONS.CUSTOMERS_READ)] },
    async (req, reply) => {
      const { region: rq } = z
        .object({ region: z.string().optional() })
        .parse(req.query);
      const region = getRegion(req, rq);
      const data = await getRegionalLoyaltyInsights(region);
      return reply.send(successResponse(data, "Regional loyalty insights"));
    },
  );

  // ═══════════════════════════════════════════════════════════════════════════
  // §5  ANALYTICS & REPORTS
  // ═══════════════════════════════════════════════════════════════════════════

  app.get(
    "/analytics",
    { preHandler: [requirePermission(PERMISSIONS.ANALYTICS_REGION)] },
    async (req, reply) => {
      const { from, to, region: rq } = dateRangeSchema.parse(req.query);
      const region = getRegion(req, rq);
      const data = await getRegionalAnalytics(region, from, to);
      return reply.send(successResponse(data, "Regional analytics"));
    },
  );

  // ═══════════════════════════════════════════════════════════════════════════
  // §6  RESOURCE PLANNING
  // ═══════════════════════════════════════════════════════════════════════════

  app.get(
    "/resource-planning",
    { preHandler: [requirePermission(PERMISSIONS.RESOURCE_PLANNING_VIEW)] },
    async (req, reply) => {
      const { region: rq } = z
        .object({ region: z.string().optional() })
        .parse(req.query);
      const region = getRegion(req, rq);
      const data = await getResourcePlanningData(region);
      return reply.send(successResponse(data, "Resource planning data"));
    },
  );

  // ═══════════════════════════════════════════════════════════════════════════
  // §7  MARKETING & CAMPAIGN OVERSIGHT
  // ═══════════════════════════════════════════════════════════════════════════

  /** View campaigns applicable to this region */
  app.get(
    "/campaigns",
    { preHandler: [requirePermission(PERMISSIONS.CAMPAIGNS_READ)] },
    async (req, reply) => {
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
    },
  );

  /** Approve or reject a campaign targeting this region */
  app.patch(
    "/campaigns/:campaignId/review",
    { preHandler: [requirePermission(PERMISSIONS.CAMPAIGNS_APPROVE)] },
    async (req: any, reply) => {
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

      if (action === "reject" && !rejectionReason) {
        throw ApiError.badRequest("rejectionReason is required when rejecting");
      }

      const region = getRegion(req, rq);
      const campaign = await reviewRegionalCampaign(
        region,
        req.params.campaignId,
        action,
        req.admin!.userId,
        rejectionReason,
      );
      const campaignAuditAction =
        action === "approve"
          ? ("CAMPAIGN_APPROVE" as const)
          : ("CAMPAIGN_REJECT" as const);
      await audit(req, campaignAuditAction, "campaigns", {
        targetId: req.params.campaignId,
        targetModel: "Campaign",
        metadata: { action, region, rejectionReason },
      });
      return reply.send(successResponse(campaign, `Campaign ${action}d`));
    },
  );

  // ═══════════════════════════════════════════════════════════════════════════
  // §8  FINANCIAL OVERSIGHT
  // ═══════════════════════════════════════════════════════════════════════════

  app.get(
    "/finance",
    { preHandler: [requirePermission(PERMISSIONS.PAYMENTS_VIEW)] },
    async (req, reply) => {
      const { from, to, region: rq } = dateRangeSchema.parse(req.query);
      const region = getRegion(req, rq);
      const data = await getRegionalFinancialOverview(region, from, to);
      return reply.send(successResponse(data, "Regional financial overview"));
    },
  );

  /** Revenue breakdown by service type */
  app.get(
    "/finance/breakdown",
    { preHandler: [requirePermission(PERMISSIONS.PAYMENTS_VIEW)] },
    async (req, reply) => {
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
    },
  );

  /** Profitability analysis by service type */
  app.get(
    "/finance/profitability",
    { preHandler: [requirePermission(PERMISSIONS.PAYMENTS_VIEW)] },
    async (req, reply) => {
      const { from, to, region: rq } = dateRangeSchema.parse(req.query);
      const region = getRegion(req, rq);
      const data = await getRegionalProfitabilityAnalysis(region, from, to);
      return reply.send(successResponse(data, "Profitability analysis"));
    },
  );

  // ═══════════════════════════════════════════════════════════════════════════
  // §9  AUDIT LOGS (region-scoped activity)
  // ═══════════════════════════════════════════════════════════════════════════

  app.get(
    "/audit-logs",
    { preHandler: [requirePermission(PERMISSIONS.AUDIT_LOGS_VIEW)] },
    async (req, reply) => {
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
    },
  );

  // ═══════════════════════════════════════════════════════════════════════════
  // §10 STRATEGIC DECISION-MAKING
  // ═══════════════════════════════════════════════════════════════════════════

  /** Growth opportunities: unmet demand, understaffed areas, category gaps */
  app.get(
    "/strategic/growth",
    { preHandler: [requirePermission(PERMISSIONS.ANALYTICS_REGION)] },
    async (req, reply) => {
      const { region: rq } = z
        .object({ region: z.string().optional() })
        .parse(req.query);
      const region = getRegion(req, rq);
      const data = await getRegionalGrowthOpportunities(region);
      return reply.send(successResponse(data, "Regional growth opportunities"));
    },
  );

  /** KPI benchmark: region vs platform average */
  app.get(
    "/strategic/benchmark",
    { preHandler: [requirePermission(PERMISSIONS.ANALYTICS_REGION)] },
    async (req, reply) => {
      const { from, to, region: rq } = dateRangeSchema.parse(req.query);
      const region = getRegion(req, rq);
      const data = await getRegionalBenchmark(region, from, to);
      return reply.send(successResponse(data, "Regional KPI benchmark"));
    },
  );
}
