import mongoose, { Document, Schema } from "mongoose";

export type TicketStatus =
  | "open"
  | "in_progress"
  | "escalated"
  | "resolved"
  | "closed";
export type TicketPriority = "low" | "medium" | "high" | "critical";
export type TicketCategory =
  | "payment_issue"
  | "service_quality"
  | "technician_complaint"
  | "app_issue"
  | "refund_request"
  | "account_issue"
  | "other";
export type TicketSource =
  | "customer"
  | "vendor"
  | "internal"
  | "chat"
  | "email";

export interface ITicketMessage {
  senderId: mongoose.Types.ObjectId;
  senderRole: string;
  message: string;
  attachments?: string[];
  timestamp: Date;
}

export interface ISupportTicket {
  ticketId: string;
  title: string;
  description: string;
  category: TicketCategory;
  priority: TicketPriority;
  status: TicketStatus;
  source: TicketSource;
  raisedBy: mongoose.Types.ObjectId;
  raisedByRole: string;
  assignedTo?: mongoose.Types.ObjectId;
  assignedAt?: Date;
  relatedServiceRequest?: mongoose.Types.ObjectId;
  relatedVendor?: mongoose.Types.ObjectId;
  messages: ITicketMessage[];
  resolutionNote?: string;
  compensation?: {
    type: "refund" | "wallet_credit" | "re_service" | "discount";
    amount?: number;
    note?: string;
    issuedBy?: mongoose.Types.ObjectId;
    issuedAt?: Date;
  };
  escalatedTo?: mongoose.Types.ObjectId;
  escalatedAt?: Date;
  resolvedAt?: Date;
  resolvedBy?: mongoose.Types.ObjectId;
  closedAt?: Date;
  slaDeadline?: Date;
  slaBreached: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface ISupportTicketDocument extends ISupportTicket, Document {}

const ticketMessageSchema = new Schema<ITicketMessage>(
  {
    senderId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    senderRole: { type: String, required: true },
    message: { type: String, required: true },
    attachments: [{ type: String }],
    timestamp: { type: Date, default: Date.now },
  },
  { _id: false },
);

const supportTicketSchema = new Schema<ISupportTicketDocument>(
  {
    ticketId: { type: String, required: true, unique: true },
    title: { type: String, required: true },
    description: { type: String, required: true },
    category: {
      type: String,
      enum: [
        "payment_issue",
        "service_quality",
        "technician_complaint",
        "app_issue",
        "refund_request",
        "account_issue",
        "other",
      ],
      required: true,
    },
    priority: {
      type: String,
      enum: ["low", "medium", "high", "critical"],
      default: "medium",
    },
    status: {
      type: String,
      enum: ["open", "in_progress", "escalated", "resolved", "closed"],
      default: "open",
    },
    source: {
      type: String,
      enum: ["customer", "vendor", "internal", "chat", "email"],
      default: "internal",
    },
    raisedBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
    raisedByRole: { type: String, required: true },
    assignedTo: { type: Schema.Types.ObjectId, ref: "User" },
    assignedAt: { type: Date },
    relatedServiceRequest: {
      type: Schema.Types.ObjectId,
      ref: "ServiceRequest",
    },
    relatedVendor: { type: Schema.Types.ObjectId, ref: "Vendor" },
    messages: [ticketMessageSchema],
    resolutionNote: { type: String },
    compensation: {
      type: {
        type: String,
        enum: ["refund", "wallet_credit", "re_service", "discount"],
      },
      amount: { type: Number },
      note: { type: String },
      issuedBy: { type: Schema.Types.ObjectId, ref: "User" },
      issuedAt: { type: Date },
    },
    escalatedTo: { type: Schema.Types.ObjectId, ref: "User" },
    escalatedAt: { type: Date },
    resolvedAt: { type: Date },
    resolvedBy: { type: Schema.Types.ObjectId, ref: "User" },
    closedAt: { type: Date },
    slaDeadline: { type: Date },
    slaBreached: { type: Boolean, default: false },
  },
  { timestamps: true },
);

supportTicketSchema.index({ raisedBy: 1, status: 1 }); // ticketId unique index handled by field definition
supportTicketSchema.index({ assignedTo: 1, status: 1 });
supportTicketSchema.index({ status: 1, priority: 1, createdAt: -1 });
supportTicketSchema.index({ relatedServiceRequest: 1 });
supportTicketSchema.index({ slaDeadline: 1, slaBreached: 1 });

export const SupportTicket = mongoose.model<ISupportTicketDocument>(
  "SupportTicket",
  supportTicketSchema,
  "supporttickets",
);
