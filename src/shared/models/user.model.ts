import mongoose, { Document, Schema } from "mongoose";

export type BaseRole = "user" | "vendor" | "admin" | "captain";
export type AssignableRole = "crm_manager" | "editor" | "regional_manager";

export const ASSIGNABLE_ROLES: readonly AssignableRole[] = [
  "crm_manager",
  "editor",
  "regional_manager",
] as const;

export const PROTECTED_BASE_ROLES: readonly string[] = [
  "admin",
  "vendor",
  "captain",
] as const;

export interface IUser {
  username?: string;
  email: string;
  phone?: string;
  password?: string;
  role: BaseRole;
  isVendor: boolean;
  roles: AssignableRole[];
  /** Per-user permission overrides (add/remove specific permissions beyond role defaults) */
  permissionOverrides?: {
    granted: string[];
    denied: string[];
  };
  /** For regional_manager: restricts data access to this region */
  region?: string;
  googleId?: string;
  avatar?: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface IUserDocument extends IUser, Document {}

const userSchema = new Schema<IUserDocument>(
  {
    username: { type: String, trim: true },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    phone: { type: String, trim: true },
    password: { type: String, select: false },
    role: {
      type: String,
      enum: ["user", "vendor", "admin", "captain"],
      default: "user",
    },
    isVendor: { type: Boolean, default: false },
    roles: {
      type: [String],
      enum: ["crm_manager", "editor", "regional_manager"],
      default: [],
    },
    googleId: { type: String },
    avatar: { type: String },
    permissionOverrides: {
      granted: { type: [String], default: [] },
      denied: { type: [String], default: [] },
    },
    region: { type: String, trim: true },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true },
);

userSchema.index({ role: 1 }); // email unique index handled by field definition
userSchema.index({ roles: 1 });
userSchema.index({ isActive: 1 });
userSchema.index({ region: 1 }, { sparse: true });
userSchema.index({ role: 1, isActive: 1 });
userSchema.index({ roles: 1, isActive: 1 });
userSchema.index({ region: 1, isActive: 1 }, { sparse: true });
userSchema.index({ googleId: 1 }, { sparse: true });

export const User = mongoose.model<IUserDocument>("User", userSchema);
