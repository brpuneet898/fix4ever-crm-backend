/**
 * ServiceRequest model — CRM reads from the same MongoDB collection
 * used by the main Fix4Ever backend.
 *
 * Schema is permissive (strict: false) to accept documents written
 * by the main app. Defines key fields for CRM queries and population.
 */
import mongoose, { Document, Schema } from "mongoose";

export interface IServiceRequestDocument extends Omit<Document, "model"> {
  request_id?: string;
  customerId?: mongoose.Types.ObjectId;
  userName?: string;
  userPhone?: string;
  requestType?: string;
  serviceType?: string;
  address?: string;
  city?: string;
  brand?: string;
  model?: string; // device model (shadows Document.model, hence Omit above)
  deviceBrand?: string;
  deviceModel?: string;
  status?: string;
  priority?: string;
  adminFinalPrice?: number;
  paymentBreakdown?: {
    totalCost?: number;
    serviceCost?: number;
    componentCost?: number;
  };
  assignedVendor?: mongoose.Types.ObjectId;
  assignedTechnician?: mongoose.Types.ObjectId;
  createdAt?: Date;
  updatedAt?: Date;
}

const serviceRequestSchema = new Schema<IServiceRequestDocument>(
  {
    request_id: { type: String, sparse: true },
    customerId: { type: Schema.Types.ObjectId, ref: "User" },
    userName: { type: String },
    userPhone: { type: String },
    requestType: { type: String },
    serviceType: { type: String },
    address: { type: String },
    city: { type: String },
    brand: { type: String },
    model: { type: String },
    deviceBrand: { type: String },
    deviceModel: { type: String },
    status: { type: String },
    priority: { type: String },
    adminFinalPrice: { type: Number },
    paymentBreakdown: { type: Schema.Types.Mixed },
    assignedVendor: { type: Schema.Types.ObjectId, ref: "Vendor" },
    assignedTechnician: { type: Schema.Types.ObjectId, ref: "Vendor" },
  },
  {
    timestamps: true,
    strict: false, // Allow fields from main app's schema
    collection: "servicerequests",
  },
);

serviceRequestSchema.index({ request_id: 1 });
serviceRequestSchema.index({ customerId: 1 });
serviceRequestSchema.index({ status: 1 });
serviceRequestSchema.index({ city: 1 });
serviceRequestSchema.index({ createdAt: -1 });

export const ServiceRequest =
  mongoose.models.ServiceRequest ??
  mongoose.model<IServiceRequestDocument>(
    "ServiceRequest",
    serviceRequestSchema,
  );
