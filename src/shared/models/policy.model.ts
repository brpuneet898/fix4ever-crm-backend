import mongoose, { Document, Schema } from "mongoose";

export type PolicyEffect = "allow" | "deny";

export interface IPolicy {
  action: string;
  resource: string;
  role: string;
  effect: PolicyEffect;
  conditions: string[] | null;
  isActive: boolean;
  description?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface IPolicyDocument extends IPolicy, Document {}

const policySchema = new Schema<IPolicyDocument>(
  {
    action: { type: String, required: true, trim: true },
    resource: { type: String, required: true, trim: true },
    role: { type: String, required: true, trim: true },
    effect: { type: String, enum: ["allow", "deny"], default: "allow" },
    conditions: { type: [String], default: null },
    isActive: { type: Boolean, default: true },
    description: { type: String, trim: true },
  },
  { timestamps: true, collection: "policies" },
);

policySchema.index({ role: 1, action: 1, resource: 1 });
policySchema.index({ isActive: 1 });
policySchema.index({ role: 1, isActive: 1 });

export const Policy = mongoose.model<IPolicyDocument>("Policy", policySchema);
