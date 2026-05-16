/**
 * Admin Dashboard Service
 *
 * PDF ref: Admin End Functionality — Section 1
 * - Centralized dashboard: total service requests, active, completed, cancelled, pending
 * - Real-time platform activity
 * - Daily / weekly / monthly analytics for revenue, services, technicians, customers
 * - KPI configuration
 * - Alerts for abnormal activities
 */
import mongoose from "mongoose";

// We use dynamic model imports to avoid circular dependencies with the legacy models
const ServiceRequest = () => mongoose.model("ServiceRequest");
const User = () => mongoose.model("User");
const PaymentTransaction = () => mongoose.model("PaymentTransaction");
const Vendor = () => mongoose.model("Vendor");
const Captain = () => mongoose.model("Captain");

export type DashboardPeriod = "today" | "week" | "month" | "year" | "custom";

function getPeriodRange(period: DashboardPeriod, from?: Date, to?: Date) {
  const now = new Date();
  let start: Date;
  const end = to ?? now;

  switch (period) {
    case "today":
      start = new Date(
        now.getFullYear(),
        now.getMonth(),
        now.getDate(),
        0,
        0,
        0,
      );
      break;
    case "week":
      start = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      break;
    case "month":
      start = new Date(now.getFullYear(), now.getMonth(), 1);
      break;
    case "year":
      start = new Date(now.getFullYear(), 0, 1);
      break;
    case "custom":
      start = from ?? new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      break;
    default:
      start = new Date(now.getFullYear(), now.getMonth(), 1);
  }

  return { start, end };
}

export async function getDashboardStats(
  period: DashboardPeriod = "month",
  from?: Date,
  to?: Date,
  region?: string,
) {
  const { start, end } = getPeriodRange(period, from, to);
  const SR = ServiceRequest();
  const PT = PaymentTransaction();
  const U = User();
  const V = Vendor();

  const dateFilter = { createdAt: { $gte: start, $lte: end } };
  const regionFilter = region ? { city: region } : {};

  const [
    serviceRequestCounts,
    revenueData,
    newCustomers,
    newVendors,
    pendingSettlements,
  ] = await Promise.all([
    // Service request breakdown
    SR.aggregate([
      { $match: { ...dateFilter, ...regionFilter } },
      { $group: { _id: "$status", count: { $sum: 1 } } },
    ]),
    // Revenue
    PT.aggregate([
      { $match: { ...dateFilter, status: "Completed" } },
      {
        $group: {
          _id: null,
          totalRevenue: { $sum: "$amount" },
          totalPlatformFee: { $sum: "$platformFee" },
          totalVendorEarnings: { $sum: "$vendorEarnings" },
          count: { $sum: 1 },
        },
      },
    ]),
    // New customers
    U.countDocuments({ role: "user", ...dateFilter }),
    // New vendors
    V.countDocuments({ ...dateFilter }),
    // Pending settlements
    mongoose.model("SettlementRequest").countDocuments({ status: "pending" }),
  ]);

  const statusMap: Record<string, number> = {};
  for (const item of serviceRequestCounts) {
    statusMap[item._id as string] = item.count as number;
  }

  const revenue = revenueData[0] ?? {
    totalRevenue: 0,
    totalPlatformFee: 0,
    totalVendorEarnings: 0,
    count: 0,
  };

  const totalSR = Object.values(statusMap).reduce((a, b) => a + b, 0);

  return {
    period,
    dateRange: { from: start, to: end },
    serviceRequests: {
      total: totalSR,
      pending: statusMap["Pending"] ?? 0,
      active:
        (statusMap["Assigned"] ?? 0) +
        (statusMap["In Progress"] ?? 0) +
        (statusMap["Repair Started"] ?? 0),
      completed: statusMap["Completed"] ?? 0,
      cancelled: statusMap["Cancelled"] ?? 0,
      statusBreakdown: statusMap,
    },
    revenue: {
      total: revenue.totalRevenue,
      platformFee: revenue.totalPlatformFee,
      vendorEarnings: revenue.totalVendorEarnings,
      transactionCount: revenue.count,
    },
    users: {
      newCustomers,
      newVendors,
    },
    alerts: {
      pendingSettlements,
    },
  };
}

export async function getRevenueAnalytics(
  period: DashboardPeriod,
  from?: Date,
  to?: Date,
) {
  const { start, end } = getPeriodRange(period, from, to);
  const PT = PaymentTransaction();

  const data = await PT.aggregate([
    {
      $match: {
        createdAt: { $gte: start, $lte: end },
        status: "Completed",
      },
    },
    {
      $group: {
        _id: {
          year: { $year: "$createdAt" },
          month: { $month: "$createdAt" },
          day: { $dayOfMonth: "$createdAt" },
        },
        revenue: { $sum: "$amount" },
        platformFee: { $sum: "$platformFee" },
        count: { $sum: 1 },
      },
    },
    { $sort: { "_id.year": 1, "_id.month": 1, "_id.day": 1 } },
  ]);

  return data;
}

export async function getLiveActivityFeed(limit = 20) {
  const SR = ServiceRequest();
  const recent = await SR.find({})
    .sort({ updatedAt: -1 })
    .limit(limit)
    .select("request_id status customerId assignedVendor city updatedAt")
    .populate("customerId", "username email")
    .lean();

  return recent;
}
