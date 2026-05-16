/**
 * Role Assignment Service
 *
 * Admin-only operations for assigning/removing/clearing CRM roles (crm_manager,
 * editor, regional_manager) on users with base role "user". Protects admins
 * from modifying their own roles.
 */
import { userRepository } from "../../repositories/user.repository";
import {
  AssignableRole,
  PROTECTED_BASE_ROLES,
  IUserDocument,
} from "../../models/user.model";
import { validateAssignableRoles } from "../../utils/role-validation.util";
import { ApiError } from "../../errors/ApiError";
import { logger } from "../../logger/logger";

/** Strips internal fields and uses consistent field names for API responses */
function sanitizeUserResponse(user: {
  _id: unknown;
  email: string;
  username?: string;
  role: string;
  roles: AssignableRole[];
}) {
  return {
    id: String(user._id),
    email: user.email,
    username: user.username,
    baseRole: user.role,
    adminRoles: user.roles,
  };
}

/** Replaces target user's admin roles with the given list. Validates roles and prevents self-assignment. */
export async function assignRolesService(
  adminId: string,
  userId: string,
  roles: unknown,
) {
  if (adminId === userId) {
    throw ApiError.forbidden("Admins cannot assign roles to themselves");
  }

  const targetUser = await userRepository.findById(userId);
  if (!targetUser) throw ApiError.notFound("User not found");

  if (PROTECTED_BASE_ROLES.includes(targetUser.role)) {
    throw ApiError.forbidden(
      `Cannot assign admin-level roles to a user with base role "${targetUser.role}". ` +
        `Only users with base role "user" can receive admin roles.`,
    );
  }

  const validatedRoles = validateAssignableRoles(roles);
  const updatedUser = await userRepository.updateRoles(userId, validatedRoles);
  if (!updatedUser) throw ApiError.internal("Failed to update user roles");

  logger.info(
    {
      action: "ROLE_ASSIGNED",
      performedBy: adminId,
      targetUser: userId,
      roles: validatedRoles,
    },
    "Admin assigned roles to user",
  );

  return sanitizeUserResponse(updatedUser);
}

/** Removes a single role from the target user. */
export async function removeRoleService(
  adminId: string,
  userId: string,
  role: string,
) {
  if (adminId === userId) {
    throw ApiError.forbidden("Admins cannot modify their own roles");
  }

  const targetUser = await userRepository.findById(userId);
  if (!targetUser) throw ApiError.notFound("User not found");

  const newRoles = targetUser.roles.filter(
    (r: AssignableRole) => r !== role,
  ) as AssignableRole[];
  const updatedUser = await userRepository.updateRoles(userId, newRoles);
  if (!updatedUser) throw ApiError.internal("Failed to update user roles");

  logger.info(
    {
      action: "ROLE_REMOVED",
      performedBy: adminId,
      targetUser: userId,
      removedRole: role,
    },
    "Admin removed role from user",
  );

  return sanitizeUserResponse(updatedUser);
}

/** Clears all admin roles from the target user. */
export async function clearRolesService(adminId: string, userId: string) {
  if (adminId === userId) {
    throw ApiError.forbidden("Admins cannot modify their own roles");
  }

  const targetUser = await userRepository.findById(userId);
  if (!targetUser) throw ApiError.notFound("User not found");

  const updatedUser = await userRepository.updateRoles(userId, []);
  if (!updatedUser) throw ApiError.internal("Failed to clear user roles");

  logger.info(
    { action: "ROLES_CLEARED", performedBy: adminId, targetUser: userId },
    "Admin cleared all roles from user",
  );

  return sanitizeUserResponse(updatedUser);
}

/** Returns a user's base role and admin roles (for role management UI). */
export async function getUserRolesService(userId: string) {
  const user = await userRepository.findById(userId);
  if (!user) throw ApiError.notFound("User not found");

  return {
    id: String(user._id),
    email: user.email,
    username: user.username,
    baseRole: user.role,
    adminRoles: user.roles,
  };
}

/** Paginated list of all users for admin dashboard. */
export async function listUsersService(page: number, limit: number) {
  const { users, total } = await userRepository.findAll(page, limit);

  const mapped = users.map((u: IUserDocument) => ({
    id: String(u._id),
    username: u.username,
    email: u.email,
    baseRole: u.role,
    adminRoles: u.roles,
    isActive: u.isActive,
    avatar: u.avatar,
    createdAt: u.createdAt,
  }));

  return { users: mapped, total };
}
