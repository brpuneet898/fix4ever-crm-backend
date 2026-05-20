import mongoose, { Document, Schema } from "mongoose";

export type AuditAction =
  | "CREATE"
  | "UPDATE"
  | "DELETE"
  | "VIEW"
  | "BLOCK"
  | "UNBLOCK"
  | "SUSPEND"
  | "APPROVE"
  | "REJECT"
  | "ASSIGN"
  | "ASSIGN_SR"
  | "REASSIGN"
  | "REASSIGN_SR"
  | "CANCEL"
  | "CANCEL_SR"
  | "OVERRIDE"
  | "REFUND"
  | "WALLET_ADJUST"
  | "PAYOUT_APPROVE"
  | "ROLE_ASSIGN"
  | "ROLE_REMOVE"
  | "PERMISSION_OVERRIDE"
  | "LOGIN"
  | "LOGOUT"
  | "EXPORT"
  | "BROADCAST"
  | "BROADCAST_NOTIFICATION"
  | "ESCALATE"
  | "ESCALATE_SR"
  | "TAG_SR"
  | "COMPENSATE"
  | "CONFIG_CHANGE"
  | "SYSTEM_TOGGLE"
  | "SUBSCRIPTION_CANCEL"
  | "SUBSCRIPTION_PAUSE"
  | "SUBSCRIPTION_REACTIVATE"
  | "CREATE_CAMPAIGN"
  | "UPDATE_CAMPAIGN"
  | "ACTIVATE_CAMPAIGN"
  | "DELETE_CAMPAIGN"
  | "RESTART_CAMPAIGN"
  | "CAMPAIGN_APPROVE"
  | "CAMPAIGN_REJECT"
  | "CREATE_TEMPLATE"
  | "UPDATE_TEMPLATE"
  | "DELETE_TEMPLATE"
  | "TAG";

export interface IAuditLog {
  action: AuditAction;
  module: string;
  performedBy: mongoose.Types.ObjectId;
  performedByEmail?: string;
  performedByRole?: string;
  targetId?: string;
  targetModel?: string;
  targetDescription?: string;
  changes?: Record<string, { before: unknown; after: unknown }>;
  metadata?: Record<string, unknown>;
  ipAddress?: string;
  userAgent?: string;
  success: boolean;
  errorMessage?: string;
  timestamp: Date;
}

export interface IAuditLogDocument extends IAuditLog, Document {}

const auditLogSchema = new Schema<IAuditLogDocument>(
  {
    action: {
      type: String,
      required: true,
      enum: [
        "CREATE",
        "UPDATE",
        "DELETE",
        "VIEW",
        "BLOCK",
        "SUSPEND",
        "APPROVE",
        "REJECT",
        "ASSIGN",
        "REASSIGN",
        "CANCEL",
        "OVERRIDE",
        "REFUND",
        "WALLET_ADJUST",
        "PAYOUT_APPROVE",
        "ROLE_ASSIGN",
        "ROLE_REMOVE",
        "PERMISSION_OVERRIDE",
        "LOGIN",
        "LOGOUT",
        "EXPORT",
        "BROADCAST",
        "ESCALATE",
        "COMPENSATE",
        "CONFIG_CHANGE",
        "SYSTEM_TOGGLE",
        "CREATE_CAMPAIGN",
        "UPDATE_CAMPAIGN",
        "ACTIVATE_CAMPAIGN",
        "DELETE_CAMPAIGN",
        "RESTART_CAMPAIGN",
        "CAMPAIGN_APPROVE",
        "CAMPAIGN_REJECT",
        "CREATE_TEMPLATE",
        "UPDATE_TEMPLATE",
        "DELETE_TEMPLATE",
        "BROADCAST_NOTIFICATION",
        "ASSIGN_SR",
        "REASSIGN_SR",
        "CANCEL_SR",
        "ESCALATE_SR",
        "TAG_SR",
        "SUBSCRIPTION_CANCEL",
        "SUBSCRIPTION_PAUSE",
        "SUBSCRIPTION_REACTIVATE",
        "WALLET_ADJUST",
        "PAYOUT_APPROVE",
        "PERMISSION_OVERRIDE",
        "ROLE_ASSIGN",
        "ROLE_REMOVE",
        "COMPENSATE",
        "TAG",
      ],
    },
    module: { type: String, required: true, index: true },
    performedBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    performedByEmail: { type: String },
    performedByRole: { type: String },
    targetId: { type: String, index: true },
    targetModel: { type: String },
    targetDescription: { type: String },
    changes: { type: Schema.Types.Mixed },
    metadata: { type: Schema.Types.Mixed },
    ipAddress: { type: String },
    userAgent: { type: String },
    success: { type: Boolean, default: true },
    errorMessage: { type: String },
    timestamp: { type: Date, default: Date.now, index: true },
  },
  { timestamps: false },
);

// Compound indexes for common query patterns
auditLogSchema.index({ performedBy: 1, timestamp: -1 });
auditLogSchema.index({ module: 1, action: 1, timestamp: -1 });
auditLogSchema.index({ targetId: 1, targetModel: 1 });
auditLogSchema.index({ timestamp: -1 }); // for recent logs pagination

export const AuditLog = mongoose.model<IAuditLogDocument>(
  "AuditLog",
  auditLogSchema,
  "auditlogs",
);
