/**
 * Admin Payment, Wallet & Financial Management Service
 *
 * PDF ref: Admin End Functionality — Section 6
 * - Track all transactions (payments, refunds, wallet credits, deductions)
 * - Manage customer wallet balances and manual adjustments
 * - Configure payment gateways and supported payment methods
 * - Generate invoices, credit notes, and refund reports
 * - Manage technician payouts, settlement cycles, earnings reports
 * - Detect and flag suspicious or failed transactions
 */
import mongoose from "mongoose";
import { CustomerWallet } from "../../models/payment/customerWallet.model";
import { ApiError } from "../../errors/ApiError";

function PT() {
  return mongoose.model("PaymentTransaction");
}

function SR() {
  return mongoose.model("SettlementRequest");
}

export interface TransactionFilter {
  status?: string;
  paymentMethod?: string;
  from?: Date;
  to?: Date;
  customerId?: string;
  vendorId?: string;
  flagged?: boolean;
  page?: number;
  limit?: number;
}

export async function listTransactions(filter: TransactionFilter) {
  const page = filter.page ?? 1;
  const limit = filter.limit ?? 20;
  const skip = (page - 1) * limit;

  const query: Record<string, unknown> = {};

  if (filter.status) query.status = filter.status;
  if (filter.paymentMethod) query.paymentMethod = filter.paymentMethod;
  if (filter.customerId) query.customerId = filter.customerId;
  if (filter.vendorId) query.vendorId = filter.vendorId;

  if (filter.from || filter.to) {
    query.createdAt = {};
    if (filter.from)
      (query.createdAt as Record<string, Date>).$gte = filter.from;
    if (filter.to) (query.createdAt as Record<string, Date>).$lte = filter.to;
  }

  const [transactions, total] = await Promise.all([
    PT()
      .find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate("customerId", "username email")
      .populate("vendorId", "pocInfo.fullName")
      .lean(),
    PT().countDocuments(query),
  ]);

  return { transactions, total, page, limit };
}

export async function getFinancialSummary(from?: Date, to?: Date) {
  const dateFilter =
    from || to
      ? { createdAt: { ...(from && { $gte: from }), ...(to && { $lte: to }) } }
      : {};

  const [summary, byStatus] = await Promise.all([
    PT().aggregate([
      { $match: { status: "Completed", ...dateFilter } },
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
    PT().aggregate([
      { $match: dateFilter },
      {
        $group: {
          _id: "$status",
          count: { $sum: 1 },
          total: { $sum: "$amount" },
        },
      },
    ]),
  ]);

  return {
    summary: summary[0] ?? {
      totalRevenue: 0,
      totalPlatformFee: 0,
      totalVendorEarnings: 0,
      count: 0,
    },
    byStatus,
  };
}

export async function processRefund(
  adminId: string,
  transactionId: string,
  reason: string,
) {
  const tx = await PT().findByIdAndUpdate(
    transactionId,
    {
      $set: {
        status: "Refunded",
        refundedAt: new Date(),
        refundReason: reason,
        vendorNotes: `Refunded by admin ${adminId}`,
      },
    },
    { new: true },
  );
  if (!tx) throw ApiError.notFound("Transaction not found");
  return tx;
}

export async function listSettlementRequests(
  status?: string,
  page = 1,
  limit = 20,
) {
  const skip = (page - 1) * limit;
  const query = status ? { status } : {};

  const [settlements, total] = await Promise.all([
    SR()
      .find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate("technicianId", "pocInfo.fullName pocInfo.email")
      .lean(),
    SR().countDocuments(query),
  ]);

  return { settlements, total };
}

export async function approveSettlement(
  adminId: string,
  settlementId: string,
  transactionRef?: string,
) {
  const settlement = await SR().findByIdAndUpdate(
    settlementId,
    {
      $set: {
        status: "approved",
        approvedBy: adminId,
        approvedAt: new Date(),
        transactionReference: transactionRef,
      },
    },
    { new: true },
  );
  if (!settlement) throw ApiError.notFound("Settlement request not found");
  return settlement;
}

export async function rejectSettlement(
  adminId: string,
  settlementId: string,
  reason: string,
) {
  const settlement = await SR().findByIdAndUpdate(
    settlementId,
    {
      $set: {
        status: "rejected",
        rejectedBy: adminId,
        rejectedAt: new Date(),
        rejectionReason: reason,
      },
    },
    { new: true },
  );
  if (!settlement) throw ApiError.notFound("Settlement request not found");
  return settlement;
}

export async function flagSuspiciousTransaction(
  transactionId: string,
  reason: string,
) {
  const tx = await PT().findByIdAndUpdate(
    transactionId,
    {
      $set: {
        fraudScore: 100,
        customerNotes: `FLAGGED: ${reason}`,
      },
    },
    { new: true },
  );
  if (!tx) throw ApiError.notFound("Transaction not found");
  return tx;
}
