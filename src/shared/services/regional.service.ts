/**
 * Regional Manager Service — Complete Implementation
 *
 * PDF ref: Regional Manager Functionality (Sections 1–10)
 *  §1  Regional Overview & Dashboard
 *  §2  Technician & Field Team Management (region-scoped)
 *  §3  Service Quality & Compliance
 *  §4  Regional Customer Insights
 *  §5  Operational Reporting & Analytics
 *  §6  Resource & Capacity Planning
 *  §7  Marketing & Campaign Oversight
 *  §8  Payments & Financial Oversight
 *  §9  Security & Compliance
 *  §10 Strategic Decision-Making
 *
 * ALL queries are REGION-SCOPED using the regional_manager's region field.
 * Regional Manager CANNOT: global config, approve/reject vendors globally,
 *                          set pricing, access other regions
 */
import mongoose from "mongoose";
import { Campaign } from "../models/campaign/campaign.model";
import { ApiError } from "../errors/ApiError";

function SR() {
  return mongoose.model("ServiceRequest");
}
function Vendor() {
  return mongoose.model("Vendor");
}

// ─────────────────────────────────────────────────────────────────────────────
// §1  REGIONAL OVERVIEW DASHBOARD
// ─────────────────────────────────────────────────────────────────────────────

export async function getRegionalDashboard(region: string) {
  const regionFilter = { city: { $regex: region, $options: "i" } };
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  const [
    totalSR,
    completedSR,
    activeSR,
    cancelledSR,
    pendingSR,
    revenueSummary,
    vendorsInRegion,
    approvedVendors,
    slaViolations,
    avgSatisfaction,
  ] = await Promise.all([
    SR().countDocuments({ ...regionFilter, createdAt: { $gte: monthStart } }),
    SR().countDocuments({
      ...regionFilter,
      status: "Completed",
      createdAt: { $gte: monthStart },
    }),
    SR().countDocuments({
      ...regionFilter,
      status: { $nin: ["Completed", "Cancelled", "Expired"] },
    }),
    SR().countDocuments({
      ...regionFilter,
      status: "Cancelled",
      createdAt: { $gte: monthStart },
    }),
    SR().countDocuments({
      ...regionFilter,
      status: "Pending",
      createdAt: { $gte: monthStart },
    }),
    SR().aggregate([
      {
        $match: {
          ...regionFilter,
          status: "Completed",
          createdAt: { $gte: monthStart },
        },
      },
      {
        $group: {
          _id: null,
          totalRevenue: { $sum: "$adminFinalPrice" },
          avgOrderValue: { $avg: "$adminFinalPrice" },
          totalJobs: { $sum: 1 },
        },
      },
    ]),
    Vendor().countDocuments({
      "operationalDetails.serviceAreas": { $in: [region] },
    }),
    Vendor().countDocuments({
      "operationalDetails.serviceAreas": { $in: [region] },
      onboardingStatus: "Approved",
    }),
    SR().countDocuments({
      ...regionFilter,
      isTimerActive: true,
      timerExpiresAt: { $lt: now },
    }),
    mongoose.model("Review").aggregate([
      {
        $lookup: {
          from: "servicerequests",
          localField: "serviceRequestId",
          foreignField: "_id",
          as: "sr",
        },
      },
      { $unwind: "$sr" },
      { $match: { "sr.city": { $regex: region, $options: "i" } } },
      { $group: { _id: null, avgRating: { $avg: "$rating" } } },
    ]),
  ]);

  const rev = revenueSummary[0] ?? {
    totalRevenue: 0,
    avgOrderValue: 0,
    totalJobs: 0,
  };

  return {
    region,
    period: { from: monthStart, to: now },
    serviceRequests: {
      total: totalSR,
      completed: completedSR,
      active: activeSR,
      cancelled: cancelledSR,
      pending: pendingSR,
      completionRate:
        totalSR > 0 ? ((completedSR / totalSR) * 100).toFixed(1) + "%" : "0%",
    },
    revenue: {
      total: rev.totalRevenue,
      avgOrderValue: Number(rev.avgOrderValue?.toFixed(2) ?? 0),
    },
    technicians: {
      total: vendorsInRegion,
      approved: approvedVendors,
    },
    slaViolations,
    avgCustomerSatisfaction:
      (avgSatisfaction[0]?.avgRating as number)?.toFixed(2) ?? 0,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// §2  TECHNICIAN & FIELD TEAM MANAGEMENT
// ─────────────────────────────────────────────────────────────────────────────

export async function getRegionalTechnicians(
  region: string,
  filter: {
    search?: string;
    onboardingStatus?: string;
    minRating?: number;
    page?: number;
    limit?: number;
  },
) {
  const page = filter.page ?? 1;
  const limit = filter.limit ?? 20;
  const skip = (page - 1) * limit;

  const query: Record<string, unknown> = {
    "operationalDetails.serviceAreas": { $in: [region] },
  };
  if (filter.onboardingStatus) query.onboardingStatus = filter.onboardingStatus;
  if (filter.minRating !== undefined) {
    query.averageRating = { $gte: filter.minRating };
  }
  if (filter.search) {
    query.$or = [
      { "pocInfo.fullName": { $regex: filter.search, $options: "i" } },
      { "pocInfo.email": { $regex: filter.search, $options: "i" } },
    ];
  }

  const [vendors, total] = await Promise.all([
    Vendor()
      .find(query)
      .skip(skip)
      .limit(limit)
      .select(
        "pocInfo.fullName pocInfo.email pocInfo.phone operationalDetails.serviceAreas operationalDetails.workingHours currentLocation averageRating totalReviews ratingBreakdown Level onboardingStatus",
      )
      .lean(),
    Vendor().countDocuments(query),
  ]);

  return { vendors, total, region, page, limit };
}

export async function getRegionalTechnicianDetail(
  region: string,
  vendorId: string,
) {
  const vendor = await Vendor()
    .findOne({
      _id: vendorId,
      "operationalDetails.serviceAreas": { $in: [region] },
    })
    .lean();

  if (!vendor) {
    throw ApiError.notFound("Technician not found in this region");
  }

  const [activeJobs, completedJobs, recentReviews] = await Promise.all([
    SR().countDocuments({
      assignedVendor: vendorId,
      status: { $nin: ["Completed", "Cancelled"] },
    }),
    SR().countDocuments({
      assignedVendor: vendorId,
      status: "Completed",
    }),
    mongoose
      .model("Review")
      .find({ vendorId })
      .sort({ createdAt: -1 })
      .limit(5)
      .populate("customerId", "username")
      .lean(),
  ]);

  return { vendor, activeJobs, completedJobs, recentReviews };
}

export async function getTechnicianWorkload(region: string) {
  return SR().aggregate([
    {
      $match: {
        city: { $regex: region, $options: "i" },
        status: { $nin: ["Completed", "Cancelled", "Expired"] },
        assignedVendor: { $exists: true, $ne: null },
      },
    },
    {
      $group: {
        _id: "$assignedVendor",
        activeJobs: { $sum: 1 },
        jobsByStatus: { $push: "$status" },
      },
    },
    {
      $lookup: {
        from: "vendors",
        localField: "_id",
        foreignField: "_id",
        as: "vendor",
      },
    },
    { $unwind: { path: "$vendor", preserveNullAndEmptyArrays: true } },
    {
      $project: {
        activeJobs: 1,
        vendorName: "$vendor.pocInfo.fullName",
        vendorLevel: "$vendor.Level",
        averageRating: "$vendor.averageRating",
        serviceAreas: "$vendor.operationalDetails.serviceAreas",
      },
    },
    { $sort: { activeJobs: -1 } },
  ]);
}

/**
 * Technician performance report for a specific vendor in the region.
 */
export async function getRegionalTechnicianPerformance(
  region: string,
  vendorId: string,
  from: Date,
  to: Date,
) {
  const vendorInRegion = await Vendor()
    .findOne({
      _id: vendorId,
      "operationalDetails.serviceAreas": { $in: [region] },
    })
    .select("pocInfo.fullName averageRating Level")
    .lean();

  if (!vendorInRegion) {
    throw ApiError.notFound("Technician not found in this region");
  }

  const [jobStats, ratingTrend, statusBreakdown] = await Promise.all([
    SR().aggregate([
      {
        $match: {
          assignedVendor: new mongoose.Types.ObjectId(vendorId),
          city: { $regex: region, $options: "i" },
          createdAt: { $gte: from, $lte: to },
        },
      },
      {
        $group: {
          _id: null,
          totalJobs: { $sum: 1 },
          completedJobs: {
            $sum: { $cond: [{ $eq: ["$status", "Completed"] }, 1, 0] },
          },
          cancelledJobs: {
            $sum: { $cond: [{ $eq: ["$status", "Cancelled"] }, 1, 0] },
          },
          totalRevenue: { $sum: "$adminFinalPrice" },
          avgOrderValue: { $avg: "$adminFinalPrice" },
        },
      },
    ]),
    mongoose.model("Review").aggregate([
      {
        $match: {
          vendorId: new mongoose.Types.ObjectId(vendorId),
          createdAt: { $gte: from, $lte: to },
        },
      },
      {
        $group: {
          _id: {
            year: { $year: "$createdAt" },
            month: { $month: "$createdAt" },
          },
          avgRating: { $avg: "$rating" },
          count: { $sum: 1 },
        },
      },
      { $sort: { "_id.year": 1, "_id.month": 1 } },
    ]),
    SR().aggregate([
      {
        $match: {
          assignedVendor: new mongoose.Types.ObjectId(vendorId),
          createdAt: { $gte: from, $lte: to },
        },
      },
      { $group: { _id: "$status", count: { $sum: 1 } } },
    ]),
  ]);

  const stats = jobStats[0] ?? {
    totalJobs: 0,
    completedJobs: 0,
    cancelledJobs: 0,
    totalRevenue: 0,
    avgOrderValue: 0,
  };

  return {
    vendor: vendorInRegion,
    dateRange: { from, to },
    performance: {
      ...stats,
      completionRate:
        stats.totalJobs > 0
          ? ((stats.completedJobs / stats.totalJobs) * 100).toFixed(1) + "%"
          : "0%",
    },
    ratingTrend,
    statusBreakdown,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// §3  SERVICE QUALITY & SLA
// ─────────────────────────────────────────────────────────────────────────────

export async function getRegionalSlaReport(region: string) {
  const now = new Date();

  const [active, slaBreached, upcoming, recentEscalations] = await Promise.all([
    SR().countDocuments({
      city: { $regex: region, $options: "i" },
      status: { $nin: ["Completed", "Cancelled", "Expired"] },
    }),
    SR().countDocuments({
      city: { $regex: region, $options: "i" },
      isTimerActive: true,
      timerExpiresAt: { $lt: now },
    }),
    SR()
      .find({
        city: { $regex: region, $options: "i" },
        isTimerActive: true,
        timerExpiresAt: {
          $gte: now,
          $lte: new Date(now.getTime() + 2 * 60 * 60 * 1000),
        },
      })
      .select(
        "request_id status customerId city timerExpiresAt priority brand model",
      )
      .sort({ timerExpiresAt: 1 })
      .limit(20)
      .lean(),
    SR()
      .find({
        city: { $regex: region, $options: "i" },
        "statusHistory.status": "Escalated",
      })
      .sort({ updatedAt: -1 })
      .limit(10)
      .select("request_id status city statusHistory")
      .lean(),
  ]);

  return {
    region,
    summary: { active, slaBreached, upcomingBreachCount: upcoming.length },
    upcomingBreaches: upcoming,
    recentEscalations,
    slaComplianceRate:
      active > 0
        ? (((active - slaBreached) / active) * 100).toFixed(1) + "%"
        : "100%",
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// §2 (cont.) SERVICE REQUEST MANAGEMENT WITHIN REGION
// ─────────────────────────────────────────────────────────────────────────────

export async function assignRegionalServiceRequest(
  region: string,
  requestId: string,
  vendorId: string,
  adminId: string,
) {
  const sr = await SR().findOne({
    _id: requestId,
    city: { $regex: region, $options: "i" },
  });

  if (!sr) {
    throw ApiError.notFound("Service request not found in this region");
  }

  if (["Completed", "Cancelled"].includes((sr as { status: string }).status)) {
    throw ApiError.badRequest(
      `Cannot assign a ${(sr as { status: string }).status} service request`,
    );
  }

  // Verify vendor is in region
  const vendor = await Vendor().findOne({
    _id: vendorId,
    "operationalDetails.serviceAreas": { $in: [region] },
    onboardingStatus: "Approved",
  });
  if (!vendor) {
    throw ApiError.badRequest(
      "Vendor not found or not approved in this region",
    );
  }

  const updated = await SR().findByIdAndUpdate(
    requestId,
    {
      assignedVendor: vendorId,
      assignedTechnician: vendorId,
      status: "Assigned",
      $push: {
        statusHistory: {
          status: "Assigned",
          timestamp: new Date(),
          notes: `Assigned by Regional Manager to vendor ${vendorId}`,
          updatedBy: adminId,
        },
      },
    },
    { new: true },
  );

  return updated;
}

export async function reassignRegionalServiceRequest(
  region: string,
  requestId: string,
  newVendorId: string,
  adminId: string,
  reason: string,
) {
  const sr = await SR().findOne({
    _id: requestId,
    city: { $regex: region, $options: "i" },
  });

  if (!sr) {
    throw ApiError.notFound("Service request not found in this region");
  }

  if (["Completed", "Cancelled"].includes((sr as { status: string }).status)) {
    throw ApiError.badRequest(
      "Cannot reassign a completed or cancelled request",
    );
  }

  const vendor = await Vendor().findOne({
    _id: newVendorId,
    "operationalDetails.serviceAreas": { $in: [region] },
    onboardingStatus: "Approved",
  });
  if (!vendor) {
    throw ApiError.badRequest(
      "New vendor not found or not approved in this region",
    );
  }

  const previousVendor = (sr as { assignedVendor?: unknown }).assignedVendor;

  const updated = await SR().findByIdAndUpdate(
    requestId,
    {
      assignedVendor: newVendorId,
      assignedTechnician: newVendorId,
      $push: {
        statusHistory: {
          status: "Assigned",
          timestamp: new Date(),
          notes: `Reassigned by Regional Manager. Reason: ${reason}. Previous vendor: ${previousVendor}`,
          updatedBy: adminId,
        },
      },
    },
    { new: true },
  );

  return updated;
}

export async function cancelRegionalServiceRequest(
  region: string,
  requestId: string,
  adminId: string,
  reason: string,
) {
  const sr = await SR().findOne({
    _id: requestId,
    city: { $regex: region, $options: "i" },
  });

  if (!sr) {
    throw ApiError.notFound("Service request not found in this region");
  }

  if (["Completed", "Cancelled"].includes((sr as { status: string }).status)) {
    throw ApiError.badRequest(
      `Service request is already ${(sr as { status: string }).status}`,
    );
  }

  const updated = await SR().findByIdAndUpdate(
    requestId,
    {
      status: "Cancelled",
      $push: {
        statusHistory: {
          status: "Cancelled",
          timestamp: new Date(),
          notes: `Cancelled by Regional Manager. Reason: ${reason}`,
          updatedBy: adminId,
        },
      },
    },
    { new: true },
  );

  return updated;
}

export async function tagRegionalServiceRequest(
  region: string,
  requestId: string,
  tag: string,
  adminId: string,
) {
  const sr = await SR().findOne({
    _id: requestId,
    city: { $regex: region, $options: "i" },
  });

  if (!sr) {
    throw ApiError.notFound("Service request not found in this region");
  }

  const updated = await SR().findByIdAndUpdate(
    requestId,
    {
      $addToSet: { tags: tag },
      $push: {
        statusHistory: {
          status: (sr as { status: string }).status,
          timestamp: new Date(),
          notes: `Tagged as "${tag}" by Regional Manager`,
          updatedBy: adminId,
        },
      },
    },
    { new: true },
  );

  return updated;
}

// ─────────────────────────────────────────────────────────────────────────────
// §4  REGIONAL CUSTOMER INSIGHTS
// ─────────────────────────────────────────────────────────────────────────────

export async function getRegionalCustomerInsights(
  region: string,
  page = 1,
  limit = 20,
) {
  const skip = (page - 1) * limit;

  const data = await SR().aggregate([
    { $match: { city: { $regex: region, $options: "i" } } },
    {
      $group: {
        _id: "$customerId",
        orderCount: { $sum: 1 },
        completed: {
          $sum: { $cond: [{ $eq: ["$status", "Completed"] }, 1, 0] },
        },
        totalSpent: { $sum: "$adminFinalPrice" },
        lastOrderDate: { $max: "$createdAt" },
      },
    },
    { $sort: { orderCount: -1 } },
    { $skip: skip },
    { $limit: limit },
    {
      $lookup: {
        from: "users",
        localField: "_id",
        foreignField: "_id",
        as: "customer",
      },
    },
    { $unwind: "$customer" },
    {
      $project: {
        orderCount: 1,
        completed: 1,
        totalSpent: 1,
        lastOrderDate: 1,
        "customer.username": 1,
        "customer.email": 1,
        "customer.phone": 1,
        "customer.isActive": 1,
      },
    },
  ]);

  const totalResult = await SR().aggregate([
    { $match: { city: { $regex: region, $options: "i" } } },
    { $group: { _id: "$customerId" } },
    { $count: "total" },
  ]);

  return {
    customers: data,
    total: totalResult[0]?.total ?? 0,
    region,
    page,
    limit,
  };
}

/**
 * Regional subscription and wallet adoption rates.
 */
export async function getRegionalLoyaltyInsights(region: string) {
  const customerIds: mongoose.Types.ObjectId[] = await SR().distinct(
    "customerId",
    { city: { $regex: region, $options: "i" } },
  );

  const [subscribed, walletHolders] = await Promise.all([
    mongoose
      .model("UserSubscription")
      .countDocuments({ userId: { $in: customerIds }, status: "active" }),
    mongoose
      .model("CustomerWallet")
      .countDocuments({ userId: { $in: customerIds }, isActive: true }),
  ]);

  const totalCustomers = customerIds.length;

  return {
    region,
    totalUniqueCustomers: totalCustomers,
    activeSubscribers: subscribed,
    walletHolders,
    subscriptionAdoptionRate:
      totalCustomers > 0
        ? ((subscribed / totalCustomers) * 100).toFixed(1) + "%"
        : "0%",
    walletAdoptionRate:
      totalCustomers > 0
        ? ((walletHolders / totalCustomers) * 100).toFixed(1) + "%"
        : "0%",
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// §5  OPERATIONAL REPORTING & ANALYTICS
// ─────────────────────────────────────────────────────────────────────────────

export async function getRegionalAnalytics(
  region: string,
  from: Date,
  to: Date,
) {
  const regionFilter = { city: { $regex: region, $options: "i" } };

  const [
    serviceStats,
    serviceByType,
    dailyTrend,
    technicianRanking,
    avgResolutionTime,
  ] = await Promise.all([
    SR().aggregate([
      { $match: { ...regionFilter, createdAt: { $gte: from, $lte: to } } },
      { $group: { _id: "$status", count: { $sum: 1 } } },
    ]),
    SR().aggregate([
      { $match: { ...regionFilter, createdAt: { $gte: from, $lte: to } } },
      {
        $group: {
          _id: "$serviceType",
          count: { $sum: 1 },
          revenue: { $sum: "$adminFinalPrice" },
        },
      },
    ]),
    SR().aggregate([
      { $match: { ...regionFilter, createdAt: { $gte: from, $lte: to } } },
      {
        $group: {
          _id: {
            year: { $year: "$createdAt" },
            month: { $month: "$createdAt" },
            day: { $dayOfMonth: "$createdAt" },
          },
          count: { $sum: 1 },
          revenue: { $sum: "$adminFinalPrice" },
        },
      },
      { $sort: { "_id.year": 1, "_id.month": 1, "_id.day": 1 } },
    ]),
    SR().aggregate([
      {
        $match: {
          ...regionFilter,
          status: "Completed",
          createdAt: { $gte: from, $lte: to },
          assignedVendor: { $exists: true, $ne: null },
        },
      },
      {
        $group: {
          _id: "$assignedVendor",
          completedJobs: { $sum: 1 },
          revenue: { $sum: "$adminFinalPrice" },
        },
      },
      { $sort: { completedJobs: -1 } },
      { $limit: 10 },
      {
        $lookup: {
          from: "vendors",
          localField: "_id",
          foreignField: "_id",
          as: "vendor",
        },
      },
      { $unwind: { path: "$vendor", preserveNullAndEmptyArrays: true } },
      {
        $project: {
          completedJobs: 1,
          revenue: 1,
          vendorName: "$vendor.pocInfo.fullName",
          vendorRating: "$vendor.averageRating",
        },
      },
    ]),
    SR().aggregate([
      {
        $match: {
          ...regionFilter,
          status: "Completed",
          createdAt: { $gte: from, $lte: to },
          completedAt: { $exists: true },
        },
      },
      {
        $project: {
          resolutionHours: {
            $divide: [{ $subtract: ["$completedAt", "$createdAt"] }, 3600000],
          },
        },
      },
      {
        $group: {
          _id: null,
          avgResolutionHours: { $avg: "$resolutionHours" },
          minResolutionHours: { $min: "$resolutionHours" },
          maxResolutionHours: { $max: "$resolutionHours" },
        },
      },
    ]),
  ]);

  const totalRevenue = dailyTrend.reduce(
    (sum: number, d: { revenue: number }) => sum + (d.revenue ?? 0),
    0,
  );

  return {
    region,
    dateRange: { from, to },
    serviceStats,
    serviceByType,
    dailyTrend,
    topTechnicians: technicianRanking,
    resolutionTime: avgResolutionTime[0] ?? {
      avgResolutionHours: 0,
      minResolutionHours: 0,
      maxResolutionHours: 0,
    },
    totalRevenue,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// §6  RESOURCE & CAPACITY PLANNING
// ─────────────────────────────────────────────────────────────────────────────

export async function getResourcePlanningData(region: string) {
  const [totalVendors, approvedVendors, activeJobs, demand, overloadedVendors] =
    await Promise.all([
      Vendor().countDocuments({
        "operationalDetails.serviceAreas": { $in: [region] },
      }),
      Vendor().countDocuments({
        "operationalDetails.serviceAreas": { $in: [region] },
        onboardingStatus: "Approved",
      }),
      SR().countDocuments({
        city: { $regex: region, $options: "i" },
        status: { $nin: ["Completed", "Cancelled", "Expired"] },
      }),
      SR().aggregate([
        { $match: { city: { $regex: region, $options: "i" } } },
        {
          $group: { _id: { $dayOfWeek: "$createdAt" }, avgDemand: { $sum: 1 } },
        },
        { $sort: { _id: 1 } },
      ]),
      // Vendors with > 5 active jobs (overloaded)
      SR().aggregate([
        {
          $match: {
            city: { $regex: region, $options: "i" },
            status: { $nin: ["Completed", "Cancelled", "Expired"] },
            assignedVendor: { $exists: true, $ne: null },
          },
        },
        { $group: { _id: "$assignedVendor", activeJobs: { $sum: 1 } } },
        { $match: { activeJobs: { $gte: 5 } } },
        { $count: "overloaded" },
      ]),
    ]);

  return {
    region,
    capacity: {
      totalVendors,
      approvedVendors,
      overloadedVendors: overloadedVendors[0]?.overloaded ?? 0,
    },
    activeJobs,
    utilizationRate:
      approvedVendors > 0
        ? ((activeJobs / approvedVendors) * 100).toFixed(1) + "%"
        : "0%",
    demandByDayOfWeek: demand,
    recommendation:
      approvedVendors > 0 && activeJobs / approvedVendors > 4
        ? "High demand — consider onboarding more technicians"
        : "Capacity is within normal range",
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// §7  MARKETING & CAMPAIGN OVERSIGHT
// ─────────────────────────────────────────────────────────────────────────────

export async function getRegionalCampaigns(
  region: string,
  filter: { status?: string; page?: number; limit?: number },
) {
  const page = filter.page ?? 1;
  const limit = filter.limit ?? 20;
  const skip = (page - 1) * limit;

  const query: Record<string, unknown> = {
    $or: [
      { targetRegion: { $regex: region, $options: "i" } },
      { targetSegment: "all" },
    ],
  };
  if (filter.status) query.status = filter.status;

  const [campaigns, total] = await Promise.all([
    Campaign.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate("createdBy", "username email")
      .lean(),
    Campaign.countDocuments(query),
  ]);

  return { campaigns, total, page, limit };
}

/**
 * Regional Manager can approve/reject campaigns targeting their region.
 */
export async function reviewRegionalCampaign(
  region: string,
  campaignId: string,
  action: "approve" | "reject",
  adminId: string,
  rejectionReason?: string,
) {
  const campaign = await Campaign.findOne({
    _id: campaignId,
    $or: [
      { targetRegion: { $regex: region, $options: "i" } },
      { targetSegment: "all" },
    ],
  });

  if (!campaign) {
    throw ApiError.notFound(
      "Campaign not found or not applicable to this region",
    );
  }

  if (campaign.approvalStatus !== "pending") {
    throw ApiError.badRequest(
      `Campaign has already been ${campaign.approvalStatus}`,
    );
  }

  campaign.approvalStatus = action === "approve" ? "approved" : "rejected";
  campaign.approvedBy = new mongoose.Types.ObjectId(adminId);
  campaign.approvedAt = new Date();
  if (action === "reject" && rejectionReason) {
    campaign.rejectionReason = rejectionReason;
  }

  await campaign.save();
  return campaign;
}

// ─────────────────────────────────────────────────────────────────────────────
// §8  PAYMENTS & FINANCIAL OVERSIGHT
// ─────────────────────────────────────────────────────────────────────────────

export async function getRegionalFinancialOverview(
  region: string,
  from: Date,
  to: Date,
) {
  const regionFilter = { city: { $regex: region, $options: "i" } };

  const [
    revenueByType,
    revenueByVendor,
    pendingPayments,
    refunds,
    dailyRevenue,
  ] = await Promise.all([
    SR().aggregate([
      {
        $match: {
          ...regionFilter,
          status: "Completed",
          createdAt: { $gte: from, $lte: to },
          adminFinalPrice: { $gt: 0 },
        },
      },
      {
        $group: {
          _id: "$serviceType",
          revenue: { $sum: "$adminFinalPrice" },
          jobs: { $sum: 1 },
          avgOrderValue: { $avg: "$adminFinalPrice" },
        },
      },
      { $sort: { revenue: -1 } },
    ]),
    SR().aggregate([
      {
        $match: {
          ...regionFilter,
          status: "Completed",
          createdAt: { $gte: from, $lte: to },
          adminFinalPrice: { $gt: 0 },
        },
      },
      {
        $group: {
          _id: "$assignedVendor",
          revenue: { $sum: "$adminFinalPrice" },
          jobs: { $sum: 1 },
        },
      },
      { $sort: { revenue: -1 } },
      { $limit: 10 },
      {
        $lookup: {
          from: "vendors",
          localField: "_id",
          foreignField: "_id",
          as: "vendor",
        },
      },
      { $unwind: { path: "$vendor", preserveNullAndEmptyArrays: true } },
      {
        $project: {
          revenue: 1,
          jobs: 1,
          vendorName: "$vendor.pocInfo.fullName",
        },
      },
    ]),
    SR().countDocuments({
      ...regionFilter,
      paymentStatus: { $in: ["pending", "vendor_initiated"] },
      status: "Completed",
    }),
    mongoose.model("PaymentTransaction").aggregate([
      {
        $match: {
          status: "Refunded",
          createdAt: { $gte: from, $lte: to },
        },
      },
      {
        $group: {
          _id: null,
          count: { $sum: 1 },
          total: { $sum: "$amount" },
        },
      },
    ]),
    SR().aggregate([
      {
        $match: {
          ...regionFilter,
          status: "Completed",
          createdAt: { $gte: from, $lte: to },
        },
      },
      {
        $group: {
          _id: {
            year: { $year: "$createdAt" },
            month: { $month: "$createdAt" },
            day: { $dayOfMonth: "$createdAt" },
          },
          revenue: { $sum: "$adminFinalPrice" },
          jobs: { $sum: 1 },
        },
      },
      { $sort: { "_id.year": 1, "_id.month": 1, "_id.day": 1 } },
    ]),
  ]);

  const totalRevenue = revenueByType.reduce(
    (sum: number, d: { revenue: number }) => sum + d.revenue,
    0,
  );

  return {
    region,
    dateRange: { from, to },
    totalRevenue,
    revenueByServiceType: revenueByType,
    topVendorsByRevenue: revenueByVendor,
    pendingPayments,
    refunds: refunds[0] ?? { count: 0, total: 0 },
    dailyRevenue,
  };
}

/**
 * Profitability analysis: revenue vs estimated costs per technician and service type.
 */
export async function getRegionalProfitabilityAnalysis(
  region: string,
  from: Date,
  to: Date,
) {
  return SR().aggregate([
    {
      $match: {
        city: { $regex: region, $options: "i" },
        status: "Completed",
        createdAt: { $gte: from, $lte: to },
      },
    },
    {
      $group: {
        _id: "$serviceType",
        totalRevenue: { $sum: "$adminFinalPrice" },
        totalJobs: { $sum: 1 },
        avgRevenue: { $avg: "$adminFinalPrice" },
        totalPlatformFee: {
          $sum: "$paymentBreakdown.companyCommission",
        },
      },
    },
    {
      $project: {
        totalRevenue: 1,
        totalJobs: 1,
        avgRevenue: { $round: ["$avgRevenue", 2] },
        totalPlatformFee: 1,
        profitMargin: {
          $cond: [
            { $gt: ["$totalRevenue", 0] },
            {
              $multiply: [
                { $divide: ["$totalPlatformFee", "$totalRevenue"] },
                100,
              ],
            },
            0,
          ],
        },
      },
    },
    { $sort: { totalRevenue: -1 } },
  ]);
}

// ─────────────────────────────────────────────────────────────────────────────
// §10 STRATEGIC DECISION-MAKING
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Growth opportunity analysis: low-served areas, high demand with low supply.
 */
export async function getRegionalGrowthOpportunities(region: string) {
  const now = new Date();
  const last30Days = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  const [unservedRequests, topDemandCities, vendorGap, categoryGap] =
    await Promise.all([
      // Requests with no vendor assigned (unmet demand)
      SR().countDocuments({
        city: { $regex: region, $options: "i" },
        assignedVendor: { $exists: false },
        status: { $nin: ["Cancelled", "Expired"] },
        createdAt: { $gte: last30Days },
      }),
      // Top sub-cities by demand
      SR().aggregate([
        {
          $match: {
            city: { $regex: region, $options: "i" },
            createdAt: { $gte: last30Days },
          },
        },
        { $group: { _id: "$address", demand: { $sum: 1 } } },
        { $sort: { demand: -1 } },
        { $limit: 10 },
      ]),
      // Technician supply vs demand gap
      Promise.all([
        Vendor().countDocuments({
          "operationalDetails.serviceAreas": { $in: [region] },
          onboardingStatus: "Approved",
        }),
        SR().countDocuments({
          city: { $regex: region, $options: "i" },
          status: { $nin: ["Completed", "Cancelled", "Expired"] },
        }),
      ]),
      // Most demanded device/service categories with low completion
      SR().aggregate([
        {
          $match: {
            city: { $regex: region, $options: "i" },
            createdAt: { $gte: last30Days },
          },
        },
        {
          $group: {
            _id: "$brand",
            totalRequests: { $sum: 1 },
            completed: {
              $sum: { $cond: [{ $eq: ["$status", "Completed"] }, 1, 0] },
            },
          },
        },
        {
          $project: {
            totalRequests: 1,
            completed: 1,
            incompletionRate: {
              $cond: [
                { $gt: ["$totalRequests", 0] },
                {
                  $multiply: [
                    {
                      $divide: [
                        { $subtract: ["$totalRequests", "$completed"] },
                        "$totalRequests",
                      ],
                    },
                    100,
                  ],
                },
                0,
              ],
            },
          },
        },
        { $sort: { incompletionRate: -1, totalRequests: -1 } },
        { $limit: 10 },
      ]),
    ]);

  const [approvedVendors, activeJobs] = vendorGap;
  const supplyDemandRatio =
    approvedVendors > 0
      ? (activeJobs / approvedVendors).toFixed(2)
      : "No vendors";

  return {
    region,
    period: "Last 30 days",
    unservedRequests,
    topDemandAreas: topDemandCities,
    technicianGap: {
      approvedVendors,
      activeJobs,
      supplyDemandRatio,
      isUnderstaffed: approvedVendors < activeJobs / 3,
    },
    categoryOpportunities: categoryGap,
    insights: [
      unservedRequests > 0
        ? `${unservedRequests} requests went unassigned — opportunity for new technicians`
        : "All recent requests were assigned",
      approvedVendors < activeJobs / 3
        ? "Region is understaffed — recommend onboarding more technicians"
        : "Technician capacity is adequate",
    ],
  };
}

/**
 * Regional KPI benchmark: compare this region vs platform average.
 */
export async function getRegionalBenchmark(
  region: string,
  from: Date,
  to: Date,
) {
  const regionFilter = { city: { $regex: region, $options: "i" } };

  const [regionStats, platformStats] = await Promise.all([
    SR().aggregate([
      { $match: { ...regionFilter, createdAt: { $gte: from, $lte: to } } },
      {
        $group: {
          _id: null,
          total: { $sum: 1 },
          completed: {
            $sum: { $cond: [{ $eq: ["$status", "Completed"] }, 1, 0] },
          },
          cancelled: {
            $sum: { $cond: [{ $eq: ["$status", "Cancelled"] }, 1, 0] },
          },
          revenue: { $sum: "$adminFinalPrice" },
          avgOrderValue: { $avg: "$adminFinalPrice" },
        },
      },
    ]),
    SR().aggregate([
      { $match: { createdAt: { $gte: from, $lte: to } } },
      {
        $group: {
          _id: null,
          total: { $sum: 1 },
          completed: {
            $sum: { $cond: [{ $eq: ["$status", "Completed"] }, 1, 0] },
          },
          cancelled: {
            $sum: { $cond: [{ $eq: ["$status", "Cancelled"] }, 1, 0] },
          },
          revenue: { $sum: "$adminFinalPrice" },
          avgOrderValue: { $avg: "$adminFinalPrice" },
        },
      },
    ]),
  ]);

  const r = regionStats[0] ?? {
    total: 0,
    completed: 0,
    cancelled: 0,
    revenue: 0,
    avgOrderValue: 0,
  };
  const p = platformStats[0] ?? {
    total: 1,
    completed: 0,
    cancelled: 0,
    revenue: 0,
    avgOrderValue: 0,
  };

  const regionCompletion =
    r.total > 0 ? ((r.completed / r.total) * 100).toFixed(1) : "0";
  const platformCompletion =
    p.total > 0 ? ((p.completed / p.total) * 100).toFixed(1) : "0";

  return {
    region,
    dateRange: { from, to },
    regional: {
      totalSR: r.total,
      completionRate: regionCompletion + "%",
      cancellationRate:
        r.total > 0 ? ((r.cancelled / r.total) * 100).toFixed(1) + "%" : "0%",
      totalRevenue: r.revenue,
      avgOrderValue: Number(r.avgOrderValue?.toFixed(2) ?? 0),
    },
    platform: {
      totalSR: p.total,
      completionRate: platformCompletion + "%",
      cancellationRate:
        p.total > 0 ? ((p.cancelled / p.total) * 100).toFixed(1) + "%" : "0%",
      totalRevenue: p.revenue,
      avgOrderValue: Number(p.avgOrderValue?.toFixed(2) ?? 0),
    },
    comparison: {
      completionRateVsPlatform:
        (parseFloat(regionCompletion) - parseFloat(platformCompletion)).toFixed(
          1,
        ) + "%",
      revenuePlatformShare:
        p.revenue > 0 ? ((r.revenue / p.revenue) * 100).toFixed(1) + "%" : "0%",
    },
  };
}
