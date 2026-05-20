/**
 * Review model — CRM reads from the same MongoDB collection
 * used by the main Fix4Ever backend (customer reviews).
 *
 * CRM-only fields (never read by main app):
 *   crmResponse   — written response posted by a CRM manager
 *   assignedTo    — ObjectId of the team member handling this review
 *   reviewStatus  — workflow state: pending → assigned/responded → resolved/flagged
 *   flagged       — quick escalation marker
 */
import mongoose, { Document, Schema } from "mongoose";

export type ReviewStatus =
  | "pending"
  | "assigned"
  | "responded"
  | "resolved"
  | "flagged";

export interface IReviewDocument extends Document {
  customerId?: mongoose.Types.ObjectId;
  vendorId?: mongoose.Types.ObjectId;
  serviceRequestId?: mongoose.Types.ObjectId;
  rating?: number;
  // CRM workflow fields
  crmResponse?: {
    text: string;
    respondedBy: mongoose.Types.ObjectId;
    respondedAt: Date;
  };
  assignedTo?: mongoose.Types.ObjectId;
  reviewStatus?: ReviewStatus;
  flagged?: boolean;
}

const reviewSchema = new Schema<IReviewDocument>(
  {
    customerId: { type: Schema.Types.ObjectId, ref: "User" },
    vendorId: { type: Schema.Types.ObjectId, ref: "Vendor" },
    serviceRequestId: { type: Schema.Types.ObjectId, ref: "ServiceRequest" },
    rating: { type: Number },
    // CRM workflow fields
    crmResponse: {
      text: { type: String },
      respondedBy: { type: Schema.Types.ObjectId, ref: "User" },
      respondedAt: { type: Date },
    },
    assignedTo: { type: Schema.Types.ObjectId, ref: "User" },
    reviewStatus: {
      type: String,
      enum: ["pending", "assigned", "responded", "resolved", "flagged"],
      default: "pending",
    },
    flagged: { type: Boolean, default: false },
  },
  {
    timestamps: true,
    strict: false,
    collection: "reviews",
  },
);

reviewSchema.index({ customerId: 1 });
reviewSchema.index({ vendorId: 1 });
reviewSchema.index({ rating: 1 });
reviewSchema.index({ reviewStatus: 1 });
reviewSchema.index({ assignedTo: 1 }, { sparse: true });

export const Review =
  mongoose.models.Review ??
  mongoose.model<IReviewDocument>("Review", reviewSchema);
