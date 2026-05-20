import { FastifyRequest, FastifyReply } from "fastify";
import { z } from "zod";
import {
  listCustomers,
  getCustomerProfile,
  adjustCustomerWallet,
  getCustomerServiceHistory,
  getCustomerWalletHistory,
  getCustomerPaymentHistory,
  cancelCustomerSubscription,
  assignDiscountToCustomer,
  blockUser,
  activateUser,
} from "../../shared/services/admin";
import {
  successResponse,
  paginatedResponse,
} from "../../shared/utils/response.util";
import { audit } from "../../shared/middleware/audit.middleware";

const paginationSchema = z.object({
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(100).default(20),
});

const customerFilterSchema = z.object({
  search: z.string().optional(),
  isActive: z
    .enum(["true", "false"])
    .optional()
    .transform((v) => (v !== undefined ? v === "true" : undefined)),
  city: z.string().optional(),
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(100).default(20),
});

type CustomerParams = { Params: { customerId: string } };

export async function listCustomersController(
  req: FastifyRequest,
  reply: FastifyReply,
) {
  const filter = customerFilterSchema.parse(req.query);
  const result = await listCustomers(filter);
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

export async function getCustomerController(
  req: FastifyRequest<CustomerParams>,
  reply: FastifyReply,
) {
  const profile = await getCustomerProfile(req.params.customerId);
  return reply.send(successResponse(profile, "Customer profile fetched"));
}

export async function blockCustomerController(
  req: FastifyRequest<CustomerParams>,
  reply: FastifyReply,
) {
  const { reason } = z
    .object({ reason: z.string().optional() })
    .parse(req.body);
  const user = await blockUser(req.admin!.userId, req.params.customerId);
  await audit(req, "BLOCK", "customers", {
    targetId: req.params.customerId,
    targetModel: "User",
    metadata: { reason },
  });
  return reply.send(successResponse(user, "Customer blocked"));
}

export async function activateCustomerController(
  req: FastifyRequest<CustomerParams>,
  reply: FastifyReply,
) {
  const user = await activateUser(req.admin!.userId, req.params.customerId);
  await audit(req, "UPDATE", "customers", {
    targetId: req.params.customerId,
    targetModel: "User",
  });
  return reply.send(successResponse(user, "Customer activated"));
}

export async function walletAdjustController(
  req: FastifyRequest<CustomerParams>,
  reply: FastifyReply,
) {
  const body = z
    .object({
      amount: z.number().positive(),
      type: z.enum(["credit", "debit", "adjustment"]),
      description: z.string().min(3),
    })
    .parse(req.body);

  const wallet = await adjustCustomerWallet(
    req.admin!.userId,
    req.params.customerId,
    body.amount,
    body.type,
    body.description,
  );
  await audit(req, "WALLET_ADJUST", "customers", {
    targetId: req.params.customerId,
    targetModel: "User",
    metadata: { amount: body.amount, type: body.type },
  });
  return reply.send(successResponse(wallet, "Wallet adjusted"));
}

export async function customerServiceHistoryController(
  req: FastifyRequest<CustomerParams>,
  reply: FastifyReply,
) {
  const { page, limit } = paginationSchema.parse(req.query);
  const result = await getCustomerServiceHistory(
    req.params.customerId,
    page,
    limit,
  );
  return reply.send(
    paginatedResponse(
      result.requests,
      result.total,
      page,
      limit,
      "Service history fetched",
    ),
  );
}

export async function customerWalletHistoryController(
  req: FastifyRequest<CustomerParams>,
  reply: FastifyReply,
) {
  const data = await getCustomerWalletHistory(req.params.customerId);
  return reply.send(successResponse(data, "Wallet history fetched"));
}

export async function customerPaymentHistoryController(
  req: FastifyRequest<CustomerParams>,
  reply: FastifyReply,
) {
  const { page, limit, status } = z
    .object({
      page: z.coerce.number().min(1).default(1),
      limit: z.coerce.number().min(1).max(100).default(20),
      status: z.string().optional(),
    })
    .parse(req.query);
  const result = await getCustomerPaymentHistory(
    req.params.customerId,
    page,
    limit,
    status,
  );
  return reply.send(
    paginatedResponse(
      result.payments,
      result.total,
      page,
      limit,
      "Payment history fetched",
    ),
  );
}

export async function cancelSubscriptionController(
  req: FastifyRequest<CustomerParams>,
  reply: FastifyReply,
) {
  const { reason } = z.object({ reason: z.string().min(5) }).parse(req.body);
  const sub = await cancelCustomerSubscription(
    req.admin!.userId,
    req.params.customerId,
    reason,
  );
  await audit(req, "UPDATE", "subscriptions", {
    targetId: req.params.customerId,
    metadata: { action: "cancel_subscription", reason },
  });
  return reply.send(successResponse(sub, "Subscription cancelled"));
}

export async function assignDiscountController(
  req: FastifyRequest<CustomerParams>,
  reply: FastifyReply,
) {
  const { discountPercentage, note } = z
    .object({
      discountPercentage: z.number().min(0).max(100),
      note: z.string().optional(),
    })
    .parse(req.body);

  const user = await assignDiscountToCustomer(
    req.admin!.userId,
    req.params.customerId,
    discountPercentage,
    note,
  );
  await audit(req, "UPDATE", "customers", {
    targetId: req.params.customerId,
    metadata: { discountPercentage },
  });
  return reply.send(successResponse(user, "Discount assigned"));
}
