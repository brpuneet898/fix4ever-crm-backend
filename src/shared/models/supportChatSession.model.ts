import mongoose, { Document, Schema } from "mongoose";

// Mirror of the main-app-backend SupportChatSession model.
// CRM backend reads these documents — it does NOT write them directly.
// All mutations happen through the main backend's internal API.

export type SessionStatus =
  | "bot_flow"
  | "pending_crm_review"
  | "crm_live"
  | "resolved"
  | "rejected"
  | "closed";

export type SessionTopic =
  | "address_update"
  | "beneficiary_update"
  | "crm_live"
  | null;

export interface ISupportMessage {
  id: string;
  senderRole: "customer" | "bot" | "crm_agent" | "system";
  senderId?: mongoose.Types.ObjectId;
  senderName?: string;
  content: string;
  messageType: "text" | "quick_reply" | "system" | "resolution" | "rejection";
  timestamp: Date;
  read: boolean;
}

export interface ISupportChatSession extends Document {
  sessionId: string;
  customerId: mongoose.Types.ObjectId;
  customerName: string;
  customerPhone?: string;
  status: SessionStatus;
  topic: SessionTopic;
  relatedServiceRequestId?: mongoose.Types.ObjectId;
  messages: ISupportMessage[];
  assignedCrmAgentId?: mongoose.Types.ObjectId;
  crmAgentName?: string;
  createdAt: Date;
  updatedAt: Date;
  resolvedAt?: Date;
}

const SupportMessageSchema = new Schema<ISupportMessage>(
  {
    id: { type: String, required: true },
    senderRole: {
      type: String,
      enum: ["customer", "bot", "crm_agent", "system"],
      required: true,
    },
    senderId: { type: Schema.Types.ObjectId },
    senderName: { type: String },
    content: { type: String, required: true },
    messageType: {
      type: String,
      enum: ["text", "quick_reply", "system", "resolution", "rejection"],
      default: "text",
    },
    timestamp: { type: Date, default: Date.now },
    read: { type: Boolean, default: false },
  },
  { _id: false }
);

const SupportChatSessionSchema = new Schema<ISupportChatSession>(
  {
    sessionId: { type: String, required: true, unique: true, index: true },
    customerId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    customerName: { type: String, required: true },
    customerPhone: { type: String },
    status: {
      type: String,
      enum: ["bot_flow", "pending_crm_review", "crm_live", "resolved", "rejected", "closed"],
      default: "bot_flow",
      index: true,
    },
    topic: {
      type: String,
      enum: ["address_update", "beneficiary_update", "crm_live", null],
      default: null,
    },
    relatedServiceRequestId: { type: Schema.Types.ObjectId },
    messages: { type: [SupportMessageSchema], default: [] },
    assignedCrmAgentId: { type: Schema.Types.ObjectId },
    crmAgentName: { type: String },
    resolvedAt: { type: Date },
  },
  { timestamps: true, collection: "supportchatsessions" }
);

export const SupportChatSession = mongoose.model<ISupportChatSession>(
  "SupportChatSession",
  SupportChatSessionSchema
);
