/**
 * Reports & Analytics Service
 * PDF ref: Admin Section 12 — Reports, Analytics & Insights
 */
import mongoose from "mongoose";

export async function generateRevenueReport(from: Date, to: Date) {
  return mongoose.model("PaymentTransaction").aggregate([
    { $match: { status: "Completed", createdAt: { $gte: from, $lte: to } } },
    {
      $group: {
        _id: { year: { $year: "$createdAt" }, month: { $month: "$createdAt" } },
        totalRevenue: { $sum: "$amount" },
        platformFee: { $sum: "$platformFee" },
        vendorEarnings: { $sum: "$vendorEarnings" },
        transactions: { $sum: 1 },
      },
    },
    { $sort: { "_id.year": 1, "_id.month": 1 } },
  ]);
}

export async function generateServiceReport(
  from: Date,
  to: Date,
  region?: string,
) {
  const match: Record<string, unknown> = {
    createdAt: { $gte: from, $lte: to },
  };
  if (region) match.city = { $regex: region, $options: "i" };

  return mongoose.model("ServiceRequest").aggregate([
    { $match: match },
    {
      $group: {
        _id: "$status",
        count: { $sum: 1 },
      },
    },
  ]);
}

export async function generateTechnicianReport(
  from: Date,
  to: Date,
  region?: string,
) {
  const srMatch: Record<string, unknown> = {
    status: "Completed",
    createdAt: { $gte: from, $lte: to },
  };
  if (region) srMatch.city = { $regex: region, $options: "i" };

  return mongoose.model("ServiceRequest").aggregate([
    { $match: srMatch },
    {
      $group: {
        _id: "$assignedVendor",
        completedJobs: { $sum: 1 },
        totalRevenue: { $sum: "$adminFinalPrice" },
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
        completedJobs: 1,
        totalRevenue: 1,
        vendorName: "$vendor.pocInfo.fullName",
        vendorEmail: "$vendor.pocInfo.email",
        vendorLevel: "$vendor.Level",
        averageRating: "$vendor.averageRating",
      },
    },
    { $sort: { completedJobs: -1 } },
  ]);
}

export async function generateCustomerReport(from: Date, to: Date) {
  return mongoose.model("User").aggregate([
    { $match: { role: "user", createdAt: { $gte: from, $lte: to } } },
    {
      $group: {
        _id: { year: { $year: "$createdAt" }, month: { $month: "$createdAt" } },
        newCustomers: { $sum: 1 },
      },
    },
    { $sort: { "_id.year": 1, "_id.month": 1 } },
  ]);
}

export async function getRegionalReport(from: Date, to: Date) {
  return mongoose.model("ServiceRequest").aggregate([
    { $match: { createdAt: { $gte: from, $lte: to } } },
    {
      $group: {
        _id: "$city",
        total: { $sum: 1 },
        completed: {
          $sum: { $cond: [{ $eq: ["$status", "Completed"] }, 1, 0] },
        },
        cancelled: {
          $sum: { $cond: [{ $eq: ["$status", "Cancelled"] }, 1, 0] },
        },
        urgent: { $sum: { $cond: ["$isUrgent", 1, 0] } },
      },
    },
    { $sort: { total: -1 } },
  ]);
}
