/**
 * FollowUpLog — dedup guard for automated follow-up delivery.
 *
 * One document is written per (ruleId × targetId) pair after a successful send.
 * Before sending, the job checks this collection to skip already-processed events.
 * A unique compound index on (ruleId, targetId) prevents duplicate entries.
 */
import mongoose, { Document, Schema } from "mongoose";

export interface IFollowUpLog {
  ruleId: mongoose.Types.ObjectId;
  /** _id of the ServiceRequest or UserSubscription that triggered the send */
  targetId: string;
  targetType: "service_request" | "subscription";
  /** _id of the User who received the message */
  userId: string;
  channel: string;
  sentAt: Date;
}

export interface IFollowUpLogDocument extends IFollowUpLog, Document {}

const followUpLogSchema = new Schema<IFollowUpLogDocument>(
  {
    ruleId: {
      type: Schema.Types.ObjectId,
      ref: "FollowUpRule",
      required: true,
    },
    targetId: { type: String, required: true },
    targetType: {
      type: String,
      enum: ["service_request", "subscription"],
      required: true,
    },
    userId: { type: String, required: true },
    channel: { type: String, required: true },
    sentAt: { type: Date, default: Date.now },
  },
  { timestamps: false },
);

// Unique guard: one send per (rule, target) pair
followUpLogSchema.index({ ruleId: 1, targetId: 1 }, { unique: true });
followUpLogSchema.index({ ruleId: 1, sentAt: -1 });
followUpLogSchema.index({ userId: 1, sentAt: -1 });

export const FollowUpLog = mongoose.model<IFollowUpLogDocument>(
  "FollowUpLog",
  followUpLogSchema,
  "followuplogs",
);
