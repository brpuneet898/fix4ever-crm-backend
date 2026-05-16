/**
 * Vendor model — CRM reads from the same MongoDB collection
 * used by the main Fix4Ever backend (technicians).
 *
 * Minimal schema for populate in ServiceRequest.assignedVendor.
 */
import mongoose, { Document, Schema } from "mongoose";

export interface IVendorDocument extends Document {
  pocInfo?: {
    fullName?: string;
    email?: string;
    phone?: string;
  };
  averageRating?: number;
}

const vendorSchema = new Schema<IVendorDocument>(
  {
    pocInfo: {
      fullName: { type: String },
      email: { type: String },
      phone: { type: String },
    },
    averageRating: { type: Number, default: 0 },
  },
  {
    timestamps: true,
    strict: false,
    collection: "vendors",
  },
);

export const Vendor =
  mongoose.models.Vendor ??
  mongoose.model<IVendorDocument>("Vendor", vendorSchema);
