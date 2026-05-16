import mongoose, { Document, Schema } from "mongoose";

export type BillingCycle = "monthly" | "quarterly" | "annual" | "one_time";
export type PlanStatus = "active" | "inactive" | "archived";

export interface ISubscriptionPlan {
  name: string;
  slug: string;
  description: string;
  price: number;
  billingCycle: BillingCycle;
  trialDays: number;
  benefits: string[];
  features: {
    priorityBooking: boolean;
    discountPercentage: number;
    extendedWarranty: boolean;
    dataProtection: boolean;
    premiumSupport: boolean;
    maintenancePlans: boolean;
  };
  status: PlanStatus;
  createdBy: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

export interface ISubscriptionPlanDocument
  extends ISubscriptionPlan, Document {}

const subscriptionPlanSchema = new Schema<ISubscriptionPlanDocument>(
  {
    name: { type: String, required: true },
    slug: { type: String, required: true, unique: true, lowercase: true },
    description: { type: String, required: true },
    price: { type: Number, required: true, min: 0 },
    billingCycle: {
      type: String,
      enum: ["monthly", "quarterly", "annual", "one_time"],
      required: true,
    },
    trialDays: { type: Number, default: 0 },
    benefits: [{ type: String }],
    features: {
      priorityBooking: { type: Boolean, default: false },
      discountPercentage: { type: Number, default: 0 },
      extendedWarranty: { type: Boolean, default: false },
      dataProtection: { type: Boolean, default: false },
      premiumSupport: { type: Boolean, default: false },
      maintenancePlans: { type: Boolean, default: false },
    },
    status: {
      type: String,
      enum: ["active", "inactive", "archived"],
      default: "active",
    },
    createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
  },
  { timestamps: true },
);

subscriptionPlanSchema.index({ status: 1 }); // slug unique index handled by field definition

export const SubscriptionPlan = mongoose.model<ISubscriptionPlanDocument>(
  "SubscriptionPlan",
  subscriptionPlanSchema,
  "subscriptionplans",
);
