import mongoose, { Document, Schema } from "mongoose";

export type FollowUpTrigger =
  | "service_completed"
  | "subscription_expiry"
  | "subscription_renewed";

export type FollowUpChannel = "email" | "sms" | "in_app" | "push";

export interface IFollowUpRule {
  name: string;
  description?: string;
  trigger: FollowUpTrigger;
  isActive: boolean;
  /**
   * service_completed  — hours after SR.updatedAt (when status became Completed)
   * subscription_renewed — hours after subscription.updatedAt (status → active)
   */
  delayHours: number;
  /** subscription_expiry only — how many days before endDate to send the message */
  daysBeforeExpiry?: number;
  channel: FollowUpChannel;
  /** Optional city filter — only send to users whose last SR city matches (case-insensitive) */
  targetCities?: string[];
  content: {
    subject?: string;
    body: string;
    callToAction?: string;
  };
  stats: {
    totalSent: number;
    totalFailed: number;
    lastRunAt?: Date;
    lastRunSent?: number;
    lastRunFailed?: number;
  };
  createdBy: mongoose.Types.ObjectId;
  updatedBy?: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

export interface IFollowUpRuleDocument extends IFollowUpRule, Document {}

const followUpRuleSchema = new Schema<IFollowUpRuleDocument>(
  {
    name: { type: String, required: true, trim: true },
    description: { type: String, trim: true },
    trigger: {
      type: String,
      enum: ["service_completed", "subscription_expiry", "subscription_renewed"],
      required: true,
    },
    isActive: { type: Boolean, default: true },
    delayHours: { type: Number, required: true, min: 0, default: 24 },
    daysBeforeExpiry: { type: Number, min: 1 },
    channel: {
      type: String,
      enum: ["email", "sms", "in_app", "push"],
      required: true,
    },
    targetCities: [{ type: String, trim: true }],
    content: {
      subject: { type: String },
      body: { type: String, required: true },
      callToAction: { type: String },
    },
    stats: {
      totalSent: { type: Number, default: 0 },
      totalFailed: { type: Number, default: 0 },
      lastRunAt: { type: Date },
      lastRunSent: { type: Number },
      lastRunFailed: { type: Number },
    },
    createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
    updatedBy: { type: Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true },
);

followUpRuleSchema.index({ trigger: 1, isActive: 1 });
followUpRuleSchema.index({ createdAt: -1 });

export const FollowUpRule = mongoose.model<IFollowUpRuleDocument>(
  "FollowUpRule",
  followUpRuleSchema,
  "followuprules",
);
