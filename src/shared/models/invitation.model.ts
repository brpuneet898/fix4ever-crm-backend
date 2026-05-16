/**
 * Invitation Model
 *
 * Stores email invitations sent by admins to grant CRM roles to users.
 * Each invitation has a unique token used in the accept URL.
 * Invitations expire after 7 days if not accepted.
 */
import mongoose, { Document, Schema } from "mongoose";
import type { AssignableRole } from "./user.model";
import { nanoid } from "nanoid";

/** Possible states of an invitation in its lifecycle */
export type InvitationStatus = "pending" | "accepted" | "expired" | "cancelled";

/** Shape of an invitation document in MongoDB */
export interface IInvitation {
  email: string;
  roles: AssignableRole[];
  token: string;
  status: InvitationStatus;
  invitedBy: mongoose.Types.ObjectId;
  invitedByName?: string;
  expiresAt: Date;
  acceptedAt?: Date;
  acceptedBy?: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

export interface IInvitationDocument extends IInvitation, Document {}

/** How many days until an invitation expires (enterprise standard) */
export const INVITATION_EXPIRY_DAYS = 7;

const invitationSchema = new Schema<IInvitationDocument>(
  {
    email: { type: String, required: true, lowercase: true, trim: true },
    roles: {
      type: [String],
      enum: ["crm_manager", "editor", "regional_manager"],
      required: true,
    },
    token: { type: String, required: true, unique: true },
    status: {
      type: String,
      enum: ["pending", "accepted", "expired", "cancelled"],
      default: "pending",
    },
    invitedBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
    invitedByName: { type: String },
    expiresAt: { type: Date, required: true },
    acceptedAt: { type: Date },
    acceptedBy: { type: Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true },
);

// token unique index handled by field definition; compound indexes for query patterns
invitationSchema.index({ email: 1, status: 1 });
invitationSchema.index({ invitedBy: 1, createdAt: -1 });

/**
 * Generates a cryptographically secure token for invitation links.
 * 32 chars from nanoid provides ~192 bits of entropy (UUID-equivalent).
 */
export function generateInviteToken(): string {
  return nanoid(32);
}

export const Invitation = mongoose.model<IInvitationDocument>(
  "Invitation",
  invitationSchema,
);
