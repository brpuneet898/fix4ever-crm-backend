/**
 * Admin Customer Management Service
 *
 * PDF ref: Admin End Functionality — Section 2
 * - View & manage all customer profiles
 * - Service history, invoices, ratings, complaints
 * - Block / suspend / restrict accounts
 * - Manually assign discounts, wallet credits, compensation
 * - Manage customer subscription plans
 * - View referral relationships and rewards
 */
import mongoose from "mongoose";
import { User } from "../../models/user.model";
import { UserSubscription } from "../../models/subscription/userSubscription.model";
import {
  adjustWalletBalance,
  getWalletHistory,
} from "../wallet.service";
import { ApiError } from "../../errors/ApiError";

export interface CustomerFilter {
  search?: string;
  isActive?: boolean;
  city?: string;
  hasSubscription?: boolean;
  page?: number;
  limit?: number;
}

export async function listCustomers(filter: CustomerFilter) {
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

export async function getCustomerProfile(customerId: string) {
  if (!mongoose.Types.ObjectId.isValid(customerId))
    throw ApiError.badRequest("Invalid customer ID");

  const [customer, walletSummary, subscription, serviceRequests] =
    await Promise.all([
      User.findById(customerId).select("-password").lean(),
      mongoose
        .model("CustomerWallet")
        .findOne({ userId: customerId })
        .select("balance totalCredited totalDebited isActive")
        .lean(),
      UserSubscription.findOne({
        userId: customerId,
        status: { $in: ["active", "trial"] },
      })
        .populate("planId", "name price billingCycle")
        .lean(),
      mongoose
        .model("ServiceRequest")
        .find({ customerId })
        .sort({ createdAt: -1 })
        .limit(10)
        .select("request_id status serviceType brand model createdAt")
        .lean(),
    ]);

  if (!customer) throw ApiError.notFound("Customer not found");

  return {
    customer,
    wallet: walletSummary,
    activeSubscription: subscription,
    recentServiceRequests: serviceRequests,
  };
}

/**
 * Atomically adjusts a customer's wallet balance.
 * Uses $inc + $push with $slice — no read-modify-write race condition.
 */
export async function adjustCustomerWallet(
  adminId: string,
  customerId: string,
  amount: number,
  type: "credit" | "debit" | "adjustment",
  description: string,
) {
  if (!mongoose.Types.ObjectId.isValid(customerId))
    throw ApiError.badRequest("Invalid customer ID");
  if (amount <= 0) throw ApiError.badRequest("Amount must be positive");

  return adjustWalletBalance({
    userId: customerId,
    type,
    amount,
    description,
    referenceModel: "User",
    performedBy: adminId,
  });
}

export async function getCustomerServiceHistory(
  customerId: string,
  page = 1,
  limit = 20,
) {
  const skip = (page - 1) * limit;
  const [requests, total] = await Promise.all([
    mongoose
      .model("ServiceRequest")
      .find({ customerId })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    mongoose.model("ServiceRequest").countDocuments({ customerId }),
  ]);
  return { requests, total };
}

export async function getCustomerWalletHistory(
  customerId: string,
  page = 1,
  limit = 20,
) {
  return getWalletHistory(customerId, page, limit);
}

export async function getCustomerPaymentHistory(
  customerId: string,
  page = 1,
  limit = 20,
  status?: string,
) {
  const skip = (page - 1) * limit;
  const query: Record<string, unknown> = { customerId };
  if (status) query.status = status;
  const [payments, total] = await Promise.all([
    mongoose
      .model("PaymentTransaction")
      .find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate("serviceRequestId", "request_id brand model serviceType")
      .lean(),
    mongoose.model("PaymentTransaction").countDocuments(query),
  ]);
  return { payments, total };
}

export async function assignDiscountToCustomer(
  adminId: string,
  customerId: string,
  discountPercentage: number,
  note?: string,
) {
  // Store discount in wallet as metadata for now
  // Future: tie to a Discount model
  if (discountPercentage < 0 || discountPercentage > 100) {
    throw ApiError.badRequest("Discount must be between 0 and 100");
  }
  const customer = await User.findByIdAndUpdate(
    customerId,
    {
      $set: {
        "discountOverride.percentage": discountPercentage,
        "discountOverride.assignedBy": adminId,
        "discountOverride.note": note,
        "discountOverride.assignedAt": new Date(),
      },
    },
    { new: true },
  ).select("-password");

  if (!customer) throw ApiError.notFound("Customer not found");
  return customer;
}

export async function cancelCustomerSubscription(
  adminId: string,
  customerId: string,
  reason: string,
) {
  const sub = await UserSubscription.findOneAndUpdate(
    { userId: customerId, status: { $in: ["active", "trial"] } },
    {
      $set: {
        status: "cancelled",
        cancelledAt: new Date(),
        cancelledBy: adminId,
        cancellationReason: reason,
      },
    },
    { new: true },
  );
  if (!sub)
    throw ApiError.notFound("No active subscription found for this customer");
  return sub;
}
