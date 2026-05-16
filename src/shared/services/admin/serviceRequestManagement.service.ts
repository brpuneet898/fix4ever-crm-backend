/**
 * Admin Service Request Management Service
 *
 * PDF ref: Admin End Functionality — Section 4
 * - View all service requests with complete lifecycle
 * - Override system logic to force-assign technicians
 * - Reschedule, cancel, modify on behalf of customers
 * - Handle escalated issues and complaints
 * - Monitor SLA compliance and service delays
 * - Tag and categorize service issues
 */
import mongoose from "mongoose";
import { ApiError } from "../../errors/ApiError";

function SR() {
  return mongoose.model("ServiceRequest");
}

export interface ServiceRequestFilter {
  status?: string;
  city?: string;
  assignedVendor?: string;
  customerId?: string;
  from?: Date;
  to?: Date;
  isUrgent?: boolean;
  search?: string;
  page?: number;
  limit?: number;
}

export async function listServiceRequests(filter: ServiceRequestFilter) {
  const page = filter.page ?? 1;
  const limit = filter.limit ?? 20;
  const skip = (page - 1) * limit;

  const query: Record<string, unknown> = {};

  if (filter.status) query.status = filter.status;
  if (filter.city) query.city = { $regex: filter.city, $options: "i" };
  if (filter.assignedVendor) query.assignedVendor = filter.assignedVendor;
  if (filter.customerId) query.customerId = filter.customerId;
  if (filter.isUrgent) query.isUrgent = true;

  if (filter.from || filter.to) {
    query.createdAt = {};
    if (filter.from)
      (query.createdAt as Record<string, Date>).$gte = filter.from;
    if (filter.to) (query.createdAt as Record<string, Date>).$lte = filter.to;
  }

  if (filter.search) {
    query.$or = [
      { request_id: { $regex: filter.search, $options: "i" } },
      { userName: { $regex: filter.search, $options: "i" } },
      { brand: { $regex: filter.search, $options: "i" } },
    ];
  }

  const [requests, total] = await Promise.all([
    SR()
      .find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate("customerId", "username email phone")
      .populate("assignedVendor", "pocInfo.fullName pocInfo.email")
      .lean(),
    SR().countDocuments(query),
  ]);

  return { requests, total, page, limit };
}

export async function getServiceRequestDetail(requestId: string) {
  const sr = await SR()
    .findById(requestId)
    .populate("customerId", "username email phone")
    .populate("assignedVendor", "pocInfo.fullName pocInfo.email")
    .populate("assignedCaptain", "personalInfo.fullName personalInfo.email")
    .lean();

  if (!sr) throw ApiError.notFound("Service request not found");
  return sr;
}

export async function forceAssignTechnician(
  adminId: string,
  requestId: string,
  vendorId: string,
  notes?: string,
) {
  if (!mongoose.Types.ObjectId.isValid(vendorId))
    throw ApiError.badRequest("Invalid vendor ID");

  const sr = await SR().findByIdAndUpdate(
    requestId,
    {
      $set: {
        assignedVendor: vendorId,
        assignedTechnician: vendorId,
        status: "Assigned",
        adminPricingNotes: notes,
        adminPricingSetBy: adminId,
        adminPricingSetAt: new Date(),
      },
      $push: {
        statusHistory: {
          status: "Assigned",
          timestamp: new Date(),
          notes: `Force-assigned by admin. ${notes ?? ""}`,
          updatedBy: adminId,
        },
      },
    },
    { new: true },
  );

  if (!sr) throw ApiError.notFound("Service request not found");
  return sr;
}

export async function cancelServiceRequest(
  adminId: string,
  requestId: string,
  reason: string,
) {
  const sr = await SR().findByIdAndUpdate(
    requestId,
    {
      $set: { status: "Cancelled" },
      $push: {
        statusHistory: {
          status: "Cancelled",
          timestamp: new Date(),
          notes: `Cancelled by admin: ${reason}`,
          updatedBy: adminId,
        },
      },
    },
    { new: true },
  );
  if (!sr) throw ApiError.notFound("Service request not found");
  return sr;
}

export async function setAdminPricing(
  adminId: string,
  requestId: string,
  finalPrice: number,
  notes: string,
) {
  const sr = await SR().findByIdAndUpdate(
    requestId,
    {
      $set: {
        adminFinalPrice: finalPrice,
        adminPricingNotes: notes,
        adminPricingSetBy: adminId,
        adminPricingSetAt: new Date(),
      },
    },
    { new: true },
  );
  if (!sr) throw ApiError.notFound("Service request not found");
  return sr;
}

export async function getSlaViolations(region?: string) {
  const query: Record<string, unknown> = {
    status: { $nin: ["Completed", "Cancelled"] },
    timerExpiresAt: { $lt: new Date() },
    isTimerActive: true,
  };
  if (region) query.city = { $regex: region, $options: "i" };

  return SR().find(query).sort({ timerExpiresAt: 1 }).lean();
}

export async function tagServiceRequest(requestId: string, tags: string[]) {
  // Tags stored in metadata — future: add tags field to SR model
  const sr = await SR().findByIdAndUpdate(
    requestId,
    { $set: { adminTags: tags } },
    { new: true },
  );
  if (!sr) throw ApiError.notFound("Service request not found");
  return sr;
}
