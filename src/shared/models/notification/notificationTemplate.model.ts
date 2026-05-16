import mongoose, { Document, Schema } from "mongoose";

export type TemplateChannel = "email" | "sms" | "push" | "in_app";
export type TemplateTrigger =
  | "service_created"
  | "service_assigned"
  | "service_completed"
  | "payment_received"
  | "payment_failed"
  | "subscription_renewal"
  | "subscription_expiry"
  | "coupon_assigned"
  | "technician_approved"
  | "technician_rejected"
  | "review_received"
  | "ticket_opened"
  | "ticket_resolved"
  | "manual";

export interface INotificationTemplate {
  name: string;
  slug: string;
  channel: TemplateChannel;
  trigger: TemplateTrigger;
  subject?: string;
  bodyTemplate: string;
  variables: string[];
  isActive: boolean;
  createdBy: mongoose.Types.ObjectId;
  updatedBy?: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

export interface INotificationTemplateDocument
  extends INotificationTemplate, Document {}

const notificationTemplateSchema = new Schema<INotificationTemplateDocument>(
  {
    name: { type: String, required: true },
    slug: { type: String, required: true, unique: true, lowercase: true },
    channel: {
      type: String,
      enum: ["email", "sms", "push", "in_app"],
      required: true,
    },
    trigger: {
      type: String,
      enum: [
        "service_created",
        "service_assigned",
        "service_completed",
        "payment_received",
        "payment_failed",
        "subscription_renewal",
        "subscription_expiry",
        "coupon_assigned",
        "technician_approved",
        "technician_rejected",
        "review_received",
        "ticket_opened",
        "ticket_resolved",
        "manual",
      ],
      required: true,
    },
    subject: { type: String },
    bodyTemplate: { type: String, required: true },
    variables: [{ type: String }],
    isActive: { type: Boolean, default: true },
    createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
    updatedBy: { type: Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true },
);

notificationTemplateSchema.index({ channel: 1, trigger: 1 }); // slug unique index handled by field definition
notificationTemplateSchema.index({ isActive: 1 });

export const NotificationTemplate =
  mongoose.model<INotificationTemplateDocument>(
    "NotificationTemplate",
    notificationTemplateSchema,
    "notificationtemplates",
  );
