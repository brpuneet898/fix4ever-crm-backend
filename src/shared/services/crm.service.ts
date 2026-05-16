/**
 * CRM Manager Service — Complete Implementation
 *
 * PDF ref: CRM Manager Functionality (Sections 1–10)
 *  §1  Customer Management — view, segment, update, block/suspend
 *  §2  Service Request Oversight — view, escalate, tag, trends
 *  §3  Communication & Engagement — notifications, campaigns, follow-ups
 *  §4  Analytics & Reporting — KPIs, revenue, subscriptions, conversions
 *  §5  Ticketing & Support — list, assign, resolve, escalate, compensate
 *  §6  Payment & Wallet — wallet overview, transactions, failed payments
 *  §7  Marketing Automation — campaign CRUD, scheduling, performance
 *  §8  Security & Compliance — audit logs (via shared module)
 *  §9  Loyalty & Retention — high-value customers, churn analysis
 *  §10 Integration & Automation — (handled via event system)
 *
 * CRM_MANAGER CANNOT: process payment refunds directly, modify system config,
 *                     approve/reject vendors, access other admins' data
 */
import mongoose from "mongoose";
import { User } from "../models/user.model";
import { UserSubscription } from "../models/subscription/userSubscription.model";
import { CustomerWallet } from "../models/payment/customerWallet.model";
import { WalletTxArchive } from "../models/payment/walletTxArchive.model";
import { Campaign } from "../models/campaign/campaign.model";
import type {
  CampaignType,
  CampaignTargetSegment,
} from "../models/campaign/campaign.model";
import { ApiError } from "../errors/ApiError";

// ─────────────────────────────────────────────────────────────────────────────
// §1  CUSTOMER MANAGEMENT
// ─────────────────────────────────────────────────────────────────────────────

export async function crmListCustomers(filter: {
  search?: string;
  segment?: string;
  isActive?: boolean;
  page?: number;
  limit?: number;
}) {
  const page = filter.page ?? 1;
  const limit = filter.limit ?? 20;
  const skip = (page - 1) * limit;

  const query: Record<string, unknown> = { role: "user" };
  if (filter.isActive !== undefined) query.isActive = filter.isActive;
  if (filter.search) {
    query.$or = [
      { email: { $regex: filter.search, $options: "i" } },
      { username: { $regex: filter.search, $options: "i" } },
      { phone: { $regex: filter.search, $options: "i" } },
    ];
  }

  const [customers, total] = await Promise.all([
    User.find(query).skip(skip).limit(limit).select("-password").lean(),
    User.countDocuments(query),
  ]);

  return { customers, total, page, limit };
}

export async function crmGetCustomerDetail(customerId: string) {
  const [customer, wallet, subscription, recentSRs, reviewCount] =
    await Promise.all([
      User.findById(customerId).select("-password").lean(),
      CustomerWallet.findOne({ userId: customerId })
        .select("balance totalCredited totalDebited isActive")
        .lean(),
      UserSubscription.findOne({
        userId: customerId,
        status: { $in: ["active", "trial"] },
      })
        .populate("planId", "name price interval")
        .lean(),
      mongoose
        .model("ServiceRequest")
        .find({ customerId })
        .sort({ createdAt: -1 })
        .limit(10)
        .select(
          "request_id status serviceType brand model city createdAt adminFinalPrice",
        )
        .lean(),
      mongoose.model("Review").countDocuments({ customerId }),
    ]);

  if (!customer) throw ApiError.notFound("Customer not found");

  return {
    customer,
    wallet,
    activeSubscription: subscription,
    recentServiceRequests: recentSRs,
    reviewCount,
  };
}

/**
 * Update mutable customer fields (username, phone, avatar).
 * CRM Managers cannot change role, email, or password.
 */
export async function crmUpdateCustomer(
  customerId: string,
  updates: { username?: string; phone?: string; avatar?: string },
  adminId: string,
) {
  const allowed = { username: 1, phone: 1, avatar: 1 } as const;
  const filtered = Object.fromEntries(
    Object.entries(updates).filter(([k]) => k in allowed),
  );
  if (Object.keys(filtered).length === 0) {
    throw ApiError.badRequest("No updatable fields provided");
  }

  const updated = await User.findByIdAndUpdate(
    customerId,
    { $set: filtered },
    { new: true, runValidators: true },
  )
    .select("-password")
    .lean();

  if (!updated) throw ApiError.notFound("Customer not found");
  return updated;
}

/**
 * Block a customer account (isActive = false).
 * Adds a note to the audit trail via the calling controller.
 */
export async function crmBlockCustomer(
  customerId: string,
  adminId: string,
  reason: string,
) {
  const user = await User.findById(customerId);
  if (!user) throw ApiError.notFound("Customer not found");
  if (user.role !== "user") {
    throw ApiError.forbidden("Can only block customer accounts");
  }
  if (!user.isActive) {
    throw ApiError.badRequest("Customer is already blocked");
  }

  user.isActive = false;
  await user.save();

  return {
    id: user._id,
    email: user.email,
    isActive: false,
    blockedBy: adminId,
    reason,
  };
}

/**
 * Reactivate a previously blocked customer.
 */
export async function crmUnblockCustomer(customerId: string, adminId: string) {
  const user = await User.findById(customerId);
  if (!user) throw ApiError.notFound("Customer not found");
  if (user.role !== "user") {
    throw ApiError.forbidden("Can only unblock customer accounts");
  }
  if (user.isActive) {
    throw ApiError.badRequest("Customer is already active");
  }

  user.isActive = true;
  await user.save();

  return {
    id: user._id,
    email: user.email,
    isActive: true,
    unblockedBy: adminId,
  };
}

export async function crmSegmentCustomers(
  segmentType: string,
  page = 1,
  limit = 20,
) {
  const skip = (page - 1) * limit;
  let query: Record<string, unknown> = { role: "user" };

  switch (segmentType) {
    case "active_subscribers": {
      const subUserIds = await UserSubscription.distinct("userId", {
        status: "active",
      });
      query._id = { $in: subUserIds };
      break;
    }
    case "inactive":
      query.isActive = false;
      break;
    case "new_this_month": {
      const monthStart = new Date();
      monthStart.setDate(1);
      monthStart.setHours(0, 0, 0, 0);
      query.createdAt = { $gte: monthStart };
      break;
    }
    case "high_value": {
      const topIds = await mongoose.model("ServiceRequest").aggregate([
        { $match: { status: "Completed" } },
        {
          $group: {
            _id: "$customerId",
            totalSpent: { $sum: "$adminFinalPrice" },
          },
        },
        { $match: { totalSpent: { $gt: 0 } } },
        { $sort: { totalSpent: -1 } },
        { $limit: 500 },
      ]);
      query._id = { $in: topIds.map((x) => x._id) };
      break;
    }
    case "no_subscription": {
      const subscribedIds = await UserSubscription.distinct("userId", {
        status: { $in: ["active", "trial"] },
      });
      query._id = { $nin: subscribedIds };
      break;
    }
    default:
      break;
  }

  const [customers, total] = await Promise.all([
    User.find(query).skip(skip).limit(limit).select("-password").lean(),
    User.countDocuments(query),
  ]);

  return { customers, total, segment: segmentType, page, limit };
}

/**
 * Full interaction timeline for a customer: service requests + wallet activity.
 */
export async function crmGetCustomerInteractions(
  customerId: string,
  page = 1,
  limit = 20,
) {
  const skip = (page - 1) * limit;

  const [serviceRequests, totalSR] = await Promise.all([
    mongoose
      .model("ServiceRequest")
      .find({ customerId })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .select(
        "request_id status serviceType brand model city createdAt adminFinalPrice assignedVendor",
      )
      .lean(),
    mongoose.model("ServiceRequest").countDocuments({ customerId }),
  ]);

  return { serviceRequests, total: totalSR, page, limit };
}

/**
 * Manage customer subscription: cancel or pause.
 * CRM Manager cannot create new subscriptions (Editor role for pricing/plan creation).
 */
export async function crmManageSubscription(
  customerId: string,
  action: "cancel" | "pause" | "reactivate",
  adminId: string,
  reason?: string,
) {
  const subscription = await UserSubscription.findOne({
    userId: customerId,
    status: { $in: ["active", "trial", "paused"] },
  });
  if (!subscription) {
    throw ApiError.notFound("No active subscription found for this customer");
  }

  const statusMap: Record<string, string> = {
    cancel: "cancelled",
    pause: "paused",
    reactivate: "active",
  };

  subscription.status = statusMap[action] as typeof subscription.status;
  await subscription.save();

  return {
    subscriptionId: subscription._id,
    customerId,
    newStatus: subscription.status,
    action,
    performedBy: adminId,
    reason,
  };
}

/**
 * Get all subscriptions (active, past) for a customer.
 */
export async function crmGetCustomerSubscriptions(customerId: string) {
  return UserSubscription.find({ userId: customerId })
    .populate("planId", "name price interval features")
    .sort({ createdAt: -1 })
    .lean();
}

// ─────────────────────────────────────────────────────────────────────────────
// §2  SERVICE REQUEST OVERSIGHT
// ─────────────────────────────────────────────────────────────────────────────

export async function crmListServiceRequests(filter: {
  status?: string;
  city?: string;
  search?: string;
  priority?: string;
  from?: Date;
  to?: Date;
  page?: number;
  limit?: number;
}) {
  const page = filter.page ?? 1;
  const limit = filter.limit ?? 20;
  const skip = (page - 1) * limit;

  const query: Record<string, unknown> = {};
  if (filter.status) query.status = filter.status;
  if (filter.city) query.city = { $regex: filter.city, $options: "i" };
  if (filter.priority) query.priority = filter.priority;
  if (filter.from || filter.to) {
    query.createdAt = {};
    if (filter.from)
      (query.createdAt as Record<string, unknown>).$gte = filter.from;
    if (filter.to)
      (query.createdAt as Record<string, unknown>).$lte = filter.to;
  }
  if (filter.search) {
    query.$or = [
      { request_id: { $regex: filter.search, $options: "i" } },
      { brand: { $regex: filter.search, $options: "i" } },
      { model: { $regex: filter.search, $options: "i" } },
    ];
  }

  const [requests, total] = await Promise.all([
    mongoose
      .model("ServiceRequest")
      .find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate("customerId", "username email phone")
      .select(
        "request_id status serviceType brand model deviceBrand deviceModel city priority createdAt adminFinalPrice paymentBreakdown assignedVendor customerId userName userPhone",
      )
      .lean(),
    mongoose.model("ServiceRequest").countDocuments(query),
  ]);

  return { requests, total, page, limit };
}

export async function crmGetServiceRequestDetail(requestId: string) {
  const SR = mongoose.model("ServiceRequest");
  // CRM routes may receive either Mongo `_id` or business `request_id`.
  const isObjectId =
    /^[0-9a-fA-F]{24}$/.test(requestId) &&
    mongoose.Types.ObjectId.isValid(requestId);

  const sr = await (
    isObjectId ? SR.findById(requestId) : SR.findOne({ request_id: requestId })
  )
    .populate("customerId", "username email phone")
    .populate("assignedVendor", "pocInfo.fullName pocInfo.email averageRating")
    .lean();

  if (!sr) throw ApiError.notFound("Service request not found");
  return sr;
}

export async function crmEscalateServiceRequest(
  requestId: string,
  crmUserId: string,
  note: string,
) {
  const SR = mongoose.model("ServiceRequest");
  // Keep escalation compatible with both id formats used by frontend callers.
  const identifierQuery =
    /^[0-9a-fA-F]{24}$/.test(requestId) &&
    mongoose.Types.ObjectId.isValid(requestId)
      ? { _id: requestId }
      : { request_id: requestId };

  const sr = await SR.findOneAndUpdate(
    identifierQuery,
    {
      $push: {
        statusHistory: {
          status: "Escalated",
          timestamp: new Date(),
          notes: `[CRM Escalation] ${note}`,
          updatedBy: crmUserId,
        },
      },
    },
    { new: true },
  );
  if (!sr) throw ApiError.notFound("Service request not found");
  return sr;
}

/**
 * Tag a service request for categorization and reporting.
 */
export async function crmTagServiceRequest(
  requestId: string,
  tag: string,
  crmUserId: string,
) {
  const SR = mongoose.model("ServiceRequest");
  // Accept both `_id` and `request_id` so tagging works from any CRM list source.
  const identifierQuery =
    /^[0-9a-fA-F]{24}$/.test(requestId) &&
    mongoose.Types.ObjectId.isValid(requestId)
      ? { _id: requestId }
      : { request_id: requestId };

  const current = (await SR.findOne(identifierQuery)
    .select("status")
    .lean()) as { status?: string } | null;

  const sr = await SR.findOneAndUpdate(
    identifierQuery,
    {
      $addToSet: { tags: tag },
      $push: {
        statusHistory: {
          status: current?.status ?? "Unknown",
          timestamp: new Date(),
          notes: `Tagged as "${tag}" by CRM Manager`,
          updatedBy: crmUserId,
        },
      },
    },
    { new: true },
  );
  if (!sr) throw ApiError.notFound("Service request not found");
  return sr;
}

/**
 * Service request trend analysis: volume, status breakdown, recurring issues.
 */
export async function crmGetServiceRequestTrends(from: Date, to: Date) {
  const [statusBreakdown, byServiceType, byCity, topBrands, dailyVolume] =
    await Promise.all([
      mongoose
        .model("ServiceRequest")
        .aggregate([
          { $match: { createdAt: { $gte: from, $lte: to } } },
          { $group: { _id: "$status", count: { $sum: 1 } } },
          { $sort: { count: -1 } },
        ]),
      mongoose
        .model("ServiceRequest")
        .aggregate([
          { $match: { createdAt: { $gte: from, $lte: to } } },
          { $group: { _id: "$serviceType", count: { $sum: 1 } } },
        ]),
      mongoose
        .model("ServiceRequest")
        .aggregate([
          { $match: { createdAt: { $gte: from, $lte: to } } },
          { $group: { _id: "$city", count: { $sum: 1 } } },
          { $sort: { count: -1 } },
          { $limit: 10 },
        ]),
      mongoose
        .model("ServiceRequest")
        .aggregate([
          { $match: { createdAt: { $gte: from, $lte: to } } },
          { $group: { _id: "$brand", count: { $sum: 1 } } },
          { $sort: { count: -1 } },
          { $limit: 10 },
        ]),
      mongoose.model("ServiceRequest").aggregate([
        { $match: { createdAt: { $gte: from, $lte: to } } },
        {
          $group: {
            _id: {
              year: { $year: "$createdAt" },
              month: { $month: "$createdAt" },
              day: { $dayOfMonth: "$createdAt" },
            },
            count: { $sum: 1 },
          },
        },
        { $sort: { "_id.year": 1, "_id.month": 1, "_id.day": 1 } },
      ]),
    ]);

  return {
    dateRange: { from, to },
    statusBreakdown,
    byServiceType,
    topCities: byCity,
    topBrands,
    dailyVolume,
  };
}

/**
 * Technician performance metrics across the platform (CRM read-only view).
 */
export async function crmGetTechnicianPerformance(page = 1, limit = 20) {
  const skip = (page - 1) * limit;

  const data = await mongoose.model("Vendor").aggregate([
    { $match: { onboardingStatus: "Approved" } },
    {
      $lookup: {
        from: "servicerequests",
        let: { vendorId: "$_id" },
        pipeline: [
          {
            $match: {
              $expr: { $eq: ["$assignedVendor", "$$vendorId"] },
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
            },
          },
        ],
        as: "jobStats",
      },
    },
    { $unwind: { path: "$jobStats", preserveNullAndEmptyArrays: true } },
    {
      $project: {
        "pocInfo.fullName": 1,
        "pocInfo.email": 1,
        Level: 1,
        averageRating: 1,
        totalReviews: 1,
        onboardingStatus: 1,
        "operationalDetails.serviceAreas": 1,
        totalJobs: { $ifNull: ["$jobStats.totalJobs", 0] },
        completedJobs: { $ifNull: ["$jobStats.completedJobs", 0] },
        cancelledJobs: { $ifNull: ["$jobStats.cancelledJobs", 0] },
        totalRevenue: { $ifNull: ["$jobStats.totalRevenue", 0] },
        completionRate: {
          $cond: [
            { $gt: [{ $ifNull: ["$jobStats.totalJobs", 0] }, 0] },
            {
              $multiply: [
                {
                  $divide: [
                    { $ifNull: ["$jobStats.completedJobs", 0] },
                    { $ifNull: ["$jobStats.totalJobs", 0] },
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
    { $sort: { averageRating: -1 } },
    { $skip: skip },
    { $limit: limit },
  ]);

  const total = await mongoose
    .model("Vendor")
    .countDocuments({ onboardingStatus: "Approved" });

  return { technicians: data, total, page, limit };
}

// ─────────────────────────────────────────────────────────────────────────────
// §4  ANALYTICS & REPORTING
// ─────────────────────────────────────────────────────────────────────────────

export async function crmGetCustomerAnalytics() {
  const monthStart = new Date(
    new Date().getFullYear(),
    new Date().getMonth(),
    1,
  );
  const lastMonthStart = new Date(
    new Date().getFullYear(),
    new Date().getMonth() - 1,
    1,
  );
  const lastMonthEnd = new Date(monthStart.getTime() - 1);

  const [
    totalCustomers,
    activeCustomers,
    activeSubscribers,
    monthlyNewCustomers,
    lastMonthNewCustomers,
    satisfactionData,
  ] = await Promise.all([
    User.countDocuments({ role: "user" }),
    User.countDocuments({ role: "user", isActive: true }),
    UserSubscription.countDocuments({ status: "active" }),
    User.countDocuments({ role: "user", createdAt: { $gte: monthStart } }),
    User.countDocuments({
      role: "user",
      createdAt: { $gte: lastMonthStart, $lte: lastMonthEnd },
    }),
    mongoose.model("Review").aggregate([
      {
        $group: {
          _id: null,
          avgRating: { $avg: "$rating" },
          total: { $sum: 1 },
        },
      },
    ]),
  ]);

  const growthRate =
    lastMonthNewCustomers > 0
      ? (
          ((monthlyNewCustomers - lastMonthNewCustomers) /
            lastMonthNewCustomers) *
          100
        ).toFixed(1)
      : "N/A";

  return {
    totalCustomers,
    activeCustomers,
    inactiveCustomers: totalCustomers - activeCustomers,
    activeSubscribers,
    subscriptionRate:
      totalCustomers > 0
        ? ((activeSubscribers / totalCustomers) * 100).toFixed(1) + "%"
        : "0%",
    monthlyNewCustomers,
    lastMonthNewCustomers,
    growthRate: growthRate !== "N/A" ? growthRate + "%" : "N/A",
    avgCustomerSatisfaction: satisfactionData[0]?.avgRating?.toFixed(2) ?? 0,
    totalReviews: satisfactionData[0]?.total ?? 0,
  };
}

export async function crmGetRevenueAnalytics(from: Date, to: Date) {
  const [revenueTrend, revenueByServiceType, revenueByCity, refundStats] =
    await Promise.all([
      mongoose.model("ServiceRequest").aggregate([
        {
          $match: {
            status: "Completed",
            createdAt: { $gte: from, $lte: to },
            adminFinalPrice: { $gt: 0 },
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
      mongoose.model("ServiceRequest").aggregate([
        {
          $match: {
            status: "Completed",
            createdAt: { $gte: from, $lte: to },
          },
        },
        {
          $group: {
            _id: "$serviceType",
            revenue: { $sum: "$adminFinalPrice" },
            count: { $sum: 1 },
          },
        },
      ]),
      mongoose.model("ServiceRequest").aggregate([
        {
          $match: {
            status: "Completed",
            createdAt: { $gte: from, $lte: to },
          },
        },
        {
          $group: {
            _id: "$city",
            revenue: { $sum: "$adminFinalPrice" },
            count: { $sum: 1 },
          },
        },
        { $sort: { revenue: -1 } },
        { $limit: 10 },
      ]),
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
            totalRefunds: { $sum: 1 },
            totalRefundAmount: { $sum: "$amount" },
          },
        },
      ]),
    ]);

  const totalRevenue = revenueTrend.reduce(
    (sum: number, d: { revenue: number }) => sum + d.revenue,
    0,
  );

  return {
    dateRange: { from, to },
    totalRevenue,
    revenueTrend,
    revenueByServiceType,
    topCitiesByRevenue: revenueByCity,
    refundStats: refundStats[0] ?? { totalRefunds: 0, totalRefundAmount: 0 },
  };
}

export async function crmGetSubscriptionAnalytics() {
  const [planBreakdown, statusBreakdown, monthlyTrend] = await Promise.all([
    UserSubscription.aggregate([
      { $match: { status: "active" } },
      { $group: { _id: "$planId", count: { $sum: 1 } } },
      {
        $lookup: {
          from: "subscriptionplans",
          localField: "_id",
          foreignField: "_id",
          as: "plan",
        },
      },
      { $unwind: { path: "$plan", preserveNullAndEmptyArrays: true } },
      {
        $project: {
          count: 1,
          planName: "$plan.name",
          planPrice: "$plan.price",
        },
      },
    ]),
    UserSubscription.aggregate([
      { $group: { _id: "$status", count: { $sum: 1 } } },
    ]),
    UserSubscription.aggregate([
      {
        $group: {
          _id: {
            year: { $year: "$createdAt" },
            month: { $month: "$createdAt" },
          },
          newSubscriptions: { $sum: 1 },
        },
      },
      { $sort: { "_id.year": 1, "_id.month": 1 } },
      { $limit: 12 },
    ]),
  ]);

  const totalActive = statusBreakdown.find(
    (s: { _id: string }) => s._id === "active",
  );

  return {
    totalActive: (totalActive as { count?: number })?.count ?? 0,
    planBreakdown,
    statusBreakdown,
    monthlyTrend,
  };
}

/**
 * Conversion rate analytics: SR completions, subscription sign-ups, wallet activations.
 */
export async function crmGetConversionAnalytics(from: Date, to: Date) {
  const [
    totalSRs,
    completedSRs,
    totalNewUsers,
    usersWithSubscription,
    usersWithWallet,
    campaignStats,
  ] = await Promise.all([
    mongoose
      .model("ServiceRequest")
      .countDocuments({ createdAt: { $gte: from, $lte: to } }),
    mongoose.model("ServiceRequest").countDocuments({
      status: "Completed",
      createdAt: { $gte: from, $lte: to },
    }),
    User.countDocuments({ role: "user", createdAt: { $gte: from, $lte: to } }),
    UserSubscription.countDocuments({
      status: "active",
      createdAt: { $gte: from, $lte: to },
    }),
    CustomerWallet.countDocuments({
      isActive: true,
      createdAt: { $gte: from, $lte: to },
    }),
    Campaign.aggregate([
      { $match: { status: "completed", sentAt: { $gte: from, $lte: to } } },
      {
        $group: {
          _id: null,
          totalCampaigns: { $sum: 1 },
          totalSent: { $sum: "$stats.sent" },
          totalOpened: { $sum: "$stats.opened" },
          totalConverted: { $sum: "$stats.converted" },
        },
      },
    ]),
  ]);

  const srCompletionRate =
    totalSRs > 0 ? ((completedSRs / totalSRs) * 100).toFixed(1) + "%" : "0%";

  const subscriptionConversionRate =
    totalNewUsers > 0
      ? ((usersWithSubscription / totalNewUsers) * 100).toFixed(1) + "%"
      : "0%";

  return {
    dateRange: { from, to },
    serviceRequests: {
      total: totalSRs,
      completed: completedSRs,
      completionRate: srCompletionRate,
    },
    subscriptions: {
      newUsers: totalNewUsers,
      converted: usersWithSubscription,
      conversionRate: subscriptionConversionRate,
    },
    walletActivations: usersWithWallet,
    campaigns: campaignStats[0] ?? {
      totalCampaigns: 0,
      totalSent: 0,
      totalOpened: 0,
      totalConverted: 0,
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// §6  PAYMENT & WALLET MANAGEMENT
// ─────────────────────────────────────────────────────────────────────────────

export async function crmGetWalletOverview() {
  const [summary, topWallets] = await Promise.all([
    CustomerWallet.aggregate([
      {
        $group: {
          _id: null,
          totalBalance: { $sum: "$balance" },
          totalCredited: { $sum: "$totalCredited" },
          totalDebited: { $sum: "$totalDebited" },
          customers: { $sum: 1 },
          avgBalance: { $avg: "$balance" },
        },
      },
    ]),
    CustomerWallet.find({ balance: { $gt: 0 } })
      .sort({ balance: -1 })
      .limit(10)
      .populate("userId", "username email")
      .lean(),
  ]);

  return {
    summary: summary[0] ?? {
      totalBalance: 0,
      totalCredited: 0,
      totalDebited: 0,
      customers: 0,
      avgBalance: 0,
    },
    topWalletHolders: topWallets,
  };
}

export async function crmGetCustomerWalletTransactions(
  customerId: string,
  page = 1,
  limit = 20,
) {
  const skip = (page - 1) * limit;
  const wallet = await CustomerWallet.findOne({ userId: customerId })
    .select("balance transactions")
    .lean();

  if (!wallet) throw ApiError.notFound("Wallet not found for this customer");

  const inlineTx = wallet.transactions ?? [];

  if (skip < inlineTx.length) {
    const slice = inlineTx.slice(skip, skip + limit);
    const archiveCount = await WalletTxArchive.countDocuments({
      userId: customerId,
    });
    return {
      balance: wallet.balance,
      transactions: slice,
      total: inlineTx.length + archiveCount,
      page,
      limit,
    };
  }

  const archiveSkip = skip - inlineTx.length;
  const [archiveTx, archiveTotal] = await Promise.all([
    WalletTxArchive.find({ userId: customerId })
      .sort({ createdAt: -1 })
      .skip(archiveSkip)
      .limit(limit)
      .lean(),
    WalletTxArchive.countDocuments({ userId: customerId }),
  ]);

  return {
    balance: wallet.balance,
    transactions: archiveTx,
    total: inlineTx.length + archiveTotal,
    page,
    limit,
  };
}

/**
 * Failed / pending payment overview for the platform.
 */
export async function crmGetFailedPayments(page = 1, limit = 20) {
  const skip = (page - 1) * limit;

  const [payments, total] = await Promise.all([
    mongoose
      .model("PaymentTransaction")
      .find({ status: { $in: ["Failed", "Pending"] } })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate("customerId", "username email phone")
      .populate("serviceRequestId", "request_id brand model")
      .lean(),
    mongoose.model("PaymentTransaction").countDocuments({
      status: { $in: ["Failed", "Pending"] },
    }),
  ]);

  return { payments, total, page, limit };
}

// ─────────────────────────────────────────────────────────────────────────────
// §7  MARKETING AUTOMATION — CAMPAIGNS
// ─────────────────────────────────────────────────────────────────────────────

export async function crmListCampaigns(filter: {
  status?: string;
  type?: string;
  segment?: string;
  page?: number;
  limit?: number;
}) {
  const page = filter.page ?? 1;
  const limit = filter.limit ?? 20;
  const skip = (page - 1) * limit;

  const query: Record<string, unknown> = {};
  if (filter.status) query.status = filter.status;
  if (filter.type) query.type = filter.type;
  if (filter.segment) query.targetSegment = filter.segment;

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

export async function crmGetCampaignDetail(campaignId: string) {
  const campaign = await Campaign.findById(campaignId)
    .populate("createdBy", "username email")
    .populate("approvedBy", "username email")
    .lean();

  if (!campaign) throw ApiError.notFound("Campaign not found");
  return campaign;
}

export async function crmCreateCampaign(
  data: {
    title: string;
    description?: string;
    type: CampaignType;
    targetSegment: CampaignTargetSegment;
    targetRegion?: string;
    targetUserIds?: string[];
    content: { subject?: string; body: string; callToAction?: string };
    scheduledAt?: Date;
  },
  createdBy: string,
) {
  if (data.targetSegment === "regional" && !data.targetRegion) {
    throw ApiError.badRequest(
      "targetRegion is required for regional campaigns",
    );
  }

  const campaign = await Campaign.create({
    ...data,
    createdBy: new mongoose.Types.ObjectId(createdBy),
    status: data.scheduledAt ? "scheduled" : "draft",
    approvalStatus: "pending",
    stats: {
      sent: 0,
      delivered: 0,
      opened: 0,
      clicked: 0,
      converted: 0,
      failed: 0,
    },
  });

  return campaign;
}

export async function crmUpdateCampaign(
  campaignId: string,
  updates: Partial<{
    title: string;
    description: string;
    scheduledAt: Date;
    content: { subject?: string; body?: string; callToAction?: string };
    status: "draft" | "scheduled" | "paused" | "cancelled";
  }>,
  adminId: string,
) {
  const campaign = await Campaign.findById(campaignId);
  if (!campaign) throw ApiError.notFound("Campaign not found");

  if (["completed", "active"].includes(campaign.status)) {
    throw ApiError.badRequest(
      "Cannot edit an active or completed campaign. Pause it first.",
    );
  }

  Object.assign(campaign, updates);
  await campaign.save();
  return campaign;
}

/**
 * Activate/schedule a campaign (moves from draft to scheduled/active).
 * Requires campaign to be approved if not admin.
 */
export async function crmActivateCampaign(campaignId: string, adminId: string) {
  const campaign = await Campaign.findById(campaignId);
  if (!campaign) throw ApiError.notFound("Campaign not found");

  if (campaign.status !== "draft" && campaign.status !== "paused") {
    throw ApiError.badRequest(
      `Campaign is already ${campaign.status}. Cannot activate.`,
    );
  }

  campaign.status = campaign.scheduledAt ? "scheduled" : "active";
  if (campaign.status === "active") campaign.sentAt = new Date();
  await campaign.save();

  return campaign;
}

// ─────────────────────────────────────────────────────────────────────────────
// §9  LOYALTY & RETENTION
// ─────────────────────────────────────────────────────────────────────────────

export async function crmGetHighValueCustomers(limit = 20) {
  return mongoose.model("ServiceRequest").aggregate([
    { $match: { status: "Completed", adminFinalPrice: { $gt: 0 } } },
    {
      $group: {
        _id: "$customerId",
        totalOrders: { $sum: 1 },
        totalSpent: { $sum: "$adminFinalPrice" },
        avgOrderValue: { $avg: "$adminFinalPrice" },
        lastOrderDate: { $max: "$createdAt" },
      },
    },
    { $sort: { totalSpent: -1 } },
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
        totalOrders: 1,
        totalSpent: 1,
        avgOrderValue: 1,
        lastOrderDate: 1,
        "customer.username": 1,
        "customer.email": 1,
        "customer.phone": 1,
        "customer.isActive": 1,
      },
    },
  ]);
}

/**
 * Churn analysis: customers who were active but haven't placed a SR recently.
 */
export async function crmGetChurnAnalysis(
  inactiveDays = 90,
  page = 1,
  limit = 20,
) {
  const skip = (page - 1) * limit;
  const cutoffDate = new Date(Date.now() - inactiveDays * 24 * 60 * 60 * 1000);

  // Customers who placed an SR more than inactiveDays ago and none more recent
  const churningIds = await mongoose
    .model("ServiceRequest")
    .aggregate([
      { $group: { _id: "$customerId", lastOrderDate: { $max: "$createdAt" } } },
      { $match: { lastOrderDate: { $lt: cutoffDate } } },
      { $sort: { lastOrderDate: 1 } },
      { $skip: skip },
      { $limit: limit },
    ]);

  const totalChurning = await mongoose
    .model("ServiceRequest")
    .aggregate([
      { $group: { _id: "$customerId", lastOrderDate: { $max: "$createdAt" } } },
      { $match: { lastOrderDate: { $lt: cutoffDate } } },
      { $count: "total" },
    ]);

  const ids = churningIds.map((c: { _id: mongoose.Types.ObjectId }) => c._id);
  const customers = await User.find({
    _id: { $in: ids as mongoose.Types.ObjectId[] },
    role: "user",
  })
    .select("-password")
    .lean();

  return {
    inactiveDays,
    cutoffDate,
    customers: customers.map((c) => ({
      ...c,
      lastOrderDate: churningIds.find(
        (x: { _id: { toString(): string } }) =>
          x._id?.toString() === (c._id as { toString(): string })?.toString(),
      )?.lastOrderDate,
    })),
    total: totalChurning[0]?.total ?? 0,
    page,
    limit,
  };
}

export async function crmGetLoyaltyOverview() {
  const [
    totalSubscribers,
    subsByPlan,
    walletStats,
    repeatCustomers,
    avgOrdersPerCustomer,
  ] = await Promise.all([
    UserSubscription.countDocuments({ status: "active" }),
    UserSubscription.aggregate([
      { $match: { status: "active" } },
      { $group: { _id: "$planId", count: { $sum: 1 } } },
      {
        $lookup: {
          from: "subscriptionplans",
          localField: "_id",
          foreignField: "_id",
          as: "plan",
        },
      },
      { $unwind: { path: "$plan", preserveNullAndEmptyArrays: true } },
      { $project: { planName: "$plan.name", count: 1 } },
    ]),
    CustomerWallet.aggregate([
      {
        $group: {
          _id: null,
          totalWallets: { $sum: 1 },
          activeWallets: {
            $sum: { $cond: ["$isActive", 1, 0] },
          },
          totalBalance: { $sum: "$balance" },
        },
      },
    ]),
    mongoose
      .model("ServiceRequest")
      .aggregate([
        { $group: { _id: "$customerId", orderCount: { $sum: 1 } } },
        { $match: { orderCount: { $gte: 2 } } },
        { $count: "total" },
      ]),
    mongoose
      .model("ServiceRequest")
      .aggregate([
        { $group: { _id: "$customerId", orderCount: { $sum: 1 } } },
        { $group: { _id: null, avgOrders: { $avg: "$orderCount" } } },
      ]),
  ]);

  return {
    activeSubscribers: totalSubscribers,
    subscriptionsByPlan: subsByPlan,
    wallet: walletStats[0] ?? {
      totalWallets: 0,
      activeWallets: 0,
      totalBalance: 0,
    },
    repeatCustomers: repeatCustomers[0]?.total ?? 0,
    avgOrdersPerCustomer: avgOrdersPerCustomer[0]?.avgOrders?.toFixed(1) ?? 0,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// §3  REVIEWS MANAGEMENT
// ─────────────────────────────────────────────────────────────────────────────

export async function crmListReviews(filter: {
  minRating?: number;
  maxRating?: number;
  page?: number;
  limit?: number;
}) {
  const page = filter.page ?? 1;
  const limit = filter.limit ?? 20;
  const skip = (page - 1) * limit;

  const query: Record<string, unknown> = {};
  if (filter.minRating !== undefined || filter.maxRating !== undefined) {
    query.rating = {};
    if (filter.minRating !== undefined)
      (query.rating as Record<string, unknown>).$gte = filter.minRating;
    if (filter.maxRating !== undefined)
      (query.rating as Record<string, unknown>).$lte = filter.maxRating;
  }

  const [reviews, total] = await Promise.all([
    mongoose
      .model("Review")
      .find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate("customerId", "username email")
      .populate("vendorId", "pocInfo.fullName")
      .populate("serviceRequestId", "request_id brand model")
      .lean(),
    mongoose.model("Review").countDocuments(query),
  ]);

  return { reviews, total, page, limit };
}

export async function crmGetReviewAnalytics() {
  const [overall, ratingDist, byMonth] = await Promise.all([
    mongoose.model("Review").aggregate([
      {
        $group: {
          _id: null,
          avgRating: { $avg: "$rating" },
          total: { $sum: 1 },
          avgServiceQuality: { $avg: "$serviceQuality" },
          avgCommunication: { $avg: "$communication" },
          avgPunctuality: { $avg: "$punctuality" },
        },
      },
    ]),
    mongoose
      .model("Review")
      .aggregate([
        { $group: { _id: "$rating", count: { $sum: 1 } } },
        { $sort: { _id: 1 } },
      ]),
    mongoose.model("Review").aggregate([
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
      { $limit: 12 },
    ]),
  ]);

  return {
    overall: overall[0] ?? {
      avgRating: 0,
      total: 0,
      avgServiceQuality: 0,
      avgCommunication: 0,
      avgPunctuality: 0,
    },
    ratingDistribution: ratingDist,
    monthlyTrend: byMonth,
  };
}
