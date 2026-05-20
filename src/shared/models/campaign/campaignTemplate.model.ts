import mongoose, { Document, Schema } from "mongoose";

export type TemplateChannel = "email" | "sms" | "in_app" | "push";

export interface ICampaignTemplate {
  name: string;
  description?: string;
  channel: TemplateChannel;
  subject?: string;
  body: string;
  callToAction?: string;
  isActive: boolean;
  createdBy: mongoose.Types.ObjectId;
  updatedBy?: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

export interface ICampaignTemplateDocument
  extends ICampaignTemplate,
    Document {}

const campaignTemplateSchema = new Schema<ICampaignTemplateDocument>(
  {
    name: { type: String, required: true, trim: true },
    description: { type: String, trim: true },
    channel: {
      type: String,
      enum: ["email", "sms", "in_app", "push"],
      required: true,
    },
    subject: { type: String },
    body: { type: String, required: true },
    callToAction: { type: String },
    isActive: { type: Boolean, default: true },
    createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
    updatedBy: { type: Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true },
);

campaignTemplateSchema.index({ channel: 1, isActive: 1 });
campaignTemplateSchema.index({ createdAt: -1 });

export const CampaignTemplate =
  mongoose.model<ICampaignTemplateDocument>(
    "CampaignTemplate",
    campaignTemplateSchema,
    "campaigntemplates",
  );
