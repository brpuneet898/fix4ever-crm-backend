/**
 * Campaign Model — Marketing Automation
 *
 * PDF ref: CRM Manager §3 Communication & Engagement, §7 Marketing Automation
 *          Regional Manager §7 Marketing & Campaign Oversight
 *
 * Supports email, SMS, in-app, and push campaigns.
 * Regional Manager can view/approve campaigns scoped to their region.
 * CRM Manager creates, schedules, and tracks campaigns.
 */
import mongoose, { Document, Schema } from "mongoose";

export type CampaignType = "email" | "sms" | "in_app" | "push";
export type CampaignStatus =
  | "draft"
  | "scheduled"
  | "active"
  | "paused"
  | "completed"
  | "cancelled";
export type CampaignTargetSegment =
  | "all"
  | "active_subscribers"
  | "inactive"
  | "new_this_month"
  | "high_value"
  | "regional"
  | "custom";
export type CampaignApprovalStatus = "pending" | "approved" | "rejected";

export interface ICampaign {
  title: string;
  description?: string;
  type: CampaignType;
  status: CampaignStatus;
  targetSegment: CampaignTargetSegment;
  /** For regional campaigns: which region */
  targetRegion?: string;
  /** For custom segments: array of userId strings */
  targetUserIds?: string[];
  content: {
    subject?: string;
    body: string;
    callToAction?: string;
    templateId?: string;
  };
  scheduledAt?: Date;
  sentAt?: Date;
  completedAt?: Date;
  /** Real-time delivery stats (updated as campaign runs) */
  stats: {
    sent: number;
    delivered: number;
    opened: number;
    clicked: number;
    converted: number;
    failed: number;
  };
  approvalStatus: CampaignApprovalStatus;
  approvedBy?: mongoose.Types.ObjectId;
  approvedAt?: Date;
  rejectionReason?: string;
  createdBy: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

export interface ICampaignDocument extends ICampaign, Document {}

const campaignSchema = new Schema<ICampaignDocument>(
  {
    title: { type: String, required: true, trim: true },
    description: { type: String, trim: true },
    type: {
      type: String,
      enum: ["email", "sms", "in_app", "push"],
      required: true,
    },
    status: {
      type: String,
      enum: [
        "draft",
        "scheduled",
        "active",
        "paused",
        "completed",
        "cancelled",
      ],
      default: "draft",
    },
    targetSegment: {
      type: String,
      enum: [
        "all",
        "active_subscribers",
        "inactive",
        "new_this_month",
        "high_value",
        "regional",
        "custom",
      ],
      required: true,
    },
    targetRegion: { type: String, trim: true },
    targetUserIds: [{ type: String }],
    content: {
      subject: { type: String },
      body: { type: String, required: true },
      callToAction: { type: String },
      templateId: { type: String },
    },
    scheduledAt: { type: Date },
    sentAt: { type: Date },
    completedAt: { type: Date },
    stats: {
      sent: { type: Number, default: 0 },
      delivered: { type: Number, default: 0 },
      opened: { type: Number, default: 0 },
      clicked: { type: Number, default: 0 },
      converted: { type: Number, default: 0 },
      failed: { type: Number, default: 0 },
    },
    approvalStatus: {
      type: String,
      enum: ["pending", "approved", "rejected"],
      default: "pending",
    },
    approvedBy: { type: Schema.Types.ObjectId, ref: "User" },
    approvedAt: { type: Date },
    rejectionReason: { type: String },
    createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
  },
  { timestamps: true },
);

// Indexes for common query patterns
campaignSchema.index({ status: 1, createdAt: -1 });
campaignSchema.index({ targetRegion: 1, status: 1 });
campaignSchema.index({ targetSegment: 1, status: 1 });
campaignSchema.index({ scheduledAt: 1, status: 1 });
campaignSchema.index({ createdBy: 1, createdAt: -1 });
campaignSchema.index({ approvalStatus: 1, status: 1 });

export const Campaign = mongoose.model<ICampaignDocument>(
  "Campaign",
  campaignSchema,
  "campaigns",
);
