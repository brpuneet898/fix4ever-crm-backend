/**
 * Permission & Role Middleware
 *
 * requirePermission("customers.read")  — checks JWT permissions array
 * requireRole(["crm_manager"])          — checks JWT roles array OR base role
 * requireAnyRole([...])                 — passes if user has ANY of the given roles
 */
import { FastifyRequest, FastifyReply } from "fastify";
import { ApiError } from "../errors/ApiError";
import { Permission } from "../../access/permissions";
import { isFullAccessRole, Role } from "../../access/roles";

/**
 * Asserts user has the specific permission in their JWT.
 * Full-access base roles bypass granular permission checks.
 */
export function requirePermission(permission: Permission) {
  return async function (request: FastifyRequest, _reply: FastifyReply) {
    const user = request.admin;
    if (!user) {
      throw ApiError.unauthorized("Authentication required");
    }

    if (isFullAccessRole(user.role)) return;

    if (!user.permissions?.includes(permission)) {
      throw ApiError.forbidden(
        `Access denied. Required permission: "${permission}"`,
      );
    }
  };
}

/**
 * Asserts user has ALL of the specified permissions.
 */
export function requireAllPermissions(permissions: Permission[]) {
  return async function (request: FastifyRequest, _reply: FastifyReply) {
    const user = request.admin;
    if (!user) throw ApiError.unauthorized("Authentication required");
    if (isFullAccessRole(user.role)) return;

    const missing = permissions.filter((p) => !user.permissions?.includes(p));
    if (missing.length > 0) {
      throw ApiError.forbidden(
        `Access denied. Missing permissions: ${missing.join(", ")}`,
      );
    }
  };
}

/**
 * Asserts user has at least one of the specified permissions.
 */
export function requireAnyPermission(permissions: Permission[]) {
  return async function (request: FastifyRequest, _reply: FastifyReply) {
    const user = request.admin;
    if (!user) throw ApiError.unauthorized("Authentication required");
    if (isFullAccessRole(user.role)) return;

    const hasAny = permissions.some((p) => user.permissions?.includes(p));
    if (!hasAny) {
      throw ApiError.forbidden(
        `Access denied. Requires one of: ${permissions.join(", ")}`,
      );
    }
  };
}

/**
 * Asserts user's base role OR sub-roles includes the required role.
 * Use for role-gating entire modules (e.g. only crm_manager can access /crm/*).
 */
export function requireRole(roles: Array<Role | string>) {
  return async function (request: FastifyRequest, _reply: FastifyReply) {
    const user = request.admin;
    if (!user) throw ApiError.unauthorized("Authentication required");

    const userRoles = [user.role, ...(user.roles ?? [])];
    const hasRole = roles.some((r) => userRoles.includes(r));

    if (!hasRole) {
      throw ApiError.forbidden(
        `Access denied. Required role(s): ${roles.join(", ")}`,
      );
    }
  };
}

/**
 * Strict admin-only gate (base role must be "admin").
 * Already implemented in requireAdmin.middleware.ts — re-exported for convenience.
 */
export function requireAdminRole() {
  return async function (request: FastifyRequest, _reply: FastifyReply) {
    const user = request.admin;
    if (!user) throw ApiError.unauthorized("Authentication required");
    if (!isFullAccessRole(user.role)) {
      throw ApiError.forbidden("Admin access required");
    }
  };
}
