import { FastifyRequest, FastifyReply } from "fastify";
import { z } from "zod";
import {
  listTransactions,
  getFinancialSummary,
  processRefund,
  listSettlementRequests,
  approveSettlement,
  rejectSettlement,
  flagSuspiciousTransaction,
} from "../../shared/services/admin";
import {
  successResponse,
  paginatedResponse,
} from "../../shared/utils/response.util";
import { audit } from "../../shared/middleware/audit.middleware";

const txFilterSchema = z.object({
  status: z.string().optional(),
  paymentMethod: z.string().optional(),
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
  customerId: z.string().optional(),
  vendorId: z.string().optional(),
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(100).default(20),
});

type TxParams = { Params: { transactionId: string } };
type SettlementParams = { Params: { settlementId: string } };

export async function listTransactionsController(
  req: FastifyRequest,
  reply: FastifyReply,
) {
  const filter = txFilterSchema.parse(req.query);
  const result = await listTransactions(filter);
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

export async function financialSummaryController(
  req: FastifyRequest,
  reply: FastifyReply,
) {
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
  const data = await getFinancialSummary(from, to);
  return reply.send(successResponse(data, "Financial summary fetched"));
}

export async function processRefundController(
  req: FastifyRequest<TxParams>,
  reply: FastifyReply,
) {
  const { reason } = z.object({ reason: z.string().min(5) }).parse(req.body);
  const tx = await processRefund(
    req.admin!.userId,
    req.params.transactionId,
    reason,
  );
  await audit(req, "REFUND", "payments", {
    targetId: req.params.transactionId,
    targetModel: "PaymentTransaction",
    metadata: { reason },
  });
  return reply.send(successResponse(tx, "Refund processed"));
}

export async function listSettlementsController(
  req: FastifyRequest,
  reply: FastifyReply,
) {
  const { status, page, limit } = z
    .object({
      status: z.string().optional(),
      page: z.coerce.number().min(1).default(1),
      limit: z.coerce.number().min(1).max(100).default(20),
    })
    .parse(req.query);
  const result = await listSettlementRequests(status, page, limit);
  return reply.send(
    paginatedResponse(
      result.settlements,
      result.total,
      page,
      limit,
      "Settlements fetched",
    ),
  );
}

export async function approveSettlementController(
  req: FastifyRequest<SettlementParams>,
  reply: FastifyReply,
) {
  const { transactionRef } = z
    .object({ transactionRef: z.string().optional() })
    .parse(req.body);
  const settlement = await approveSettlement(
    req.admin!.userId,
    req.params.settlementId,
    transactionRef,
  );
  await audit(req, "PAYOUT_APPROVE", "payments", {
    targetId: req.params.settlementId,
    targetModel: "SettlementRequest",
  });
  return reply.send(successResponse(settlement, "Settlement approved"));
}

export async function rejectSettlementController(
  req: FastifyRequest<SettlementParams>,
  reply: FastifyReply,
) {
  const { reason } = z.object({ reason: z.string().min(5) }).parse(req.body);
  const settlement = await rejectSettlement(
    req.admin!.userId,
    req.params.settlementId,
    reason,
  );
  await audit(req, "UPDATE", "payments", {
    targetId: req.params.settlementId,
    targetModel: "SettlementRequest",
    metadata: { reason },
  });
  return reply.send(successResponse(settlement, "Settlement rejected"));
}

export async function flagTransactionController(
  req: FastifyRequest<TxParams>,
  reply: FastifyReply,
) {
  const { reason } = z.object({ reason: z.string().min(5) }).parse(req.body);
  const tx = await flagSuspiciousTransaction(req.params.transactionId, reason);
  await audit(req, "UPDATE", "payments", {
    targetId: req.params.transactionId,
    targetModel: "PaymentTransaction",
    metadata: { flagged: true, reason },
  });
  return reply.send(successResponse(tx, "Transaction flagged"));
}
