/**
 * Admin Vendor/Technician Management Service
 *
 * PDF ref: Admin End Functionality — Section 3
 * - Onboard with KYC verification
 * - Approve / reject / suspend accounts
 * - Define skill sets, coverage areas
 * - Real-time availability & workload
 * - Manually assign / reassign service requests
 * - Monitor performance metrics
 * - Manage payout structures, commissions, penalties
 * - Send announcements
 */
import mongoose from "mongoose";
import { ApiError } from "../../errors/ApiError";

function Vendor() {
  return mongoose.model("Vendor");
}

function SR() {
  return mongoose.model("ServiceRequest");
}

export interface VendorFilter {
  onboardingStatus?: string;
  serviceAreas?: string;
  search?: string;
  level?: string;
  page?: number;
  limit?: number;
}

export async function listVendors(filter: VendorFilter) {
  const page = filter.page ?? 1;
  const limit = filter.limit ?? 20;
  const skip = (page - 1) * limit;

  const query: Record<string, unknown> = {};

  if (filter.onboardingStatus) query.onboardingStatus = filter.onboardingStatus;
  if (filter.level) query.Level = filter.level;
  if (filter.serviceAreas) {
    query["operationalDetails.serviceAreas"] = { $in: [filter.serviceAreas] };
  }
  if (filter.search) {
    query.$or = [
      { "pocInfo.fullName": { $regex: filter.search, $options: "i" } },
      { "pocInfo.email": { $regex: filter.search, $options: "i" } },
      {
        "businessDetails.businessName": {
          $regex: filter.search,
          $options: "i",
        },
      },
    ];
  }

  const [vendors, total] = await Promise.all([
    Vendor().find(query).skip(skip).limit(limit).lean(),
    Vendor().countDocuments(query),
  ]);

  return { vendors, total, page, limit };
}

export async function getVendorDetail(vendorId: string) {
  if (!mongoose.Types.ObjectId.isValid(vendorId))
    throw ApiError.badRequest("Invalid vendor ID");

  const [vendor, wallet, activeRequests] = await Promise.all([
    Vendor().findById(vendorId).lean(),
    mongoose
      .model("TechnicianWallet")
      .findOne({ technicianId: vendorId })
      .lean(),
    SR().countDocuments({
      assignedVendor: vendorId,
      status: { $nin: ["Completed", "Cancelled"] },
    }),
  ]);

  if (!vendor) throw ApiError.notFound("Vendor not found");
  return { vendor, wallet, activeRequests };
}

export async function approveVendor(
  adminId: string,
  vendorId: string,
  notes?: string,
) {
  const vendor = await Vendor().findByIdAndUpdate(
    vendorId,
    {
      $set: {
        onboardingStatus: "Approved",
        reviewedBy: adminId,
        reviewedAt: new Date(),
        reviewComments: notes ?? "Approved by admin",
        "idVerification.verificationStatus": "Verified",
      },
    },
    { new: true },
  );
  if (!vendor) throw ApiError.notFound("Vendor not found");
  return vendor;
}

export async function rejectVendor(
  adminId: string,
  vendorId: string,
  reason: string,
) {
  const vendor = await Vendor().findByIdAndUpdate(
    vendorId,
    {
      $set: {
        onboardingStatus: "Rejected",
        reviewedBy: adminId,
        reviewedAt: new Date(),
        reviewComments: reason,
        "idVerification.verificationStatus": "Rejected",
      },
    },
    { new: true },
  );
  if (!vendor) throw ApiError.notFound("Vendor not found");
  return vendor;
}

export async function suspendVendor(
  adminId: string,
  vendorId: string,
  reason: string,
) {
  // Suspend = set to Rejected with suspend comment; future: add 'Suspended' status
  const vendor = await Vendor().findByIdAndUpdate(
    vendorId,
    {
      $set: {
        onboardingStatus: "Rejected",
        reviewedBy: adminId,
        reviewedAt: new Date(),
        reviewComments: `SUSPENDED: ${reason}`,
      },
    },
    { new: true },
  );
  if (!vendor) throw ApiError.notFound("Vendor not found");
  return vendor;
}

export async function getVendorPerformance(vendorId: string) {
  const [vendor, completedCount, cancelledCount, avgRating] = await Promise.all(
    [
      Vendor()
        .findById(vendorId)
        .select("averageRating totalReviews ratingBreakdown Level")
        .lean(),
      SR().countDocuments({ assignedVendor: vendorId, status: "Completed" }),
      SR().countDocuments({ assignedVendor: vendorId, status: "Cancelled" }),
      mongoose.model("Review").aggregate([
        { $match: { vendorId: new mongoose.Types.ObjectId(vendorId) } },
        {
          $group: { _id: null, avg: { $avg: "$rating" }, total: { $sum: 1 } },
        },
      ]),
    ],
  );

  return {
    vendorId,
    completedJobs: completedCount,
    cancelledJobs: cancelledCount,
    averageRating: avgRating[0]?.avg ?? 0,
    totalReviews: avgRating[0]?.total ?? 0,
    vendorLevel: (vendor as Record<string, unknown>)?.Level,
  };
}

export async function requestVendorClarification(
  adminId: string,
  vendorId: string,
  message: string,
) {
  const vendor = await Vendor().findByIdAndUpdate(
    vendorId,
    {
      $set: {
        clarificationRequested: true,
        clarificationRequestedAt: new Date(),
        reviewComments: message,
        reviewedBy: adminId,
      },
    },
    { new: true },
  );
  if (!vendor) throw ApiError.notFound("Vendor not found");
  return vendor;
}
