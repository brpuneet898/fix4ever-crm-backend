import mongoose, { Document, Schema } from "mongoose";

export type ChangeType = "address_update" | "beneficiary_update";
export type ChangeRequestStatus = "pending" | "approved" | "rejected" | "executed";
export type AuditAction = "submitted" | "approved" | "rejected" | "executed" | "re_submitted";

export interface IAuditEntry {
  action: AuditAction;
  performedBy: mongoose.Types.ObjectId;
  performedByRole: "customer" | "crm_agent" | "system";
  performedByName: string;
  timestamp: Date;
  note: string;
}

export interface ISupportChangeRequest extends Document {
  sessionId: mongoose.Types.ObjectId;
  customerId: mongoose.Types.ObjectId;
  customerName: string;
  serviceRequestId: mongoose.Types.ObjectId;
  serviceRequestRef: string;
  changeType: ChangeType;
  requestedData: Record<string, any>;
  currentData: Record<string, any>;
  status: ChangeRequestStatus;
  reviewedBy?: mongoose.Types.ObjectId;
  reviewedByName?: string;
  reviewedAt?: Date;
  rejectionReason?: string;
  executedAt?: Date;
  auditTrail: IAuditEntry[];
  createdAt: Date;
  updatedAt: Date;
}

const AuditEntrySchema = new Schema<IAuditEntry>(
  {
    action: {
      type: String,
      enum: ["submitted", "approved", "rejected", "executed", "re_submitted"],
      required: true,
    },
    performedBy: { type: Schema.Types.ObjectId, required: true },
    performedByRole: { type: String, enum: ["customer", "crm_agent", "system"], required: true },
    performedByName: { type: String, required: true },
    timestamp: { type: Date, default: Date.now },
    note: { type: String, default: "" },
  },
  { _id: false }
);

const SupportChangeRequestSchema = new Schema<ISupportChangeRequest>(
  {
    sessionId: { type: Schema.Types.ObjectId, ref: "SupportChatSession", required: true, index: true },
    customerId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    customerName: { type: String, required: true },
    serviceRequestId: { type: Schema.Types.ObjectId, required: true },
    serviceRequestRef: { type: String, required: true },
    changeType: {
      type: String,
      enum: ["address_update", "beneficiary_update"],
      required: true,
    },
    requestedData: { type: Schema.Types.Mixed, required: true },
    currentData: { type: Schema.Types.Mixed, default: {} },
    status: {
      type: String,
      enum: ["pending", "approved", "rejected", "executed"],
      default: "pending",
      index: true,
    },
    reviewedBy: { type: Schema.Types.ObjectId },
    reviewedByName: { type: String },
    reviewedAt: { type: Date },
    rejectionReason: { type: String },
    executedAt: { type: Date },
    auditTrail: { type: [AuditEntrySchema], default: [] },
  },
  { timestamps: true, collection: "supportchangerequests" }
);

SupportChangeRequestSchema.index({ status: 1, createdAt: -1 });

export const SupportChangeRequest = mongoose.model<ISupportChangeRequest>(
  "SupportChangeRequest",
  SupportChangeRequestSchema
);
