import mongoose, { Document, Schema } from "mongoose";

export type CouponType = "percentage" | "flat" | "cashback" | "free_service";
export type CouponStatus = "active" | "inactive" | "expired" | "exhausted";
export type CouponEligibility =
  | "all"
  | "new_users"
  | "specific_users"
  | "region";

export interface ICoupon {
  code: string;
  title: string;
  description?: string;
  type: CouponType;
  value: number;
  maxDiscountAmount?: number;
  minOrderAmount?: number;
  usageLimit?: number;
  usagePerUser?: number;
  usedCount: number;
  status: CouponStatus;
  eligibility: CouponEligibility;
  eligibleUsers?: mongoose.Types.ObjectId[];
  eligibleRegions?: string[];
  applicableServiceTypes?: string[];
  expiresAt?: Date;
  createdBy: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

export interface ICouponDocument extends ICoupon, Document {}

const couponSchema = new Schema<ICouponDocument>(
  {
    code: {
      type: String,
      required: true,
      unique: true,
      uppercase: true,
      trim: true,
    },
    title: { type: String, required: true },
    description: { type: String },
    type: {
      type: String,
      enum: ["percentage", "flat", "cashback", "free_service"],
      required: true,
    },
    value: { type: Number, required: true, min: 0 },
    maxDiscountAmount: { type: Number },
    minOrderAmount: { type: Number, default: 0 },
    usageLimit: { type: Number },
    usagePerUser: { type: Number, default: 1 },
    usedCount: { type: Number, default: 0 },
    status: {
      type: String,
      enum: ["active", "inactive", "expired", "exhausted"],
      default: "active",
    },
    eligibility: {
      type: String,
      enum: ["all", "new_users", "specific_users", "region"],
      default: "all",
    },
    eligibleUsers: [{ type: Schema.Types.ObjectId, ref: "User" }],
    eligibleRegions: [{ type: String }],
    applicableServiceTypes: [{ type: String }],
    expiresAt: { type: Date },
    createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
  },
  { timestamps: true },
);

couponSchema.index({ status: 1, expiresAt: 1 }); // code unique index handled by field definition
couponSchema.index({ createdBy: 1 });
couponSchema.index({ eligibleRegions: 1 });

export const Coupon = mongoose.model<ICouponDocument>(
  "Coupon",
  couponSchema,
  "coupons",
);
