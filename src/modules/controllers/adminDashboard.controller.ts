import { FastifyRequest, FastifyReply } from "fastify";
import { z } from "zod";
import {
  getDashboardStats,
  getRevenueAnalytics,
  getLiveActivityFeed,
  DashboardPeriod,
} from "../../shared/services/admin";
import { successResponse } from "../../shared/utils/response.util";

const dashboardQuerySchema = z.object({
  period: z.enum(["today", "week", "month", "year", "custom"]).default("month"),
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
  region: z.string().optional(),
});

export async function dashboardStatsController(
  req: FastifyRequest,
  reply: FastifyReply,
) {
  const query = dashboardQuerySchema.parse(req.query);
  const data = await getDashboardStats(
    query.period as DashboardPeriod,
    query.from,
    query.to,
    query.region,
  );
  return reply.send(successResponse(data, "Dashboard stats fetched"));
}

export async function revenueAnalyticsController(
  req: FastifyRequest,
  reply: FastifyReply,
) {
  const query = dashboardQuerySchema.parse(req.query);
  const data = await getRevenueAnalytics(
    query.period as DashboardPeriod,
    query.from,
    query.to,
  );
  return reply.send(successResponse(data, "Revenue analytics fetched"));
}

export async function liveActivityController(
  req: FastifyRequest,
  reply: FastifyReply,
) {
  const { limit } = z
    .object({ limit: z.coerce.number().default(20) })
    .parse(req.query);
  const data = await getLiveActivityFeed(limit);
  return reply.send(successResponse(data, "Live activity fetched"));
}
