/**
 * Admin Coupon & Promotions Management Service
 * PDF ref: Admin Section 8 — Referral, Coupon & Promotion Management
 */
import { Coupon } from "../../models/coupon/coupon.model";
import { ApiError } from "../../errors/ApiError";

export async function listCoupons(status?: string, page = 1, limit = 20) {
  const skip = (page - 1) * limit;
  const query = status ? { status } : {};
  const [coupons, total] = await Promise.all([
    Coupon.find(query).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
    Coupon.countDocuments(query),
  ]);
  return { coupons, total };
}

export async function createCoupon(data: {
  code: string;
  title: string;
  description?: string;
  type: string;
  value: number;
  maxDiscountAmount?: number;
  minOrderAmount?: number;
  usageLimit?: number;
  usagePerUser?: number;
  eligibility?: string;
  eligibleRegions?: string[];
  eligibleUsers?: string[];
  applicableServiceTypes?: string[];
  expiresAt?: Date;
  createdBy: string;
}) {
  const existing = await Coupon.findOne({ code: data.code.toUpperCase() });
  if (existing)
    throw ApiError.conflict(`Coupon code "${data.code}" already exists`);

  return Coupon.create(data);
}

export async function updateCoupon(
  couponId: string,
  updates: Record<string, unknown>,
) {
  const coupon = await Coupon.findByIdAndUpdate(
    couponId,
    { $set: updates },
    { new: true },
  );
  if (!coupon) throw ApiError.notFound("Coupon not found");
  return coupon;
}

export async function deleteCoupon(couponId: string) {
  const coupon = await Coupon.findByIdAndDelete(couponId);
  if (!coupon) throw ApiError.notFound("Coupon not found");
}

export async function getCouponAnalytics() {
  return Coupon.aggregate([
    {
      $group: {
        _id: "$status",
        count: { $sum: 1 },
        totalUsed: { $sum: "$usedCount" },
      },
    },
  ]);
}

export async function deactivateExpiredCoupons() {
  const now = new Date();
  const result = await Coupon.updateMany(
    { expiresAt: { $lt: now }, status: "active" },
    { $set: { status: "expired" } },
  );
  return result.modifiedCount;
}
