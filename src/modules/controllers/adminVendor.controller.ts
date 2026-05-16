import { FastifyRequest, FastifyReply } from "fastify";
import { z } from "zod";
import {
  listVendors,
  getVendorDetail,
  approveVendor,
  rejectVendor,
  suspendVendor,
  getVendorPerformance,
  requestVendorClarification,
} from "../../shared/services/admin";
import {
  successResponse,
  paginatedResponse,
} from "../../shared/utils/response.util";
import { audit } from "../../shared/middleware/audit.middleware";

type VendorParams = { Params: { vendorId: string } };

const vendorFilterSchema = z.object({
  onboardingStatus: z.string().optional(),
  serviceAreas: z.string().optional(),
  search: z.string().optional(),
  level: z.string().optional(),
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(100).default(20),
});

export async function listVendorsController(
  req: FastifyRequest,
  reply: FastifyReply,
) {
  const filter = vendorFilterSchema.parse(req.query);
  const result = await listVendors(filter);
  return reply.send(
    paginatedResponse(
      result.vendors,
      result.total,
      filter.page,
      filter.limit,
      "Vendors fetched",
    ),
  );
}

export async function getVendorController(
  req: FastifyRequest<VendorParams>,
  reply: FastifyReply,
) {
  const data = await getVendorDetail(req.params.vendorId);
  return reply.send(successResponse(data, "Vendor detail fetched"));
}

export async function approveVendorController(
  req: FastifyRequest<VendorParams>,
  reply: FastifyReply,
) {
  const { notes } = z.object({ notes: z.string().optional() }).parse(req.body);
  const vendor = await approveVendor(
    req.admin!.userId,
    req.params.vendorId,
    notes,
  );
  await audit(req, "APPROVE", "vendors", {
    targetId: req.params.vendorId,
    targetModel: "Vendor",
  });
  return reply.send(successResponse(vendor, "Vendor approved"));
}

export async function rejectVendorController(
  req: FastifyRequest<VendorParams>,
  reply: FastifyReply,
) {
  const { reason } = z.object({ reason: z.string().min(5) }).parse(req.body);
  const vendor = await rejectVendor(
    req.admin!.userId,
    req.params.vendorId,
    reason,
  );
  await audit(req, "REJECT", "vendors", {
    targetId: req.params.vendorId,
    targetModel: "Vendor",
    metadata: { reason },
  });
  return reply.send(successResponse(vendor, "Vendor rejected"));
}

export async function suspendVendorController(
  req: FastifyRequest<VendorParams>,
  reply: FastifyReply,
) {
  const { reason } = z.object({ reason: z.string().min(5) }).parse(req.body);
  const vendor = await suspendVendor(
    req.admin!.userId,
    req.params.vendorId,
    reason,
  );
  await audit(req, "SUSPEND", "vendors", {
    targetId: req.params.vendorId,
    targetModel: "Vendor",
    metadata: { reason },
  });
  return reply.send(successResponse(vendor, "Vendor suspended"));
}

export async function vendorPerformanceController(
  req: FastifyRequest<VendorParams>,
  reply: FastifyReply,
) {
  const data = await getVendorPerformance(req.params.vendorId);
  return reply.send(successResponse(data, "Vendor performance fetched"));
}

export async function clarificationController(
  req: FastifyRequest<VendorParams>,
  reply: FastifyReply,
) {
  const { message } = z.object({ message: z.string().min(10) }).parse(req.body);
  const vendor = await requestVendorClarification(
    req.admin!.userId,
    req.params.vendorId,
    message,
  );
  await audit(req, "UPDATE", "vendors", {
    targetId: req.params.vendorId,
    targetModel: "Vendor",
  });
  return reply.send(successResponse(vendor, "Clarification requested"));
}
