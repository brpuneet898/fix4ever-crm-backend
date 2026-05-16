import { FastifyRequest, FastifyReply } from "fastify";
import { z } from "zod";
import {
  listServiceRequests,
  getServiceRequestDetail,
  forceAssignTechnician,
  cancelServiceRequest,
  setAdminPricing,
  getSlaViolations,
  tagServiceRequest,
} from "../../shared/services/admin";
import {
  successResponse,
  paginatedResponse,
} from "../../shared/utils/response.util";
import { audit } from "../../shared/middleware/audit.middleware";

type SRParams = { Params: { requestId: string } };

const srFilterSchema = z.object({
  status: z.string().optional(),
  city: z.string().optional(),
  assignedVendor: z.string().optional(),
  customerId: z.string().optional(),
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
  isUrgent: z
    .enum(["true", "false"])
    .optional()
    .transform((v) => v === "true"),
  search: z.string().optional(),
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(100).default(20),
});

export async function listSRController(
  req: FastifyRequest,
  reply: FastifyReply,
) {
  const filter = srFilterSchema.parse(req.query);
  const result = await listServiceRequests(filter);
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

export async function getSRController(
  req: FastifyRequest<SRParams>,
  reply: FastifyReply,
) {
  const data = await getServiceRequestDetail(req.params.requestId);
  return reply.send(successResponse(data, "Service request fetched"));
}

export async function forceAssignController(
  req: FastifyRequest<SRParams>,
  reply: FastifyReply,
) {
  const { vendorId, notes } = z
    .object({
      vendorId: z.string(),
      notes: z.string().optional(),
    })
    .parse(req.body);

  const sr = await forceAssignTechnician(
    req.admin!.userId,
    req.params.requestId,
    vendorId,
    notes,
  );
  await audit(req, "ASSIGN", "service_requests", {
    targetId: req.params.requestId,
    targetModel: "ServiceRequest",
    metadata: { vendorId },
  });
  return reply.send(successResponse(sr, "Technician force-assigned"));
}

export async function cancelSRController(
  req: FastifyRequest<SRParams>,
  reply: FastifyReply,
) {
  const { reason } = z.object({ reason: z.string().min(5) }).parse(req.body);
  const sr = await cancelServiceRequest(
    req.admin!.userId,
    req.params.requestId,
    reason,
  );
  await audit(req, "CANCEL", "service_requests", {
    targetId: req.params.requestId,
    targetModel: "ServiceRequest",
    metadata: { reason },
  });
  return reply.send(successResponse(sr, "Service request cancelled"));
}

export async function setAdminPriceController(
  req: FastifyRequest<SRParams>,
  reply: FastifyReply,
) {
  const { finalPrice, notes } = z
    .object({
      finalPrice: z.number().positive(),
      notes: z.string(),
    })
    .parse(req.body);

  const sr = await setAdminPricing(
    req.admin!.userId,
    req.params.requestId,
    finalPrice,
    notes,
  );
  await audit(req, "UPDATE", "service_requests", {
    targetId: req.params.requestId,
    targetModel: "ServiceRequest",
    metadata: { finalPrice },
  });
  return reply.send(successResponse(sr, "Admin price set"));
}

export async function slaViolationsController(
  req: FastifyRequest,
  reply: FastifyReply,
) {
  const { region } = z
    .object({ region: z.string().optional() })
    .parse(req.query);
  const violations = await getSlaViolations(region);
  return reply.send(successResponse(violations, "SLA violations fetched"));
}

export async function tagSRController(
  req: FastifyRequest<SRParams>,
  reply: FastifyReply,
) {
  const { tags } = z.object({ tags: z.array(z.string()) }).parse(req.body);
  const sr = await tagServiceRequest(req.params.requestId, tags);
  return reply.send(successResponse(sr, "Tags updated"));
}
