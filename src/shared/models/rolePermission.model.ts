import mongoose, { Document, Schema } from "mongoose";

export interface IRolePermission {
  role: string;
  permissions: string[];
  createdAt: Date;
  updatedAt: Date;
}

export interface IRolePermissionDocument extends IRolePermission, Document {}

const rolePermissionSchema = new Schema<IRolePermissionDocument>(
  {
    role: { type: String, required: true, unique: true, trim: true },
    permissions: { type: [String], default: [] },
  },
  { timestamps: true, collection: "rolepermissons" }, // matches existing DB collection name (single 's')
);

rolePermissionSchema.index({ role: 1 }, { unique: true });

export const RolePermission = mongoose.model<IRolePermissionDocument>(
  "RolePermission",
  rolePermissionSchema,
);
