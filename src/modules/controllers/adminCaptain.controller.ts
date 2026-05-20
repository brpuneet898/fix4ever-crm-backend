import { FastifyRequest, FastifyReply } from "fastify";
import { z } from "zod";
import {
  listCaptains,
  getCaptainStats,
  getCaptainDetail,
  updateCaptainInfo,
  updateCaptainDocuments,
  approveCaptain,
  rejectCaptain,
  suspendCaptain,
  reactivateCaptain,
  getCaptainWallet,
  getCaptainTransactions,
  getCaptainWalletAnalytics,
  getCaptainLiveOrders,
  getCaptainHistory,
  listCaptainSettlements,
  approveSettlement,
  rejectSettlement,
} from "../../shared/services/admin";
import {
  successResponse,
  paginatedResponse,
} from "../../shared/utils/response.util";
import { audit } from "../../shared/middleware/audit.middleware";

type CaptainParams = { Params: { captainId: string } };
type SettlementParams = { Params: { settlementId: string } };

const listSchema = z.object({
  onboardingStatus: z.string().optional(),
  availability: z.string().optional(),
  serviceArea: z.string().optional(),
  search: z.string().optional(),
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(100).default(20),
});

const txFilterSchema = z.object({
  type: z.string().optional(),
  category: z.string().optional(),
  status: z.string().optional(),
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
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(100).default(20),
});

const historyFilterSchema = z.object({
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
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(100).default(20),
});

const settlementFilterSchema = z.object({
  status: z.string().optional(),
  captainId: z.string().optional(),
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
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(100).default(20),
});

export async function listCaptainsController(
  req: FastifyRequest,
  reply: FastifyReply,
) {
  const filter = listSchema.parse(req.query);
  const result = await listCaptains(filter);
  return reply.send(
    paginatedResponse(
      result.captains,
      result.total,
      filter.page,
      filter.limit,
      "Captains fetched",
    ),
  );
}

export async function getCaptainStatsController(
  _req: FastifyRequest,
  reply: FastifyReply,
) {
  const stats = await getCaptainStats();
  return reply.send(successResponse(stats, "Captain stats fetched"));
}

export async function getCaptainController(
  req: FastifyRequest<CaptainParams>,
  reply: FastifyReply,
) {
  const data = await getCaptainDetail(req.params.captainId);
  return reply.send(successResponse(data, "Captain detail fetched"));
}

export async function updateCaptainInfoController(
  req: FastifyRequest<CaptainParams>,
  reply: FastifyReply,
) {
  const captain = await updateCaptainInfo(
    req.params.captainId,
    req.body as Record<string, unknown>,
  );
  await audit(req, "UPDATE", "captains", {
    targetId: req.params.captainId,
    targetModel: "Captain",
  });
  return reply.send(successResponse(captain, "Captain info updated"));
}

export async function updateCaptainDocumentsController(
  req: FastifyRequest<CaptainParams>,
  reply: FastifyReply,
) {
  const captain = await updateCaptainDocuments(
    req.params.captainId,
    req.body as Record<string, unknown>,
  );
  await audit(req, "UPDATE", "captains", {
    targetId: req.params.captainId,
    targetModel: "Captain",
    metadata: { action: "document_update" },
  });
  return reply.send(successResponse(captain, "Captain documents updated"));
}

export async function approveCaptainController(
  req: FastifyRequest<CaptainParams>,
  reply: FastifyReply,
) {
  const { notes } = z.object({ notes: z.string().optional() }).parse(req.body);
  const captain = await approveCaptain(
    req.admin!.userId,
    req.params.captainId,
    notes,
  );
  await audit(req, "APPROVE", "captains", {
    targetId: req.params.captainId,
    targetModel: "Captain",
  });
  return reply.send(successResponse(captain, "Captain approved"));
}

export async function rejectCaptainController(
  req: FastifyRequest<CaptainParams>,
  reply: FastifyReply,
) {
  const { reason } = z.object({ reason: z.string().min(5) }).parse(req.body);
  const captain = await rejectCaptain(
    req.admin!.userId,
    req.params.captainId,
    reason,
  );
  await audit(req, "REJECT", "captains", {
    targetId: req.params.captainId,
    targetModel: "Captain",
    metadata: { reason },
  });
  return reply.send(successResponse(captain, "Captain rejected"));
}

export async function suspendCaptainController(
  req: FastifyRequest<CaptainParams>,
  reply: FastifyReply,
) {
  const { reason } = z.object({ reason: z.string().min(5) }).parse(req.body);
  const captain = await suspendCaptain(
    req.admin!.userId,
    req.params.captainId,
    reason,
  );
  await audit(req, "SUSPEND", "captains", {
    targetId: req.params.captainId,
    targetModel: "Captain",
    metadata: { reason },
  });
  return reply.send(successResponse(captain, "Captain suspended"));
}

export async function reactivateCaptainController(
  req: FastifyRequest<CaptainParams>,
  reply: FastifyReply,
) {
  const captain = await reactivateCaptain(
    req.admin!.userId,
    req.params.captainId,
  );
  await audit(req, "UPDATE", "captains", {
    targetId: req.params.captainId,
    targetModel: "Captain",
    metadata: { action: "reactivate" },
  });
  return reply.send(successResponse(captain, "Captain reactivated"));
}

export async function getCaptainWalletController(
  req: FastifyRequest<CaptainParams>,
  reply: FastifyReply,
) {
  const wallet = await getCaptainWallet(req.params.captainId);
  return reply.send(successResponse(wallet, "Captain wallet fetched"));
}

export async function getCaptainTransactionsController(
  req: FastifyRequest<CaptainParams>,
  reply: FastifyReply,
) {
  const filter = txFilterSchema.parse(req.query);
  const result = await getCaptainTransactions(req.params.captainId, filter);
  return reply.send(
    paginatedResponse(
      result.transactions,
      result.total,
      filter.page,
      filter.limit,
      "Transactions fetched",
    ),
  );
}

export async function getCaptainWalletAnalyticsController(
  req: FastifyRequest<CaptainParams>,
  reply: FastifyReply,
) {
  const data = await getCaptainWalletAnalytics(req.params.captainId);
  return reply.send(successResponse(data, "Wallet analytics fetched"));
}

export async function getCaptainLiveOrdersController(
  req: FastifyRequest<CaptainParams>,
  reply: FastifyReply,
) {
  const orders = await getCaptainLiveOrders(req.params.captainId);
  return reply.send(successResponse(orders, "Live orders fetched"));
}

export async function getCaptainHistoryController(
  req: FastifyRequest<CaptainParams>,
  reply: FastifyReply,
) {
  const filter = historyFilterSchema.parse(req.query);
  const result = await getCaptainHistory(req.params.captainId, filter);
  return reply.send(
    paginatedResponse(
      result.trips,
      result.total,
      filter.page,
      filter.limit,
      "Trip history fetched",
    ),
  );
}

export async function listSettlementsController(
  req: FastifyRequest,
  reply: FastifyReply,
) {
  const filter = settlementFilterSchema.parse(req.query);
  const result = await listCaptainSettlements(filter);
  return reply.send(
    paginatedResponse(
      result.settlements,
      result.total,
      filter.page,
      filter.limit,
      "Settlements fetched",
    ),
  );
}

export async function approveSettlementController(
  req: FastifyRequest<SettlementParams>,
  reply: FastifyReply,
) {
  const settlement = await approveSettlement(
    req.admin!.userId,
    req.params.settlementId,
  );
  await audit(req, "APPROVE", "captains", {
    targetId: req.params.settlementId,
    targetModel: "CaptainSettlementRequest",
  });
  return reply.send(successResponse(settlement, "Settlement approved"));
}

export async function rejectSettlementController(
  req: FastifyRequest<SettlementParams>,
  reply: FastifyReply,
) {
  const { reason } = z.object({ reason: z.string().min(3) }).parse(req.body);
  const settlement = await rejectSettlement(
    req.admin!.userId,
    req.params.settlementId,
    reason,
  );
  await audit(req, "REJECT", "captains", {
    targetId: req.params.settlementId,
    targetModel: "CaptainSettlementRequest",
    metadata: { reason },
  });
  return reply.send(successResponse(settlement, "Settlement rejected"));
}
