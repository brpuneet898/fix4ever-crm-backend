/**
 * Admin User Management Service
 *
 * Handles:
 * - Listing / searching all users with filters
 * - Blocking / suspending / activating user accounts
 * - Assigning / revoking assignable admin roles
 * - Setting per-user permission overrides (granted + denied)
 * - Setting user region (for regional_manager)
 * - Getting full access summary for a user
 */
import mongoose from "mongoose";
import {
  User,
  AssignableRole,
  ASSIGNABLE_ROLES,
} from "../../models/user.model";
import {
  PERMISSIONS,
  buildEffectivePermissions,
  getCatalogRoleDefaults,
  type Permission,
} from "../../../access";
import { isFullAccessRole } from "../../../access/roles";
import { ApiError } from "../../errors/ApiError";
import { logger } from "../../logger/logger";

export interface UserListFilter {
  role?: string;
  roles?: string;
  isActive?: boolean;
  search?: string;
  region?: string;
}

export async function listAllUsers(
  filter: UserListFilter,
  page: number,
  limit: number,
) {
  const query: Record<string, unknown> = {};

  if (filter.role) query.role = filter.role;
  if (filter.roles) query.roles = { $in: [filter.roles] };
  if (filter.isActive !== undefined) query.isActive = filter.isActive;
  if (filter.region) query.region = filter.region;

  if (filter.search) {
    query.$or = [
      { email: { $regex: filter.search, $options: "i" } },
      { username: { $regex: filter.search, $options: "i" } },
    ];
  }

  const skip = (page - 1) * limit;
  const [users, total] = await Promise.all([
    User.find(query).skip(skip).limit(limit).select("-password").lean(),
    User.countDocuments(query),
  ]);

  return { users, total };
}

export async function getUserById(userId: string) {
  if (!mongoose.Types.ObjectId.isValid(userId))
    throw ApiError.badRequest("Invalid user ID");
  const user = await User.findById(userId).select("-password").lean();
  if (!user) throw ApiError.notFound("User not found");
  return user;
}

export async function blockUser(adminId: string, userId: string) {
  _guardSelfAction(adminId, userId);
  const user = await User.findByIdAndUpdate(
    userId,
    { $set: { isActive: false } },
    { new: true },
  ).select("-password");
  if (!user) throw ApiError.notFound("User not found");
  logger.info({ action: "BLOCK_USER", adminId, userId }, "Admin blocked user");
  return user;
}

export async function activateUser(adminId: string, userId: string) {
  _guardSelfAction(adminId, userId);
  const user = await User.findByIdAndUpdate(
    userId,
    { $set: { isActive: true } },
    { new: true },
  ).select("-password");
  if (!user) throw ApiError.notFound("User not found");
  logger.info(
    { action: "ACTIVATE_USER", adminId, userId },
    "Admin activated user",
  );
  return user;
}

export async function assignRolesToUser(
  adminId: string,
  userId: string,
  roles: AssignableRole[],
) {
  _guardSelfAction(adminId, userId);
  _validateAssignableRoles(roles);

  const user = await User.findByIdAndUpdate(
    userId,
    { $set: { roles } },
    { new: true },
  ).select("-password");
  if (!user) throw ApiError.notFound("User not found");

  logger.info(
    { action: "ASSIGN_ROLES", adminId, userId, roles },
    "Roles assigned",
  );
  return user;
}

export async function removeRoleFromUser(
  adminId: string,
  userId: string,
  role: AssignableRole,
) {
  _guardSelfAction(adminId, userId);
  const user = await User.findByIdAndUpdate(
    userId,
    { $pull: { roles: role } },
    { new: true },
  ).select("-password");
  if (!user) throw ApiError.notFound("User not found");
  return user;
}

export async function clearUserRoles(adminId: string, userId: string) {
  _guardSelfAction(adminId, userId);
  const user = await User.findByIdAndUpdate(
    userId,
    { $set: { roles: [] } },
    { new: true },
  ).select("-password");
  if (!user) throw ApiError.notFound("User not found");
  return user;
}

export async function setPermissionOverrides(
  adminId: string,
  userId: string,
  granted: string[],
  denied: string[],
  actorRole?: string,
) {
  _guardSelfAction(adminId, userId);
  _validatePermissionKeys(granted, "granted");
  _validatePermissionKeys(denied, "denied");

  const overlap = granted.filter((p) => denied.includes(p));
  if (overlap.length > 0) {
    throw ApiError.badRequest(
      `Permissions cannot be both granted and denied: ${overlap.join(", ")}`,
    );
  }

  if (!isFullAccessRole(actorRole)) {
    throw ApiError.forbidden(
      "Only an administrator can assign or revoke granular permissions.",
    );
  }

  const user = await User.findByIdAndUpdate(
    userId,
    {
      $set: {
        "permissionOverrides.granted": granted,
        "permissionOverrides.denied": denied,
      },
    },
    { new: true },
  ).select("-password");
  if (!user) throw ApiError.notFound("User not found");

  logger.info(
    { action: "PERMISSION_OVERRIDE", adminId, userId, granted, denied },
    "Permissions overridden",
  );
  return user;
}

export async function setUserRegion(
  adminId: string,
  userId: string,
  region: string,
) {
  _guardSelfAction(adminId, userId);
  const user = await User.findByIdAndUpdate(
    userId,
    { $set: { region } },
    { new: true },
  ).select("-password");
  if (!user) throw ApiError.notFound("User not found");
  return user;
}

/**
 * Returns full computed access for a user (same rules as JWT: admin/super_admin = full
 * catalog; others = permissionOverrides only).
 */
export async function getUserAccessSummary(userId: string) {
  if (!mongoose.Types.ObjectId.isValid(userId))
    throw ApiError.badRequest("Invalid user ID");
  const user = await User.findById(userId).select("-password").lean();
  if (!user) throw ApiError.notFound("User not found");

  const effectivePerms = buildEffectivePermissions({
    role: user.role,
    permissionOverrides: user.permissionOverrides,
  });

  return {
    userId: user._id.toString(),
    email: user.email,
    username: user.username,
    baseRole: user.role,
    assignedRoles: user.roles,
    region: user.region,
    permissionOverrides: user.permissionOverrides ?? {
      granted: [],
      denied: [],
    },
    effectivePermissions: [...effectivePerms].sort(),
    isActive: user.isActive,
  };
}

/**
 * Returns a user's base role + assigned CRM sub-roles (adminRoles).
 * Shape matches the legacy frontend expectation for role management UI.
 */
export async function getUserRolesSummary(userId: string) {
  if (!mongoose.Types.ObjectId.isValid(userId)) {
    throw ApiError.badRequest("Invalid user ID");
  }

  const user = await User.findById(userId).select("-password").lean();
  if (!user) throw ApiError.notFound("User not found");

  return {
    id: user._id.toString(),
    email: user.email,
    username: user.username,
    baseRole: user.role,
    adminRoles: (user.roles ?? []) as AssignableRole[],
  };
}

/**
 * Returns the full permission catalog for admin panel UIs.
 *
 * Includes:
 *  - allPermissions   : deduplicated, sorted list of every unique permission value
 *  - roleDefaults     : full set only for admin/super_admin; assignable roles = [] (no code presets)
 *  - permissionsByResource : every permission value grouped by resource module,
 *                            keyed by action (create/read/update/delete/approve/
 *                            block/monitor/export/escalate/…)
 */
export function getPermissionCatalog() {
  // Deduplicate: PERMISSIONS may contain alias keys pointing to the same value
  // (e.g. SERVICE_REQUESTS_CANCEL and SERVICE_REQUESTS_DELETE both = "service_requests.delete")
  const allPermissions = [...new Set(Object.values(PERMISSIONS) as string[])].sort();

  const roleDefaults = Object.fromEntries(
    Object.entries(getCatalogRoleDefaults()).map(([role, perms]) => [
      role,
      [...new Set((perms as Permission[]).map(String))].sort(),
    ]),
  );

  // Build a full action map per resource — not limited to CRUD only.
  // Each resource gets every action it declares, so the frontend matrix
  // can render any column (approve, block, monitor, escalate, export, …).
  const permissionsByResource = allPermissions.reduce<
    Record<string, Record<string, string>>
  >((acc, permValue) => {
    const dotIndex = permValue.indexOf(".");
    if (dotIndex === -1) return acc;
    const resource = permValue.slice(0, dotIndex);
    const action = permValue.slice(dotIndex + 1);
    if (!resource || !action) return acc;
    if (!acc[resource]) acc[resource] = {};
    acc[resource][action] = permValue;
    return acc;
  }, {});

  return {
    allPermissions,
    roleDefaults,
    permissionsByResource,
    /** @deprecated renamed to permissionsByResource — kept for backward compat */
    crudByResource: permissionsByResource,
  };
}

// ─── Guards ───────────────────────────────────────────────────────────────────

function _guardSelfAction(adminId: string, targetId: string) {
  if (adminId === targetId) {
    throw ApiError.forbidden("Cannot perform this action on yourself");
  }
}

const ALL_PERMISSION_VALUES = new Set<string>(Object.values(PERMISSIONS));

function _validatePermissionKeys(keys: string[], field: string) {
  const invalid = keys.filter((k) => !ALL_PERMISSION_VALUES.has(k));
  if (invalid.length > 0) {
    throw ApiError.badRequest(
      `Invalid ${field} permissions: ${invalid.join(", ")}`,
    );
  }
}

function _validateAssignableRoles(roles: string[]) {
  const invalid = roles.filter(
    (r) => !ASSIGNABLE_ROLES.includes(r as AssignableRole),
  );
  if (invalid.length > 0) {
    throw ApiError.badRequest(`Invalid roles: ${invalid.join(", ")}`);
  }
}
