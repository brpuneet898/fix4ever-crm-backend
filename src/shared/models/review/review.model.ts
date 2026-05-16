/**
 * Review model — CRM reads from the same MongoDB collection
 * used by the main Fix4Ever backend (customer reviews).
 */
import mongoose, { Document, Schema } from "mongoose";

export interface IReviewDocument extends Document {
  customerId?: mongoose.Types.ObjectId;
  vendorId?: mongoose.Types.ObjectId;
  serviceRequestId?: mongoose.Types.ObjectId;
  rating?: number;
}

const reviewSchema = new Schema<IReviewDocument>(
  {
    customerId: { type: Schema.Types.ObjectId, ref: "User" },
    vendorId: { type: Schema.Types.ObjectId, ref: "Vendor" },
    serviceRequestId: { type: Schema.Types.ObjectId, ref: "ServiceRequest" },
    rating: { type: Number },
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

export const Review =
  mongoose.models.Review ??
  mongoose.model<IReviewDocument>("Review", reviewSchema);
