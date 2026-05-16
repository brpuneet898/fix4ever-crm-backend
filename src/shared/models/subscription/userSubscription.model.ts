import mongoose, { Document, Schema } from "mongoose";

export type SubscriptionStatus =
  | "trial"
  | "active"
  | "paused"
  | "cancelled"
  | "expired"
  | "pending_renewal";

export interface IUserSubscription {
  userId: mongoose.Types.ObjectId;
  planId: mongoose.Types.ObjectId;
  status: SubscriptionStatus;
  startDate: Date;
  endDate: Date;
  trialEndsAt?: Date;
  autoRenew: boolean;
  cancelledAt?: Date;
  cancelledBy?: mongoose.Types.ObjectId;
  cancellationReason?: string;
  pausedAt?: Date;
  pausedBy?: mongoose.Types.ObjectId;
  upgradedFrom?: mongoose.Types.ObjectId;
  paymentTransactionId?: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

export interface IUserSubscriptionDocument
  extends IUserSubscription, Document {}

const userSubscriptionSchema = new Schema<IUserSubscriptionDocument>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    planId: {
      type: Schema.Types.ObjectId,
      ref: "SubscriptionPlan",
      required: true,
    },
    status: {
      type: String,
      enum: [
        "trial",
        "active",
        "paused",
        "cancelled",
        "expired",
        "pending_renewal",
      ],
      default: "active",
    },
    startDate: { type: Date, required: true },
    endDate: { type: Date, required: true },
    trialEndsAt: { type: Date },
    autoRenew: { type: Boolean, default: true },
    cancelledAt: { type: Date },
    cancelledBy: { type: Schema.Types.ObjectId, ref: "User" },
    cancellationReason: { type: String },
    pausedAt: { type: Date },
    pausedBy: { type: Schema.Types.ObjectId, ref: "User" },
    upgradedFrom: { type: Schema.Types.ObjectId, ref: "SubscriptionPlan" },
    paymentTransactionId: {
      type: Schema.Types.ObjectId,
      ref: "PaymentTransaction",
    },
  },
  { timestamps: true },
);

userSubscriptionSchema.index({ userId: 1, status: 1 });
userSubscriptionSchema.index({ status: 1, endDate: 1 });
userSubscriptionSchema.index({ planId: 1, status: 1 });

export const UserSubscription = mongoose.model<IUserSubscriptionDocument>(
  "UserSubscription",
  userSubscriptionSchema,
  "usersubscriptions",
);
